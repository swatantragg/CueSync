from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.audit import AuditLog
from app.models.notification import Notification
from app.models.project import Project
from app.models.user import User, UserRole
from app.models.work_delegation import WorkDelegation

router = APIRouter()

WD_ROLES = (UserRole.ADMIN, UserRole.WORK_DELEGATOR)
ALL_PRIVILEGED = (UserRole.ADMIN, UserRole.WORK_DELEGATOR, UserRole.REVIEWER)


class DelegationCreate(BaseModel):
    serial_name: str
    work_type: str = "TV Cue Sheet"
    client: str | None = None
    channel: str | None = None
    episode_range: str | None = None
    week_target: int | None = None
    completed: int | None = 0
    status: str = "pending"
    notes: str | None = None
    assigned_to: int
    project_id: int | None = None


class DelegationUpdate(BaseModel):
    serial_name: str | None = None
    work_type: str | None = None
    client: str | None = None
    channel: str | None = None
    episode_range: str | None = None
    week_target: int | None = None
    completed: int | None = None
    status: str | None = None
    notes: str | None = None
    assigned_to: int | None = None
    project_id: int | None = None


def _row(d: WorkDelegation, assignee: User | None = None, creator: User | None = None) -> dict:
    return {
        "id": d.id,
        "project_id": d.project_id,
        "serial_name": d.serial_name,
        "work_type": d.work_type,
        "client": d.client,
        "channel": d.channel,
        "episode_range": d.episode_range,
        "week_target": d.week_target,
        "completed": d.completed or 0,
        "balance": (d.week_target or 0) - (d.completed or 0),
        "status": d.status,
        "notes": d.notes,
        "assigned_to": d.assigned_to,
        "assigned_to_name": assignee.full_name if assignee else None,
        "created_by": d.created_by,
        "created_by_name": creator.full_name if creator else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


async def _enrich(db: AsyncSession, rows: list[WorkDelegation]) -> list[dict]:
    uids = {r.assigned_to for r in rows} | {r.created_by for r in rows}
    users: dict[int, User] = {}
    if uids:
        users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()}
    return [_row(r, users.get(r.assigned_to), users.get(r.created_by)) for r in rows]


