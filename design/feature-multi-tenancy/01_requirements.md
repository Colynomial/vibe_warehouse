# Multi-Tenancy — Requirements

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|----------|
| Database | PostgreSQL (ook voor development) | Schema-per-tenant native, materialized views, production parity |
| Isolation | Schema-per-tenant | Echte isolatie, geen tenant_id filtering bugs |
| Permission model | Resource-based (geen vaste rollen) | Maximale flexibiliteit, dynamisch configureerbaar door tenant admin |
| Default access | Deny (explicit allow required) | Veiligste standaard |

## Schema-per-Tenant

```
PostgreSQL Database
├── public              ← shared: users, tenants, permissions, config, metrics
├── tenant_faam         ← Faam's data: contracts, timecards, kpis, materialized views
├── tenant_klant_b      ← Another client's data
└── tenant_klant_c      ← etc.
```

### How It Works in Django
- **Middleware** reads tenant from JWT claim (or X-Tenant-Slug header in local dev)
- **Database router** switches schema: `SET search_path TO tenant_faam, public`
- All ORM queries automatically scoped to tenant schema
- Migrations run per-schema (new tenant = `CREATE SCHEMA` + `migrate`)
- Public schema always in search_path (shared models accessible)

### Tenant Lifecycle
```
Create tenant:
  1. Insert Tenant record in public schema
  2. CREATE SCHEMA tenant_<slug>
  3. Run migrations on new schema
  4. Seed default data (if any)

Delete tenant:
  1. Deactivate Tenant record
  2. (Optional) DROP SCHEMA tenant_<slug> CASCADE
  3. Archive data backup first
```

---

## Permission System: Resource-Based Access Control

Geen vaste rollen (admin/editor/viewer). Alles direct op resource-niveau configureerbaar.

### Resource Hierarchy

```
Data permissions (hiërarchisch):
  data_source (groep)          bijv. "meta", "helloflex"
    └── table                  bijv. "meta_campaigns", "meta_ad_spend"
         └── row_filter        bijv. column "team_id" IN [5, 8]

App/UI permissions (hiërarchisch):
  app                          bijv. "main-dashboard", "hr-portal"
    └── page                   bijv. "overview", "financial", "settings"
         └── action            bijv. "export", "edit", "delete", "approve"
```

### Evaluation Rules

1. **Default = deny** — geen expliciete allow = geen toegang
2. **Specifiekste regel wint** — table-level overruled data_source-level
3. **Deny overruled allow** op hetzelfde niveau
4. **Overerving naar beneden** — deny op data_source blokkeert alle tabellen eronder

Voorbeelden:
- Deny op `data_source: meta` → user ziet GEEN enkele meta-tabel
- Allow op `data_source: meta` + deny op `table: meta_costs` → alles behalve costs
- Allow op `app: main-dashboard` + deny op `page: settings` → app zichtbaar, settings niet
- Allow op `page: overview` + deny op `action: export` → pagina zichtbaar, export knop niet

### Data Model

```python
class Permission(Model):
    """Single permission rule for a user within a tenant.
    Stored in public schema (cross-tenant queryable for platform admins)."""
    tenant = ForeignKey(Tenant)
    user = ForeignKey(User)
    
    # What resource type
    resource_type = CharField(choices=[
        'data_source',   # groep: meta, helloflex
        'table',         # specifieke tabel
        'row_filter',    # rij-level filter
        'app',           # tenant app
        'page',          # pagina binnen app
        'action',        # knop/actie binnen pagina
    ])
    
    # Which specific resource
    resource_id = CharField()  # bijv. "meta", "meta_campaigns", "main-dashboard"
    
    # Parent resource (for hierarchy resolution)
    parent_resource_type = CharField(null=True)
    parent_resource_id = CharField(null=True)
    
    # Access effect
    effect = CharField(choices=['allow', 'deny'])
    
    # Row-level scope (only for resource_type='row_filter')
    scope_column = CharField(null=True)   # bijv. "team_id"
    scope_operator = CharField(null=True, choices=[
        'equals', 'not_equals', 'in', 'not_in'
    ])
    scope_value = JSONField(null=True)    # bijv. 5 of [5, 8, 12]
    
    # Audit
    granted_by = ForeignKey(User, related_name='permissions_granted')
    granted_at = DateTimeField(auto_now_add=True)
    reason = TextField(blank=True)
    
    class Meta:
        indexes = [
            Index(fields=['tenant', 'user', 'resource_type']),
            Index(fields=['tenant', 'resource_type', 'resource_id']),
        ]
```

### Backend Enforcement

