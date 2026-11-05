import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import AuthResponse, ChangePasswordIn, SeenVersionIn, TokenOut, UserOut
from app.services import gmail
from app.services.audit import log_activity
from app.services.client_info import describe_client
from app.services.token_blacklist import blacklist_token, is_blacklisted
from app.services.login_tracker import clear_failed_logins, is_account_locked, record_failed_login

router = APIRouter()

# Ties the Google redirect to the browser that started it, so nobody can sign someone into another account.
_GOOGLE_NONCE_COOKIE = "google_login_nonce"
_GOOGLE_NONCE_PATH = "/api/mail/oauth"   # the callback (GOOGLE_REDIRECT_URI) lives here


class GoogleTicketIn(BaseModel):
    ticket: str


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
    return _signed_in(response, user)


def _signed_in(response: Response, user: User) -> AuthResponse:
    auth_resp = AuthResponse(
        access_token=create_access_token(str(user.id), user.role.value),
        refresh_token=create_refresh_token(str(user.id)),
        user=user,
    )
    _set_auth_cookies(response, auth_resp.access_token, auth_resp.refresh_token)
    return auth_resp


# ── Sign in with Google ──────────────────────────────────────────────────────
# Accounts are still created by an admin: Google only proves the email address, which must already be
# an active CueSync account. The password keeps working next to it.

@router.get("/google/config")
async def google_config():
    return {"enabled": gmail.login_ready()}


@router.get("/google/start")
async def google_start(origin: str | None = None):
    """The login page's Google button lands here; continues to Google's account chooser."""
    home = gmail.allowed_origin(origin) or settings.FRONTEND_URL.rstrip("/")
    if not gmail.login_ready():
        return _back_to_login(home, "Sign in with Google is not set up on the server yet.")
    nonce = secrets.token_urlsafe(24)
    res = RedirectResponse(gmail.login_url(gmail.sign_state(gmail.LOGIN_STATE, timedelta(minutes=10), org=home, nonce=nonce)), 302)
    res.set_cookie(_GOOGLE_NONCE_COOKIE, nonce, max_age=600, httponly=True, secure=settings.APP_ENV == "production",
                   samesite="lax", path=_GOOGLE_NONCE_PATH)
    return res


def _back_to_login(home: str, error: str | None = None, ticket: str | None = None) -> RedirectResponse:
    # A fragment never reaches a server or a Referer header.
    fragment = f"google_ticket={ticket}" if ticket else f"google_error={quote(error or 'Sign-in failed.')}"
    res = RedirectResponse(f"{home.rstrip('/')}/#{fragment}", 302)
    res.delete_cookie(_GOOGLE_NONCE_COOKIE, path=_GOOGLE_NONCE_PATH)
    return res


async def _user_by_google_email(db: AsyncSession, email: str) -> User | None:
    email = email.strip().lower()
    user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
    if user or email.rpartition("@")[2] not in ("gmail.com", "googlemail.com"):
        return user
    # Gmail ignores dots and +tags, so j.doe@gmail.com in CueSync is the same mailbox as jdoe@gmail.com.
    others = (await db.execute(select(User).where(func.lower(User.email).like("%mail.com")))).scalars().all()
    same = [u for u in others if gmail.same_address(u.email, email)]
    return same[0] if len(same) == 1 else None


async def google_login_callback(request: Request, state: dict, code: str | None, error: str | None, db: AsyncSession) -> RedirectResponse:
    """Google redirected back (routes/clients.py oauth_callback). Hands the login page a one-time ticket."""
    home = state.get("org") or settings.FRONTEND_URL
    nonce = request.cookies.get(_GOOGLE_NONCE_COOKIE)
    if not nonce or not secrets.compare_digest(nonce.encode(), str(state.get("nonce")).encode()):
        return _back_to_login(home, "This sign-in has expired. Please try again.")
    if error or not code:
        return _back_to_login(home, "Google sign-in was cancelled." if error == "access_denied" else f"Google returned an error: {error or 'no code'}.")
    try:
        tokens = await gmail.exchange_code(code)
        info = await gmail.user_info(tokens["access_token"])
    except gmail.MailError as e:
        return _back_to_login(home, str(e))
    email = (info.get("email") or "").strip().lower()
    if not email or info.get("email_verified") is not True:
        return _back_to_login(home, "Google did not confirm this email address.")
    user = await _user_by_google_email(db, email)
    if not user:
        return _back_to_login(home, f"{email} has no CueSync account. Ask your administrator to add it, or sign in with the account they created.")
    if not user.is_active:
        return _back_to_login(home, f"The CueSync account for {email} is deactivated.")
    ticket = gmail.sign_state(gmail.LOGIN_TICKET, timedelta(minutes=2), sub=str(user.id))
    return _back_to_login(home, ticket=ticket)


@router.post("/google/exchange", response_model=AuthResponse)
async def google_exchange(payload: GoogleTicketIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """One-time ticket from the Google redirect → a normal session, same as the password login."""
    try:
        data = gmail.read_signed(payload.ticket, gmail.LOGIN_TICKET)
        user_id, jti = int(data["sub"]), data["jti"]
    except (ValueError, KeyError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This sign-in has expired. Please try again.")
    if await is_blacklisted(jti):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "This sign-in was already used. Please try again.")
    await blacklist_token(jti, 300)
    user = await db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive")
    await clear_failed_logins(user.email)
    await log_activity(db, user.id, "login", "user", user.id, f"Signed in with Google · {describe_client(request)}")
    await db.commit()
    return _signed_in(response, user)


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
