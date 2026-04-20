from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token, verify_password
from app.models.user import User
from app.schemas.auth import TokenOut, UserOut

router = APIRouter()


@router.post("/login", response_model=TokenOut)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    user = (await db.execute(select(User).where(User.email == form.username))).scalar_one_or_none()
    if not user or not verify_password(form.password, user.hashed_password) or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    return TokenOut(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenOut)
async def refresh(refresh_token: str, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError()
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return TokenOut(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
