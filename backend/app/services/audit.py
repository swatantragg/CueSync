from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog

# Visible only to admins: account sign-ins and reviewers opening a submitted cue sheet.
REVIEW_OPEN = "review_open"
ADMIN_ONLY_ACTIONS = ("login", "logout", "password_change", REVIEW_OPEN)


async def log_activity(
    db: AsyncSession,
    user_id: int | None,
    action: str,
    entity: str,
    entity_id: int | None,
    details: str | None = None,
):
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details=details,
    ))
    await db.flush()


async def _latest_by_episode(db: AsyncSession, episode_ids, *conds) -> dict[int, datetime]:
    if not episode_ids:
        return {}
    rows = (await db.execute(
        select(AuditLog.entity_id, func.max(AuditLog.created_at))
        .where(AuditLog.entity == "episode", AuditLog.entity_id.in_(list(episode_ids)), *conds)
        .group_by(AuditLog.entity_id)
    )).all()
    return {eid: at for eid, at in rows}


async def reviewer_opened_ids(db: AsyncSession, user_id: int, episode_ids) -> set[int]:
    """Episodes this reviewer has opened since their latest submission."""
    opens = await _latest_by_episode(db, episode_ids, AuditLog.action == REVIEW_OPEN, AuditLog.user_id == user_id)
    if not opens:
        return set()
    submits = await _latest_by_episode(db, opens.keys(), AuditLog.action == "submit")
    return {eid for eid, at in opens.items() if eid not in submits or at >= submits[eid]}
