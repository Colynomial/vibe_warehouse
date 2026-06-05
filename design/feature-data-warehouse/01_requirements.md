# Data Warehouse & Connectors — Requirements

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Raw storage | JSONB + GIN index + extracted columns (B+C) | No model-code per endpoint, GIN for ad-hoc queries, fast filtering on date/guid |
| Materialized views | Query in Django model + cache-table | UI-editable, AI-readable, row-level filtering possible |
| Scheduling | Django Q (ORM-backed) | No Redis, proven in reference |
| Connector model | Generic (credential_schema per type) | One model fits all APIs |
| Preload | Preview (1 day) → full preload | Client sees data before committing |

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DATA PIPELINE                                 │
│                                                                     │
│  [Connector Config]  →  [Ingestion Tasks]  →  [Raw Storage]        │
│    credentials            Django Q               JSONB + cols       │
│    resources              periodic               per tenant schema  │
│    parameters                                                       │
│                                                                     │
│  [Raw Storage]  →  [Materialized View Engine]  →  [Cache Tables]   │
│    raw_records       SQL queries (in DB)           mv_<slug>        │
│                      auto-refresh after ingest     queryable via API │
│                                                                     │
│  [Cache Tables]  →  [REST API]  →  [Frontend / Client Apps]        │
│    mv_<slug>         filtered by permissions                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Connector System

### ConnectorType (registry of available connectors)

```python
class ConnectorType(Model):
    """Available connector types. Managed by us (platform)."""
    slug = CharField(unique=True)           # "helloflex", "meta_ads"
    name = CharField()                      # "HelloFlex", "Meta Ads"
    description = TextField(blank=True)
    auth_type = CharField()                 # "oauth2_client", "token", "api_key"
    
    # Dynamic credential form definition
    credential_schema = JSONField()
    # Example for HelloFlex:
    # [
    #   {"key": "client_id", "label": "Client ID", "type": "text", "required": true},
    #   {"key": "client_secret", "label": "Client Secret", "type": "password", "required": true},
    #   {"key": "base_url", "label": "API Base URL", "type": "url", "required": true,
    #    "default": "https://api.helloflex.com"}
    # ]
    
    # Available resources (endpoints/tables) the client can choose
    available_resources = JSONField()
    # Example for HelloFlex:
    # [
    #   {"slug": "contracts", "name": "Contracts", "path": "/api/contracts",
    #    "description": "Employment contracts",
    #    "cursor_field": "lastUpdatedDateTimeUtcFrom",
    #    "id_field": "guid",
    #    "parameters": [
    #      {"key": "includeArchived", "label": "Include archived", "type": "boolean", "default": false},
    #      {"key": "includeAllVersions", "label": "Include all versions", "type": "boolean", "default": false}
    #    ]},
    #   {"slug": "timecards", "name": "Timecards", "path": "/api/timecards", ...},
    #   {"slug": "candidates", "name": "Candidates", "path": "/api/candidates", ...}
    # ]
    
    api_docs_url = URLField(blank=True)     # "https://api.helloflex.com/docs/index"
    
    # Rate limiting info
    rate_limit_info = TextField(blank=True)  # "2 concurrent, 5 per 100ms"
```

### TenantConnector (configured instance per tenant)

```python
class TenantConnector(Model):
    """A configured connector for a specific tenant."""
    tenant = ForeignKey(Tenant)
    connector_type = ForeignKey(ConnectorType)
    name = CharField()                      # Client-chosen: "Onze HelloFlex"
    credentials = JSONField()               # Stored credentials (encrypted at DB level)
    is_active = BooleanField(default=True)
    created_at = DateTimeField(auto_now_add=True)
    last_validated_at = DateTimeField(null=True)
    validation_error = TextField(null=True)  # Last credential test error
```

### TenantConnectorResource (what to fetch + config)

```python
class TenantConnectorResource(Model):
    """Which resource a tenant wants to ingest, with parameters."""
    connector = ForeignKey(TenantConnector)
    resource_slug = CharField()             # "contracts", "timecards"
    is_active = BooleanField(default=True)
    
    # Client-configured parameters
    parameters = JSONField(default=dict)    # {"includeArchived": true}
    
    # Scheduling
    sync_frequency = CharField(choices=[
        ('hourly', 'Hourly'),
        ('daily', 'Daily'),
        ('weekly', 'Weekly'),
    ], default='daily')
    
    # Sync tracking
    preload_from = DateField(null=True)
    last_synced_at = DateTimeField(null=True)
    last_sync_cursor = JSONField(null=True) # {"lastUpdatedDateTimeUtcFrom": "2026-06-03T00:00:00Z"}
    total_records = IntegerField(default=0)
    
    # Preview (1-day sample before full preload)
    preview_data = JSONField(null=True)
    preview_fetched_at = DateTimeField(null=True)
    preview_record_count = IntegerField(null=True)
    preview_fields = JSONField(null=True)   # Detected field names + types
```

