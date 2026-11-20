"""Watches one mailbox for emails from the fingerprinting service (BMAT Vericast).

An Admin connects FINGERPRINT_MAILBOX once through Google, read-only. Each email from FINGERPRINT_SENDER is stored,
and a new work waiting on fingerprinting whose title the email names gets that email attached, which is what lets
"Fingerprinting Completed" be ticked for it. Emails naming no work stay listed so one can be linked by hand.

Runs from the mail sync loop and from "Check now"; a Postgres advisory lock keeps the gunicorn workers from reading
the mailbox at the same time.
"""
import base64
import html
import re
from datetime import datetime, timedelta, timezone
from email.utils import parseaddr

from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.new_work import FingerprintMail, NewWork, SystemMailbox
from app.models.notification import Notification
from app.models.user import User
from app.services import gmail, new_works
from app.services.audit import log_activity

PURPOSE = "fingerprint"
LOCK_KEY = 40021                     # pg advisory lock id (mail_sync uses 40020)
FIRST_SCAN = timedelta(days=30)      # the first read of the mailbox looks back this far
SCAN_OVERLAP = timedelta(hours=1)    # re-read a little before the newest stored email; known ids are skipped
BODY_LIMIT = 8000                    # characters of an email kept for matching titles
MIN_COMPACT = 6                      # shortest title matched with its spaces removed ("Movie ABC" in "MovieABC.wav")
_TAGS = re.compile(r"<(script|style)\b.*?</\1>|<[^>]+>", re.S | re.I)


def words(value: str | None) -> str:
    """'Movie_ABC (Final).wav' → 'movie abc final wav'."""
    return " ".join(re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).split())


def mentions(haystack: str | None, title: str) -> bool:
    """Whether an email's words name this title: as whole words, or run together when the title is long enough."""
    want = words(title)
    if not want or not haystack:
        return False
    if f" {want} " in f" {haystack} ":
        return True
    compact = want.replace(" ", "")
    return len(compact) >= MIN_COMPACT and compact in haystack.replace(" ", "")


def _headers(msg: dict) -> dict[str, str]:
    return {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}


def _files(part: dict) -> list[str]:
    names = [part["filename"]] if part.get("filename") else []
    for p in part.get("parts", []) or []:
        names += _files(p)
    return names


def _decode(data: str | None) -> str:
    try:
        return base64.urlsafe_b64decode((data or "") + "=" * (-len(data or "") % 4)).decode("utf-8", "replace")
    except (ValueError, TypeError):
        return ""


def _body(part: dict) -> str:
    """The readable text of a message: its text/plain parts, or its HTML with the tags taken out."""
    plain, rich = [], []

    def walk(p: dict) -> None:
        if not p.get("filename"):
            kind = p.get("mimeType", "")
            if kind == "text/plain":
                plain.append(_decode(p.get("body", {}).get("data")))
            elif kind == "text/html":
                rich.append(html.unescape(_TAGS.sub(" ", _decode(p.get("body", {}).get("data")))))
        for child in p.get("parts", []) or []:
            walk(child)
    walk(part)
    return " ".join(plain or rich)[:BODY_LIMIT]


async def mailbox(db: AsyncSession) -> SystemMailbox | None:
    return (await db.execute(select(SystemMailbox).where(SystemMailbox.purpose == PURPOSE))).scalar_one_or_none()


def mailbox_row(mb: SystemMailbox | None, connected_by: str | None = None) -> dict:
    return {
        "configured": not gmail.missing_config(),
        "mailbox": settings.FINGERPRINT_MAILBOX,
        "sender": settings.FINGERPRINT_SENDER,
        "sender_name": settings.FINGERPRINT_SENDER_NAME,
        "connected": bool(mb and mb.status == "connected"),
        "status": mb.status if mb else None,
        "email": mb.email if mb else None,
        "connected_by_name": connected_by,
        "connected_at": new_works.iso(mb.connected_at) if mb else None,
        "last_checked_at": new_works.iso(mb.last_checked_at) if mb else None,
        "last_error": mb.last_error if mb else None,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
    }


async def unlinked(db: AsyncSession, limit: int = 30) -> list[FingerprintMail]:
    """Emails no work points at yet, newest first."""
    used = select(NewWork.fp_mail_id).where(NewWork.fp_mail_id.isnot(None))
    return (await db.execute(
        select(FingerprintMail).where(FingerprintMail.id.not_in(used))
        .order_by(FingerprintMail.received_at.desc()).limit(limit)
    )).scalars().all()


async def _lost(db: AsyncSession, mb: SystemMailbox, reason: str) -> None:
    """Flag the mailbox and tell the admins, once however many workers notice."""
    res = await db.execute(
        update(SystemMailbox).where(SystemMailbox.id == mb.id, SystemMailbox.status == "connected")
        .values(status="reconnect_needed", last_error=reason, last_checked_at=datetime.now(timezone.utc))
    )
    if res.rowcount:
        admins = (await db.execute(select(User.id).where(User.role == "admin", User.is_active.is_(True)))).scalars().all()
        for uid in admins:
            db.add(Notification(
                user_id=uid, title=f"Reconnect {mb.email}",
                body=f"CueSync can no longer read {mb.email} for {settings.FINGERPRINT_SENDER_NAME} emails. {reason} "
                     "Connect it again under New Work.",
                entity_type="system_mailbox", entity_id=mb.id))
        await log_activity(db, None, "fp_mailbox_lost", "system_mailbox", mb.id, f"{mb.email}: {reason}")
    await db.refresh(mb)


