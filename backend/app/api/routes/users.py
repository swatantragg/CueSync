from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_roles
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.auth import UserCreate, UserOut

router = APIRouter()


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


@router.delete("/{user_id}", dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def delete_user(user_id: int, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404)
    await db.delete(user)
    await db.commit()
    return {"ok": True}
