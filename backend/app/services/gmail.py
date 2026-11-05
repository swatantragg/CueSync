"""Google OAuth + Gmail API calls for client mailboxes.

CueSync never sees a client's Gmail password: someone signs in on Google's own page once and
Google hands back a refresh token, which is stored encrypted (Fernet, MAIL_TOKEN_KEY).
"""
import re
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from jose import JWTError, jwt

from app.core.config import settings

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
API_URL = "https://gmail.googleapis.com/gmail/v1/users/me"
# Upload endpoint: takes the raw RFC 822 message (attachments up to Gmail's 25 MB limit).
SEND_URL = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media"

# gmail.send → send cue sheets to the societies; gmail.readonly → read their replies and the Sent folder.
SCOPES = (
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
)
SCOPE_LABEL = {SCOPES[0]: "Send email on your behalf", SCOPES[1]: "View your email messages and settings"}

# Sign in with Google proves who someone is and nothing more; a staff member's own Gmail is connected
# separately and may only send (no reading), since that's all Notify Editor needs.
IDENTITY_SCOPES = ("openid", "email", "profile")
SEND_SCOPE = SCOPES[0]

_STATE_TYPE = "gmail_connect"
_STATE_TTL = timedelta(minutes=15)
_TIMEOUT = httpx.Timeout(15.0)
_LOCAL_ORIGIN = re.compile(r"http://(?:localhost|127\.0\.0\.1)(?::\d+)?")

# The other kinds of signed state that come back through the same Google callback.
LOGIN_STATE = "google_login"
USER_MAIL_STATE = "user_mail_connect"
LOGIN_TICKET = "google_ticket"


class MailError(Exception):
    """Google could not be reached or answered with an error; the mailbox may still be fine."""


class MailboxRevoked(MailError):
    """The stored token no longer works (password changed, access removed, key changed): reconnect."""


def missing_config() -> list[str]:
    """Settings that still have to be filled in before mailboxes can be connected."""
    missing = [name for name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "MAIL_TOKEN_KEY") if not getattr(settings, name)]
    if settings.MAIL_TOKEN_KEY:
        try:
            Fernet(settings.MAIL_TOKEN_KEY)
        except ValueError:
            missing.append("MAIL_TOKEN_KEY (not a valid Fernet key)")
    return missing


def login_ready() -> bool:
    """Sign in with Google only needs the OAuth client; nothing is stored, so no MAIL_TOKEN_KEY."""
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET)


def allowed_origin(origin: str | None) -> str | None:
    """`origin` when it is a CueSync address we serve (CORS_ORIGINS, or localhost outside production)."""
    origin = (origin or "").rstrip("/")
    if origin in settings.cors_list or (settings.APP_ENV != "production" and _LOCAL_ORIGIN.fullmatch(origin)):
        return origin
    return None


def encrypt_token(token: str) -> str:
    return Fernet(settings.MAIL_TOKEN_KEY).encrypt(token.encode()).decode()


def decrypt_token(token_enc: str) -> str:
    # Not MailboxRevoked: dev and production share one database, so a server with the wrong
    # MAIL_TOKEN_KEY must not flag every mailbox as dead for the other one.
    try:
        return Fernet(settings.MAIL_TOKEN_KEY).decrypt(token_enc.encode()).decode()
    except (InvalidToken, ValueError, TypeError):
        raise MailError("This server's MAIL_TOKEN_KEY can't read the stored connection. Use the same "
                        "MAIL_TOKEN_KEY on every server that shares this database, or connect the mailbox again.")


def make_state(user_id: int, client_id: int, origin: str | None = None) -> str:
    """Signed, short-lived proof of who started the connection, for which client, and from which
    CueSync address (`origin`), so the result reaches the right window in dev and production."""
    return jwt.encode(
        {"sub": str(user_id), "cid": client_id, "org": origin, "type": _STATE_TYPE, "jti": str(uuid.uuid4()),
         "exp": datetime.now(timezone.utc) + _STATE_TTL},
        settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM,
    )


