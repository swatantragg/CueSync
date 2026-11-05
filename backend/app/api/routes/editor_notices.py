from datetime import timedelta
from typing import Literal

import orjson
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db, utcnow
from app.core.deps import require_roles
from app.models.client import ClientMailbox
from app.models.editor_notice import EditorNotice
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.user_mailbox import UserMailbox
from app.services import editor_notices as notices, gmail, insights
from app.services.audit import log_activity

router = APIRouter()

SENDERS = (UserRole.ADMIN, UserRole.WORK_DELEGATOR)


class NoticeIn(BaseModel):
    editor_id: int
    period: Literal["week", "month"] = "week"
    subject: str = Field(min_length=1, max_length=300)
    message: str = Field(min_length=1, max_length=10000)


def _mailbox_row(mb: UserMailbox | None) -> dict:
    return {
        "configured": not gmail.missing_config(),
        "connected": bool(mb and mb.status == "connected"),
        "email": mb.email if mb else None,
        "status": mb.status if mb else None,
        "last_error": mb.last_error if mb else None,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
    }


async def _editor(db: AsyncSession, editor_id: int) -> User:
    editor = await db.get(User, editor_id)
    if not editor or editor.role != UserRole.EDITOR:
        raise HTTPException(404, "Editor not found")
    if not editor.is_active:
        raise HTTPException(400, f"{editor.full_name}'s account is deactivated.")
    return editor


# ── The sender's own Gmail ───────────────────────────────────────────────────

@router.get("/mailbox")
async def my_mailbox(db: AsyncSession = Depends(get_db), current: User = Depends(require_roles(*SENDERS))):
    return _mailbox_row(await notices.get_mailbox(db, current.id))


@router.post("/mailbox/connect")
async def connect_my_mailbox(request: Request, current: User = Depends(require_roles(*SENDERS))):
    """Google's page for the signed-in user's Gmail; send permission only. Comes back to oauth_callback."""
    missing = gmail.missing_config()
    if missing:
        raise HTTPException(400, "Gmail connection is not set up on the server yet. Missing: " + ", ".join(missing))
    state = gmail.sign_state(gmail.USER_MAIL_STATE, timedelta(minutes=15), sub=str(current.id),
                             org=gmail.allowed_origin(request.headers.get("origin")))
    return {"url": gmail.user_mail_url(state, current.email)}


@router.delete("/mailbox")
async def disconnect_my_mailbox(db: AsyncSession = Depends(get_db), current: User = Depends(require_roles(*SENDERS))):
    mb = await notices.get_mailbox(db, current.id)
    if not mb:
        raise HTTPException(404, "Your Gmail is not connected.")
    # Revoking is per Google account, so it would cut off a client connection on the same address.
    clients = (await db.execute(select(ClientMailbox.email))).scalars().all()
    if not any(gmail.same_address(e, mb.email) for e in clients) and not gmail.missing_config():
        try:
            await gmail.revoke(gmail.decrypt_token(mb.refresh_token_enc))
        except gmail.MailError:
            pass
    await log_activity(db, current.id, "user_mailbox_disconnect", "user", current.id, mb.email)
    await db.delete(mb)
    await db.commit()
    return _mailbox_row(None)


async def connect_user_mailbox(state: dict, code: str | None, error: str | None, db: AsyncSession) -> tuple[bool, str]:
    """Google redirected back (routes/clients.py oauth_callback). → (connected?, message for the popup)."""
    user = await db.get(User, int(state["sub"]))
    if not user or not user.is_active or user.role not in SENDERS:
        return False, "Only a Work Delegator or Admin can connect their Gmail."
    if error or not code:
        return False, ("Access was not allowed on Google's page, so nothing was connected. If Google said \"Access blocked\", "
                       "add this Gmail as a test user or publish the app (Google Auth Platform → Audience)."
                       if error == "access_denied" else f"Google returned an error: {error or 'no code'}.")
    if gmail.missing_config():
        return False, "Gmail connection is not set up on the server yet."
    try:
        tokens = await gmail.exchange_code(code)
        if gmail.SEND_SCOPE not in (tokens.get("scope") or "").split():
            return False, 'CueSync needs "Send email on your behalf" to email editors. Tick it on Google\'s page and connect again.'
        if not tokens.get("refresh_token"):
            return False, ("Google did not return a long-term key. In your Google account, remove CueSync under "
                           "Security → Third-party access, then connect again.")
        info = await gmail.user_info(tokens["access_token"])
    except gmail.MailError as e:
        return False, str(e)
    address = (info.get("email") or "").strip().lower()
    # Nothing is revoked on a mismatch: that account may be someone's working connection.
    if not gmail.same_address(address, user.email):
        return False, f"You signed in as {address or 'another account'}, but your CueSync account is {user.email}. Nothing was saved. Connect again and choose {user.email}."
    mb = await notices.get_mailbox(db, user.id) or UserMailbox(user_id=user.id)
    mb.email, mb.refresh_token_enc = address, gmail.encrypt_token(tokens["refresh_token"])
    mb.status, mb.last_error, mb.connected_at = "connected", None, utcnow()
    db.add(mb)
    await log_activity(db, user.id, "user_mailbox_connect", "user", user.id, address)
    await db.commit()
    return True, f"Your Gmail ({address}) is connected. You can close this window."


