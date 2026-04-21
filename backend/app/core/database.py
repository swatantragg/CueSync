from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

_connect_args = {}
if "asyncpg" in settings.DATABASE_URL:
    # Neon pooler (PgBouncer) requires disabled prepared-statement cache for asyncpg
    _connect_args = {"statement_cache_size": 0, "prepared_statement_cache_size": 0}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    connect_args=_connect_args,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with SessionLocal() as session:
        yield session
