# CueSync Backend

FastAPI + PostgreSQL + SQLAlchemy (async) + openpyxl.

## Setup
```
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # edit DB creds
python -m app.scripts.seed_admin
uvicorn app.main:app --reload
```
Swagger: http://localhost:8000/docs

## Postgres
Install & run Postgres locally (Homebrew: `brew install postgresql@16 && brew services start postgresql@16`).
Create DB:
```
createuser -s cuesync
createdb -O cuesync cuesync
psql -c "ALTER USER cuesync WITH PASSWORD 'cuesync_pass';"
```

## Migrations
```
alembic revision --autogenerate -m "init"
alembic upgrade head
```

## Stack
- FastAPI / Uvicorn / Gunicorn
- SQLAlchemy 2 async + asyncpg (runtime) + psycopg v3 (migrations)
- Alembic
- openpyxl (IPRS / PRS / ASCAP export builders)
- python-jose + bcrypt + passlib
- orjson responses

## Default admin
`admin@cuesync.local` / `admin123` (override via `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
