# Roadmap — Phase 1: Foundation

## Goal
Een werkend prototype met Faam als eerste klant. Login, data ophalen, data bekijken.
Alles lokaal draaibaar (geen Azure nodig voor development).

## Phase 1 Deliverables

### 1.1 Django Project Setup
- [ ] Django project met DRF (Django REST Framework)
- [ ] PostgreSQL database (local instance of Docker)
- [ ] Django Q met ORM backend
- [ ] Basic project structure: `config/`, `core/`, `tenants/`, `connectors/`, `monitoring/`

### 1.2 Multi-Tenancy (schema-per-tenant)
- [ ] Tenant model in public schema
- [ ] Tenant middleware (resolve tenant van JWT/header)
- [ ] Schema switching: `SET search_path TO tenant_<slug>, public`
- [ ] Tenant provisioning: admin maakt tenant aan → CREATE SCHEMA + migrate
- [ ] Permission model (resource-based access control)

### 1.3 Auth
- [ ] User model (email-based login)
- [ ] JWT auth (djangorestframework-simplejwt)
- [ ] Login/logout API endpoints
- [ ] Tenant-scoped users (user behoort tot tenant)
- [ ] Basic role: admin / viewer

### 1.4 React Frontend Shell (Core Portal)
- [ ] React + Vite + TypeScript project setup
- [ ] Login page
- [ ] Tenant-aware routing (subdomain → tenant context, localhost header for dev)
- [ ] Protected routes (JWT check)
- [ ] Basic layout: sidebar, header, content area
- [ ] Local dev: `npm run dev` op localhost:5173

### 1.5 Faam: First Data Connector
- [ ] Meta Ads connector (based on Colynomial's API proxy pattern)
- [ ] Raw data tables for Meta Ads in tenant schema
- [ ] Django Q task: periodic fetch
- [ ] Simple materialized view: monthly spend by campaign
- [ ] API endpoint to query the view

### 1.6 Basic Data Portal
- [ ] List available datasets
- [ ] Table view with data from materialized view
- [ ] Simple chart (bar chart: spend per month)

### 1.7 Monitoring (basic)
- [ ] APIRequestLog model
- [ ] Middleware that logs every API call (tenant, user, endpoint, duration)
- [ ] Admin view to see metrics

## Success Criteria
> We can log in as a Faam user, see Meta Ads data in a table and chart,
> data refreshes automatically via Django Q, and we can see API usage metrics.
> Everything runs locally (Django + Vite dev servers).

## What's NOT in Phase 1
- Row-level security (permission model exists, but basic allow/deny first)
- Vibe coding / repo provisioning / Azure Static Web Apps
- @vibewarehouse/ui package
- Custom dashboards
- Multiple connectors
- Production deployment (Azure)
- Claude.ai integration
- Permission admin UI (tree with toggles)

---

## Phase 2: Multi-Tenant Production + Vibe Coding (future)
- PostgreSQL with schema-per-tenant
- Azure Static Web Apps deployment
- @vibewarehouse/ui npm package
- Tenant repo provisioning (GitHub API)
- Claude.ai Project setup automation
- Row-level security
- Multiple data connectors
