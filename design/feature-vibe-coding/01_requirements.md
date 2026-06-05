# Vibe Coding — Requirements

## Core Idea
Clients build their own dashboards/apps by vibe-coding with Claude.ai against our data API.
Clients are non-technical — they never touch a code editor or terminal.

## Decisions Made

| Decision | Choice |
|----------|--------|
| IDE/tool | Claude.ai (Projects + GitHub integration) |
| Preview | Claude Artifacts (live component preview) + Azure preview deploys |
| Repo model | Monorepo per tenant (npm workspaces), multiple apps possible |
| Deploy | Azure Static Web Apps (auto-deploy on push) |
| UI library | @vibewarehouse/ui (private npm package, client upgrades at own pace) |
| Branching | `dev` = preview, `main` = production |

## How It Works

```
1. Client signs up → tenant provisioned
2. Data connectors configured → data flows in
3. We auto-generate a GitHub repo from template:
   - React + Vite + TypeScript boilerplate
   - @vibewarehouse/ui pre-installed
   - Auto-generated API client (typed, from their materialized views)
   - .claude/ context files (API docs, UI kit docs, examples)
4. Client creates Claude.ai Project with repo connected
5. Client describes what they want → Claude builds it
6. Claude pushes to dev branch → preview auto-deploys
7. Client checks preview-klantnaam.platformname.com
8. Merge dev → main → live at klantnaam.platformname.com
```

## Tenant Repo Structure

```
tenant-faam/
├── apps/
│   ├── main-dashboard/       ← primary app
│   │   ├── src/
│   │   └── package.json
│   ├── hr-portal/            ← second app (another team)
│   └── marketing-dash/       ← third app
├── shared/                   ← tenant-internal shared code
│   ├── components/
│   └── utils/
├── .claude/                  ← AI context for Claude.ai
│   ├── api-docs.md           ← auto-generated from materialized views
│   ├── ui-kit.md             ← @vibewarehouse/ui usage guide
│   └── examples.md           ← example implementations
├── package.json              ← npm workspaces root
└── turbo.json                ← optional monorepo tooling
```

## Auto-Generated Claude Context (.claude/api-docs.md)

Generated per tenant based on their active materialized views:
```markdown
# Available API Endpoints

Base URL: `https://api.platformname.com`
Auth: Bearer token (JWT) — included automatically by @vibewarehouse/ui AuthProvider

## GET /api/data/monthly-ad-spend/
Monthly advertising spend by campaign.

**Fields:** month, campaign_name, total_spend, total_impressions, total_clicks
**Filters:** ?month_from=2025-01&month_to=2025-12&campaign_name=brand

**Example response:**
```json
[
  { "month": "2025-01", "campaign_name": "Brand", "total_spend": 1250.00 }
]
```

## @vibewarehouse/ui Components Available
- `<DataTable data={...} columns={...} />` — sortable, filterable table
- `<BarChart data={...} xKey="month" yKey="total_spend" />` — bar chart
- `<AuthProvider>` — wrap app for automatic JWT handling
```

## @vibewarehouse/ui Package

Shared npm package (private, published to GitHub Packages):
- `<AuthProvider>` — JWT handling, login redirect, token refresh
- `<TenantLayout>` — sidebar, header, responsive shell
- `<DataTable>` — pagination, sorting, filtering
- `<BarChart>`, `<LineChart>`, `<PieChart>` — standard charts
- `<FilterPanel>` — date ranges, dropdowns, search
- `<FormBuilder>` — dynamic forms from API schema
- API client (auto-generated per tenant, typed endpoints)

Versioning: semantic, clients pin version, upgrade at own pace (AI-assisted migration).

## Provisioning Steps (what our platform does when creating a tenant)

1. Create GitHub repo from template (GitHub API)
2. Generate `.claude/api-docs.md` from tenant's materialized views
3. Create Azure Static Web App linked to repo
4. Configure custom domain: `klantnaam.platformname.com`
5. Set up preview environment for `dev` branch
6. Provide client with repo access + Claude.ai setup instructions

## Open Questions (resolved)
- [x] Repo per klant of monorepo? → **Monorepo per tenant** (apps/ folders)
- [x] Deploy methode? → **Azure Static Web Apps** (auto on push)
- [x] Template gallery? → Later (start with one template)
- [x] Rate limiting? → **Nee, maar monitoring** (Django models, shared with client)
- [x] Hosting kosten? → Onderdeel van subscription

## Remaining Open Questions
- [ ] Hoe automatiseren we de api-docs.md regeneratie bij nieuwe materialized views?
- [ ] Moeten we een GitHub App bouwen voor repo provisioning of is API + PAT genoeg?
- [ ] Hoe gaan we om met meerdere apps in één repo + Azure Static Web Apps? (aparte SWA per app folder?)
