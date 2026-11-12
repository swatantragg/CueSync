from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.audit import AuditLog
from app.models.notification import Notification
from app.models.project import Project
from app.models.society_submission import SocietySubmission
from app.models.user import User, UserRole
from app.models.client import Client
from app.models.detected_mail import DetectedMail
from app.models.episode import Episode
from app.models.society import Society
from app.services import gmail
from app.services.audit import log_activity
from app.services.clients import mark_lost, resolve_client
from app.services.mail_sync import gmail_link, last_sync, sync_all
from app.services.society_mail import (
    ATTACHMENTS, build_files, build_message, clean_attachments, clean_emails, episodes_label, fill,
    join_emails, make_draft, not_dead, split_emails,
)

router = APIRouter()

_IPRS_ROLES = (UserRole.ADMIN, UserRole.REVIEWER)


class SubmissionCreate(BaseModel):
    project_id: int
    episode_from: int
    episode_to: int
    client_id: int | None = None
    client: str | None = None  # legacy: must match a client in the client list
    notes: str | None = None


class MailDraftIn(BaseModel):
    project_id: int
    episode_from: int
    episode_to: int
    client_id: int | None = None
    society_id: int | None = None
    converted: bool = False  # send the sheets saved under Projects → Conversion


class MailSendIn(MailDraftIn):
    to: list[str]
    cc: list[str] = []
    bcc: list[str] = []
    subject: str
    body: str
    attachments: list[str]
    notes: str | None = None
    resend: bool = False  # the range was already emailed to this society: send again anyway


class DetectedConfirmIn(BaseModel):
    project_id: int
    episode_from: int
    episode_to: int
    society_id: int


GMAIL_MAX_BYTES = 25 * 1024 * 1024


async def _row(db: AsyncSession, s: SocietySubmission) -> dict:
    proj = await db.get(Project, s.project_id)
    user = await db.get(User, s.submitted_by)
    return {
        "id":                    s.id,
        "project_id":            s.project_id,
        "project_title":         proj.title if proj else None,
        "project_type":          proj.type.value if proj else None,
        "episode_from":          s.episode_from,
        "episode_to":            s.episode_to,
        "client":                s.client,
        "client_id":             s.client_id,
        "notes":                 s.notes,
        "submitted_by":          s.submitted_by,
        "submitted_by_name":     user.full_name if user else None,
        "submitted_at":          s.submitted_at.isoformat() if s.submitted_at else None,
        "submitted_to_iprs":     s.submitted_to_iprs,
        "submitted_to_iprs_at":  s.submitted_to_iprs_at.isoformat() if s.submitted_to_iprs_at else None,
        "accepted_by_iprs":      s.accepted_by_iprs,
        "accepted_by_iprs_at":   s.accepted_by_iprs_at.isoformat() if s.accepted_by_iprs_at else None,
        "followup_count":        s.followup_count or 0,
        "society_id":            s.society_id,
        "society_name":          s.society_name,
        "sent_via":              s.sent_via,
        "from_conversion":       bool(s.from_conversion),
        "mail_from":             s.mail_from,
        "mail_to":               s.mail_to,
        "mail_cc":               s.mail_cc,
        "mail_bcc":              s.mail_bcc,
        "mail_subject":          s.mail_subject,
        "mail_attachments":      s.mail_attachments,
        "gmail_message_id":      s.gmail_message_id,
        "gmail_thread_id":       s.gmail_thread_id,
        "mail_sent_at":          s.mail_sent_at.isoformat() if s.mail_sent_at else None,
        "mail_status":           s.mail_status,
        "mail_checked_at":       s.mail_checked_at.isoformat() if s.mail_checked_at else None,
        "reply_at":              s.reply_at.isoformat() if s.reply_at else None,
        "reply_from":            s.reply_from,
        "reply_subject":         s.reply_subject,
        "reply_snippet":         s.reply_snippet,
        "bounce_reason":         s.bounce_reason,
        "gmail_link":            gmail_link(s.mail_from, s.gmail_thread_id),
    }


async def _notify_iprs_users(db: AsyncSession, title: str, body: str, sub_id: int) -> None:
    """Send notification to all admin, reviewer, and work_delegator users."""
    users = (await db.execute(
        select(User).where(User.role.in_(["admin", "reviewer", "work_delegator"]))
    )).scalars().all()
    for u in users:
        db.add(Notification(
            user_id=u.id, title=title, body=body,
            entity_type="society_submission", entity_id=sub_id,
        ))


