import html
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import google_login_callback
from app.api.routes.editor_notices import connect_user_mailbox
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.client import Client, ClientMailbox
from app.models.user import User, UserRole
from app.models.user_mailbox import UserMailbox
from app.services import gmail
from app.services.audit import log_activity
from app.services.clients import (
    check_mailbox, legacy_names, link_matching, link_names, name_key, rename_everywhere, usage_counts,
)

router = APIRouter()        # /api/clients
oauth_router = APIRouter()  # /api/mail — Google redirects the browser here, so no login header

CLIENT_ROLES = (UserRole.ADMIN, UserRole.REVIEWER)


def _frontend_origin(request: Request) -> str | None:
    """The CueSync address the Connect click came from, when it is one we serve.
    The sign-in popup reports back there; FRONTEND_URL otherwise."""
    return gmail.allowed_origin(request.headers.get("origin"))


class ClientIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    email: EmailStr | None = None
    notes: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    notes: str | None = None
    is_active: bool | None = None


class LinkNamesIn(BaseModel):
    names: list[str]


def _mailbox_row(mb: ClientMailbox | None, users: dict[int, User]) -> dict | None:
    if not mb:
        return None
    by = users.get(mb.connected_by)
    return {
        "email": mb.email,
        "status": mb.status,
        "connected_by_name": by.full_name if by else None,
        "connected_at": mb.connected_at.isoformat() if mb.connected_at else None,
        "last_checked_at": mb.last_checked_at.isoformat() if mb.last_checked_at else None,
        "last_error": mb.last_error,
    }


async def _rows(db: AsyncSession, clients: list[Client]) -> list[dict]:
    ids = [c.id for c in clients]
    mailboxes = {m.client_id: m for m in (await db.execute(
        select(ClientMailbox).where(ClientMailbox.client_id.in_(ids))
    )).scalars().all()} if ids else {}
    uids = {c.created_by for c in clients} | {m.connected_by for m in mailboxes.values()}
    uids.discard(None)
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    counts = await usage_counts(db)
    out = []
    for c in clients:
        creator = users.get(c.created_by)
        used = counts.get(c.id, {})
        out.append({
            "id": c.id,
            "name": c.name,
            "email": c.email,
            "notes": c.notes,
            "is_active": c.is_active,
            "created_by_name": creator.full_name if creator else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
            "delegations": used.get("delegations", 0),
            "submissions": used.get("submissions", 0),
            "mailbox": _mailbox_row(mailboxes.get(c.id), users),
        })
    return out


async def _row(db: AsyncSession, c: Client) -> dict:
    return (await _rows(db, [c]))[0]


async def _get(db: AsyncSession, cid: int) -> Client:
    c = await db.get(Client, cid)
    if not c:
        raise HTTPException(404, "Client not found")
    return c


async def _mailbox(db: AsyncSession, cid: int) -> ClientMailbox | None:
    return (await db.execute(select(ClientMailbox).where(ClientMailbox.client_id == cid))).scalar_one_or_none()


async def _check_name(db: AsyncSession, name: str, own_id: int | None = None) -> str:
    key = name_key(name)
    if not key:
        raise HTTPException(400, "Enter a client name with letters or numbers.")
    other = (await db.execute(select(Client).where(Client.name_key == key))).scalar_one_or_none()
    if other and other.id != own_id:
        raise HTTPException(409, f'"{other.name}" is already in the client list.')
    return key


async def _disconnect(db: AsyncSession, mb: ClientMailbox) -> None:
    """Remove CueSync's access at Google unless another client uses the same Google account
    (revoking is per account, so it would cut that client off too)."""
    others = list((await db.execute(select(ClientMailbox).where(ClientMailbox.id != mb.id))).scalars().all())
    others += (await db.execute(select(UserMailbox))).scalars().all()
    if not any(gmail.same_address(o.email, mb.email) for o in others) and not gmail.missing_config():
        try:
            await gmail.revoke(gmail.decrypt_token(mb.refresh_token_enc))
        except gmail.MailError:
            pass
    await db.delete(mb)


