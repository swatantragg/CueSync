from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.episode import Episode
from app.models.project import Project, ProjectType
from app.models.user import User, UserRole
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter()


@router.post("/", response_model=ProjectOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    proj = Project(**payload.model_dump(), created_by_id=user.id)
    db.add(proj)
    try:
        await db.commit()
        await db.refresh(proj)
        return proj
    except IntegrityError as exc:
        await db.rollback()
        detail = str(exc.orig) if exc.orig else str(exc)
        if "duplicate key" in detail.lower() or "unique" in detail.lower():
            raise HTTPException(409, "A project with this title already exists or a database ID conflict occurred. Please restart the backend to sync sequences.")
        raise HTTPException(409, f"Database constraint error: {detail[:200]}")
    except SQLAlchemyError as exc:
        await db.rollback()
        raise HTTPException(500, f"Create project failed: {exc.__class__.__name__}")


@router.get("/", response_model=list[ProjectOut])
async def list_projects(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return (await db.execute(select(Project).order_by(Project.id.desc()))).scalars().all()


@router.get("/{pid}", response_model=ProjectOut)
async def get_project(pid: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    p = await db.get(Project, pid)
    if not p:
        raise HTTPException(404)
    return p


@router.put("/{pid}", response_model=ProjectOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def update_project(pid: int, payload: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    p = await db.get(Project, pid)
    if not p:
        raise HTTPException(404)
    for k, v in payload.model_dump().items():
        setattr(p, k, v)
    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/{pid}", dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def delete_project(pid: int, db: AsyncSession = Depends(get_db)):
    p = await db.get(Project, pid)
    if not p:
        raise HTTPException(404)
    await db.delete(p)
    await db.commit()
    return {"ok": True}


@router.get("/search/bg-composer")
async def search_by_bg_composer(
    q: str = Query("", min_length=1),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(Project).where(Project.bg_music_composer.ilike(f"%{q}%"))
        .order_by(Project.title).limit(50)
    )).scalars().all()
    result = []
    for p in rows:
        ep_count = (await db.execute(
            select(func.count()).where(Episode.project_id == p.id)
        )).scalar() or 0
        approved = (await db.execute(
            select(func.count()).where(Episode.project_id == p.id, Episode.status == "approved")
        )).scalar() or 0
        result.append({
            "id": p.id, "title": p.title, "type": p.type.value,
            "bg_music_composer": p.bg_music_composer,
            "language": p.language, "channel_name": p.channel_name,
            "production_company": p.production_company,
            "total_episodes": ep_count, "approved_episodes": approved,
        })
    return result


@router.get("/stats/overview")
async def project_stats(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role not in (UserRole.ADMIN, UserRole.WORK_DELEGATOR, UserRole.REVIEWER):
        raise HTTPException(403)
    total_projects = (await db.execute(select(func.count()).select_from(Project))).scalar() or 0
    total_serials = (await db.execute(select(func.count()).select_from(Project).where(Project.type == ProjectType.SERIAL))).scalar() or 0
    total_movies = (await db.execute(select(func.count()).select_from(Project).where(Project.type == ProjectType.MOVIE))).scalar() or 0
    total_episodes = (await db.execute(select(func.count()).select_from(Episode))).scalar() or 0
    approved = (await db.execute(select(func.count()).where(Episode.status == "approved"))).scalar() or 0
    submitted = (await db.execute(select(func.count()).where(Episode.status == "submitted"))).scalar() or 0
    rejected = (await db.execute(select(func.count()).where(Episode.status == "rejected"))).scalar() or 0
    pending = (await db.execute(select(func.count()).where(Episode.status == "pending"))).scalar() or 0
    user_rows = (await db.execute(
        select(User.role, func.count()).group_by(User.role)
    )).all()
    users_by_role = {r[0].value: r[1] for r in user_rows}
    return {
        "total_projects": total_projects,
        "total_serials": total_serials,
        "total_movies": total_movies,
        "total_episodes": total_episodes,
        "episodes": {"approved": approved, "submitted": submitted, "rejected": rejected, "pending": pending},
        "users_by_role": users_by_role,
    }