```python
def get_allowed_tables(user, tenant):
    """Return list of tables user can access, with row filters."""
    perms = Permission.objects.filter(tenant=tenant, user=user)
    
    # Get data_source level permissions
    source_perms = perms.filter(resource_type='data_source')
    denied_sources = source_perms.filter(effect='deny').values_list('resource_id', flat=True)
    allowed_sources = source_perms.filter(effect='allow').values_list('resource_id', flat=True)
    
    # Get table level permissions
    table_perms = perms.filter(resource_type='table')
    denied_tables = table_perms.filter(effect='deny').values_list('resource_id', flat=True)
    allowed_tables = table_perms.filter(effect='allow').values_list('resource_id', flat=True)
    
    # Get row filters
    row_filters = perms.filter(resource_type='row_filter')
    
    # Build accessible tables:
    # 1. All tables in allowed sources, MINUS denied tables
    # 2. Plus explicitly allowed tables (even if source not explicitly allowed)
    # 3. Minus tables in denied sources
    # 4. Attach row filters per table
    ...

def apply_row_filters(queryset, user, tenant, table_name):
    """Apply row-level filters to a queryset based on user permissions."""
    filters = Permission.objects.filter(
        tenant=tenant, user=user,
        resource_type='row_filter',
        parent_resource_id=table_name
    )
    for f in filters:
        if f.scope_operator == 'equals':
            queryset = queryset.filter(**{f.scope_column: f.scope_value})
        elif f.scope_operator == 'in':
            queryset = queryset.filter(**{f'{f.scope_column}__in': f.scope_value})
        elif f.scope_operator == 'not_equals':
            queryset = queryset.exclude(**{f.scope_column: f.scope_value})
        elif f.scope_operator == 'not_in':
            queryset = queryset.exclude(**{f'{f.scope_column}__in': f.scope_value})
    return queryset
```

### Frontend Integration

Permissions returned via API at login/token refresh:
```json
{
  "permissions": {
    "data": {
      "meta": { "effect": "allow", "tables": {
        "meta_campaigns": { "effect": "allow", "row_filters": [] },
        "meta_ad_spend": { "effect": "allow", "row_filters": [] },
        "meta_costs": { "effect": "deny" }
      }},
      "helloflex": { "effect": "allow", "tables": {
        "contracts": { "effect": "allow", "row_filters": [
          { "column": "team_id", "operator": "in", "value": [5, 8] }
        ]}
      }}
    },
    "apps": {
      "main-dashboard": { "effect": "allow", "pages": {
        "overview": { "effect": "allow", "actions": {
          "export": { "effect": "allow" },
          "delete": { "effect": "deny" }
        }},
        "settings": { "effect": "deny" }
      }},
      "hr-portal": { "effect": "deny" }
    }
  }
}
```

React hook:
```tsx
function usePermission(resourceType: string, resourceId: string): boolean {
  const { permissions } = useAuth()
  return resolvePermission(permissions, resourceType, resourceId)
}

// Usage
function OverviewPage() {
  const canExport = usePermission('action', 'overview.export')
  const canDelete = usePermission('action', 'overview.delete')
  
  return (
    <DataTable endpoint="/api/data/contracts/">
      {canExport && <ExportButton />}
      {canDelete && <DeleteButton />}
    </DataTable>
  )
}
```

### Admin UI (tenant beheerder)

Visuele tree met toggles — geen technische kennis nodig:

```
┌──────────────────────────────────────────────────────────┐
│  👤 Jan van der Berg — Rechten beheren               │
│                                                          │
│  📊 Data Bronnen                                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ✅ Meta Ads                                        │  │
│  │    ✅ meta_campaigns                              │  │
│  │    ✅ meta_ad_spend                               │  │
│  │    ❌ meta_costs (verborgen)                      │  │
│  │                                                   │  │
│  │ ✅ HelloFlex                                      │  │
│  │    ✅ contracts                                   │  │
│  │       🔒 Alleen team_id IN [5, 8]                │  │
│  │    ✅ timecards                                   │  │
│  │       🔒 Alleen team_id IN [5, 8]                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  📱 Apps & Pagina's                                      │
│  ┌──────────────────────────────────────────────────┐  │
│  │ ✅ Main Dashboard                                 │  │
│  │    ✅ Overview                                    │  │
│  │       ✅ Export  ❌ Delete                        │  │
│  │    ✅ Reports                                     │  │
│  │    ❌ Settings (verborgen)                        │  │
│  │                                                   │  │
│  │ ❌ HR Portal (geen toegang)                       │  │
│  └──────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Design Principles

1. **Geen vaste rollen** — alles op resource-niveau, direct configureerbaar
2. **Hiërarchisch** — deny op groep-niveau geldt voor alles eronder
3. **Specifiekste wint** — table-level overruled data_source-level
4. **Deny overruled allow** op hetzelfde niveau
5. **Default = deny** — expliciet allow vereist
6. **Backend enforced** — frontend is UX, backend is de echte check
7. **Audit trail** — elke wijziging gelogd (PermissionChangeLog)
8. **Dynamisch** — tenant admin configureert via UI, geen code changes
9. **Groepen later** — nu per user, later optioneel user groups

---

## Row-Level Security + Materialized Views

Materialized views zijn pre-computed. Row-filtering werkt als volgt:
- Materialized view bevat ALLE data voor de tenant
- Bij API request: permission row_filters worden als WHERE clause toegepast op de view
- Backend filtert altijd, ongeacht wat frontend doet

```sql
-- Materialized view (bevat alle data)
CREATE MATERIALIZED VIEW mv_monthly_spend AS
SELECT team_id, month, campaign, spend FROM raw_meta_ads GROUP BY 1,2,3;

-- Query voor user met row_filter team_id IN [5, 8]
SELECT * FROM mv_monthly_spend WHERE team_id IN (5, 8);
```

---

## Open Questions
- [ ] Hoe handlen we schema-migraties voor 100+ tenants efficient?
- [ ] Willen we django-tenants library of zelf bouwen?
- [ ] Hoe registreren tenant apps hun pages/actions? (hardcoded manifest? API-driven?)
- [ ] Performance: cachen we de resolved permissions per user? (Redis/in-memory?)
- [ ] User groups ("Sales team ziet X") — wanneer toevoegen?
