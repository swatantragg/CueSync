from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.auth import UserCreate, UserOut

router = APIRouter()


class RoleUpdateIn(BaseModel):
    role: UserRole


class ActiveUpdateIn(BaseModel):
    is_active: bool


@router.post("/", response_model=UserOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email exists")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/", response_model=list[UserOut], dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def list_users(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(User).order_by(User.id))).scalars().all()


@router.get("/editors", response_model=list[UserOut])
async def list_editors(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role not in (UserRole.ADMIN, UserRole.WORK_DELEGATOR):
        raise HTTPException(403)
    rows = (await db.execute(
        select(User).where(User.role == UserRole.EDITOR, User.is_active == True).order_by(User.full_name)
    )).scalars().all()
    return rows


@router.get("/me", response_model=UserOut)
async def me(current: User = Depends(get_current_user)):
    return current


@router.put("/{user_id}/role", response_model=UserOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def update_user_role(user_id: int, payload: RoleUpdateIn, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404)
    try:
        user.role = payload.role
        await db.commit()
        await db.refresh(user)
        return user
    except Exception as exc:
        await db.rollback()
        detail = str(exc).split("\n")[0][:300]
        raise HTTPException(500, f"Role update failed: {detail}")


@router.put("/{user_id}/active", response_model=UserOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def toggle_user_active(user_id: int, payload: ActiveUpdateIn, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404)
    try:
        user.is_active = payload.is_active
        await db.commit()
        await db.refresh(user)
        return user
    except Exception as exc:
        await db.rollback()
        raise HTTPException(500, f"Active toggle failed: {str(exc)[:200]}")


@router.delete("/{user_id}", dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404)
    await db.delete(user)
    await db.commit()
    return {"ok": True}
