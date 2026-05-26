import re
from contextlib import asynccontextmanager

import orjson
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.router import api_router
from app.core.config import settings
from app.core.database import Base, engine
import app.models.work_delegation       # noqa: F401
import app.models.notification           # noqa: F401
import app.models.society_submission     # noqa: F401
from app.services.library_sync import (
    cleanup_contributor_duplicates,
    cleanup_cue_contributor_duplicates,
    cleanup_song_duplicates,
    normalize_library_contributors_json,
)

_CORS_RE = re.compile(r"http://(?:localhost|127\.0\.0\.1)(?::\d+)?")

MIGRATIONS = [
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS country VARCHAR(100)",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_episodes INTEGER",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS bg_music_composer VARCHAR(255)",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS submitted_by VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS air_date VARCHAR(50)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_serial_title VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_channel VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_serial_type VARCHAR(50)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_language VARCHAR(100)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_director VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_genre VARCHAR(100)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_production_company VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_country VARCHAR(100)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_actors TEXT",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_producer VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_production_year INTEGER",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_bg_music_composer VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS cue_submitted_by VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' NOT NULL",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS rejection_note TEXT",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS review_note TEXT",
    "ALTER TABLE cue_entries ADD COLUMN IF NOT EXISTS singer VARCHAR(255)",
    "ALTER TABLE cue_entries ADD COLUMN IF NOT EXISTS library_id INTEGER REFERENCES song_library(id) ON DELETE SET NULL",
    "ALTER TABLE song_library ADD COLUMN IF NOT EXISTS singer VARCHAR(255)",
    "ALTER TABLE song_library ADD COLUMN IF NOT EXISTS contributors_json TEXT",
    "ALTER TABLE song_library ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()",
    "ALTER TABLE song_library ADD COLUMN IF NOT EXISTS alt_titles TEXT",
    "ALTER TABLE contributor_library ADD COLUMN IF NOT EXISTS alt_names TEXT",
    "CREATE INDEX IF NOT EXISTS ix_member_pa_name ON member_directory(pa_name)",
    "CREATE INDEX IF NOT EXISTS ix_member_ipi ON member_directory(ipi_number)",
    "ALTER TABLE song_library DROP CONSTRAINT IF EXISTS song_library_title_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_song_library_isrc ON song_library(isrc) WHERE isrc IS NOT NULL",
    "SELECT setval('projects_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM projects), 1))) FROM projects_id_seq",
    "SELECT setval('episodes_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM episodes), 1))) FROM episodes_id_seq",
    "SELECT setval('cue_entries_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM cue_entries), 1))) FROM cue_entries_id_seq",
    "SELECT setval('song_library_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM song_library), 1))) FROM song_library_id_seq",
]

# Use lowercase values to match Python enum .value ("reviewer", not "REVIEWER")
USER_ROLE_ENUM_VALUES = ["work_delegator", "reviewer"]
USAGE_TYPE_ENUM_VALUES = ["BI", "BV", "FI", "FV"]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        ac_engine = engine.execution_options(isolation_level="AUTOCOMMIT")
        for val in USER_ROLE_ENUM_VALUES:
            try:
                async with ac_engine.connect() as conn:
                    await conn.execute(text(f"ALTER TYPE userrole ADD VALUE IF NOT EXISTS '{val}'"))
                print(f"[enum-migration] ensured userrole value: {val}")
            except Exception as me:
                print(f"[enum-migration] skipped '{val}': {me}")
        for val in USAGE_TYPE_ENUM_VALUES:
            try:
                async with ac_engine.connect() as conn:
                    await conn.execute(text(f"ALTER TYPE usagetype ADD VALUE IF NOT EXISTS '{val}'"))
                print(f"[enum-migration] ensured usagetype value: {val}")
            except Exception as me:
                print(f"[enum-migration] skipped '{val}': {me}")

        # Convert users.role from native PostgreSQL enum to varchar (matches native_enum=False).
        # Idempotent: only runs if the column is still the userrole enum type.
        try:
            async with ac_engine.connect() as conn:
                await conn.execute(text("""
                    DO $$ BEGIN
                      IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='users' AND column_name='role' AND udt_name='userrole'
                      ) THEN
                        ALTER TABLE users ALTER COLUMN role TYPE varchar(50) USING role::varchar;
                      END IF;
                    END $$;
                """))
            print("[enum-migration] converted users.role to varchar(50)")
        except Exception as me:
            print(f"[enum-migration] role column conversion skipped: {me}")

        # Normalize ALL uppercase role values (old DB stored them as enum names, not values).
        # Runs in autocommit so it's independent of the main migration transaction.
        _role_map = [
            ("ADMIN", "admin"), ("EDITOR", "editor"), ("VIEWER", "viewer"),
            ("REVIEWER", "reviewer"), ("WORK_DELEGATOR", "work_delegator"),
        ]
        try:
            async with ac_engine.connect() as conn:
                for old_val, new_val in _role_map:
                    await conn.execute(text(f"UPDATE users SET role = '{new_val}' WHERE role = '{old_val}'"))
            print("[enum-migration] normalized user role casing")
        except Exception as me:
            print(f"[enum-migration] role normalization skipped: {me}")

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            for sql in MIGRATIONS:
                try:
                    await conn.execute(text(sql))
                except Exception as me:
                    print(f"[migration] skipped: {me}")
        print("[startup] DB connected, tables ensured")
        try:
            async with AsyncSession(engine) as db:
                async with db.begin():
                    s = await cleanup_song_duplicates(db)
                    c = await cleanup_contributor_duplicates(db)
                    cu = await cleanup_cue_contributor_duplicates(db)
                    lj = await normalize_library_contributors_json(db)
                    print(f"[startup] dedup: {s} songs, {c} contributors, {cu} cue-contribs, {lj} library-json rows cleaned")
        except Exception as de:
            print(f"[startup] dedup skipped: {de}")
    except Exception as e:
        print(f"[startup] DB unavailable — API will run without DB. Error: {e}")
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
    # Disable automatic debug info exposure in OpenAPI errors
    debug=False,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
_cors_kwargs: dict = dict(
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
    expose_headers=["Content-Disposition"],
)
if settings.APP_ENV != "production":
    _cors_kwargs["allow_origin_regex"] = r"http://localhost:\d+"

app.add_middleware(CORSMiddleware, **_cors_kwargs)

app.include_router(api_router)


# ── Body size limit ────────────────────────────────────────────────────────────
@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length:
        try:
            if int(content_length) > settings.max_body_size_bytes:
                return JSONResponse(status_code=413, content={"detail": "Request body too large"})
        except ValueError:
            pass
    return await call_next(request)


# ── Security headers ───────────────────────────────────────────────────────────
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if settings.APP_ENV == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ── CORS safety net (keeps headers on unhandled exception paths) ───────────────
@app.middleware("http")
async def cors_safety_net(request: Request, call_next):
    response = await call_next(request)
    origin = request.headers.get("origin", "")
    if origin and (origin in settings.cors_list or _CORS_RE.fullmatch(origin)):
        if "access-control-allow-origin" not in response.headers:
            response.headers["access-control-allow-origin"] = origin
            response.headers["access-control-allow-credentials"] = "true"
            response.headers["vary"] = "Origin"
    return response


@app.get("/")
async def root():
    return {"app": settings.APP_NAME, "status": "ok"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
