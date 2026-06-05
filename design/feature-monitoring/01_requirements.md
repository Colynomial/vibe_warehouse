# Monitoring & Usage Tracking — Requirements

## Goal

Full visibility into platform costs, usage patterns, and system health. Two audiences:
1. **Platform owner (us)**: cost allocation per tenant/user, system health, business decisions
2. **Tenant admin**: usage insights for their organization, billing transparency

## What We Track

### 1. API Usage (per request)

Every API call logged:

```python
class APIRequestLog(Model):
    """Every API request to the platform. Public schema."""
    tenant = ForeignKey(Tenant)
    user = ForeignKey(User, null=True)  # null for system/anonymous
    
    # Request details
    endpoint = CharField(max_length=500)
    method = CharField(max_length=10)  # GET, POST, etc.
    query_params = JSONField(null=True)  # what was requested
    
    # Response details
    status_code = IntegerField()
    response_size_bytes = IntegerField()
    
    # Performance
    duration_ms = IntegerField()  # total request time
    db_query_count = IntegerField()  # number of DB queries
    db_query_time_ms = IntegerField()  # total DB time
    
    # Context
    source_app = CharField(null=True)  # which tenant app made the call
    ip_address = GenericIPAddressField(null=True)
    user_agent = CharField(max_length=500, null=True)
    timestamp = DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            Index(fields=['tenant', 'timestamp']),
            Index(fields=['tenant', 'user', 'timestamp']),
            Index(fields=['timestamp']),  # for cleanup/aggregation
        ]
```

### 2. Data Ingestion (per task)

Every ingestion task logged:

```python
class IngestionLog(Model):
    """Every data ingestion run. Public schema."""
    tenant = ForeignKey(Tenant)
    connector = CharField()  # "meta_ads", "helloflex"
    
    # What happened
    status = CharField(choices=['started', 'success', 'partial', 'failed'])
    records_fetched = IntegerField(default=0)
    records_inserted = IntegerField(default=0)
    records_updated = IntegerField(default=0)
    records_skipped = IntegerField(default=0)
    
    # Target
    target_table = CharField()  # which table was written to
    data_size_bytes = IntegerField(default=0)  # size of fetched data
    
    # Performance
    duration_ms = IntegerField()
    api_calls_made = IntegerField(default=0)  # calls to external API
    
    # Error tracking
    error_message = TextField(null=True)
    error_traceback = TextField(null=True)
    
    # Timing
    started_at = DateTimeField()
    completed_at = DateTimeField(null=True)
    
    class Meta:
        indexes = [
            Index(fields=['tenant', 'connector', 'started_at']),
        ]
```

### 3. User Sessions (activity tracking)

Track when users are active:

```python
class UserSession(Model):
    """User session tracking. Public schema."""
    tenant = ForeignKey(Tenant)
    user = ForeignKey(User)
    
    # Session
    session_start = DateTimeField()
    session_end = DateTimeField(null=True)  # updated on last activity
    last_activity = DateTimeField()  # updated on each request
    duration_minutes = IntegerField(null=True)  # computed on session end
    
    # Context
    source_app = CharField(null=True)  # which app they were using
    device_type = CharField(null=True)  # desktop/mobile/tablet
    
    class Meta:
        indexes = [
            Index(fields=['tenant', 'user', 'session_start']),
        ]
```

Session logic:
- New session starts on first request after 30min inactivity
- `last_activity` updated on each API call (via middleware)
- Session "closes" when no activity for 30min (background task)
- `duration_minutes` = `last_activity - session_start`

### 4. Data Consumption (what data is accessed)

