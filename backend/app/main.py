from contextlib import asynccontextmanager

import orjson
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse

from sqlalchemy import text

from app.api.router import api_router
from app.core.config import settings
from app.core.database import Base, engine

MIGRATIONS = [
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS country VARCHAR(100)",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_episodes INTEGER",
    "ALTER TABLE projects ADD COLUMN IF NOT EXISTS bg_music_composer VARCHAR(255)",
    "ALTER TABLE episodes ADD COLUMN IF NOT EXISTS air_date VARCHAR(50)",
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/")
async def root():
    return {"app": settings.APP_NAME, "env": settings.APP_ENV, "status": "ok"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