---

## 2. Raw Data Storage (JSONB + Extracted Columns)

```python
class RawRecord(Model):
    """Generic storage for all ingested API data.
    Lives in tenant schema. No model-per-endpoint needed."""
    
    # Identification
    connector_resource = ForeignKey(TenantConnectorResource)
    source_id = CharField(max_length=255)   # Unique ID from API (guid, composite key)
    
    # Full data
    data = JSONField()                      # Complete API record as JSON
    
    # Extracted columns (indexed, for fast filtering)
    record_date = DateField(null=True, db_index=True)     # Primary date in the record
    record_guid = CharField(max_length=255, null=True, db_index=True)  # Primary GUID
    
    # Tracking
    fetched_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('connector_resource', 'source_id')
        indexes = [
            Index(fields=['connector_resource', 'record_date']),
            Index(fields=['connector_resource', 'fetched_at']),
        ]
```

### Why JSONB + Extracted Columns

- **`data` (JSONB)**: stores the full API response. MV queries use `data->>'fieldName'` to access any field.
- **`record_date`**: extracted at ingest time from the cursor field. Enables fast date-range queries.
- **`record_guid`**: extracted at ingest time from the ID field. Enables fast lookup/dedup.
- **GIN index** on `data` column for ad-hoc JSON queries within MVs.

No model code per endpoint. All HelloFlex tables (contracts, timecards, candidates) go into the same `raw_records` table, differentiated by `connector_resource_id`.

---

## 3. Materialized Views (Query in DB + Cache Table)

```python
class MaterializedView(Model):
    """A SQL transformation defined by client/AI. Query stored in DB, results in cache table."""
    tenant = ForeignKey(Tenant)
    
    # Identity
    slug = SlugField()
    title = CharField(max_length=200)       # "Actieve Contracten"
    description = TextField(blank=True)     # Context: what this dataset contains, purpose
    # Description can be AI-generated and AI-updated
    
    # The SQL query (editable via UI code editor)
    query = TextField()
    # Example:
    # SELECT
    #   data->>'guid' as contract_guid,
    #   data->>'candidateName' as candidate,
    #   (data->>'startDate')::date as start_date,
    #   (data->>'endDate')::date as end_date,
    #   data->>'employerName' as employer,
    #   data->>'statusName' as status
    # FROM raw_records
    # WHERE connector_resource_id = 3
    #   AND (data->>'statusName') != 'Archived'
    
    # Dependencies (what triggers a refresh)
    depends_on_resources = ManyToManyField(TenantConnectorResource, blank=True)
    depends_on_views = ManyToManyField('self', symmetrical=False, blank=True,
                                        related_name='downstream_views')
    
    # Refresh config
    auto_refresh = BooleanField(default=True)   # Refresh when dependencies update?
    
    # Status & metrics
    status = CharField(choices=['draft', 'active', 'error'], default='draft')
    last_refreshed_at = DateTimeField(null=True)
    refresh_duration_ms = IntegerField(null=True)
    row_count = IntegerField(null=True)
    error_message = TextField(null=True)
    
    # Cache table name (auto-generated)
    cache_table_name = CharField(max_length=100, blank=True)  # "mv_active_contracts"
    
    # Metadata
    created_by = ForeignKey(User, null=True)
    created_at = DateTimeField(auto_now_add=True)
    updated_at = DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ('tenant', 'slug')
    
    def save(self, *args, **kwargs):
        if not self.cache_table_name:
            self.cache_table_name = f"mv_{self.slug}"
        super().save(*args, **kwargs)
```

### How Refresh Works

```python
def refresh_materialized_view(mv: MaterializedView):
    """
    Refreshes a materialized view by executing its query
    and storing results in a cache table.
    """
    with connection.cursor() as cursor:
        # Drop old cache table
        cursor.execute(f"DROP TABLE IF EXISTS {mv.cache_table_name}")
        
        # Create new cache table from query
        cursor.execute(f"CREATE TABLE {mv.cache_table_name} AS ({mv.query})")
        
        # Get row count
        cursor.execute(f"SELECT COUNT(*) FROM {mv.cache_table_name}")
        row_count = cursor.fetchone()[0]
    
    mv.last_refreshed_at = timezone.now()
    mv.row_count = row_count
    mv.status = 'active'
    mv.error_message = None
    mv.save()
    
    # Trigger downstream views
    for downstream in mv.downstream_views.filter(auto_refresh=True):
        refresh_materialized_view(downstream)
```