```python
class DataAccessLog(Model):
    """Which data users consume. Public schema."""
    tenant = ForeignKey(Tenant)
    user = ForeignKey(User)
    
    # What was accessed
    data_source = CharField()  # "meta", "helloflex"
    table_name = CharField()  # "meta_campaigns"
    
    # How much
    rows_returned = IntegerField()
    response_size_bytes = IntegerField()
    query_duration_ms = IntegerField()
    
    # Context
    source_app = CharField(null=True)
    timestamp = DateTimeField(auto_now_add=True)
    
    class Meta:
        indexes = [
            Index(fields=['tenant', 'user', 'timestamp']),
            Index(fields=['tenant', 'data_source', 'timestamp']),
        ]
```

### 5. Storage & Compute Metrics (periodic)

Background task (daily) that measures:

```python
class TenantMetricsSnapshot(Model):
    """Daily snapshot of tenant resource usage. Public schema."""
    tenant = ForeignKey(Tenant)
    date = DateField()
    
    # Storage
    schema_size_bytes = BigIntegerField()  # pg_total_relation_size
    table_count = IntegerField()
    row_count_total = BigIntegerField()
    materialized_view_count = IntegerField()
    
    # Activity (aggregated from other logs)
    api_calls_total = IntegerField()
    api_calls_unique_users = IntegerField()
    active_users = IntegerField()  # users with >= 1 session
    total_session_minutes = IntegerField()
    
    # Ingestion
    ingestion_runs = IntegerField()
    ingestion_records_total = IntegerField()
    ingestion_errors = IntegerField()
    
    # Cost indicators
    compute_seconds = IntegerField()  # sum of all duration_ms / 1000
    data_transferred_bytes = BigIntegerField()  # sum of response sizes
    
    class Meta:
        unique_together = ('tenant', 'date')
```

---

## How It's Implemented

### Django Middleware (automatic, every request)

```python
class MonitoringMiddleware:
    """Logs every API request + updates user session."""
    
    def __call__(self, request):
        start_time = time.time()
        
        # Count DB queries
        reset_queries()
        
        response = self.get_response(request)
        
        duration_ms = (time.time() - start_time) * 1000
        
        # Log API request
        APIRequestLog.objects.create(
            tenant=request.tenant,
            user=request.user if request.user.is_authenticated else None,
            endpoint=request.path,
            method=request.method,
            status_code=response.status_code,
            response_size_bytes=len(response.content),
            duration_ms=duration_ms,
            db_query_count=len(connection.queries),
            db_query_time_ms=sum(float(q['time']) for q in connection.queries) * 1000,
            source_app=request.headers.get('X-Source-App'),
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
        )
        
        # Update user session
        if request.user.is_authenticated:
            self.update_session(request)
        
        return response
```

### Data Access Decorator (on data API views)

```python
@log_data_access
def get_table_data(request, table_name):
    """API endpoint that serves materialized view data."""
    queryset = get_filtered_data(request.user, request.tenant, table_name)
    # ... return response
```

### Background Tasks (Django Q)

- **Session closer**: every 5min, close sessions with no activity > 30min
- **Daily metrics**: every night, compute TenantMetricsSnapshot
- **Log cleanup**: after 90 days, aggregate old logs and delete raw records

---

## Who Sees What

### Platform Owner (us) — Control Centre

Full visibility across all tenants:

```
┌─────────────────────────────────────────────────────────────┐
│  🏠 Platform Control Centre                                  │
│                                                              │
│  📊 Overview                                                 │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Active tenants: 24    Active users today: 156       │    │
│  │ API calls today: 45,231   Avg response: 82ms       │    │
│  │ Ingestion errors: 2    Storage total: 12.4 GB      │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  💰 Cost per Tenant (this month)                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Tenant        │ API Calls │ Storage │ Compute │ Est.│    │
│  │ Faam          │ 12,450   │ 2.1 GB │ 4.2 hrs │ €45│    │
│  │ Klant B       │ 8,210    │ 1.4 GB │ 2.8 hrs │ €32│    │
│  │ Klant C       │ 890      │ 0.2 GB │ 0.3 hrs │ €8 │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  🔍 Drill down per tenant:                                   │
│  - API calls per user per dag                                │
│  - Session duration per user                                 │
│  - Data consumption per table                                │
│  - Ingestion history (success/fail, duration, volume)       │
│  - Storage growth over time                                  │
│  - Slowest endpoints                                         │
│  - Most expensive users (API calls × duration)              │
└─────────────────────────────────────────────────────────────┘
```