# ── Notify an editor ─────────────────────────────────────────────────────────

def _last_notice(n: EditorNotice | None) -> dict | None:
    return {"sent_at": n.sent_at.isoformat(), "sent_by": n.sent_by_name, "read": bool(n.read_at)} if n and n.sent_at else None


@router.get("/preview/{editor_id}")
async def preview_notice(
    editor_id: int,
    period: Literal["week", "month"] = "week",
    db: AsyncSession = Depends(get_db),
    current: User = Depends(require_roles(*SENDERS)),
):
    editor = await _editor(db, editor_id)
    d = await notices.make_draft(db, current, editor, period)
    last = (await db.execute(
        select(EditorNotice).where(EditorNotice.editor_id == editor.id).order_by(EditorNotice.sent_at.desc()).limit(1)
    )).scalar_one_or_none()
    return {
        "editor": {"id": editor.id, "name": editor.full_name, "email": editor.email},
        "from": {"name": current.full_name, "email": current.email},
        "mailbox": _mailbox_row(await notices.get_mailbox(db, current.id)),
        "period": period, "period_label": d.period_label,
        "subject": d.subject, "message": d.message, "reasons": d.reasons, "work": d.work,
        "last_notice": _last_notice(last),
    }


@router.post("/send")
async def send_notice(payload: NoticeIn, db: AsyncSession = Depends(get_db), current: User = Depends(require_roles(*SENDERS))):
    editor = await _editor(db, payload.editor_id)
    mb = await notices.get_mailbox(db, current.id)
    if not mb or mb.status != "connected":
        raise HTTPException(409, "Connect your Gmail first.")
    if gmail.missing_config():
        raise HTTPException(400, "Gmail connection is not set up on the server yet.")
    subject = " ".join(payload.subject.split())
    message = payload.message.strip()
    if not subject or not message:
        raise HTTPException(400, "Enter a subject and a message.")

    d = await notices.make_draft(db, current, editor, payload.period)
    raw = notices.build_message(current, mb, editor, subject, message, d.work)
    try:
        sent = await gmail.send_message(await gmail.access_token(gmail.decrypt_token(mb.refresh_token_enc)), raw)
    except gmail.MailboxRevoked as e:
        mb.status, mb.last_error = "reconnect_needed", str(e)
        await db.commit()
        raise HTTPException(409, f"Your Gmail connection stopped working, so nothing was sent. Connect it again. ({e})")
    except gmail.MailError as e:
        raise HTTPException(502, str(e))

    notice = EditorNotice(
        editor_id=editor.id, sent_by=current.id, sent_by_name=current.full_name,
        from_email=mb.email, to_email=editor.email, subject=subject, message=message,
        reasons_json=orjson.dumps(d.reasons).decode(), work_json=orjson.dumps(d.work).decode(),
        gmail_message_id=sent.get("id"), gmail_thread_id=sent.get("threadId"),
    )
    db.add(notice)
    await db.flush()
    db.add(Notification(user_id=editor.id, title=f"Email from {current.full_name}: {subject}",
                        body="It's on your Dashboard with the list of pending work.",
                        entity_type="editor_notice", entity_id=notice.id))
    await log_activity(db, current.id, "editor_notice", "user", editor.id, f"Emailed {editor.full_name} · {subject}")
    await db.commit()
    return {"ok": True, "id": notice.id, "last_notice": _last_notice(notice)}


@router.post("/{notice_id}/read")
async def mark_notice_read(notice_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(require_roles(UserRole.EDITOR))):
    notice = await db.get(EditorNotice, notice_id)
    if not notice or notice.editor_id != current.id:
        raise HTTPException(404, "Email not found")
    notice.read_at = notice.read_at or utcnow()
    await db.execute(update(Notification).where(
        Notification.user_id == current.id, Notification.entity_type == "editor_notice", Notification.entity_id == notice.id,
    ).values(is_read=True))
    await db.commit()
    return insights.notice_row(notice)
