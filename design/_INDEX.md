# Feature Index

Master index of all Vibe Warehouse features. See [ROADMAP.md](./ROADMAP.md) for phased delivery plan.

## Core Features

### Multi-Tenancy (Schema-per-Tenant)
- **[feature-multi-tenancy](./feature-multi-tenancy/)** — Schema isolation, tenant routing, data & UI permissions
  - Status: 📝 Ideation
  - Priority: P0 (MVP)
  - Docs: [01_requirements.md](./feature-multi-tenancy/01_requirements.md)

### Authentication & Authorization
- **[feature-auth](./feature-auth/)** — JWT auth, tenant-scoped users, role-based access
  - Status: 📝 Ideation
  - Priority: P0 (MVP)
  - Docs: [01_requirements.md](./feature-auth/01_requirements.md)

### Data Warehouse & Ingestion
- **[feature-data-warehouse](./feature-data-warehouse/)** — Generic connectors (HelloFlex, Meta Ads), JSONB raw storage, MV engine with DAG
  - Status: ✅ Designed
  - Priority: P0 (MVP)
  - Docs: [01_requirements.md](./feature-data-warehouse/01_requirements.md)
  - Key decisions: JSONB+extracted columns for raw storage, SQL queries stored in DB + cache tables for MVs

### Dashboard / Data Portal
- **[feature-dashboard-builder](./feature-dashboard-builder/)** — Basic data views, tables, charts
  - Status: 📝 Ideation
  - Priority: P0 (MVP)
  - Docs: [01_requirements.md](./feature-dashboard-builder/01_requirements.md)

### Vibe Coding (Client Self-Service)
- **[feature-vibe-coding](./feature-vibe-coding/)** — Repo provisioning, API docs, client app hosting
  - Status: 📝 Ideation
  - Priority: P1
  - Docs: [01_requirements.md](./feature-vibe-coding/01_requirements.md)

### Frontend Architecture
- **[feature-frontend](./feature-frontend/)** — React + Vite, per-tenant deploys, @vibewarehouse/ui, Azure Static Web Apps
  - Status: 📝 Ideation
  - Priority: P0 (MVP)
  - Docs: [01_requirements.md](./feature-frontend/01_requirements.md)

### Monitoring & Usage Tracking
- **[feature-monitoring](./feature-monitoring/)** — API logging, ingestion tracking, user sessions, cost allocation, tenant insights
  - Status: 📝 Ideation
  - Priority: P0 (MVP)
  - Docs: [01_requirements.md](./feature-monitoring/01_requirements.md)

## Planning Status

| Feature | Status | Priority | Phase |
|---------|--------|----------|-------|
| Multi-Tenancy | 📝 Ideation | P0 | 1 |
| Auth | 📝 Ideation | P0 | 1 |
| Data Warehouse | 📝 Ideation | P0 | 1 |
| Dashboard | 📝 Ideation | P0 | 1 |
| Frontend | 📝 Ideation | P0 | 1 |
| Monitoring | 📝 Ideation | P0 | 1 |
| Vibe Coding | 📝 Ideation | P1 | 2 |

## How to Add a Feature

1. Create folder: `feature-name/`
2. Add files:
   - `01_requirements.md`
   - `02_design.md`
   - `03_api_spec.md`
   - `04_data_model.md`
   - `05_decisions.md`
   - `discussion/` (folder for decision docs)
3. Link in this index
4. Open GitHub Issue for tracking

See [CONTRIBUTING.md](../.github/CONTRIBUTING.md) for details.
