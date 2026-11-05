"""Reads each connected client Gmail to follow up Send to Society emails:

- a society reply in the sent email's thread  → mail_status "replied" (Reviewer marks Accepted)
- a bounce (mailer-daemon) in that thread     → mail_status "bounced" (Reviewer resends)
- a cue sheet email sent straight from Gmail  → DetectedMail (Reviewer confirms or dismisses)

Runs from the background loop and the Dashboard's "Check now"; a Postgres advisory lock keeps the
gunicorn workers from doing it at the same time.
"""
import html
import re
from datetime import datetime, timedelta, timezone
from email.utils import getaddresses, parseaddr

from sqlalchemy import select, text, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client, ClientMailbox
from app.models.detected_mail import DetectedMail
from app.models.notification import Notification
from app.models.project import Project
from app.models.society import Society
from app.models.society_submission import SocietySubmission
from app.models.user import User
from app.services import gmail
from app.services.audit import log_activity
from app.services.clients import mark_lost, name_key
from app.services.society_mail import split_emails

LOCK_KEY = 40020                     # pg advisory lock id for the mail sync
WATCH_DAYS = 120                     # stop watching a thread for replies after this long
FIRST_SCAN = timedelta(days=30)      # first Sent-folder scan of a mailbox looks back this far
SCAN_OVERLAP = timedelta(hours=1)    # re-read a little before the watermark; known ids are skipped
SHEET_FILE = re.compile(r"\.(xlsx|xls|csv|zip)$", re.I)
BOUNCE_SUBJECT = re.compile(
    r"^(delivery status notification \(failure\)|undeliverable|undelivered mail|mail delivery failed|"
    r"returned mail|failure notice|delivery failure|address not found)", re.I)
OUR_FILE = re.compile(r"^(?P<title>.+)_(?:IPRS|PRS|ASCAP|WorkFile|All)_EP(?P<a>-?\d+)-(?P<b>-?\d+)\.\w+$", re.I)
SUBJECT_EPS = re.compile(r"ep(?:isodes?)?\.?\s*(?P<a>\d+)(?:\s*(?:-|–|—|to)\s*(?P<b>\d+))?", re.I)


def _headers(msg: dict) -> dict[str, str]:
    return {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}


def _when(msg: dict) -> datetime:
    return datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, tz=timezone.utc)


def _domain(addr: str) -> str:
    return addr.rpartition("@")[2].lower()


def _is_bounce(msg: dict, hdr: dict[str, str]) -> bool:
    sender = parseaddr(hdr.get("from", ""))[1].lower()
    return (sender.split("@")[0] in ("mailer-daemon", "postmaster")
            or "x-failed-recipients" in hdr
            or msg.get("payload", {}).get("mimeType") == "multipart/report"
            or bool(BOUNCE_SUBJECT.match(hdr.get("subject", ""))))


def _snippet(msg: dict) -> str:
    return html.unescape(msg.get("snippet", ""))[:500]


def _files(part: dict) -> list[str]:
    names = [part["filename"]] if part.get("filename") else []
    for p in part.get("parts", []) or []:
        names += _files(p)
    return names


def gmail_link(mailbox: str | None, thread_id: str | None) -> str | None:
    return f"https://mail.google.com/mail/u/?authuser={mailbox}#all/{thread_id}" if mailbox and thread_id else None


async def _notify(db: AsyncSession, title: str, body: str, entity_type: str, entity_id: int) -> None:
    users = (await db.execute(
        select(User).where(User.role.in_(["admin", "reviewer"]), User.is_active.is_(True))
    )).scalars().all()
    for u in users:
        db.add(Notification(user_id=u.id, title=title, body=body, entity_type=entity_type, entity_id=entity_id))


def _episodes(sub: SocietySubmission) -> str:
    return f"Ep {sub.episode_from}" if sub.episode_from == sub.episode_to else f"Ep {sub.episode_from}–{sub.episode_to}"


