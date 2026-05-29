# Design & Features

All product features, architectural decisions, and design specifications live here.

## Structure

```
design/
├─ 00_ARCHITECTURE_OVERVIEW.md      # System-wide architecture
├─ _INDEX.md                        # Master index of all features
├─ features/
│  ├─ feature-auth/
│  ├─ feature-data-warehouse/
│  ├─ feature-dashboard-builder/
│  ├─ feature-data-branches/
│  ├─ feature-vibe-coding/
│  └─ feature-multi-tenancy/
└─ decisions/
   └─ *.md (archived decisions)
```

## How to Use This Folder

### For Product Managers / Designers

1. Read [`00_ARCHITECTURE_OVERVIEW.md`](./00_ARCHITECTURE_OVERVIEW.md) to understand the system
2. Review [`_INDEX.md`](./_INDEX.md) to see all features
3. Read individual feature specs to understand scope

### For Engineers

1. Start with [`00_ARCHITECTURE_OVERVIEW.md`](./00_ARCHITECTURE_OVERVIEW.md)
2. Find your feature in [`_INDEX.md`](./_INDEX.md)
3. Read all files in `feature-*/`:
   - `01_requirements.md` - What to build
   - `02_design.md` - How to build it
   - `03_api_spec.md` - API endpoints (if backend)
   - `04_data_model.md` - Database schema
   - `05_decisions.md` - Why we chose this approach

### For AI Agents

Use all files in `feature-*/` as context. They are structured for AI consumption:
- Clear requirements (checkboxes ✅)
- Concrete examples (JSON, SQL)
- Decisions with reasoning
- Links to related features

## Feature Template

Each feature folder contains:

```
feature-name/
├─ 01_requirements.md
├─ 02_design.md
├─ 03_api_spec.md
├─ 04_data_model.md
├─ 05_decisions.md
└─ discussion/
   └─ *.md (key discussions/decisions)
```

[See example structure in CONTRIBUTING.md](../.github/CONTRIBUTING.md)

## Status

🟡 Actively being designed (Phase 1)

## Questions?

- Open a GitHub Issue
- Start a GitHub Discussion
- Reference specific decision docs
