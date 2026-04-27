import re
from contextlib import asynccontextmanager

import orjson
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, ORJSONResponse

from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.database import Base, engine

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
    "ALTER TABLE song_library DROP CONSTRAINT IF EXISTS song_library_title_key",
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_song_library_isrc ON song_library(isrc) WHERE isrc IS NOT NULL",
    "SELECT setval('projects_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM projects), 1))) FROM projects_id_seq",
    "SELECT setval('episodes_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM episodes), 1))) FROM episodes_id_seq",
    "SELECT setval('cue_entries_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM cue_entries), 1))) FROM cue_entries_id_seq",
    "SELECT setval('song_library_id_seq', GREATEST(last_value, COALESCE((SELECT MAX(id) FROM song_library), 1))) FROM song_library_id_seq",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            for sql in MIGRATIONS:
                try:
                    await conn.execute(text(sql))
                except Exception as me:
                    print(f"[migration] skipped: {me}")
        print("[startup] DB connected, tables ensured")
    except Exception as e:
        print(f"[startup] DB unavailable — API will run without DB. Error: {e}")
    yield
    await engine.dispose()


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_origin_regex=r"http://localhost:\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(api_router)


# ── Safety net: guarantee CORS headers even when CORSMiddleware misses them ──
# (happens when an unhandled exception causes uvicorn to drop the connection
#  before the middleware can annotate the response)
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
    return {"app": settings.APP_NAME, "env": settings.APP_ENV, "status": "ok"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
