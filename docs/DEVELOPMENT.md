# Development Setup

## Prerequisites

- **Python 3.12+** (via Conda: `conda create -n vibe_warehouse python=3.12`)
- **Node.js 18+** + npm
- **PostgreSQL 16+** (Azure Flexible Server or local)
- **Git**

## Quick Start

### 1. Clone & enter repo
```bash
git clone <repo-url>
cd vibe_warehouse
```

### 2. Backend setup
```bash
# Activate conda env
conda activate vibe_warehouse

# Install Python deps
pip install -r backend/requirements.txt

# Create .env from example
copy .env.example .env
# Edit .env with your database credentials

# Run migrations
cd backend
python manage.py migrate

# Seed demo data
python manage.py seed_demo
# Creates: colin@colynomial.com / demo1234

# Start Django server
python manage.py runserver
# → http://localhost:8000
```

### 3. Frontend setup
```bash
# From repo root
cd frontend

# Install deps
npm install

# Start dev server
npm run dev
# → http://localhost:5173
```

### 4. Test it
1. Open http://localhost:5173
2. Click "Inloggen"
3. Login: `colin@colynomial.com` / `demo1234`
4. You should see the App Picker with 3 cards

## Environment Variables (.env)

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | `postgres://user:pass@host:5432/dbname?sslmode=require` |
| SECRET_KEY | Django secret key | random string |
| DEBUG | Django debug mode | `True` |
| ALLOWED_HOSTS | Comma-separated hosts | `localhost,127.0.0.1` |
| CORS_ALLOWED_ORIGINS | Frontend URL | `http://localhost:5173` |

## Project Structure

```
vibe_warehouse/
├── backend/
│   ├── config/          ← Django settings, URLs
│   ├── core/            ← User model, auth views
│   ├── tenants/         ← Tenant, Membership, App models
│   ├── monitoring/      ← Request logging middleware
│   └── manage.py
├── frontend/
│   ├── src/
│   │   ├── api/         ← API client
│   │   ├── components/  ← Shared React components
│   │   ├── hooks/       ← Auth hook
│   │   └── pages/       ← All pages
│   └── vite.config.ts
├── design/              ← Architecture & feature docs
├── reference/           ← Colynomial platform (read-only submodule)
├── .env                 ← Secrets (gitignored)
└── .env.example         ← Template for .env
```

## Useful Commands

```bash
# Backend
conda run -n vibe_warehouse python backend/manage.py migrate
conda run -n vibe_warehouse python backend/manage.py createsuperuser
conda run -n vibe_warehouse python backend/manage.py seed_demo
conda run -n vibe_warehouse python backend/manage.py runserver

# Frontend
cd frontend && npm run dev
cd frontend && npm run build
```
