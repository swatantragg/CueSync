from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.audit import AuditLog
from app.models.cue import CueEntry
from app.models.episode import Episode
from app.models.project import Project
from app.models.user import User, UserRole

_REVIEWER_ROLES = (UserRole.ADMIN, UserRole.REVIEWER)

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


@router.get("/reviewer-serials")
async def reviewer_serials(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """All SERIAL projects that have at least one submitted or approved episode, with counts."""
    if current.role not in _REVIEWER_ROLES:
        raise HTTPException(403)
    from app.models.project import ProjectType
    projects = (await db.execute(
        select(Project).where(Project.type == ProjectType.SERIAL).order_by(Project.title)
    )).scalars().all()
    result = []
    for proj in projects:
        eps = (await db.execute(
            select(Episode).where(Episode.project_id == proj.id)
        )).scalars().all()
        submitted = sum(1 for e in eps if e.status == "submitted")
        approved  = sum(1 for e in eps if e.status == "approved")
        if submitted == 0 and approved == 0:
            continue
        result.append({
            "project_id":      proj.id,
            "project_title":   proj.title,
            "project_type":    proj.type.value,
            "total_episodes":  len(eps),
            "submitted_count": submitted,
            "approved_count":  approved,
        })
    return result


@router.get("/reviewer-movies")
async def reviewer_movies(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """All MOVIE projects that have at least one submitted or approved episode, with counts."""
    if current.role not in _REVIEWER_ROLES:
        raise HTTPException(403)
    from app.models.project import ProjectType
    projects = (await db.execute(
        select(Project).where(Project.type == ProjectType.MOVIE).order_by(Project.title)
    )).scalars().all()
    result = []
    for proj in projects:
        eps = (await db.execute(
            select(Episode).where(Episode.project_id == proj.id)
        )).scalars().all()
        submitted = sum(1 for e in eps if e.status == "submitted")
        approved  = sum(1 for e in eps if e.status == "approved")
        if submitted == 0 and approved == 0:
            continue
        result.append({
            "project_id":      proj.id,
            "project_title":   proj.title,
            "project_type":    proj.type.value,
            "total_episodes":  len(eps),
            "submitted_count": submitted,
            "approved_count":  approved,
        })
    return result


@router.get("/reviewer-serials/{project_id}")
async def reviewer_serial_episodes(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """All episodes for a project, visible to reviewer for status/download management."""
    if current.role not in _REVIEWER_ROLES:
        raise HTTPException(403)
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404)
    eps = (await db.execute(
        select(Episode).where(Episode.project_id == project_id).order_by(Episode.episode_number)
    )).scalars().all()
    ep_ids = [ep.id for ep in eps]
    song_counts: dict[int, int] = {}
    if ep_ids:
        rows = (await db.execute(
            select(CueEntry.episode_id, func.count(CueEntry.id).label("cnt"))
            .where(CueEntry.episode_id.in_(ep_ids))
            .group_by(CueEntry.episode_id)
        )).all()
        song_counts = {r.episode_id: r.cnt for r in rows}
    return {
        "project_id":    proj.id,
        "project_title": proj.title,
        "project_type":  proj.type.value,
        "channel":       proj.channel_name or "",
        "episodes": [{
            "id":                ep.id,
            "episode_number":    ep.episode_number,
            "title":             ep.title or "",
            "status":            ep.status,
            "air_date":          str(ep.air_date) if ep.air_date else None,
            "total_duration_sec": ep.total_duration_sec,
            "song_count":        song_counts.get(ep.id, 0),
        } for ep in eps],
    }


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