async def _read_new(db: AsyncSession, mb: SystemMailbox, started: datetime) -> int:
    """Store the sender's emails that arrived since the newest one already stored."""
    token = await gmail.access_token(gmail.decrypt_token(mb.refresh_token_enc))
    newest = (await db.execute(
        select(FingerprintMail.received_at).where(FingerprintMail.received_at.isnot(None))
        .order_by(FingerprintMail.received_at.desc()).limit(1)
    )).scalar()
    after = (newest or started - FIRST_SCAN) - SCAN_OVERLAP
    sender = settings.FINGERPRINT_SENDER.strip().lower()
    ids = await gmail.list_messages(token, f"from:{sender} after:{int(after.timestamp())}", limit=100)
    if not ids:
        return 0
    known = set((await db.execute(
        select(FingerprintMail.gmail_message_id).where(FingerprintMail.gmail_message_id.in_(ids))
    )).scalars().all())
    found = 0
    for mid in ids:
        if mid in known:
            continue
        msg = await gmail.get_message(token, mid)
        hdr = _headers(msg)
        if parseaddr(hdr.get("from", ""))[1].lower() != sender:
            continue   # the search also matches names; only the real address counts
        files = _files(msg.get("payload", {}))
        snippet = html.unescape(msg.get("snippet", ""))[:500]
        res = await db.execute(insert(FingerprintMail).values(
            gmail_message_id=mid, gmail_thread_id=msg.get("threadId"), mailbox_email=mb.email,
            from_addr=hdr.get("from", "")[:500], subject=hdr.get("subject"), snippet=snippet,
            attachments=", ".join(files) or None,
            match_text=words(" ".join([hdr.get("subject", ""), snippet, " ".join(files), _body(msg.get("payload", {}))])),
            received_at=datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, tz=timezone.utc), created_at=started,
        ).on_conflict_do_nothing(index_elements=["gmail_message_id"]).returning(FingerprintMail.id))
        found += res.scalar() is not None
    return found


async def match_waiting(db: AsyncSession) -> int:
    """Attach a stored email to every work waiting on fingerprinting that it names. The email must have arrived
    after the work was added, so last year's email about a same-named title unlocks nothing."""
    works = (await db.execute(select(NewWork).where(
        NewWork.bgm_state != "awaiting", NewWork.fp_status.in_(("not_assigned", "assigned", "in_progress")),
        NewWork.fp_mail_id.is_(None), NewWork.video_state.is_distinct_from("waiting"),   # matched once the video is in
    ))).scalars().all()
    if not works:
        return 0
    oldest = min(w.created_at for w in works)
    mails = (await db.execute(
        select(FingerprintMail).where(FingerprintMail.received_at >= oldest).order_by(FingerprintMail.received_at)
    )).scalars().all()
    linked = 0
    for w in works:
        mail = next((m for m in mails if m.received_at >= w.created_at and mentions(m.match_text, w.title)), None)
        if not mail:
            continue
        now = datetime.now(timezone.utc)
        res = await db.execute(
            update(NewWork).where(NewWork.id == w.id, NewWork.fp_mail_id.is_(None))
            .values(fp_mail_id=mail.id, fp_mail_linked_by=None, fp_mail_linked_at=now)
        )
        if not res.rowcount:
            continue   # another worker, or a person, linked one meanwhile
        linked += 1
        subject = mail.subject or "(no subject)"
        await log_activity(db, None, "new_work_fp_mail", new_works.ENTITY, w.id,
                           f"From {mail.from_addr} on {mail.mailbox_email}, {mail.received_at:%d %b %Y}: “{subject}”. "
                           "Matched to this work by its title. Fingerprinting Completed can now be ticked.")
        await new_works.notify(
            db, await new_works.staff(db, w.fp_assigned_to),
            f"{settings.FINGERPRINT_SENDER_NAME} email received: {w.title}",
            f"“{subject}” arrived on {mail.mailbox_email}. Fingerprinting can now be marked completed.", w)
    return linked


async def sync(db: AsyncSession) -> dict | None:
    """Read the mailbox and match what it holds. None when another worker is already at it."""
    if not (await db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY})).scalar():
        return None
    out = {"connected": False, "found": 0, "linked": 0, "error": None}
    mb = await mailbox(db)
    if mb and mb.status == "connected" and not gmail.missing_config():
        out["connected"] = True
        started = datetime.now(timezone.utc)
        try:
            out["found"] = await _read_new(db, mb, started)
            mb.last_checked_at, mb.last_error = started, None
        except gmail.MailboxRevoked as e:
            await _lost(db, mb, str(e))
            out["connected"], out["error"] = False, "The mailbox needs reconnecting."
        except gmail.MailError as e:   # Google hiccup or a wrong key on this server: keep the status, try again later
            mb.last_checked_at, mb.last_error = started, str(e)
            out["error"] = str(e)
    out["linked"] = await match_waiting(db)   # also catches a work that reached fingerprinting after its email came
    return out
