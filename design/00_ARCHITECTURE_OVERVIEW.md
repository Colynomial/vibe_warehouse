# Vibe Warehouse — Architecture Overview

## Vision

A multi-tenant SaaS platform for non-technical SMBs in the Netherlands. Clients get:
1. **Data ingestion** — we pull their data from APIs (Meta, HelloFlex, etc.) via Django Q
2. **Materialized views** — SQL queries (optionally AI-generated) transform raw data into useful datasets
3. **Self-service dashboards** — clients vibe-code their own apps on top of our data layer using Claude

## Key Architectural Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Backend | Django + DRF (API-only) | Team knows Django, proven at scale |
| Frontend | React + Vite + TypeScript | Best AI/vibe-coding support, largest ecosystem |
| UI Kit | @vibewarehouse/ui (private npm package) | Consistent design, clients upgrade at own pace |
| Multi-tenancy | Schema-per-tenant | True isolation, no tenant_id filtering bugs, clean migrations |
| Permission model | Resource-based (no fixed roles) | Fine-grained: data_source/table/row + app/page/action level |
| Task queue | Django Q (ORM-backed) | No Redis dependency, proven in Colynomial |
| Database | PostgreSQL (dev + prod) | Schema-per-tenant native, materialized views, production parity |
| Frontend hosting | Azure Static Web Apps | Preview per branch, custom domains, independent deploys per tenant |
| Backend hosting | Azure App Service | Managed, scalable |
| Vibe coding tool | Claude.ai (Projects + GitHub integration) | Client already uses it, Artifacts for preview, direct repo pushes |
| Tenant repos | Monorepo per tenant (npm workspaces) | Multiple apps + shared layer, Claude works best with single repo |
| Monitoring | Django models (tenant-scoped) | Shareable with clients, full control, no external vendor needed |
| Routing | Wildcard subdomain (*.platformname.com) | Clean tenant isolation |

## High-Level Architecture

```
         *.platformname.com (wildcard DNS)
                    │
            ┌───────▼────────┐
            │  Reverse Proxy  │  (Azure Front Door / nginx)
            └───┬───┬───┬────┘
                │   │   │
    ┌───────────┘   │   └───────────┐
    ▼               ▼               ▼
┌────────┐   ┌──────────┐   ┌──────────────┐
│ Core   │   │ Tenant A │   │ Tenant B     │
│ Portal │   │ React    │   │ React App    │
│ (ons)  │   │ App      │   │ (vibe-coded) │
└───┬────┘   └────┬─────┘   └──────┬───────┘
    └──────────────┼────────────────┘
                   │ REST API (JSON + JWT)
                   ▼
┌─────────────────────────────────────────────────────┐
│              DJANGO BACKEND                         │
│            api.platformname.com                     │
│  ┌─────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │  Auth &  │  │  Tenant  │  │   Data Ingestion  │  │
│  │  RBAC   │  │  Router  │  │   (Django Q)      │  │
│  └─────────┘  └──────────┘  └───────────────────┘  │
│  ┌──────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ Materialized │  │ Vibe Coding│  │ Monitoring │  │
│  │ Views (SQL)  │  │ API (repo) │  │ & Metrics  │  │
│  └──────────────┘  └────────────┘  └────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────┐
│                   DATABASE                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐          │
│  │ public   │  │ tenant_  │  │ tenant_  │  ...     │
│  │ (shared) │  │ faam     │  │ klant_b  │          │
│  └──────────┘  └──────────┘  └──────────┘          │
└─────────────────────────────────────────────────────┘
```

### URL Structure
- `api.platformname.com` → Django backend (all API calls)
- `app.platformname.com` → Core platform portal (our React app)
- `faam.platformname.com` → Faam's tenant app (vibe-coded React build)
- `preview-faam.platformname.com` → Preview deploy (dev branch)

### Schema Layout