@router.post("/", dependencies=[Depends(require_roles(*WD_ROLES))])
async def create_delegation(
    payload: DelegationCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    project_id = payload.project_id
    if not project_id and payload.serial_name:
        from app.models.project import ProjectType
        proj = (await db.execute(
            select(Project).where(Project.title.ilike(payload.serial_name.strip()))
        )).scalar_one_or_none()
        if proj:
            project_id = proj.id
            # sync project type with delegation work_type
            desired_type = ProjectType.MOVIE if payload.work_type == "Movie Cue Sheet" else ProjectType.SERIAL
            if proj.type != desired_type:
                proj.type = desired_type
        else:
            new_proj = Project(
                title=payload.serial_name.strip(),
                type=ProjectType.MOVIE if payload.work_type == "Movie Cue Sheet" else ProjectType.SERIAL,
                channel_name=payload.channel or None,
                created_by_id=current.id,
            )
            db.add(new_proj)
            await db.flush()
            project_id = new_proj.id

    d = WorkDelegation(
        serial_name=payload.serial_name,
        work_type=payload.work_type,
        client=payload.client,
        channel=payload.channel,
        episode_range=payload.episode_range,
        week_target=payload.week_target,
        completed=payload.completed or 0,
        status=payload.status,
        notes=payload.notes,
        assigned_to=payload.assigned_to,
        project_id=project_id,
        created_by=current.id,
    )
    db.add(d)
    await db.flush()

    assignee = await db.get(User, payload.assigned_to)
    if assignee:
        db.add(Notification(
            user_id=payload.assigned_to,
            title=f"New work assigned: {payload.serial_name}",
            body=f"Assigned by {current.full_name}. Target: {payload.week_target or '?'} episodes. Range: {payload.episode_range or 'N/A'}",
            entity_type="delegation",
            entity_id=d.id,
        ))

    await db.commit()
    await db.refresh(d)
    return _row(d, assignee, current)


@router.get("/projects/suggest")
async def suggest_projects(
    q: str = Query(""),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(Project).order_by(Project.title).limit(20)
    if q and q.strip():
        stmt = select(Project).where(Project.title.ilike(f"%{q.strip()}%")).order_by(Project.title).limit(20)
    rows = (await db.execute(stmt)).scalars().all()
    if not rows:
        return []
    # determine effective type from delegation work_type (Movie Cue Sheet → movie, else serial)
    proj_ids = [r.id for r in rows]
    deleg_rows = (await db.execute(
        select(WorkDelegation.project_id, WorkDelegation.work_type)
        .where(WorkDelegation.project_id.in_(proj_ids))
    )).all()
    movie_proj_ids = {pid for pid, wt in deleg_rows if wt == "Movie Cue Sheet"}
    return [
        {"id": r.id, "title": r.title, "type": "movie" if r.id in movie_proj_ids else "serial"}
        for r in rows
    ]


@router.get("/activity/calendar", dependencies=[Depends(require_roles(*WD_ROLES))])
async def activity_calendar(year: int = Query(..., ge=2020, le=2100), db: AsyncSession = Depends(get_db)):
    from datetime import datetime, timezone
    from app.models.audit import AuditLog

    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    rows = (await db.execute(
        select(AuditLog).where(
            AuditLog.action.in_(["submit", "approve"]),
            AuditLog.entity == "episode",
            AuditLog.created_at >= start,
            AuditLog.created_at < end,
        ).order_by(AuditLog.created_at)
    )).scalars().all()

    user_ids = {r.user_id for r in rows if r.user_id}
    users: dict[int, User] = {}
    if user_ids:
        users = {u.id: u for u in (await db.execute(
            select(User).where(User.id.in_(user_ids))
        )).scalars().all()}

    months: dict[int, dict] = {}
    for r in rows:
        if not r.created_at:
            continue
        month = r.created_at.month
        day = r.created_at.day
        week_of_month = (day - 1) // 7 + 1

        if month not in months:
            months[month] = {"submitted": 0, "approved": 0, "weeks": {}, "editors": {}}

        m = months[month]
        user = users.get(r.user_id)
        uname = user.full_name if user else f"User #{r.user_id}"

        if r.action == "submit":
            m["submitted"] += 1
        else:
            m["approved"] += 1

        wk = str(week_of_month)
        if wk not in m["weeks"]:
            m["weeks"][wk] = {"submitted": 0, "approved": 0, "editors": []}
        w = m["weeks"][wk]
        if r.action == "submit":
            w["submitted"] += 1
        else:
            w["approved"] += 1
        if uname not in w["editors"]:
            w["editors"].append(uname)

        if uname not in m["editors"]:
            m["editors"][uname] = {"submitted": 0, "approved": 0}
        if r.action == "submit":
            m["editors"][uname]["submitted"] += 1
        else:
            m["editors"][uname]["approved"] += 1

    return {"year": year, "months": months}


@router.get("/activity/editor/{user_id}", dependencies=[Depends(require_roles(*WD_ROLES))])
async def editor_activity(user_id: int, db: AsyncSession = Depends(get_db)):
    from app.models.episode import Episode as EpisodeModel

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404)

    delegations = (await db.execute(
        select(WorkDelegation).where(WorkDelegation.assigned_to == user_id)
        .order_by(WorkDelegation.created_at.desc())
    )).scalars().all()
    delegation_list = await _enrich(db, list(delegations))

    rows = (await db.execute(
        select(AuditLog).where(AuditLog.user_id == user_id)
        .order_by(AuditLog.created_at.desc()).limit(500)
    )).scalars().all()

    episode_ids = {r.entity_id for r in rows if r.entity == "episode" and r.entity_id}
    proj_ids_direct = {r.entity_id for r in rows if r.entity == "project" and r.entity_id}

    ep_map: dict[int, EpisodeModel] = {}
    if episode_ids:
        ep_map = {e.id: e for e in (await db.execute(
            select(EpisodeModel).where(EpisodeModel.id.in_(episode_ids))
        )).scalars().all()}

    delegated_proj_ids = {d.project_id for d in delegations if d.project_id}
    all_proj_ids = proj_ids_direct | {e.project_id for e in ep_map.values() if e.project_id} | delegated_proj_ids
    proj_map: dict[int, Project] = {}
    if all_proj_ids:
        proj_map = {p.id: p for p in (await db.execute(
            select(Project).where(Project.id.in_(all_proj_ids))
        )).scalars().all()}

    def _get_serial(r: AuditLog) -> tuple[int | None, str]:
        if r.entity == "episode" and r.entity_id in ep_map:
            ep = ep_map[r.entity_id]
            if ep.project_id in proj_map:
                return ep.project_id, proj_map[ep.project_id].title
        if r.entity == "project" and r.entity_id in proj_map:
            return r.entity_id, proj_map[r.entity_id].title
        return None, "Other"

    groups: dict[str, dict] = {}
    for r in rows:
        pid, serial = _get_serial(r)
        if serial not in groups:
            groups[serial] = {"project_id": pid, "serial": serial, "entries": []}
        ep_num = ep_map[r.entity_id].episode_number if r.entity == "episode" and r.entity_id in ep_map else None
        groups[serial]["entries"].append({
            "id": r.id, "action": r.action, "entity": r.entity,
            "entity_id": r.entity_id, "episode_number": ep_num,
            "details": r.details,
            "at": r.created_at.isoformat() if r.created_at else None,
        })

    by_serial = [
        {"project_id": v["project_id"], "serial": v["serial"],
         "count": len(v["entries"]), "entries": v["entries"]}
        for v in sorted(groups.values(), key=lambda x: (x["serial"] or "").lower())
    ]

    # Episode status counts per serial (from delegated projects)
    episode_stats: dict[str, dict] = {}
    if delegated_proj_ids:
        all_eps = (await db.execute(
            select(EpisodeModel).where(EpisodeModel.project_id.in_(delegated_proj_ids))
        )).scalars().all()
        for ep_row in all_eps:
            proj = proj_map.get(ep_row.project_id)
            if not proj:
                continue
            sname = proj.title
            if sname not in episode_stats:
                episode_stats[sname] = {"total": 0, "approved": 0, "submitted": 0, "rejected": 0, "pending": 0}
            episode_stats[sname]["total"] += 1
            s = ep_row.status or "pending"
            episode_stats[sname][s] = episode_stats[sname].get(s, 0) + 1

    return {
        "user": {"id": user.id, "full_name": user.full_name, "email": user.email, "role": user.role.value},
        "delegations": delegation_list,
        "by_serial": by_serial,
        "episode_stats": episode_stats,
    }


@router.get("/")
async def list_delegations(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role in WD_ROLES:
        rows = (await db.execute(
            select(WorkDelegation).order_by(WorkDelegation.created_at.desc())
        )).scalars().all()
    else:
        rows = (await db.execute(
            select(WorkDelegation).where(WorkDelegation.assigned_to == current.id)
            .order_by(WorkDelegation.created_at.desc())
        )).scalars().all()
    return await _enrich(db, rows)


@router.get("/{did}")
async def get_delegation(
    did: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    d = await db.get(WorkDelegation, did)
    if not d:
        raise HTTPException(404)
    if current.role not in WD_ROLES and d.assigned_to != current.id:
        raise HTTPException(403)
    return (await _enrich(db, [d]))[0]


@router.put("/{did}")
async def update_delegation(
    did: int,
    payload: DelegationUpdate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    d = await db.get(WorkDelegation, did)
    if not d:
        raise HTTPException(404)

    if current.role not in WD_ROLES:
        # Editors can only update status + completed on their own tasks
        if d.assigned_to != current.id:
            raise HTTPException(403)
        if payload.status is not None:
            d.status = payload.status
        if payload.completed is not None:
            d.completed = payload.completed
        await db.commit()
        await db.refresh(d)
        return (await _enrich(db, [d]))[0]

    for field in ("serial_name", "work_type", "client", "channel", "episode_range",
                  "week_target", "completed", "status", "notes", "project_id"):
        val = getattr(payload, field)
        if val is not None:
            setattr(d, field, val)

    if payload.assigned_to is not None and payload.assigned_to != d.assigned_to:
        d.assigned_to = payload.assigned_to
        new_assignee = await db.get(User, payload.assigned_to)
        if new_assignee:
            db.add(Notification(
                user_id=payload.assigned_to,
                title=f"Work re-assigned to you: {d.serial_name}",
                body=f"Assigned by {current.full_name}.",
                entity_type="delegation",
                entity_id=d.id,
            ))

    await db.commit()
    await db.refresh(d)
    return (await _enrich(db, [d]))[0]


@router.delete("/{did}", dependencies=[Depends(require_roles(*WD_ROLES))])
async def delete_delegation(did: int, db: AsyncSession = Depends(get_db)):
    d = await db.get(WorkDelegation, did)
    if not d:
        raise HTTPException(404)
    await db.delete(d)
    await db.commit()
    return {"ok": True}
