from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.audit import AuditLog
from app.models.user import User

router = APIRouter()


@router.get("/episode/{episode_id}")
async def episode_activity(
    episode_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity == "episode",
            AuditLog.entity_id == episode_id,
        ).order_by(AuditLog.created_at.desc()).limit(200)
    )).scalars().all()
    users = {}
    uids = {r.user_id for r in rows if r.user_id}
    if uids:
        urows = (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()
        users = {u.id: u for u in urows}
    out = []
    for r in rows:
        u = users.get(r.user_id) if r.user_id else None
        out.append({
            "id": r.id,
            "user_id": r.user_id,
            "user_name": u.full_name if u else "System",
            "user_email": u.email if u else None,
            "user_role": u.role.value if u else None,
            "action": r.action,
            "details": r.details,
            "at": r.created_at.isoformat() if r.created_at else None,
        })
    return out


@router.get("/project/{project_id}")
async def project_activity(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity.in_(("project", "episode")),
        ).order_by(AuditLog.created_at.desc()).limit(500)
    )).scalars().all()
    users = {}
    uids = {r.user_id for r in rows if r.user_id}
    if uids:
        urows = (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()
        users = {u.id: u for u in urows}
    out = []
    for r in rows:
        u = users.get(r.user_id) if r.user_id else None
        out.append({
            "id": r.id,
            "user_id": r.user_id,
            "user_name": u.full_name if u else "System",
            "entity": r.entity,
            "entity_id": r.entity_id,
            "action": r.action,
            "details": r.details,
            "at": r.created_at.isoformat() if r.created_at else None,
        })
    return out