@router.post("/mail/preview", dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def preview_society_mail(payload: MailDraftIn, db: AsyncSession = Depends(get_db)):
    """The email Send to Society would send, filled from the society's template, plus anything blocking it."""
    d = await make_draft(db, payload.project_id, payload.episode_from, payload.episode_to, payload.client_id,
                         payload.society_id, payload.converted)
    defaults = set((d.society.attachments or "").split(",")) if d.society else set()
    return {
        "ready": not d.problems,
        "problems": d.problems,
        "project_title": d.project.title,
        "episodes": d.episodes,
        "converted": d.converted,
        "client": {"id": d.client.id, "name": d.client.name} if d.client else None,
        "society": {"id": d.society.id, "name": d.society.name} if d.society else None,
        "from": {"name": d.client.name, "email": d.mailbox.email, "status": d.mailbox.status} if d.mailbox else None,
        "to": split_emails(d.society.to_emails) if d.society else [],
        "cc": split_emails(d.society.cc_emails) if d.society else [],
        "bcc": split_emails(d.society.bcc_emails) if d.society else [],
        "subject": fill(d.society.subject_template or "", d.values) if d.society else "",
        "body": fill(d.society.body_template or "", d.values) if d.society else "",
        "attachments": [{
            "key": k, "label": label, "filename": d.filename(k),
            "available": k != "workfile" or d.work_files > 0,
            "selected": k in defaults and (k != "workfile" or d.work_files > 0),
        } for k, label in ATTACHMENTS.items()],
        "already_sent": d.already_sent,
    }


@router.post("/mail/send", dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def send_society_mail(
    payload: MailSendIn,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Email the cue sheets from the client's Gmail. The Submit Cue entry is created only after
    Gmail accepts the message, so every entry made here has a real email behind it."""
    d = await make_draft(db, payload.project_id, payload.episode_from, payload.episode_to, payload.client_id,
                         payload.society_id, payload.converted)
    if d.problems:
        raise HTTPException(400, " ".join(d.problems))
    to = clean_emails(payload.to, "To")
    cc = clean_emails(payload.cc, "CC")
    bcc = clean_emails(payload.bcc, "BCC")
    subject, body = payload.subject.strip(), payload.body.strip()
    kinds = clean_attachments(payload.attachments)
    if not to:
        raise HTTPException(400, "Add at least one To address.")
    if not subject:
        raise HTTPException(400, "Add a subject.")
    if not body:
        raise HTTPException(400, "Write the message.")
    if not kinds:
        raise HTTPException(400, "Attach at least one file.")
    if d.already_sent and not payload.resend:
        last = d.already_sent[0]
        raise HTTPException(409, f"{last['episodes']} of {d.project.title} was already sent to {d.society.name}"
                                 f"{' by ' + last['sent_by'] if last['sent_by'] else ''}. Tick “Send again” to send it anyway.")

    mb, client, society = d.mailbox, d.client, d.society
    try:
        token = await gmail.access_token(gmail.decrypt_token(mb.refresh_token_enc))
    except gmail.MailboxRevoked as e:
        await mark_lost(db, mb, str(e))
        await db.commit()
        raise HTTPException(400, f"Nothing was sent: {client.name}'s Gmail needs reconnecting. {e}")
    except gmail.MailError as e:
        raise HTTPException(502, f"Nothing was sent. {e}")

    files = await build_files(db, d, kinds)
    raw = build_message(d, to, cc, bcc, subject, body, files)
    if len(raw) > GMAIL_MAX_BYTES:
        raise HTTPException(400, "Nothing was sent: the attachments are larger than Gmail allows (25 MB). Send fewer episodes at a time.")
    try:
        sent = await gmail.send_message(token, raw)
    except gmail.MailboxRevoked as e:
        await mark_lost(db, mb, str(e))
        await db.commit()
        raise HTTPException(400, f"Nothing was sent: {client.name}'s Gmail needs reconnecting. {e}")
    except gmail.MailError as e:
        raise HTTPException(502, f"Nothing was sent. {e}")

    now = datetime.now(timezone.utc)
    sub = SocietySubmission(
        project_id=d.project.id, episode_from=d.from_ep, episode_to=d.to_ep,
        client_id=client.id, client=client.name,
        society_id=society.id, society_name=society.name,
        notes=(payload.notes or "").strip() or None,
        submitted_by=current.id,
        submitted_to_iprs=True, submitted_to_iprs_at=now,  # starts the 3-week acceptance follow-up
        sent_via="gmail", mail_from=mb.email,
        mail_to=join_emails(to), mail_cc=join_emails(cc) or None, mail_bcc=join_emails(bcc) or None,
        mail_subject=subject, mail_body=body, mail_attachments=", ".join(name for name, _ in files),
        gmail_message_id=sent.get("id"), gmail_thread_id=sent.get("threadId"), mail_sent_at=now,
        mail_status="sent", mail_watch_from=now, from_conversion=d.converted,
    )
    db.add(sub)
    await db.flush()
    # A bounced email for this range has now been sent again.
    await db.execute(
        update(SocietySubmission).where(
            SocietySubmission.project_id == d.project.id, SocietySubmission.society_id == society.id,
            SocietySubmission.mail_status == "bounced",
            SocietySubmission.episode_from <= d.to_ep, SocietySubmission.episode_to >= d.from_ep,
        ).values(mail_status="resent")
    )
    mb.last_checked_at, mb.last_error = now, None
    await log_activity(db, current.id, "society_mail_sent", "project", d.project.id,
                       f"Emailed {d.episodes}{' (converted cue sheets)' if d.converted else ''} to {society.name} "
                       f"({join_emails(to)}) from {mb.email}. Subject: {subject}")
    await _notify_iprs_users(
        db, title=f"Sent to {society.name} — {d.project.title}",
        body=f"{d.episodes} emailed from {client.name} ({mb.email}) to {join_emails(to)} by {current.full_name}.",
        sub_id=sub.id,
    )
    await db.commit()
    await db.refresh(sub)
    return await _row(db, sub)


@router.get("/approved-episodes/{project_id}", dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def approved_episodes(project_id: int, society_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """Approved episode numbers of a serial/movie — the only ones Send to Society accepts — and whether
    each was already emailed to `society_id`."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Serial or movie not found")
    numbers = (await db.execute(
        select(Episode.episode_number).where(Episode.project_id == proj.id, Episode.status == "approved")
        .order_by(Episode.episode_number)
    )).scalars().all()
    spans = (await db.execute(
        select(SocietySubmission.episode_from, SocietySubmission.episode_to).where(
            SocietySubmission.project_id == proj.id, SocietySubmission.society_id == society_id,
            SocietySubmission.sent_via.in_(("gmail", "gmail_detected")), not_dead,
        )
    )).all() if society_id else []
    return {
        "project_type": proj.type.value,
        "episodes": [{"number": n, "sent": any(a <= n <= b for a, b in spans)} for n in numbers],
    }


@router.get("/mail/overview", dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def mail_overview(db: AsyncSession = Depends(get_db)):
    """Dashboard extras: when the mailboxes were last read, and emails sent outside CueSync to confirm."""
    rows = (await db.execute(
        select(DetectedMail).where(DetectedMail.status == "pending").order_by(DetectedMail.sent_at.desc())
    )).scalars().all()
    clients = {c.id: c.name for c in (await db.execute(
        select(Client).where(Client.id.in_({r.client_id for r in rows}))
    )).scalars().all()} if rows else {}
    synced = await last_sync(db)
    return {
        "configured": not gmail.missing_config(),
        "last_sync": synced.isoformat() if synced else None,
        "sync_minutes": settings.MAIL_SYNC_MINUTES,
        "detected": [{
            "id": r.id, "client_id": r.client_id, "client": clients.get(r.client_id), "mailbox": r.mailbox_email,
            "sent_at": r.sent_at.isoformat() if r.sent_at else None,
            "to": r.mail_to, "cc": r.mail_cc, "subject": r.subject, "attachments": r.attachments,
            "society_id": r.society_id, "project_id": r.project_id,
            "episode_from": r.episode_from, "episode_to": r.episode_to,
            "gmail_link": gmail_link(r.mailbox_email, r.gmail_thread_id),
        } for r in rows],
    }


@router.post("/mail/sync", dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def sync_mail_now(db: AsyncSession = Depends(get_db)):
    """Read the connected client Gmails now instead of waiting for the background check."""
    if gmail.missing_config():
        raise HTTPException(400, "Gmail connection is not set up on the server yet.")
    result = await sync_all(db)
    if result is None:
        raise HTTPException(409, "A mailbox check is already running. Try again in a minute.")
    await db.commit()
    synced = await last_sync(db)
    return {**result, "last_sync": synced.isoformat() if synced else None}


@router.post("/{sub_id}/keep-waiting", dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def keep_waiting(sub_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """The society's reply wasn't the acceptance (e.g. a question): keep watching for a later reply."""
    sub = await db.get(SocietySubmission, sub_id)
    if not sub:
        raise HTTPException(404, "Submission not found")
    if sub.mail_status != "replied":
        raise HTTPException(400, "This email has no reply waiting.")
    sub.mail_status, sub.mail_watch_from = "sent", sub.reply_at
    await log_activity(db, current.id, "reply_keep_waiting", "project", sub.project_id,
                       f"{sub.society_name} reply to Ep {sub.episode_from}–{sub.episode_to} was not the acceptance; waiting for more.")
    await db.commit()
    await db.refresh(sub)
    return await _row(db, sub)


async def _detected(db: AsyncSession, did: int) -> DetectedMail:
    det = await db.get(DetectedMail, did)
    if not det:
        raise HTTPException(404, "Email not found")
    if det.status != "pending":
        raise HTTPException(409, f"This email was already {det.status}.")
    return det


@router.post("/detected/{did}/confirm", dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def confirm_detected(did: int, payload: DetectedConfirmIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """An email sent straight from the client's Gmail is a real submission: record it."""
    det = await _detected(db, did)
    proj = await db.get(Project, payload.project_id)
    society = await db.get(Society, payload.society_id)
    if not proj:
        raise HTTPException(404, "Serial or movie not found")
    if not society:
        raise HTTPException(404, "Society not found")
    if payload.episode_from > payload.episode_to:
        raise HTTPException(400, "Episode From must be ≤ Episode To.")
    client = await db.get(Client, det.client_id)
    now = datetime.now(timezone.utc)
    sent_at = det.sent_at or now
    sub = SocietySubmission(
        project_id=proj.id, episode_from=payload.episode_from, episode_to=payload.episode_to,
        client_id=det.client_id, client=client.name if client else None,
        society_id=society.id, society_name=society.name,
        notes=f"Sent straight from Gmail; confirmed by {current.full_name}.",
        submitted_by=current.id, submitted_to_iprs=True, submitted_to_iprs_at=sent_at,
        sent_via="gmail_detected", mail_from=det.mailbox_email, mail_to=det.mail_to, mail_cc=det.mail_cc,
        mail_subject=det.subject, mail_attachments=det.attachments,
        gmail_message_id=det.gmail_message_id, gmail_thread_id=det.gmail_thread_id, mail_sent_at=sent_at,
        mail_status="sent", mail_watch_from=sent_at,
    )
    db.add(sub)
    await db.flush()
    det.status, det.submission_id, det.decided_by, det.decided_at = "confirmed", sub.id, current.id, now
    label = episodes_label(proj, payload.episode_from, payload.episode_to)
    await log_activity(db, current.id, "detected_confirm", "project", proj.id,
                       f"{label} to {society.name} sent from {det.mailbox_email} outside CueSync — confirmed.")
    await db.commit()
    await db.refresh(sub)
    return await _row(db, sub)


@router.post("/detected/{did}/dismiss", dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def dismiss_detected(did: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """Not a cue sheet submission: stop showing it."""
    det = await _detected(db, did)
    det.status, det.decided_by, det.decided_at = "dismissed", current.id, datetime.now(timezone.utc)
    await log_activity(db, current.id, "detected_dismiss", "client", det.client_id,
                       f"{det.mailbox_email} → {det.mail_to}: {det.subject} — not a cue sheet submission.")
    await db.commit()
    return {"ok": True}


@router.post("/", dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def create_submission(
    payload: SubmissionCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Admin-only entry for a submission that was not emailed through Send to Society."""
    if not (payload.notes or "").strip():
        raise HTTPException(400, "Give the reason this is logged without an email (Notes).")
    if payload.episode_from > payload.episode_to:
        raise HTTPException(400, "episode_from must be ≤ episode_to")

    proj = await db.get(Project, payload.project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    client_id, client = await resolve_client(db, payload.client_id, payload.client)
    sub = SocietySubmission(
        project_id=payload.project_id,
        episode_from=payload.episode_from,
        episode_to=payload.episode_to,
        client_id=client_id,
        client=client,
        notes=payload.notes,
        submitted_by=current.id,
    )
    db.add(sub)

    db.add(AuditLog(
        user_id=current.id,
        action="society_submit",
        entity="project",
        entity_id=payload.project_id,
        details=(
            f"Submitted Ep {payload.episode_from}–{payload.episode_to} to society."
            f"{' Client: ' + client if client else ''}"
        ),
    ))

    await db.commit()
    await db.refresh(sub)
    return await _row(db, sub)


@router.get("/")
async def list_submissions(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(SocietySubmission).order_by(SocietySubmission.submitted_at.desc())
    )).scalars().all()
    return [await _row(db, r) for r in rows]


@router.get("/serial/{project_id}")
async def submissions_by_serial(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(SocietySubmission)
        .where(SocietySubmission.project_id == project_id)
        .order_by(SocietySubmission.submitted_at.desc())
    )).scalars().all()
    return [await _row(db, r) for r in rows]


@router.get("/suggest-clients")
async def suggest_clients(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Names of the active clients in the client list."""
    return (await db.execute(
        select(Client.name).where(Client.is_active.is_(True)).order_by(Client.name)
    )).scalars().all()


@router.post("/{sub_id}/submit-to-iprs",
             dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def mark_submitted_to_iprs(
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Mark a society submission as submitted to IPRS and start the followup clock."""
    sub = await db.get(SocietySubmission, sub_id)
    if not sub:
        raise HTTPException(404, "Submission not found")
    if sub.submitted_to_iprs:
        raise HTTPException(400, "Already marked as submitted to IPRS")

    sub.submitted_to_iprs    = True
    sub.submitted_to_iprs_at = datetime.now(timezone.utc)
    sub.last_followup_at     = None  # reset so 3-week countdown starts fresh
    sub.followup_count       = 0

    proj = await db.get(Project, sub.project_id)
    ep_range = f"Ep {sub.episode_from}–{sub.episode_to}"
    await _notify_iprs_users(
        db,
        title=f"Submitted to IPRS — {proj.title if proj else sub.project_id}",
        body=(
            f"{ep_range} has been submitted to IPRS by {current.full_name}. "
            f"A followup reminder will be sent in 3 weeks if acceptance is not confirmed."
        ),
        sub_id=sub_id,
    )
    db.add(AuditLog(
        user_id=current.id, action="submit_to_iprs",
        entity="society_submission", entity_id=sub_id,
        details=f"Marked {ep_range} as submitted to IPRS.",
    ))
    await db.commit()
    await db.refresh(sub)
    return await _row(db, sub)


@router.post("/{sub_id}/accept-iprs",
             dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def mark_accepted_by_iprs(
    sub_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Mark a submission as accepted/registered by IPRS. Stops all followup notifications."""
    sub = await db.get(SocietySubmission, sub_id)
    if not sub:
        raise HTTPException(404, "Submission not found")
    if sub.accepted_by_iprs:
        raise HTTPException(400, "Already marked as accepted by IPRS")

    sub.accepted_by_iprs    = True
    sub.accepted_by_iprs_at = datetime.now(timezone.utc)

    proj = await db.get(Project, sub.project_id)
    ep_range = f"Ep {sub.episode_from}–{sub.episode_to}"
    await _notify_iprs_users(
        db,
        title=f"IPRS Accepted — {proj.title if proj else sub.project_id}",
        body=(
            f"{ep_range} has been accepted/registered by IPRS. "
            f"Confirmed by {current.full_name}. No further followup needed."
        ),
        sub_id=sub_id,
    )
    db.add(AuditLog(
        user_id=current.id, action="accept_iprs",
        entity="society_submission", entity_id=sub_id,
        details=f"Confirmed IPRS acceptance for {ep_range}.",
    ))
    await db.commit()
    await db.refresh(sub)
    return await _row(db, sub)


@router.get("/stats/overview",
            dependencies=[Depends(require_roles(*_IPRS_ROLES))])
async def submissions_stats(db: AsyncSession = Depends(get_db)):
    """Summary counts for reviewer dashboard."""
    rows = (await db.execute(select(SocietySubmission))).scalars().all()
    return {
        "total":               len(rows),
        "submitted_to_iprs":   sum(1 for r in rows if r.submitted_to_iprs),
        "accepted_by_iprs":    sum(1 for r in rows if r.accepted_by_iprs),
        "pending_iprs_submit": sum(1 for r in rows if not r.submitted_to_iprs),
        "pending_acceptance":  sum(1 for r in rows if r.submitted_to_iprs and not r.accepted_by_iprs),
        "with_client":         sum(1 for r in rows if r.client),
    }