- **`public` schema**: platform users, tenants, plans, billing, shared config, monitoring/metrics
- **`tenant_<slug>` schemas**: per-tenant data tables, materialized views, ingestion logs

### Frontend Deployment Model

Each tenant app is an independent static React build:
- **Azure Static Web Apps** per tenant repo
- Push to `dev` → preview deploy (preview-klantnaam.platformname.com)
- Merge to `main` → production deploy (klantnaam.platformname.com)
- Independent: one tenant broken ≠ others affected
- Local dev: `npm run dev` → Vite on localhost (no Azure needed)

### Tenant Repo Structure (monorepo per tenant)
```
tenant-faam/
├── apps/
│   ├── main-dashboard/     ← primary app
│   ├── hr-portal/          ← second app (optional)
│   └── ...                 
├── shared/                 ← shared components within tenant
│   ├── components/
│   └── utils/
├── package.json            ← npm workspaces root
├── vite.config.ts
└── .claude/                ← AI context for Claude.ai
    ├── api-docs.md         ← auto-generated endpoint docs
    ├── ui-kit.md           ← @vibewarehouse/ui usage guide
    └── examples.md         ← example implementations
```

### Vibe Coding Flow
```
Client chats with Claude.ai (Project with repo context)
       │ Claude generates code + Artifacts preview
       │ Client approves
       ▼
Claude pushes to dev branch (GitHub integration)
       │ Azure Static Web Apps auto-deploys
       ▼
Preview: preview-faam.platformname.com
       │ Client checks, approves
       ▼
Merge dev → main → Live: faam.platformname.com
```

## Differences vs Colynomial Reference

| Aspect | Colynomial (reference) | Vibe Warehouse (new) |
|--------|----------------------|---------------------|
| Multi-tenancy | UserRole + GenericFK (shared tables) | Schema-per-tenant (true isolation) |
| Frontend | Django templates (server-rendered) | React SPA (decoupled) |
| API style | Django views returning HTML + some JSON | REST API only (DRF) |
| Data access | Direct ORM queries | Materialized views + API |
| Client customization | We build everything | Clients vibe-code their own dashboards |
| DB | Single PostgreSQL | Schema-per-tenant PostgreSQL |

## What We Keep From Colynomial

- Django Q with ORM backend (no Redis) — works well
- Hierarchical permission patterns (Faam's role model is a good reference)
- Data ingestion patterns (API proxy + upsert + IngestionState tracking)
- Dashboard SQL registry concept → evolves into materialized views
- Email-based login + invitation flow

## Auth & Roles (summary — see [feature-auth](./feature-auth/01_requirements.md) for full spec)

Three layers:
1. **Platform superuser** — us (Colynomial). Access all tenants via impersonation. Invisible to tenants.
2. **Tenant admin/dev** — client's power user. Manages users, apps, permissions. Achterkant access.
3. **Tenant user** — end user. Sees only assigned apps with scoped data.

Key design choices:
- One email can belong to multiple tenants (shared User record, multiple TenantMemberships)
- Per-app access control with roles (admin/editor/viewer) + data scope (row-level filters)
- All permission changes logged (compliance audit trail)
- Removal cascade: remove from app → remove from tenant (if last app) → deactivate account (if last tenant)
- Achterkant is part of core portal, not a separate app

## Monitoring & Metrics

All usage tracked in Django models (public schema). See [feature-monitoring](./feature-monitoring/01_requirements.md) for full spec.

**What we track:**
- API requests (per tenant/user/endpoint, with timing + size)
- Data ingestion (per connector, records, duration, errors)
- User sessions (online time, activity patterns)
- Data consumption (which tables, how many rows, query cost)
- Daily snapshots (storage size, compute time, active users)

**Two audiences:**
- Platform owner: full visibility, cost allocation per tenant/user
- Tenant admin: usage insights for their organization (no cost data)

**Implementation:** Django middleware (automatic, every request) + background aggregation tasks.