async def _check_thread(db: AsyncSession, token: str, mb: ClientMailbox, sub: SocietySubmission, title: str) -> str | None:
    """Look for the society's reply or a bounce after the sent email. Returns "replied"/"bounced"/None."""
    thread = await gmail.get_thread(token, sub.gmail_thread_id)
    watch_from = sub.mail_watch_from or sub.mail_sent_at
    recipients = [a.lower() for a in split_emails(sub.mail_to)]
    society_domains = {_domain(a) for a in recipients}
    for msg in sorted(thread.get("messages", []), key=lambda m: int(m.get("internalDate", 0))):
        if msg["id"] == sub.gmail_message_id or (watch_from and _when(msg) <= watch_from):
            continue
        hdr = _headers(msg)
        sender = parseaddr(hdr.get("from", ""))[1].lower()
        if _is_bounce(msg, hdr):
            reason = _snippet(msg) or hdr.get("subject", "Delivery failed")
            res = await db.execute(
                update(SocietySubmission).where(SocietySubmission.id == sub.id, SocietySubmission.mail_status == "sent")
                .values(mail_status="bounced", bounce_reason=reason)
            )
            if res.rowcount:
                await _notify(db, f"Email bounced — {sub.society_name} · {title}",
                              f"{_episodes(sub)} to {sub.mail_to} did not arrive. Resend it from the Dashboard. {reason[:160]}",
                              "society_submission", sub.id)
                await log_activity(db, None, "society_bounce", "project", sub.project_id,
                                   f"{_episodes(sub)} to {sub.society_name} ({sub.mail_to}) bounced: {reason[:200]}")
            return "bounced"
        if gmail.same_address(sender, mb.email):
            continue  # the client's own follow-up in the thread
        if sender in recipients or _domain(sender) in society_domains:
            snippet = _snippet(msg)
            res = await db.execute(
                update(SocietySubmission).where(SocietySubmission.id == sub.id, SocietySubmission.mail_status == "sent")
                .values(mail_status="replied", reply_at=_when(msg), reply_from=hdr.get("from"),
                        reply_subject=hdr.get("subject"), reply_snippet=snippet, reply_message_id=msg["id"])
            )
            if res.rowcount:
                await _notify(db, f"{sub.society_name} replied — {title}",
                              f"{_episodes(sub)}: “{snippet[:180]}” Open the Dashboard to mark it Accepted.",
                              "society_submission", sub.id)
                await log_activity(db, None, "society_reply", "project", sub.project_id,
                                   f"{sub.society_name} replied to {_episodes(sub)} ({hdr.get('from')}): {snippet[:200]}")
            return "replied"
    return None


def _guess(subject: str, files: list[str], projects: dict[str, int]) -> tuple[int | None, int | None, int | None]:
    """(project_id, episode_from, episode_to) from CueSync-style file names or the subject line."""
    for f in files:
        m = OUR_FILE.match(f)
        if m and name_key(m["title"]) in projects:
            return projects[name_key(m["title"])], int(m["a"]), int(m["b"])
    parts = [p.strip() for p in re.split(r"[|:\-–—]", subject or "") if p.strip()]
    pid = next((projects[name_key(p)] for p in parts if name_key(p) in projects), None)
    if pid is None:  # title somewhere in the subject
        key = name_key(subject)
        pid = next((v for k, v in sorted(projects.items(), key=lambda kv: -len(kv[0])) if k and k in key), None)
    m = SUBJECT_EPS.search(subject or "")
    a = int(m["a"]) if m else None
    return pid, a, int(m["b"]) if m and m["b"] else a


async def _scan_sent(db: AsyncSession, token: str, mb: ClientMailbox, client: Client, started: datetime) -> int:
    """Cue sheet emails to a society address in the Sent folder that CueSync didn't send."""
    societies = (await db.execute(select(Society).where(Society.is_active.is_(True)))).scalars().all()
    by_address = {a.lower(): s for s in societies for a in split_emails(s.to_emails)}
    if not by_address:
        return 0
    after = (mb.last_sent_scan_at or started - FIRST_SCAN) - SCAN_OVERLAP
    query = f"in:sent has:attachment after:{int(after.timestamp())} {{{' '.join(f'to:{a} cc:{a}' for a in by_address)}}}"
    ids = await gmail.list_messages(token, query)
    if not ids:
        return 0
    known = set((await db.execute(
        select(SocietySubmission.gmail_message_id).where(SocietySubmission.gmail_message_id.in_(ids))
    )).scalars().all()) | set((await db.execute(
        select(DetectedMail.gmail_message_id).where(DetectedMail.gmail_message_id.in_(ids))
    )).scalars().all())
    projects = {name_key(t): i for i, t in (await db.execute(select(Project.id, Project.title))).all()}
    found = 0
    for mid in ids:
        if mid in known:
            continue
        msg = await gmail.get_message(token, mid)
        hdr = _headers(msg)
        if "x-cuesync-ref" in hdr:
            continue  # sent by Send to Society; its entry may still be committing
        files = _files(msg.get("payload", {}))
        if not any(SHEET_FILE.search(f) for f in files):
            continue
        to = [a for _, a in getaddresses([hdr.get("to", "")]) if a]
        cc = [a for _, a in getaddresses([hdr.get("cc", "")]) if a]
        society = next((by_address[a.lower()] for a in to + cc if a.lower() in by_address), None)
        pid, a, b = _guess(hdr.get("subject", ""), files, projects)
        res = await db.execute(insert(DetectedMail).values(
            client_id=client.id, mailbox_email=mb.email, gmail_message_id=mid, gmail_thread_id=msg.get("threadId"),
            sent_at=_when(msg), mail_to=", ".join(to), mail_cc=", ".join(cc) or None, subject=hdr.get("subject"),
            attachments=", ".join(files), society_id=society.id if society else None,
            project_id=pid, episode_from=a, episode_to=b, status="pending", created_at=started,
        ).on_conflict_do_nothing(index_elements=["gmail_message_id"]).returning(DetectedMail.id))
        new_id = res.scalar()
        if new_id:
            found += 1
            await _notify(db, f"Email sent outside CueSync — {client.name}",
                          f"{mb.email} emailed {', '.join(to)} “{hdr.get('subject', '')}”. Confirm it on the Dashboard.",
                          "detected_mail", new_id)
            await log_activity(db, None, "mail_detected", "client", client.id,
                               f"{mb.email} → {', '.join(to)}: {hdr.get('subject', '')} ({', '.join(files)})")
    return found


