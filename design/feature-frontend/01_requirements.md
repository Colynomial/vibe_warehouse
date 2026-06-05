# Frontend Architecture — Requirements

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | React + TypeScript | Best AI/vibe-coding support (most training data for Claude) |
| Build tool | Vite | Fastest dev experience, simple config |
| Styling | Tailwind CSS | Utility-first, great with AI, consistent output |
| Components | shadcn/ui (base) | Copy-paste, no dependency lock-in |
| Charts | Recharts or Tremor | React-native, simple API for dashboards |
| State | TanStack Query | Server-state management, caching, auto-refetch |
| Routing | React Router | Standard, well-documented |
| Auth | JWT (httpOnly cookie, domain=.platformname.com) | Works cross-subdomain |
| Hosting | Azure Static Web Apps | Preview per branch, auto-deploy, custom domains |
| Local dev | Vite dev server (localhost) | No Azure needed for development |

## Two Types of Frontend Apps

### 1. Core Platform Portal (built by us)
- URL: `app.platformname.com`
- Purpose: login, tenant management, data overview, connector config, monitoring
- Built and maintained by our team
- Single React + Vite + TypeScript app

### 2. Tenant Apps (vibe-coded by client with Claude.ai)
- URL: `klantnaam.platformname.com`
- Purpose: custom dashboards, workflows, applications
- Built by client via Claude.ai from our template
- Monorepo per tenant with npm workspaces (multiple apps possible)

## URL Routing

```
*.platformname.com (wildcard DNS → Azure Front Door / reverse proxy)
  │
  ├── api.platformname.com          → Django backend
  ├── app.platformname.com          → Core portal (our React app)
  ├── faam.platformname.com         → Faam production app
  ├── preview-faam.platformname.com → Faam dev branch preview
  └── klantb.platformname.com       → Another tenant's app
```

### Local Development (no Azure)
```
localhost:8000          → Django backend
localhost:5173          → Core portal (Vite dev server)
localhost:5174          → Tenant app under development (Vite)
```

Tenant resolution in local dev: use `X-Tenant-Slug` header or query param instead of subdomain.

## Deployment Model

```
Push to dev branch
    │ GitHub webhook
    ▼
Azure Static Web Apps (auto-build)
    │ npm run build
    ▼
Preview: preview-klantnaam.platformname.com
    │ client approves
    ▼
Merge dev → main
    │ auto-deploy
    ▼
Live: klantnaam.platformname.com
```

### Properties
- **Independent deploys**: tenant A deploy does not affect tenant B
- **Zero-downtime**: old build served until new is ready
- **Rollback**: revert git commit → auto-redeploy previous version
- **Scalable**: static files on CDN = unlimited scalability

## Cross-Subdomain Auth

```
1. User visits faam.platformname.com
2. No JWT cookie → redirect to app.platformname.com/login
3. User logs in → Django sets JWT cookie with domain=.platformname.com
4. Redirect back to faam.platformname.com
5. Cookie now readable by all *.platformname.com subdomains
6. API calls include cookie automatically (same parent domain)
```

Cookie settings:
- `domain=.platformname.com` (shared across subdomains)
- `HttpOnly=true` (not accessible via JS)
- `Secure=true` (HTTPS only, production)
- `SameSite=Lax`

## @vibewarehouse/ui Package

Shared component library published as private npm package.

### Distribution
- Published to GitHub Packages (or Azure Artifacts)
- Semantic versioning: clients pin version, upgrade when ready
- AI-assisted migration for breaking changes

### Components included
- `<AuthProvider>` — JWT handling, login redirect, token refresh
- `<TenantLayout>` — sidebar, header, responsive shell
- `<DataTable>` — pagination, sorting, filtering on API data
- `<BarChart>`, `<LineChart>`, `<PieChart>` — standard charts
- `<FilterPanel>` — date ranges, dropdowns, search
- `<FormBuilder>` — dynamic forms from API schema
- API client utilities (typed fetch wrappers)

### Usage in tenant app
```tsx
import { AuthProvider, TenantLayout, DataTable, BarChart } from '@vibewarehouse/ui'

function App() {
  return (
    <AuthProvider>
      <TenantLayout>
        <DataTable endpoint="/api/data/monthly-spend/" />
        <BarChart endpoint="/api/data/monthly-spend/" xKey="month" yKey="total_spend" />
      </TenantLayout>
    </AuthProvider>
  )
}
```

## Open Questions
- [ ] Hoe handlen we meerdere apps per tenant repo in Azure Static Web Apps? (Aparte SWA per app? Of één SWA met routing?)
- [ ] Willen we een design system / Storybook voor de UI kit?
- [ ] Dark mode?
