from datetime import datetime, timezone

try:
    import redis.asyncio as aioredis
    _REDIS_AVAILABLE = True
except ImportError:
    _REDIS_AVAILABLE = False

from app.core.config import settings

_redis_client = None
_memory_bl: dict[str, float] = {}  # jti → expiry unix timestamp (fallback only)


async def _get_redis():
    global _redis_client
    if not _REDIS_AVAILABLE or not settings.REDIS_URL:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2
        )
        await _redis_client.ping()
        return _redis_client
    except Exception:
        _redis_client = None
        return None


async def blacklist_token(jti: str, ttl_seconds: int) -> None:
    r = await _get_redis()
    if r:
        await r.setex(f"bl:{jti}", max(ttl_seconds, 1), "1")
        return
    # In-memory fallback — not shared across gunicorn workers; use Redis for multi-worker
    now = datetime.now(timezone.utc).timestamp()
    _memory_bl[jti] = now + ttl_seconds
    # Prune expired
    for k in [k for k, v in _memory_bl.items() if v < now]:
        del _memory_bl[k]


async def is_blacklisted(jti: str) -> bool:
    r = await _get_redis()
    if r:
        return bool(await r.exists(f"bl:{jti}"))
    exp = _memory_bl.get(jti)
    if exp is None:
        return False
    if exp < datetime.now(timezone.utc).timestamp():
        del _memory_bl[jti]
        return False
    return True