# ── Clients ──────────────────────────────────────────────────────────────────

@router.get("/")
async def list_clients(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(Client).order_by(Client.name))).scalars().all()
    return await _rows(db, rows)


@router.get("/mail-config", dependencies=[Depends(require_roles(*CLIENT_ROLES))])
async def mail_config():
    missing = gmail.missing_config()
    return {"ready": not missing, "missing": missing, "redirect_uri": settings.GOOGLE_REDIRECT_URI}


@router.get("/legacy-names", dependencies=[Depends(require_roles(*CLIENT_ROLES))])
async def list_legacy_names(db: AsyncSession = Depends(get_db)):
    """Client names typed before the client list existed and not linked to a client yet."""
    groups = await legacy_names(db)
    by_key = {c.name_key: c for c in (await db.execute(select(Client).where(Client.name_key.in_(list(groups))))).scalars().all()} if groups else {}
    out = []
    for key, g in groups.items():
        names = sorted(g["names"], key=lambda n: -g["names"][n])
        match = by_key.get(key)
        out.append({
            "label": names[0], "names": names,
            "delegations": g["delegations"], "submissions": g["submissions"],
            "match": {"id": match.id, "name": match.name} if match else None,
        })
    return sorted(out, key=lambda r: -(r["delegations"] + r["submissions"]))


