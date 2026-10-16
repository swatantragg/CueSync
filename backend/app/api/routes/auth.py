from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import AuthResponse, ChangePasswordIn, SeenVersionIn, TokenOut, UserOut
from app.services.audit import log_activity
from app.services.client_info import describe_client
from app.services.token_blacklist import blacklist_token
from app.services.login_tracker import clear_failed_logins, is_account_locked, record_failed_login

router = APIRouter()


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    is_prod = settings.APP_ENV == "production"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        path="/api/auth/refresh",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/api/auth/refresh")


async def _blacklist_if_valid(token: str | None) -> None:
    if not token:
        return
    try:
        payload = decode_token(token)
        jti = payload.get("jti")
        exp = payload.get("exp", 0)
        if jti:
            remaining = max(0, int(exp - datetime.now(timezone.utc).timestamp()))
            await blacklist_token(jti, remaining + 60)
    except Exception:
        pass


@router.post("/login", response_model=AuthResponse)
async def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    db: AsyncSession = Depends(get_db),
):
    email = form.username.strip().lower()

    if await is_account_locked(email):
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Account temporarily locked due to too many failed attempts. Try again in 15 minutes.",
        )

    user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
    if not user or not verify_password(form.password, user.hashed_password) or not user.is_active:
        await record_failed_login(email)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    await clear_failed_logins(email)
    await log_activity(db, user.id, "login", "user", user.id, f"Signed in · {describe_client(request)}")
    await db.commit()
    auth_resp = AuthResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id)),
        user=user,
    )
    _set_auth_cookies(response, auth_resp.access_token, auth_resp.refresh_token)
    return auth_resp


@router.post("/refresh", response_model=TokenOut)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token missing")
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise ValueError()
        user_id = int(payload["sub"])
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    token_out = TokenOut(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id)),
    )
    _set_auth_cookies(response, token_out.access_token, token_out.refresh_token)
    return token_out


@router.post("/logout")
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    # Blacklist both access AND refresh tokens so neither can be reused
    access_token = request.cookies.get("access_token")
    if not access_token:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            access_token = auth_header[7:]

    user_id = None
    try:
        payload = decode_token(access_token) if access_token else {}
        if payload.get("type") == "access":
            user_id = int(payload["sub"])
    except Exception:
        pass
    if user_id and await db.get(User, user_id):
        await log_activity(db, user_id, "logout", "user", user_id, f"Signed out · {describe_client(request)}")
        await db.commit()

    await _blacklist_if_valid(access_token)
    await _blacklist_if_valid(request.cookies.get("refresh_token"))

    _clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user


@router.post("/change-password", response_model=UserOut)
async def change_password(
    payload: ChangePasswordIn,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    if payload.new_password == payload.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "New password must be different from the current one")
    user.hashed_password = hash_password(payload.new_password)
    user.must_change_password = False
    await log_activity(db, user.id, "password_change", "user", user.id, f"Changed password · {describe_client(request)}")
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/seen-version", response_model=UserOut)
async def seen_version(
    payload: SeenVersionIn,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user.last_seen_version = payload.version
    await db.commit()
    await db.refresh(user)
    return user