### MV Dependency Chain (DAG)

```
raw_records (contracts) ──┐
                          ├──▶ [mv_active_contracts] ──┐
raw_records (timecards) ──┘                            │
                                                       ├──▶ [mv_team_performance]
raw_records (meta_spend) ──▶ [mv_daily_spend] ────────┘
```

After ingestion of "contracts":
1. `raw_records` updated
2. System finds MVs that depend on this resource
3. Refreshes `mv_active_contracts`
4. Finds MVs that depend on `mv_active_contracts`
5. Refreshes `mv_team_performance`

---

## 4. Ingestion Flow

### Preview (before preload)

```
Client activates resource "contracts" with params {includeArchived: true}
    │
    ▼
System fetches 1 day of data (yesterday)
    │
    ▼
Stores in preview_data (JSON array of sample records)
Detects fields: [{name: "guid", type: "string"}, {name: "startDate", type: "date"}, ...]
    │
    ▼
UI shows:
  "24 records found. Fields: guid, candidateName, startDate, endDate, ..."
  [Sample data table]
  [Button: "Start Preload (from 90 days ago)"]
```

### Preload

```
Client confirms preload with preload_from = today - 90 days
    │
    ▼
Django Q task: fetch all records from preload_from to today
  - Paginated (skip/take for HelloFlex, cursor for Meta)
  - Upsert into raw_records (source_id as unique key)
  - Extract record_date + record_guid at insert time
  - Update last_synced_at and total_records
    │
    ▼
Trigger dependent MV refreshes
```

### Incremental Sync (scheduled)

```
Django Q periodic task (daily/hourly/weekly):
    │
    ▼
since = last_sync_cursor (e.g. lastUpdatedDateTimeUtcFrom)
    │
    ▼
Fetch all records modified since last sync
    │
    ▼
Upsert into raw_records
Update last_synced_at + last_sync_cursor
    │
    ▼
Trigger dependent MV refreshes
```

### Backfill (client wants more history)

```
Client changes preload_from to an earlier date
    │
    ▼
Django Q task: fetch from new_preload_from to old_preload_from
    │
    ▼
Upsert into raw_records (won't duplicate existing)
```

---

## 5. Ingestion Logging

```python
class IngestionRun(Model):
    """Log of every ingestion execution."""
    resource = ForeignKey(TenantConnectorResource)
    run_type = CharField(choices=['preview', 'preload', 'incremental', 'backfill'])
    
    started_at = DateTimeField()
    completed_at = DateTimeField(null=True)
    status = CharField(choices=['running', 'success', 'partial', 'failed'])
    
    records_fetched = IntegerField(default=0)
    records_created = IntegerField(default=0)
    records_updated = IntegerField(default=0)
    
    sync_cursor_before = JSONField(null=True)
    sync_cursor_after = JSONField(null=True)
    
    error_message = TextField(null=True)
    duration_ms = IntegerField(null=True)
    api_calls_made = IntegerField(default=0)
```

---

## 6. Connector Implementations

### HelloFlex

- **Auth**: OAuth2 Client Credentials (`POST /oauth2/token`)
- **Pagination**: skip/take (100 per page)
- **Rate limit**: 2 concurrent, 5 per 100ms
- **Cursor field**: `lastUpdatedDateTimeUtcFrom` (most endpoints)
- **ID field**: `guid`
- **API docs**: [swagger_20260604.json](../../reference/api-docs/helloflex/swagger_20260604.json)

Available resources:
| Slug | Name | Path | Key Params |
|------|------|------|-----------|
| contracts | Contracts | /api/contracts | includeArchived, includeAllVersions |
| timecards | Timecards | /api/timecards | — |
| candidates | Candidates | /api/candidates | — |
| employers | Employers | /api/employers | — |
| jobs | Jobs | /api/jobs | — |
| invoices | Invoices | /api/invoices | — |

### Meta Ads

- **Auth**: Long-lived access token
- **Pagination**: cursor-based (`after` param)
- **Rate limit**: 200 calls/hour per ad account
- **Cursor field**: `date_start`
- **ID field**: composite (`adset_id:date_start` or `campaign_id:date_start`)
- **API docs**: [marketing-api.md](../../reference/api-docs/meta/marketing-api.md)
- **Note**: Re-fetch last 7 days on each sync (attribution window updates)

Available resources:
| Slug | Name | Params |
|------|------|--------|
| insights_daily | Daily Ad Performance | level, fields |
| insights_daily_age_gender | Daily by Age+Gender | level (fixed breakdowns: age,gender) |
| campaigns | Campaign List | — |
| adsets | Ad Set List | — |

---

## 7. Frontend: Tenant Admin Pages

