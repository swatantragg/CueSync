from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.audit import AuditLog
from app.models.cue import CueEntry
from app.models.episode import Episode
from app.models.project import Project
from app.models.user import User, UserRole
from app.models.work_file import WorkFile
from app.services.audit import ADMIN_ONLY_ACTIONS, reviewer_opened_ids

_REVIEWER_ROLES = (UserRole.ADMIN, UserRole.REVIEWER)

router = APIRouter()


def _visible(current: User) -> list:
    """Extra filters hiding admin-only audit rows from non-admin viewers."""
    return [] if current.role == UserRole.ADMIN else [AuditLog.action.not_in(ADMIN_ONLY_ACTIONS)]


def _user_meta(u: User | None) -> dict:
    if not u:
        return {"user_id": None, "user_name": "System", "user_email": None, "user_role": None}
    return {"user_id": u.id, "user_name": u.full_name, "user_email": u.email, "user_role": u.role.value}


@router.get("/episode/{episode_id}")
async def episode_activity(
    episode_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity == "episode",
            AuditLog.entity_id == episode_id,
            *_visible(current),
        ).order_by(AuditLog.created_at.desc()).limit(200)
    )).scalars().all()
    uids = {r.user_id for r in rows if r.user_id}
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    return [{**_user_meta(users.get(r.user_id)), "id": r.id, "action": r.action, "details": r.details, "at": r.created_at.isoformat() if r.created_at else None} for r in rows]


@router.get("/project/{project_id}")
async def project_activity(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.entity.in_(("project", "episode")),
            *_visible(current),
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
    ids = [ep.id for ep in rows]
    opened = await reviewer_opened_ids(db, current.id, ids) if current.role == UserRole.REVIEWER else set(ids)
    # Who sent each one for review, and when (the latest submit).
    submits: dict[int, tuple] = {}
    if ids:
        for eid, uid, at in (await db.execute(
            select(AuditLog.entity_id, AuditLog.user_id, AuditLog.created_at).where(
                AuditLog.entity == "episode", AuditLog.action == "submit", AuditLog.entity_id.in_(ids),
            ).order_by(AuditLog.created_at)
        )).all():
            submits[eid] = (uid, at)
    uids = {uid for uid, _ in submits.values() if uid}
    names = dict((await db.execute(select(User.id, User.full_name).where(User.id.in_(uids)))).all()) if uids else {}
    return [{
        "id": ep.id, "episode_number": ep.episode_number, "title": ep.title,
        "status": ep.status, "project_id": ep.project_id,
        "project_title": projects[ep.project_id].title if ep.project_id in projects else None,
        "project_type": projects[ep.project_id].type.value if ep.project_id in projects else None,
        "air_date": ep.air_date,
        "opened": ep.id in opened,
        "submitted_by": names.get(submits[ep.id][0]) if ep.id in submits else None,
        "submitted_at": submits[ep.id][1].isoformat() if ep.id in submits and submits[ep.id][1] else None,
    } for ep in rows]


async def _converted_counts(db: AsyncSession) -> dict[int, int]:
    """project id → cue sheets saved under Projects → Conversion."""
    from app.models.conversion import Conversion
    return dict((await db.execute(
        select(Conversion.project_id, func.count()).group_by(Conversion.project_id)
    )).all())


@router.get("/reviewer-serials")
async def reviewer_serials(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """All SERIAL projects that have a submitted or approved episode or a converted cue sheet, with counts."""
    if current.role not in _REVIEWER_ROLES:
        raise HTTPException(403)
    from app.models.project import ProjectType
    projects = (await db.execute(
        select(Project).where(Project.type == ProjectType.SERIAL).order_by(Project.title)
    )).scalars().all()
    converted_counts = await _converted_counts(db)
    result = []
    for proj in projects:
        eps = (await db.execute(
            select(Episode).where(Episode.project_id == proj.id)
        )).scalars().all()
        submitted = sum(1 for e in eps if e.status == "submitted")
        approved  = sum(1 for e in eps if e.status == "approved")
        converted = converted_counts.get(proj.id, 0)
        if submitted == 0 and approved == 0 and converted == 0:
            continue
        result.append({
            "project_id":      proj.id,
            "project_title":   proj.title,
            "project_type":    proj.type.value,
            "total_episodes":  len(eps),
            "submitted_count": submitted,
            "approved_count":  approved,
            "converted_count": converted,
        })
    return result


@router.get("/reviewer-movies")
async def reviewer_movies(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """All MOVIE projects that have a submitted or approved episode or a converted cue sheet, with counts."""
    if current.role not in _REVIEWER_ROLES:
        raise HTTPException(403)
    from app.models.project import ProjectType
    projects = (await db.execute(
        select(Project).where(Project.type == ProjectType.MOVIE).order_by(Project.title)
    )).scalars().all()
    converted_counts = await _converted_counts(db)
    result = []
    for proj in projects:
        eps = (await db.execute(
            select(Episode).where(Episode.project_id == proj.id)
        )).scalars().all()
        submitted = sum(1 for e in eps if e.status == "submitted")
        approved  = sum(1 for e in eps if e.status == "approved")
        converted = converted_counts.get(proj.id, 0)
        if submitted == 0 and approved == 0 and converted == 0:
            continue
        result.append({
            "project_id":      proj.id,
            "project_title":   proj.title,
            "project_type":    proj.type.value,
            "total_episodes":  len(eps),
            "submitted_count": submitted,
            "approved_count":  approved,
            "converted_count": converted,
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
    opened = await reviewer_opened_ids(db, current.id, ep_ids) if current.role == UserRole.REVIEWER else set(ep_ids)
    work_file_eps = set((await db.execute(
        select(WorkFile.episode_number).where(WorkFile.project_id == project_id)
    )).scalars().all())
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
            "opened":            ep.id in opened,
            "has_work_file":     ep.episode_number in work_file_eps,
        } for ep in eps],
    }


@router.get("/editor/{user_id}")
async def editor_activity_log(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN, UserRole.WORK_DELEGATOR)),
):
    rows = (await db.execute(
        select(AuditLog).where(AuditLog.user_id == user_id, *_visible(current))
        .order_by(AuditLog.created_at.desc()).limit(200)
    )).scalars().all()
    user = await db.get(User, user_id)
    return {
        "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role.value} if user else None,
        "activity": [{"id": r.id, "action": r.action, "entity": r.entity, "entity_id": r.entity_id, "details": r.details, "at": r.created_at.isoformat() if r.created_at else None} for r in rows],
    }


@router.get("/logins")
async def login_activity(
    limit: int = Query(500, ge=1, le=2000),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN)),
):
    """Sign-in / sign-out / password-change history for every account (admins only)."""
    rows = (await db.execute(
        select(AuditLog).where(AuditLog.entity == "user", AuditLog.action.in_(("login", "logout", "password_change")))
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit)
    )).scalars().all()
    uids = {r.user_id for r in rows if r.user_id}
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    return [{
        **_user_meta(users.get(r.user_id)),
        **({} if users.get(r.user_id) else {"user_name": "Deleted user"}),
        "id": r.id, "action": r.action, "details": r.details,
        "at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]