async def sync_mailbox(db: AsyncSession, mb: ClientMailbox) -> dict:
    out = {"checked": 0, "replies": 0, "bounces": 0, "detected": 0, "errors": []}
    client = await db.get(Client, mb.client_id)
    started = datetime.now(timezone.utc)
    try:
        token = await gmail.access_token(gmail.decrypt_token(mb.refresh_token_enc))
    except gmail.MailboxRevoked as e:
        await mark_lost(db, mb, str(e))
        out["errors"].append(f"{client.name}: Gmail needs reconnecting")
        return out
    except gmail.MailError as e:
        out["errors"].append(f"{client.name}: {e}")
        return out

    subs = (await db.execute(
        select(SocietySubmission).where(
            SocietySubmission.mail_from == mb.email,
            SocietySubmission.mail_status == "sent",
            SocietySubmission.accepted_by_iprs.is_(False),
            SocietySubmission.gmail_thread_id.isnot(None),
            SocietySubmission.mail_sent_at >= started - timedelta(days=WATCH_DAYS),
        )
    )).scalars().all()
    titles = dict((await db.execute(
        select(Project.id, Project.title).where(Project.id.in_({s.project_id for s in subs}))
    )).all()) if subs else {}
    try:
        for sub in subs:
            try:
                result = await _check_thread(db, token, mb, sub, titles.get(sub.project_id, ""))
            except gmail.MailboxRevoked:
                raise
            except gmail.MailError as e:  # e.g. the thread was deleted: keep going with the rest
                out["errors"].append(f"{client.name}: {e}")
                continue
            sub.mail_checked_at = started
            out["checked"] += 1
            out["replies"] += result == "replied"
            out["bounces"] += result == "bounced"
        out["detected"] = await _scan_sent(db, token, mb, client, started)
        mb.last_sent_scan_at = started
    except gmail.MailboxRevoked as e:
        await mark_lost(db, mb, str(e))
        out["errors"].append(f"{client.name}: Gmail needs reconnecting")
    except gmail.MailError as e:
        out["errors"].append(f"{client.name}: {e}")
    return out


async def sync_all(db: AsyncSession) -> dict | None:
    """Check every connected mailbox. None when Gmail isn't set up or another worker is already at it."""
    if gmail.missing_config():
        return None
    if not (await db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": LOCK_KEY})).scalar():
        return None
    total = {"mailboxes": 0, "checked": 0, "replies": 0, "bounces": 0, "detected": 0, "errors": []}
    for mb in (await db.execute(select(ClientMailbox).where(ClientMailbox.status == "connected"))).scalars().all():
        r = await sync_mailbox(db, mb)
        total["mailboxes"] += 1
        for k in ("checked", "replies", "bounces", "detected"):
            total[k] += r[k]
        total["errors"] += r["errors"]
    return total


async def last_sync(db: AsyncSession) -> datetime | None:
    return (await db.execute(
        select(ClientMailbox.last_sent_scan_at).where(ClientMailbox.last_sent_scan_at.isnot(None))
        .order_by(ClientMailbox.last_sent_scan_at.desc()).limit(1)
    )).scalar()