### Connector Management
```
/tenant/:slug/admin/connectors/
├── [List connectors: name, type, status, last sync]
├── /add
│   ├── Step 1: Choose type (HelloFlex / Meta Ads / ...)
│   ├── Step 2: Fill credentials (dynamic form from credential_schema)
│   ├── Step 3: Test connection ("Verbinding testen" button)
│   └── Step 4: Save
└── /:connectorId/
    ├── /resources
    │   ├── [List available + active resources with toggle]
    │   └── /:resourceSlug/
    │       ├── Step 1: Set parameters (dynamic form)
    │       ├── Step 2: Preview (fetch 1 day, show sample)
    │       ├── Step 3: Configure preload (from date, frequency)
    │       └── Step 4: Activate → start preload
    └── /logs [Ingestion history: runs, status, records, errors]
```

### Data Pipeline (MV management)
```
/tenant/:slug/admin/data-pipeline/
├── [Visual DAG: nodes = resources + MVs, edges = dependencies]
├── /add-view
│   ├── SQL editor (code block, syntax highlighted)
│   ├── Title + description fields
│   ├── Dependency selector (checkboxes: which resources/views as input)
│   ├── "Test Query" button → shows preview of results
│   └── "Activeren" → creates cache table, starts auto-refresh
└── /:viewSlug/
    ├── Query editor (editable)
    ├── Title + description (editable, AI can update)
    ├── Status: last refresh, row count, duration
    ├── "Refresh Now" button
    └── Downstream dependencies list
```

### Data Pipeline Visual (DAG viewer)
```
┌──────────────────────────────────────────────────────────────┐
│  📊 Data Pipeline                                             │
│                                                              │
│  ┌─────────────┐     ┌────────────────────┐                 │
│  │ 🔌 contracts │────▶│ mv_active_contracts│──┐              │
│  │   2,450 rows │     │ "Actieve contracten│  │              │
│  └─────────────┘     │  zonder archief"   │  │              │
│                       │   890 rows ✅      │  │              │
│  ┌─────────────┐     └────────────────────┘  │              │
│  │ 🔌 timecards │─────────────────────────────┼──▶┌─────────┐│
│  │   8,200 rows │                             │   │mv_team_ ││
│  └─────────────┘                             │   │ perf    ││
│                       ┌────────────────────┐  │   │ 24 rows ││
│  ┌─────────────┐     │ mv_daily_spend     │──┘   └─────────┘│
│  │ 🔌 meta_ads  │────▶│ "Dagelijkse spend  │                 │
│  │  12,400 rows │     │  per campaign"     │                 │
│  └─────────────┘     │  1,200 rows ✅     │                 │
│                       └────────────────────┘                 │
└──────────────────────────────────────────────────────────────┘
```

---

## 8. API Endpoints

### Connector CRUD
```
GET    /api/tenant/connectors/types/              → list available connector types
POST   /api/tenant/connectors/                    → create connector (credentials)
GET    /api/tenant/connectors/                    → list tenant's connectors
POST   /api/tenant/connectors/:id/test/           → test credentials
DELETE /api/tenant/connectors/:id/                → remove connector
```

### Resource Management
```
GET    /api/tenant/connectors/:id/resources/      → list resources + status
POST   /api/tenant/connectors/:id/resources/:slug/preview/  → fetch 1-day preview
POST   /api/tenant/connectors/:id/resources/:slug/activate/ → start preload
PATCH  /api/tenant/connectors/:id/resources/:slug/          → update params/frequency
POST   /api/tenant/connectors/:id/resources/:slug/sync/     → trigger manual sync
```

### Materialized Views
```
GET    /api/tenant/views/                         → list all MVs
POST   /api/tenant/views/                         → create new MV (query, title, deps)
GET    /api/tenant/views/:slug/                   → MV detail (query, status, metadata)
PATCH  /api/tenant/views/:slug/                   → update query/title/description
POST   /api/tenant/views/:slug/test/              → execute query, return preview
POST   /api/tenant/views/:slug/refresh/           → trigger refresh
DELETE /api/tenant/views/:slug/                   → delete MV + cache table
GET    /api/tenant/views/:slug/data/              → query cache table (with pagination/filters)
GET    /api/tenant/pipeline/                      → full DAG (nodes + edges)
```

### Ingestion Logs
```
GET    /api/tenant/connectors/:id/resources/:slug/runs/ → ingestion history
```

---

## Open Questions
- [ ] Credential encryption: Fernet in app layer, or rely on Azure DB encryption at rest?
- [ ] Max number of MVs per tenant? (performance consideration)
- [ ] Should AI be able to directly create/modify MVs via API? (for vibe-coding flow)
- [ ] How to handle MV refresh failures in a chain? (skip downstream or retry?)