@router.post("/", dependencies=[Depends(require_roles(*CLIENT_ROLES))])
async def create_client(payload: ClientIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    name = payload.name.strip()
    c = Client(
        name=name, name_key=await _check_name(db, name),
        email=str(payload.email).lower() if payload.email else None,
        notes=(payload.notes or "").strip() or None,
        created_by=current.id,
    )
    db.add(c)
    await db.flush()
    linked = await link_matching(db, c)
    await log_activity(db, current.id, "client_add", "client", c.id,
                       c.name + (f" · linked {linked} earlier entries" if linked else ""))
    await db.commit()
    return {**await _row(db, c), "linked": linked}


@router.put("/{cid}", dependencies=[Depends(require_roles(*CLIENT_ROLES))])
async def update_client(cid: int, payload: ClientUpdate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    c = await _get(db, cid)
    fields = payload.model_fields_set
    changes = []
    if "name" in fields and payload.name and payload.name.strip() != c.name:
        name = payload.name.strip()
        c.name_key = await _check_name(db, name, c.id)
        changes.append(f"renamed {c.name} → {name}")
        c.name = name
        await rename_everywhere(db, c)
        await link_matching(db, c)
    if "email" in fields:
        email = str(payload.email).lower() if payload.email else None
        if email != c.email:
            mb = await _mailbox(db, c.id)
            if mb and not gmail.same_address(email, mb.email):
                raise HTTPException(400, "Disconnect the Gmail connection before changing the email.")
            changes.append(f"email {email or '—'}")
            c.email = email
    if "notes" in fields:
        c.notes = (payload.notes or "").strip() or None
    if "is_active" in fields and payload.is_active is not None and payload.is_active != c.is_active:
        c.is_active = payload.is_active
        changes.append("activated" if c.is_active else "deactivated")
    if changes:
        await log_activity(db, current.id, "client_edit", "client", c.id, f"{c.name} · " + ", ".join(changes))
    await db.commit()
    return await _row(db, c)


@router.delete("/{cid}", dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def delete_client(cid: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    c = await _get(db, cid)
    row = await _row(db, c)
    if row["delegations"] or row["submissions"]:
        raise HTTPException(409, f"{c.name} is used by {row['delegations']} delegation(s) and "
                                 f"{row['submissions']} submission(s). Deactivate it instead.")
    mb = await _mailbox(db, c.id)
    if mb:
        await _disconnect(db, mb)
    await log_activity(db, current.id, "client_remove", "client", c.id, c.name)
    await db.delete(c)
    await db.commit()
    return {"ok": True}


@router.post("/{cid}/link-names", dependencies=[Depends(require_roles(*CLIENT_ROLES))])
async def link_legacy_names(cid: int, payload: LinkNamesIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    c = await _get(db, cid)
    linked = await link_names(db, c, payload.names)
    if linked:
        await log_activity(db, current.id, "client_link", "client", c.id,
                           f"{c.name} ← {', '.join(payload.names)} ({linked} entries)")
    await db.commit()
    return {"linked": linked}


# ── Gmail connection ─────────────────────────────────────────────────────────

@router.post("/{cid}/mailbox/connect", dependencies=[Depends(require_roles(*CLIENT_ROLES))])
async def connect_mailbox(cid: int, request: Request, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Google sign-in URL for this client's mailbox. Google sends the browser back to oauth_callback."""
    missing = gmail.missing_config()
    if missing:
        raise HTTPException(400, "Gmail connection is not set up on the server yet. Missing: " + ", ".join(missing))
    c = await _get(db, cid)
    if not c.is_active:
        raise HTTPException(400, f"{c.name} is deactivated.")
    if not c.email:
        raise HTTPException(400, f"Add {c.name}'s Gmail address first.")
    return {"url": gmail.consent_url(gmail.make_state(current.id, c.id, _frontend_origin(request)), c.email)}


@router.post("/{cid}/mailbox/check", dependencies=[Depends(require_roles(*CLIENT_ROLES))])
async def check_client_mailbox(cid: int, db: AsyncSession = Depends(get_db)):
    if gmail.missing_config():
        raise HTTPException(400, "Gmail connection is not set up on the server yet.")
    c = await _get(db, cid)
    mb = await _mailbox(db, c.id)
    if not mb:
        raise HTTPException(404, f"{c.name}'s Gmail is not connected.")
    await check_mailbox(db, mb)
    await db.commit()
    return await _row(db, c)


@router.delete("/{cid}/mailbox", dependencies=[Depends(require_roles(*CLIENT_ROLES))])
async def disconnect_mailbox(cid: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    c = await _get(db, cid)
    mb = await _mailbox(db, c.id)
    if not mb:
        raise HTTPException(404, f"{c.name}'s Gmail is not connected.")
    email = mb.email
    await _disconnect(db, mb)
    await log_activity(db, current.id, "mailbox_disconnect", "client", c.id, f"{c.name} · {email}")
    await db.commit()
    return await _row(db, c)


def _result_page(ok: bool, message: str, client_id: int | None = None, origin: str | None = None,
                 kind: str = "cuesync-mailbox") -> HTMLResponse:
    """Shown in the Google sign-in popup. Tells the CueSync window (at `origin`) the result, then closes itself."""
    payload = json.dumps({"type": kind, "ok": ok, "clientId": client_id, "message": message}).replace("</", "<\\/")
    home = (origin or settings.FRONTEND_URL).rstrip("/")
    target = json.dumps(home)
    colour = "#2E7D32" if ok else "#C62828"
    return HTMLResponse(f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CueSync · Gmail {"connected" if ok else "not connected"}</title>
<style>
  body {{ margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: #F4F7F5; font-family: system-ui, sans-serif; color: #1E2B26; }}
  .card {{ max-width: 26rem; margin: 1rem; padding: 1.75rem; background: #fff; border-radius: 1rem;
          box-shadow: 0 10px 30px rgba(0,0,0,.08); }}
  h1 {{ font-size: 1.15rem; margin: 0 0 .6rem; color: {colour}; }}
  p {{ margin: 0 0 1.1rem; line-height: 1.5; font-size: .95rem; }}
  a {{ color: #1E2B26; font-weight: 600; }}
</style></head>
<body><div class="card">
  <h1>{"Gmail connected" if ok else "Gmail not connected"}</h1>
  <p>{html.escape(message)}</p>
  <a href="{html.escape(home)}">Back to CueSync</a>
</div>
<script>
  if (window.opener) {{
    try {{ window.opener.postMessage({payload}, {target}); }} catch (e) {{}}
    setTimeout(function () {{ window.close(); }}, {1500 if ok else 6000});
  }}
</script></body></html>""")


@oauth_router.get("/oauth/callback", response_class=HTMLResponse)
async def oauth_callback(request: Request, state: str = "", code: str | None = None, error: str | None = None, db: AsyncSession = Depends(get_db)):
    # One registered redirect URI serves every Google flow; the signed state says which one this is.
    try:
        signed = gmail.read_signed(state)
    except ValueError:
        signed = {}
    if signed.get("type") == gmail.LOGIN_STATE:
        return await google_login_callback(request, signed, code, error, db)
    if signed.get("type") == gmail.USER_MAIL_STATE:
        ok, message = await connect_user_mailbox(signed, code, error, db)
        return _result_page(ok, message, origin=signed.get("org"), kind="cuesync-user-mailbox")

    try:
        user_id, cid, origin = gmail.read_state(state)
    except ValueError:
        return _result_page(False, "This link has expired or is not valid. Go back to CueSync and start again.")

    def page(ok: bool, message: str, client_id: int | None = None) -> HTMLResponse:
        return _result_page(ok, message, client_id, origin)

    user = await db.get(User, user_id)
    if not user or not user.is_active or user.role not in CLIENT_ROLES:
        return page(False, "Only an Admin or Reviewer can connect a client's Gmail.")
    c = await db.get(Client, cid)
    if not c:
        return page(False, "This client no longer exists.")
    if error or not code:
        reason = ("Access was not allowed on Google's page, so nothing was connected. If Google said "
                  "\"Access blocked\", the app is still in Testing: publish it (Google Auth Platform → Audience → "
                  "Publish app) or add this Gmail as a test user."
                  if error == "access_denied" else f"Google returned an error: {error or 'no code'}.")
        return page(False, reason, c.id)
    if gmail.missing_config():
        return page(False, "Gmail connection is not set up on the server yet.", c.id)

    try:
        tokens = await gmail.exchange_code(code)
        granted = set((tokens.get("scope") or "").split())
        missing = [gmail.SCOPE_LABEL[s] for s in gmail.SCOPES if s not in granted]
        if missing:
            return page(False, "CueSync needs both permissions. On Google's page, tick: "
                                + " and ".join(f'"{m}"' for m in missing) + ". Then connect again.", c.id)
        refresh = tokens.get("refresh_token")
        if not refresh:
            return page(False, "Google did not return a long-term key. In the Google account, remove CueSync "
                                       "under Security → Third-party access, then connect again.", c.id)
        address = await gmail.gmail_address(tokens["access_token"])
    except gmail.MailError as e:
        return page(False, str(e), c.id)

    # Wrong-account guard. Nothing is revoked: that account may be another client's working connection.
    if c.email and not gmail.same_address(address, c.email):
        return page(False, f"You signed in as {address}, but {c.name}'s email is {c.email}. "
                                   f"Nothing was saved. Connect again and choose {c.email}.", c.id)

    now = datetime.now(timezone.utc)
    c.email = c.email or address.lower()
    mb = await _mailbox(db, c.id) or ClientMailbox(client_id=c.id)
    mb.provider, mb.email = "google", address.lower()
    mb.refresh_token_enc = gmail.encrypt_token(refresh)
    mb.scopes = " ".join(sorted(granted))
    mb.status, mb.last_error = "connected", None
    mb.connected_by, mb.connected_at, mb.last_checked_at = user.id, now, now
    db.add(mb)
    await log_activity(db, user.id, "mailbox_connect", "client", c.id, f"{c.name} · {address}")
    await db.commit()
    return page(True, f"{c.name}'s Gmail ({address}) is connected. You can close this window.", c.id)
