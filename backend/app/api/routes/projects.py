from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.project import Project
from app.models.user import User, UserRole
from app.schemas.project import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter()


@router.post("/", response_model=ProjectOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def create_project(payload: ProjectCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    proj = Project(**payload.model_dump(), created_by_id=user.id)
    db.add(proj)
    await db.commit()
    await db.refresh(proj)
    return proj


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