### Tenant Admin — Usage Insights (subset)

Tenant admins see their own tenant's data:

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Usage Insights (Faam)                                    │
│                                                              │
│  👥 Active Users                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ User          │ Sessions │ Time Online │ Data Used  │    │
│  │ Jan v/d Berg  │ 14       │ 6.2 hrs    │ 2,450 rows │    │
│  │ Marie Jansen  │ 8        │ 3.1 hrs    │ 890 rows   │    │
│  │ Piet Bakker   │ 2        │ 0.4 hrs    │ 120 rows   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  📈 Usage Trends                                             │
│  - API calls per week (chart)                                │
│  - Active users per dag (chart)                              │
│  - Most accessed datasets                                    │
│                                                              │
│  🔌 Data Ingestion Status                                    │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Connector    │ Last Run     │ Status │ Records     │    │
│  │ Meta Ads     │ 2 hrs ago    │ ✅     │ 1,240 new   │    │
│  │ HelloFlex    │ 30 min ago   │ ✅     │ 89 updated  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### What Tenant Admins DON'T See
- Cost estimates (that's our business)
- Other tenants' data (obviously)
- Platform-level system metrics
- Infrastructure details

---

## API Endpoints

### For Platform Control Centre (superuser only)

```
GET /api/platform/metrics/overview/              → platform-wide stats
GET /api/platform/metrics/tenants/               → cost/usage per tenant
GET /api/platform/metrics/tenants/<slug>/        → drill-down per tenant
GET /api/platform/metrics/tenants/<slug>/users/  → per-user within tenant
GET /api/platform/metrics/ingestion/             → all ingestion logs
GET /api/platform/metrics/slow-queries/          → performance issues
```

### For Tenant Admin (scoped to their tenant)

```
GET /api/tenant/metrics/overview/                → tenant summary
GET /api/tenant/metrics/users/                   → per-user activity
GET /api/tenant/metrics/data-access/             → which data is used
GET /api/tenant/metrics/ingestion/               → connector status
GET /api/tenant/metrics/trends/                  → usage over time
```

---

## Data Retention & Performance

| Log type | Retention (raw) | Aggregation | Aggregated retention |
|----------|----------------|-------------|---------------------|
| APIRequestLog | 30 days | Daily per tenant/user/endpoint | 2 years |
| IngestionLog | 90 days | Daily per tenant/connector | Forever |
| UserSession | 90 days | Daily per tenant/user | 2 years |
| DataAccessLog | 30 days | Daily per tenant/user/table | 2 years |
| TenantMetricsSnapshot | Forever | Already aggregated | Forever |

Background task: nightly aggregation + cleanup of raw logs older than retention period.

---

## Design Principles

1. **Automatic** — middleware logs everything, no manual instrumentation needed
2. **Low overhead** — async writes (bulk insert via Django Q if needed), indexes for reads
3. **Tenant-scoped** — all data filterable by tenant, never cross-tenant leakage
4. **Two views** — same data, different access: full for us, scoped for clients
5. **Cost-oriented** — everything maps to a cost: compute time, storage, API calls
6. **Actionable** — not just data, but insights: "User X costs you €12/month but rarely logs in"

---

## Open Questions
- [ ] Willen we real-time dashboards (WebSocket) of is periodic refresh genoeg?
- [ ] Alerting: notificaties bij ingestion errors of ongewoon hoog gebruik?
- [ ] Export: kunnen tenants hun usage data exporteren (CSV)?
- [ ] Billing integration: automatisch factureren op basis van usage? (later)
- [ ] GDPR: hoe lang mogen we user activity data bewaren?
