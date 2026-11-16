"""New Work List: upcoming movies and TV shows tracked through BGM received → fingerprinting → cue sheet work.
Rules and wording live in services/new_works.py; the fingerprinting service's emails in services/fingerprint_mail.py."""
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.delegations import DelegationCreate, allocation_body, allot
from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.client import ClientMailbox
from app.models.new_work import FingerprintMail, NewWork, SystemMailbox
from app.models.user import User, UserRole
from app.models.user_mailbox import UserMailbox
from app.services import fingerprint_mail, gmail, new_works
from app.services.audit import log_activity

router = APIRouter()

WD = require_roles(*new_works.WD_ROLES)
ADMIN = require_roles(UserRole.ADMIN)
WorkType = Literal["movie", "tv_show"]
Step = Literal["bgm", "fingerprint", "cue"]


class WorkIn(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    work_type: WorkType = "movie"
    remarks: str | None = Field(default=None, max_length=5000)


class WorkEdit(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    work_type: WorkType | None = None
    remarks: str | None = Field(default=None, max_length=5000)


class BgmIn(BaseModel):
    received: bool


class SkipIn(BaseModel):
    step: Step
    reason: str = Field(max_length=2000)


class ReopenIn(BaseModel):
    step: Step


class AssignIn(BaseModel):
    assigned_to: int | None   # null takes the fingerprinting back


class FingerprintStatusIn(BaseModel):
    status: Literal["assigned", "in_progress"]


class FingerprintDoneIn(BaseModel):
    source_note: str | None = Field(default=None, max_length=2000)   # where it came from, when no email arrived


class MailLinkIn(BaseModel):
    mail_id: int | None   # null unlinks


class AllotIn(BaseModel):
    assigned_to: int
    client_id: int | None = None
    channel: str | None = Field(default=None, max_length=255)
    episode_range: str | None = Field(default=None, max_length=255)
    week_target: int | None = Field(default=None, ge=0, le=100000)
    notes: str | None = Field(default=None, max_length=5000)


class CueStatusIn(BaseModel):
    status: Literal["assigned", "in_progress", "completed"]


async def _get(db: AsyncSession, wid: int) -> NewWork:
    w = await db.get(NewWork, wid)
    if not w:
        raise HTTPException(404, "This work is no longer in the New Work List.")
    return w


async def _for_fingerprint(db: AsyncSession, wid: int, current: User) -> NewWork:
    """A Work Delegator or Admin, or the editor the fingerprinting is assigned to."""
    w = await _get(db, wid)
    if current.role not in new_works.WD_ROLES and w.fp_assigned_to != current.id:
        raise HTTPException(403, "This fingerprinting is not assigned to you.")
    return w


async def _detail(db: AsyncSession, wid: int) -> dict:
    data = await new_works.Loaded().load(db, NewWork.id == wid)
    return {"work": data.row(data.works[0]), "history": await new_works.history(db, wid)}


async def _saved(db: AsyncSession, w: NewWork) -> dict:
    await db.commit()
    return await _detail(db, w.id)


async def _mail(db: AsyncSession) -> dict:
    mb = await fingerprint_mail.mailbox(db)
    by = await db.get(User, mb.connected_by) if mb and mb.connected_by else None
    return {**fingerprint_mail.mailbox_row(mb, by.full_name if by else None),
            "unlinked": [new_works.mail_row(m) for m in await fingerprint_mail.unlinked(db)]}


# ── lists ────────────────────────────────────────────────────────────────────
@router.get("/", dependencies=[Depends(WD)])
async def list_works(db: AsyncSession = Depends(get_db)):
    rows = (await new_works.Loaded().load(db)).rows()
    return {
        "works": rows, "summary": new_works.summarize(rows), "mail": await _mail(db),
        "reminder_days": settings.NEW_WORK_REMINDER_DAYS, "long_pending": list(new_works.LONG_PENDING),
    }


@router.get("/summary", dependencies=[Depends(WD)])
async def summary(db: AsyncSession = Depends(get_db)):
    """The dashboard numbers, and the works whose reminders are due (longest pending first)."""
    rows = (await new_works.Loaded().load(db)).rows()
    due = sorted((r for r in rows if r["reminder"] and r["reminder"]["due"]), key=lambda r: -r["days_open"])
    return {
        "summary": new_works.summarize(rows), "long_pending": list(new_works.LONG_PENDING),
        "reminders": [{"id": r["id"], "title": r["title"], "stage_label": r["stage_label"], "days_open": r["days_open"],
                       "level": r["reminder"]["level"], "message": r["reminder"]["long_message"] or r["reminder"]["message"]}
                      for r in due[:8]],
    }


@router.get("/mine")
async def my_fingerprinting(db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Fingerprinting assigned to the signed-in person: open work, and what they finished in the last two weeks."""
    data = await new_works.Loaded().load(db, NewWork.fp_assigned_to == current.id)
    cutoff = datetime.now(timezone.utc) - new_works.RECENT_DONE
    rows = [data.row(w) for w in data.works
            if w.fp_status in ("assigned", "in_progress") or (w.fp_status == "completed" and w.fp_done_at and w.fp_done_at >= cutoff)]
    return {"works": rows, "sender_name": settings.FINGERPRINT_SENDER_NAME, "mailbox": settings.FINGERPRINT_MAILBOX}


@router.get("/activity", dependencies=[Depends(WD)])
async def activity(db: AsyncSession = Depends(get_db)):
    """Everything done on the New Work List, by people and by CueSync, newest first."""
    return await new_works.history(db, limit=500)


# ── the fingerprinting service's mailbox ─────────────────────────────────────
@router.get("/mail", dependencies=[Depends(WD)])
async def mail_status(db: AsyncSession = Depends(get_db)):
    return await _mail(db)


@router.post("/mail/connect")
async def connect_mail(request: Request, current: User = Depends(ADMIN)):
    """Google's page for the mailbox the fingerprinting emails arrive on; read-only. Comes back to oauth_callback."""
    missing = gmail.missing_config()
    if missing:
        raise HTTPException(400, "Gmail connection is not set up on the server yet. Missing: " + ", ".join(missing))
    state = gmail.sign_state(gmail.FINGERPRINT_STATE, timedelta(minutes=15), sub=str(current.id),
                             org=gmail.allowed_origin(request.headers.get("origin")))
    return {"url": gmail.read_only_url(state, settings.FINGERPRINT_MAILBOX)}


@router.delete("/mail")
async def disconnect_mail(db: AsyncSession = Depends(get_db), current: User = Depends(ADMIN)):
    mb = await fingerprint_mail.mailbox(db)
    if not mb:
        raise HTTPException(404, "The mailbox is not connected.")
    # Revoking is per Google account, so it would cut off a client's or a person's connection on the same address.
    others = list((await db.execute(select(ClientMailbox.email))).scalars().all())
    others += (await db.execute(select(UserMailbox.email))).scalars().all()
    if not any(gmail.same_address(e, mb.email) for e in others) and not gmail.missing_config():
        try:
            await gmail.revoke(gmail.decrypt_token(mb.refresh_token_enc))
        except gmail.MailError:
            pass
    await log_activity(db, current.id, "fp_mailbox_disconnect", "system_mailbox", mb.id, mb.email)
    await db.delete(mb)
    await db.commit()
    return await _mail(db)


@router.post("/mail/sync", dependencies=[Depends(WD)])
async def sync_mail(db: AsyncSession = Depends(get_db)):
    """Check now: read the mailbox and match its emails to the works waiting on fingerprinting."""
    result = await fingerprint_mail.sync(db)
    await db.commit()
    return {"result": result, "mail": await _mail(db)}


async def connect_fingerprint_mailbox(state: dict, code: str | None, error: str | None, db: AsyncSession) -> tuple[bool, str]:
    """Google redirected back (routes/clients.py oauth_callback). → (connected?, message for the popup)."""
    want = settings.FINGERPRINT_MAILBOX
    user = await db.get(User, int(state["sub"]))
    if not user or not user.is_active or user.role != UserRole.ADMIN:
        return False, "Only an Admin can connect this mailbox."
    if error or not code:
        return False, ("Access was not allowed on Google's page, so nothing was connected. If Google said \"Access blocked\", "
                       "add this mailbox as a test user or publish the app (Google Auth Platform → Audience)."
                       if error == "access_denied" else f"Google returned an error: {error or 'no code'}.")
    if gmail.missing_config():
        return False, "Gmail connection is not set up on the server yet."
    try:
        tokens = await gmail.exchange_code(code)
        if gmail.READ_SCOPE not in (tokens.get("scope") or "").split():
            return False, ('CueSync needs "View your email messages and settings" to see the fingerprinting emails. '
                           "Tick it on Google's page and connect again.")
        if not tokens.get("refresh_token"):
            return False, ("Google did not return a long-term key. In the Google account, remove CueSync under "
                           "Security → Third-party access, then connect again.")
        address = (await gmail.gmail_address(tokens["access_token"])).strip().lower()
    except gmail.MailError as e:
        return False, str(e)
    # Nothing is revoked on a mismatch: that account may be someone's working connection.
    if not gmail.same_address(address, want):
        return False, f"You signed in as {address}, but the fingerprinting emails arrive on {want}. Nothing was saved. Connect again and choose {want}."
    now = datetime.now(timezone.utc)
    mb = await fingerprint_mail.mailbox(db) or SystemMailbox(purpose=fingerprint_mail.PURPOSE)
    mb.email, mb.refresh_token_enc = address, gmail.encrypt_token(tokens["refresh_token"])
    mb.status, mb.last_error, mb.connected_by, mb.connected_at = "connected", None, user.id, now
    db.add(mb)
    await db.flush()
    await log_activity(db, user.id, "fp_mailbox_connect", "system_mailbox", mb.id, address)
    await db.commit()
    return True, f"{address} is connected. CueSync will look for {settings.FINGERPRINT_SENDER_NAME} emails there. You can close this window."


# ── one work ─────────────────────────────────────────────────────────────────
@router.post("/")
async def create_work(payload: WorkIn, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    w = await new_works.create(db, current, payload.title, payload.work_type, payload.remarks)
    return await _saved(db, w)


@router.get("/{wid}")
async def get_work(wid: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    await _for_fingerprint(db, wid, current)
    return await _detail(db, wid)


@router.put("/{wid}")
async def edit_work(wid: int, payload: WorkEdit, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    w = await _get(db, wid)
    await new_works.edit(db, w, current, payload.model_dump(exclude_unset=True))
    return await _saved(db, w)


@router.delete("/{wid}")
async def delete_work(wid: int, db: AsyncSession = Depends(get_db), current: User = Depends(ADMIN)):
    """Removes an entry added by mistake. Its allotment, if any, stays; so does everything in the log."""
    w = await _get(db, wid)
    await new_works.clear_reminders(db, w)
    await log_activity(db, current.id, "new_work_remove", new_works.ENTITY, w.id, f"{w.title} ({new_works.TYPES.get(w.work_type, w.work_type)})")
    await db.delete(w)
    await db.commit()
    return {"ok": True}


@router.post("/{wid}/bgm")
async def bgm(wid: int, payload: BgmIn, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    w = await _get(db, wid)
    await new_works.set_bgm(db, w, current, payload.received)
    return await _saved(db, w)


@router.post("/{wid}/skip")
async def skip_step(wid: int, payload: SkipIn, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    w = await _get(db, wid)
    await new_works.skip(db, w, current, payload.step, payload.reason)
    return await _saved(db, w)


@router.post("/{wid}/reopen")
async def reopen_step(wid: int, payload: ReopenIn, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    w = await _get(db, wid)
    await new_works.reopen(db, w, current, payload.step)
    return await _saved(db, w)


@router.post("/{wid}/fingerprint/assign")
async def assign_fingerprint(wid: int, payload: AssignIn, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    w = await _get(db, wid)
    await new_works.assign_fingerprint(db, w, current, payload.assigned_to)
    return await _saved(db, w)


@router.post("/{wid}/fingerprint/status")
async def fingerprint_status(wid: int, payload: FingerprintStatusIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    w = await _for_fingerprint(db, wid, current)
    await new_works.set_fingerprint_status(db, w, current, payload.status)
    return await _saved(db, w)


@router.post("/{wid}/fingerprint/complete")
async def fingerprint_complete(wid: int, payload: FingerprintDoneIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    w = await _for_fingerprint(db, wid, current)
    await new_works.complete_fingerprint(db, w, current, payload.source_note)
    return await _saved(db, w)


@router.post("/{wid}/fingerprint/mail")
async def fingerprint_mail_link(wid: int, payload: MailLinkIn, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    w = await _get(db, wid)
    if payload.mail_id is not None and not await db.get(FingerprintMail, payload.mail_id):
        raise HTTPException(404, "Email not found")
    await new_works.link_mail(db, w, current, payload.mail_id)
    return await _saved(db, w)


@router.post("/{wid}/cue/allot")
async def allot_cue(wid: int, payload: AllotIn, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    """Step 3: allot the cue sheet work, the same way New Delegation does (it creates the serial or movie if new)."""
    w = await _get(db, wid)
    if w.fp_status not in ("completed", "skipped"):
        raise HTTPException(409, "Complete or skip the fingerprinting step first.")
    data = await new_works.Loaded().load(db, NewWork.id == w.id)
    status = new_works.cue_status(w, data.delegation(w))
    if status != "not_assigned":
        raise HTTPException(409, "The cue sheet step was skipped. Reopen it first." if status == "skipped"
                            else "The cue sheet work is already allotted. Change it under Editors and their serials.")
    editor = await db.get(User, payload.assigned_to)
    if not editor or not editor.is_active or editor.role != UserRole.EDITOR:
        raise HTTPException(400, "Pick an active editor.")
    movie = w.work_type == "movie"
    order = DelegationCreate(
        serial_name=w.title, work_type="Movie Cue Sheet" if movie else "TV Cue Sheet", assigned_to=editor.id,
        client_id=payload.client_id, channel=None if movie else (payload.channel or "").strip() or None,
        episode_range=None if movie else (payload.episode_range or "").strip() or None,
        week_target=payload.week_target or None, notes=(payload.notes or "").strip() or None,
    )
    dl = await allot(db, order, current, new_title_ok=True)
    await new_works.cue_allotted(db, w, current, dl, editor, allocation_body(dl.work_type, dl.episode_range, dl.week_target))
    return await _saved(db, w)


@router.post("/{wid}/cue/status")
async def cue_status(wid: int, payload: CueStatusIn, db: AsyncSession = Depends(get_db), current: User = Depends(WD)):
    w = await _get(db, wid)
    data = await new_works.Loaded().load(db, NewWork.id == w.id)
    dl = data.delegation(w)
    if not dl:
        raise HTTPException(409, "Allot the cue sheet work first.")
    status = new_works.DELEGATION_FROM_CUE[payload.status]
    if dl.status != status:
        was, dl.status = dl.status, status
        await new_works.delegation_changed(db, dl, current, was, dl.assigned_to)
    return await _saved(db, w)
