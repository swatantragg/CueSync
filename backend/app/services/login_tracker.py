from datetime import datetime, timezone

from app.services.token_blacklist import _get_redis

_memory_attempts: dict[str, dict] = {}  # email → {count, window_start}

_MAX_ATTEMPTS = 5
_LOCKOUT_SECONDS = 900  # 15 minutes


async def record_failed_login(email: str) -> int:
    key = f"login_fail:{email}"
    r = await _get_redis()
    if r:
        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, _LOCKOUT_SECONDS)
        results = await pipe.execute()
        return int(results[0])
    # In-memory fallback
    now = datetime.now(timezone.utc).timestamp()
    entry = _memory_attempts.get(email)
    if entry and (now - entry["window_start"]) > _LOCKOUT_SECONDS:
        entry = None  # window expired, reset
    if entry is None:
        _memory_attempts[email] = {"count": 1, "window_start": now}
        return 1
    entry["count"] += 1
    return entry["count"]


async def is_account_locked(email: str) -> bool:
    r = await _get_redis()
    if r:
        val = await r.get(f"login_fail:{email}")
        return val is not None and int(val) >= _MAX_ATTEMPTS
    entry = _memory_attempts.get(email)
    if not entry:
        return False
    now = datetime.now(timezone.utc).timestamp()
    if (now - entry["window_start"]) > _LOCKOUT_SECONDS:
        del _memory_attempts[email]
        return False
    return entry["count"] >= _MAX_ATTEMPTS


async def clear_failed_logins(email: str) -> None:
    r = await _get_redis()
    if r:
        await r.delete(f"login_fail:{email}")
        return
    _memory_attempts.pop(email, None)