def read_state(state: str) -> tuple[int, int, str | None]:
    """(user_id, client_id, origin) from a state made by make_state; ValueError when forged or expired."""
    try:
        payload = jwt.decode(state, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise ValueError(str(e))
    if payload.get("type") != _STATE_TYPE:
        raise ValueError("wrong state type")
    return int(payload["sub"]), int(payload["cid"]), payload.get("org")


def sign_state(kind: str, ttl: timedelta, **claims) -> str:
    return jwt.encode(
        {**claims, "type": kind, "jti": str(uuid.uuid4()), "exp": datetime.now(timezone.utc) + ttl},
        settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM,
    )


def read_signed(token: str, kind: str | None = None) -> dict:
    """The claims of a token from sign_state; ValueError when forged, expired or of another kind."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except JWTError as e:
        raise ValueError(str(e))
    if kind and payload.get("type") != kind:
        raise ValueError("wrong state type")
    return payload


def _auth_url(state: str, scopes: tuple[str, ...], login_hint: str | None, offline: bool = True) -> str:
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": " ".join(scopes),
        "state": state,
    }
    if offline:
        params["access_type"] = "offline"             # → refresh token
        params["prompt"] = "consent select_account"   # always return a refresh token; let them pick the account
    else:
        params["prompt"] = "select_account"
    if login_hint:
        params["login_hint"] = login_hint
    return f"{AUTH_URL}?{urlencode(params)}"


def consent_url(state: str, login_hint: str | None) -> str:
    return _auth_url(state, SCOPES, login_hint)


def login_url(state: str) -> str:
    return _auth_url(state, IDENTITY_SCOPES, None, offline=False)


def user_mail_url(state: str, login_hint: str | None) -> str:
    return _auth_url(state, (*IDENTITY_SCOPES, SEND_SCOPE), login_hint)


def same_address(a: str | None, b: str | None) -> bool:
    """Compare mailbox addresses the way Gmail does: case, dots and +tags don't matter on gmail.com."""
    def norm(addr: str) -> str:
        local, _, domain = addr.strip().lower().partition("@")
        if domain in ("gmail.com", "googlemail.com"):
            local, domain = local.split("+", 1)[0].replace(".", ""), "gmail.com"
        return f"{local}@{domain}"
    return bool(a and b) and norm(a) == norm(b)


def _google_error(res: httpx.Response) -> str:
    try:
        data = res.json()
    except ValueError:
        return f"HTTP {res.status_code}"
    err = data.get("error")
    if isinstance(err, dict):  # Gmail API shape
        return err.get("message") or f"HTTP {res.status_code}"
    return " — ".join(x for x in (err, data.get("error_description")) if x) or f"HTTP {res.status_code}"


async def _post(url: str, data: dict) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            return await http.post(url, data=data)
    except httpx.HTTPError as e:
        raise MailError(f"Google could not be reached: {e}")


async def exchange_code(code: str) -> dict:
    """Authorization code → {"access_token", "refresh_token", "scope", ...}."""
    res = await _post(TOKEN_URL, {
        "code": code,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code",
    })
    if res.status_code != 200:
        raise MailError(f"Google refused the sign-in: {_google_error(res)}")
    return res.json()


async def access_token(refresh_token: str) -> str:
    """A fresh 1-hour access token. MailboxRevoked when Google no longer accepts the refresh token."""
    res = await _post(TOKEN_URL, {
        "refresh_token": refresh_token,
        "client_id": settings.GOOGLE_CLIENT_ID,
        "client_secret": settings.GOOGLE_CLIENT_SECRET,
        "grant_type": "refresh_token",
    })
    if res.status_code == 200:
        return res.json()["access_token"]
    message = _google_error(res)
    if "invalid_grant" in message:
        raise MailboxRevoked(f"Google no longer accepts this connection ({message}). "
                             "The password may have changed or access was removed. Connect again.")
    raise MailError(f"Google token refresh failed: {message}")


def _gmail_failure(res: httpx.Response, what: str) -> MailError:
    """Gmail API error → MailboxRevoked only when the connection itself is gone."""
    if res.status_code == 403 and any(w in res.text for w in ("SERVICE_DISABLED", "has not been used", "is disabled")):
        return MailError("The Gmail API is not enabled in the Google Cloud project. Enable it under "
                         "APIs & Services → Library → Gmail API, then connect again.")
    if res.status_code == 429 or any(w in res.text for w in ("rateLimitExceeded", "dailyLimitExceeded", "Limit Exceeded")):
        return MailError(f"Gmail's sending limit was reached for this mailbox. Try again later. ({_google_error(res)})")
    if res.status_code in (401, 403):
        return MailboxRevoked(f"Gmail refused access: {_google_error(res)}")
    return MailError(f"{what}: {_google_error(res)}")


async def gmail_address(token: str) -> str:
    """The address of the mailbox the token belongs to."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            res = await http.get(PROFILE_URL, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as e:
        raise MailError(f"Gmail could not be reached: {e}")
    if res.status_code != 200:
        raise _gmail_failure(res, "Gmail profile lookup failed")
    return res.json()["emailAddress"]


async def user_info(token: str) -> dict:
    """{"email", "email_verified", "name", ...} of the Google account the token belongs to."""
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            res = await http.get(USERINFO_URL, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as e:
        raise MailError(f"Google could not be reached: {e}")
    if res.status_code != 200:
        raise MailError(f"Google account lookup failed: {_google_error(res)}")
    return res.json()


async def _get(token: str, path: str, params=None) -> dict:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as http:
            res = await http.get(f"{API_URL}/{path}", params=params, headers={"Authorization": f"Bearer {token}"})
    except httpx.HTTPError as e:
        raise MailError(f"Gmail could not be reached: {e}")
    if res.status_code != 200:
        raise _gmail_failure(res, f"Gmail lookup failed ({path.split('/')[0]})")
    return res.json()


async def get_thread(token: str, thread_id: str) -> dict:
    """Thread messages with the headers reply/bounce detection needs (no bodies)."""
    return await _get(token, f"threads/{thread_id}", [
        ("format", "metadata"),
        *[("metadataHeaders", h) for h in ("From", "To", "Subject", "Date", "X-Failed-Recipients")],
    ])


async def list_messages(token: str, query: str, limit: int = 50) -> list[str]:
    """Message ids matching a Gmail search (same syntax as the Gmail search box)."""
    data = await _get(token, "messages", {"q": query, "maxResults": limit})
    return [m["id"] for m in data.get("messages", [])]


async def get_message(token: str, message_id: str) -> dict:
    """Headers, snippet and the part tree (attachment file names; attachment data is not downloaded)."""
    return await _get(token, f"messages/{message_id}", {"format": "full"})


async def send_message(token: str, raw: bytes) -> dict:
    """Send a raw RFC 822 message from the token's mailbox. Gmail returns {"id", "threadId", ...};
    the message lands in that mailbox's Sent folder."""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(90.0)) as http:
            res = await http.post(SEND_URL, content=raw, headers={
                "Authorization": f"Bearer {token}", "Content-Type": "message/rfc822"})
    except httpx.HTTPError as e:
        raise MailError(f"Gmail could not be reached, so nothing was sent: {e}")
    if res.status_code != 200:
        raise _gmail_failure(res, "Gmail did not send the email")
    return res.json()


async def revoke(token: str) -> None:
    """Best effort: remove CueSync's access from the Google account."""
    try:
        await _post(REVOKE_URL, {"token": token})
    except MailError:
        pass
