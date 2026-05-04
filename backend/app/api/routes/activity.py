from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.audit import AuditLog
from app.models.episode import Episode
from app.models.project import Project
from app.models.user import User, UserRole

router = APIRouter()


def _user_meta(u: User | None) -> dict:
    if not u:
        return {"user_id": None, "user_name": "System", "user_email": None, "user_role": None}
    return {"user_id": u.id, "user_name": u.full_name, "user_email": u.email, "user_role": u.role.value}


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
    uids = {r.user_id for r in rows if r.user_id}
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    return [{**_user_meta(users.get(r.user_id)), "id": r.id, "action": r.action, "details": r.details, "at": r.created_at.isoformat() if r.created_at else None} for r in rows]


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
    uids = {r.user_id for r in rows if r.user_id}
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    return [{**_user_meta(users.get(r.user_id)), "id": r.id, "entity": r.entity, "entity_id": r.entity_id, "action": r.action, "details": r.details, "at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.get("/submitted-episodes")
async def submitted_episodes(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role not in (UserRole.ADMIN, UserRole.REVIEWER):
        return []
    rows = (await db.execute(
        select(Episode).where(Episode.status == "submitted").order_by(Episode.id.desc()).limit(200)
    )).scalars().all()
    pids = {r.project_id for r in rows}
    projects = {p.id: p for p in (await db.execute(select(Project).where(Project.id.in_(pids)))).scalars().all()} if pids else {}
    return [{
        "id": ep.id, "episode_number": ep.episode_number, "title": ep.title,
        "status": ep.status, "project_id": ep.project_id,
        "project_title": projects[ep.project_id].title if ep.project_id in projects else None,
        "air_date": ep.air_date,
    } for ep in rows]


@router.get("/editor/{user_id}", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.WORK_DELEGATOR))])
async def editor_activity_log(user_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(AuditLog).where(AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc()).limit(200)
    )).scalars().all()
    user = await db.get(User, user_id)
    return {
        "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role.value} if user else None,
        "activity": [{"id": r.id, "action": r.action, "entity": r.entity, "entity_id": r.entity_id, "details": r.details, "at": r.created_at.isoformat() if r.created_at else None} for r in rows],
    }
