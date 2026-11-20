"""New Work tracking: an upcoming movie or TV show, from the day its name arrives until its cue sheet work is done.

Three steps, each done or skipped with a reason before the next one opens:
  1. BGM received
  2. Fingerprinting: assigned → in progress → completed. "Completed" needs the fingerprinting service's email for
     this title (services/fingerprint_mail.py), or a note of where the fingerprinting came from when no email arrived.
  3. Cue sheet work allotted: an ordinary delegation, whose status the work follows from then on.

A step left waiting is chased every NEW_WORK_REMINDER_DAYS days, and once more at 15 and at 30 days since the work
was added while its cue sheet work is still not allotted. Everything done here, by a person or by CueSync, is written
to the audit log under entity "new_work".

Each work names its client (required when it is added) and may carry a release date and a video link. A release date
still ahead when it is entered brings the Admins and Work Delegators an update on that day and RELEASE_FOLLOW_UP days
after it, saying where the work stands.

A movie released in theatres first (release_type "theatrical") has no video to work from until it reaches OTT or the
client sends a copy, so it waits for "Video available" before fingerprinting opens. While it waits, the step
reminders and the 15/30-day flags hold off (they count from the day the video came); instead CueSync asks "is it on
OTT yet?" on the expected OTT date (the announced one, or the usual gap after release) and every
NEW_WORK_VIDEO_CHECK_DAYS after, and flags it once NEW_WORK_VIDEO_OVERDUE_DAYS after release.
"""
import re
from datetime import date, datetime, timedelta, timezone
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.client import Client
from app.models.new_work import FingerprintMail, NewWork
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.work_delegation import WorkDelegation
from app.services.audit import log_activity

WD_ROLES = (UserRole.ADMIN, UserRole.WORK_DELEGATOR)
ENTITY = "new_work"
EVENT = "new_work"                 # notification about something that happened to a work
REMINDER = "new_work_reminder"     # notification chasing a pending step
RELEASE = "new_work_release"       # notification on a work's release day, and RELEASE_FOLLOW_UP days after it
RELEASE_FOLLOW_UP = 7              # days after the release date for the second update
VIDEO = "new_work_video"           # notification: is a theatrical release on OTT yet?
RELEASE_TYPES = {"theatrical": "Theatres first", "ott": "OTT", "tv": "TV"}
OTT_WINDOWS = (28, 56)             # the usual theatre → OTT gaps a work can be set to: 4 weeks (South), 8 weeks (Hindi)
VIDEO_SOURCES = {"ott": "Streaming on OTT", "client": "Copy sent by the client", "tv": "Shown on TV", "other": "Other"}
TYPES = {"movie": "Movie", "tv_show": "TV Show"}
STEPS = {"bgm": "BGM received", "fingerprint": "Fingerprinting", "cue": "Cue sheet work"}
LONG_PENDING = (15, 30)            # days since added, cue sheet work still not allotted
MIN_REASON = 5                     # shortest reason / source note that says anything
RECENT_DONE = timedelta(days=14)   # how long finished fingerprinting stays on the editor's dashboard

STAGES = {
    "awaiting_bgm": "Awaiting BGM",
    "awaiting_video": "Waiting for video",
    "fp_not_assigned": "Fingerprinting not assigned",
    "fp_assigned": "Fingerprinting assigned",
    "fp_in_progress": "Fingerprinting in progress",
    "cue_pending": "Cue sheet allocation pending",
    "cue_assigned": "Cue sheet assigned",
    "cue_in_progress": "Cue sheet in progress",
    "completed": "Completed",
    "closed": "Closed without a cue sheet",
}
PENDING_STAGES = ("awaiting_bgm", "fp_not_assigned", "fp_assigned", "fp_in_progress", "cue_pending")
FP_LABEL = {"not_assigned": "Not assigned", "assigned": "Assigned", "in_progress": "In progress",
            "completed": "Completed", "skipped": "Skipped"}
CUE_LABEL = {"not_assigned": "Not assigned", "assigned": "Assigned", "in_progress": "In progress",
             "completed": "Completed", "skipped": "Skipped"}
CUE_FROM_DELEGATION = {"pending": "assigned", "in_progress": "in_progress", "completed": "completed"}
DELEGATION_FROM_CUE = {v: k for k, v in CUE_FROM_DELEGATION.items()}
REMINDER_TITLE = {"bgm": "BGM not received", "fingerprint": "Fingerprinting pending", "cue": "Cue sheet work not allotted"}


def title_key(title: str | None) -> str:
    return "".join(ch for ch in (title or "").lower() if ch.isalnum())


def iso(at: datetime | None) -> str | None:
    return at.isoformat() if at else None


def days_since(at: datetime | None, now: datetime) -> int:
    return max(0, (now - at).days) if at else 0


def ago(days: int) -> str:
    return "today" if days <= 0 else "1 day ago" if days == 1 else f"{days} days ago"


def local_today(now: datetime) -> date:
    """The office's calendar day (REPORT_TIMEZONE): a release date "arrives" at its midnight, not UTC's."""
    try:
        tz = ZoneInfo(settings.REPORT_TIMEZONE.strip())
    except Exception:
        tz = timezone.utc
    return now.astimezone(tz).date()


def day(d: date | None) -> str | None:
    return f"{d:%d %b %Y}" if d else None


DATE_RANGE = (date(1950, 1, 1), date(2100, 12, 31))


def sane_date(d: date | None, what: str) -> date | None:
    """A typo like year 9999 would overflow every "+ 7 days" and break the whole list, so dates stay in a real range."""
    if d is not None and not DATE_RANGE[0] <= d <= DATE_RANGE[1]:
        raise HTTPException(400, f"The {what} must be between {DATE_RANGE[0].year} and {DATE_RANGE[1].year}.")
    return d


def release_level(release: date | None, today: date) -> int:
    """How many of the two release updates have come round: on the day (1), and RELEASE_FOLLOW_UP days after (2)."""
    if not release or today < release:
        return 0
    return 2 if (today - release).days >= RELEASE_FOLLOW_UP else 1


def release_info(w: NewWork, today: date) -> dict | None:
    if not w.release_date:
        return None
    days = (today - w.release_date).days   # negative while it is still ahead
    label = ("Releases today" if days == 0 else "Releases tomorrow" if days == -1 else f"Releases in {-days} days" if days < 0
             else "Released yesterday" if days == 1 else f"Released {days} days ago")
    follow = w.release_date + timedelta(days=RELEASE_FOLLOW_UP)
    nxt = (w.release_date if w.release_alert_level < 1 and today <= w.release_date
           else follow if w.release_alert_level < 2 and today <= follow else None)
    return {"date": w.release_date.isoformat(), "days": days, "upcoming": days < 0, "label": label,
            "updates_sent": w.release_alert_level, "next_update": nxt.isoformat() if nxt else None}


# ── waiting for the video (theatrical releases) ───────────────────────────────
def expected_ott(w: NewWork) -> date | None:
    """The announced OTT date, or the usual gap after the theatrical release."""
    if w.ott_date:
        return w.ott_date
    if w.release_date:
        return w.release_date + timedelta(days=w.ott_window_days or settings.NEW_WORK_OTT_WINDOW_DAYS)
    return None


def _added_day(w: NewWork) -> date:
    return local_today(w.created_at or datetime.now(timezone.utc))


def video_anchor(w: NewWork) -> date:
    """The day of the first "is it on OTT yet?" check: the expected OTT date, or a week after the work was added
    when neither a release nor an OTT date is known."""
    return expected_ott(w) or _added_day(w) + timedelta(days=max(1, settings.NEW_WORK_VIDEO_CHECK_DAYS))


def video_checks_due(w: NewWork, today: date) -> int:
    anchor = video_anchor(w)
    return 0 if today < anchor else 1 + (today - anchor).days // max(1, settings.NEW_WORK_VIDEO_CHECK_DAYS)


def video_overdue(w: NewWork, today: date) -> bool:
    start = w.release_date or _added_day(w)
    return (today - start).days >= settings.NEW_WORK_VIDEO_OVERDUE_DAYS


def arm_video_checks(w: NewWork, today: date) -> None:
    """Checks and the overdue flag owed from now on: whatever has already come round is not sent late."""
    w.video_check_count = video_checks_due(w, today)
    w.video_overdue_sent = video_overdue(w, today)


def video_info(w: NewWork, today: date, by_name: str | None) -> dict | None:
    if not w.video_state:
        return None
    exp = expected_ott(w)
    every = max(1, settings.NEW_WORK_VIDEO_CHECK_DAYS)
    waiting = w.video_state == "waiting"
    nxt = video_anchor(w) + timedelta(days=every * w.video_check_count) if waiting else None
    return {
        "state": w.video_state, "waiting": waiting, "at": iso(w.video_at), "by_name": by_name,
        "source": w.video_source, "source_label": VIDEO_SOURCES.get(w.video_source or ""), "note": w.video_note,
        "expected_ott": exp.isoformat() if exp else None, "estimated": bool(exp and not w.ott_date),
        "checks_sent": w.video_check_count, "next_check": nxt.isoformat() if nxt else None,
        "overdue": waiting and video_overdue(w, today),
        "days_since_release": (today - w.release_date).days if w.release_date and w.release_date <= today else None,
    }


def counts_from_video(w: NewWork) -> bool:
    """Pending time of a theatrical release starts when its video came, not when its name did."""
    return w.video_state == "available" and w.video_at is not None


def clean_link(text: str | None) -> str | None:
    """A video link as a web address (http/https only, so it is safe to open); "youtu.be/x" gets https:// added."""
    link = (text or "").strip()
    if not link:
        return None
    if not re.match(r"https?://", link, re.I):
        link = "https://" + link
    try:
        host = urlparse(link).hostname or ""
    except ValueError:
        host = ""
    if "." not in host or any(ch.isspace() for ch in link):
        raise HTTPException(400, "The video link must be a web address, e.g. https://youtu.be/…")
    return link


async def client_of(db: AsyncSession, client_id: int | None) -> Client:
    if not client_id:
        raise HTTPException(400, "Pick the client. Every new work needs one.")
    c = await db.get(Client, client_id)
    if not c or not c.is_active:
        raise HTTPException(400, "Pick an active client from the client list.")
    return c


def reason_of(text: str | None, what: str) -> str:
    reason = " ".join((text or "").split())
    if len(reason) < MIN_REASON:
        raise HTTPException(400, f"{what} (at least {MIN_REASON} characters).")
    return reason


# ── where a work stands ────────────────────────────────────────────────────────
def cue_status(w: NewWork, dl: WorkDelegation | None) -> str:
    if w.cue_skip_reason is not None:
        return "skipped"
    if dl is not None:
        return CUE_FROM_DELEGATION.get(dl.status, "assigned")
    return "completed" if w.cue_done_at else "not_assigned"   # the allotment was deleted after the work was done


def fingerprint_locked(w: NewWork) -> bool:
    return w.bgm_state == "awaiting" or w.video_state == "waiting"


def stage_of(w: NewWork, dl: WorkDelegation | None) -> str:
    if w.bgm_state == "awaiting":
        return "awaiting_bgm"
    if w.video_state == "waiting" and w.fp_status not in ("completed", "skipped"):
        return "awaiting_video"
    if w.fp_status not in ("completed", "skipped"):
        return f"fp_{w.fp_status}"
    return {"not_assigned": "cue_pending", "assigned": "cue_assigned", "in_progress": "cue_in_progress",
            "completed": "completed", "skipped": "closed"}[cue_status(w, dl)]


def stage_since(w: NewWork, stage: str) -> datetime | None:
    """When the step the work is waiting on opened."""
    if stage == "awaiting_bgm":
        return w.created_at
    if stage == "awaiting_video":
        return w.bgm_at or w.created_at
    if stage.startswith("fp_"):
        opened = w.bgm_at or w.created_at
        return max(opened, w.video_at) if counts_from_video(w) and opened else opened
    if stage == "cue_pending":
        return w.fp_done_at or w.bgm_at or w.created_at
    if stage in ("cue_assigned", "cue_in_progress"):
        return w.cue_assigned_at or w.fp_done_at
    return w.cue_done_at


def _opened(w: NewWork, days_open: int) -> str:
    return (f"The video of {w.title} became available {ago(days_open)}" if counts_from_video(w)
            else f"{w.title} was added {ago(days_open)}")


def _long_message(w: NewWork, kind: str, days_open: int, days: int, message: str) -> str:
    opened = _opened(w, days_open)
    if kind == "bgm":   # both count from the day it was added: say it once
        return f"{opened}. The BGM has still not been received, so cue sheet work has not been assigned. Please follow up."
    if kind == "cue":   # the step itself is "not allotted": don't say it twice
        done = "skipped" if w.fp_status == "skipped" else "completed"
        return f"{opened}, but cue sheet work has still not been assigned. Fingerprinting was {done} {ago(days)}."
    return f"{opened}, but cue sheet work has still not been assigned. {message}"


def follow_up(w: NewWork, stage: str, now: datetime, assignee: str | None = None) -> dict | None:
    """What still has to be chased for this work, in the words of its reminder. None once cue sheet work is allotted,
    and while the work waits for its video (those checks are send_video_checks')."""
    if stage not in PENDING_STAGES:
        return None
    since = stage_since(w, stage)
    days = days_since(since, now)
    if stage == "awaiting_bgm":
        kind = "bgm"
        message = f"{w.title} was added {ago(days)}, but the BGM has not yet been received. Please follow up."
    elif stage == "cue_pending":
        kind = "cue"
        done = "was skipped" if w.fp_status == "skipped" else "was completed"
        message = f"Fingerprinting for {w.title} {done} {ago(days)}, but cue sheet work has not yet been allocated."
    else:
        kind = "fingerprint"
        start = (f"The video of {w.title} became available {ago(days)}" if counts_from_video(w) and since == w.video_at
                 else f"The BGM step for {w.title} was skipped {ago(days)}" if w.bgm_state == "skipped"
                 else f"BGM for {w.title} was received {ago(days)}")
        who = " It is not assigned to anyone yet." if stage == "fp_not_assigned" else f" Assigned to {assignee}." if assignee else ""
        message = f"{start}, but fingerprinting is still pending.{who}"
    every = max(1, settings.NEW_WORK_REMINDER_DAYS)
    days_open = days_since(w.video_at if counts_from_video(w) else w.created_at, now)
    # No video yet: nothing can be allotted, so the 15/30-day flags wait for it.
    level = 0 if w.video_state == "waiting" else max((n for n in LONG_PENDING if days_open >= n), default=0)
    return {
        "kind": kind, "days": days, "days_open": days_open, "count": days // every,
        "due": days >= every or level > 0, "level": level, "message": message,
        "long_message": _long_message(w, kind, days_open, days, message) if level else None,
        "last_sent_at": iso(w.last_reminder_at),
        "next_at": iso(since + timedelta(days=every * (days // every + 1))) if since else None,
    }


# ── reading ────────────────────────────────────────────────────────────────────
class Loaded:
    """Works with everything their rows name, read in a handful of queries."""

    async def load(self, db: AsyncSession, *where) -> "Loaded":
        self.now = datetime.now(timezone.utc)
        self.works = (await db.execute(select(NewWork).where(*where).order_by(NewWork.created_at.desc(), NewWork.id.desc()))).scalars().all()
        dids = {w.delegation_id for w in self.works if w.delegation_id}
        self.delegations = {d.id: d for d in (await db.execute(
            select(WorkDelegation).where(WorkDelegation.id.in_(dids)))).scalars().all()} if dids else {}
        mids = {w.fp_mail_id for w in self.works if w.fp_mail_id}
        self.mails = {m.id: m for m in (await db.execute(
            select(FingerprintMail).where(FingerprintMail.id.in_(mids)))).scalars().all()} if mids else {}
        uids = set()
        for w in self.works:
            uids |= {w.created_by, w.bgm_by, w.fp_assigned_to, w.fp_assigned_by, w.fp_done_by, w.fp_mail_linked_by,
                     w.cue_assigned_to, w.cue_assigned_by, w.video_by}
        uids |= {d.assigned_to for d in self.delegations.values()}
        cids = {w.client_id for w in self.works if w.client_id}
        self.clients = {c.id: c for c in (await db.execute(select(Client).where(Client.id.in_(cids)))).scalars().all()} if cids else {}
        uids.discard(None)
        self.users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
        return self

    def name(self, uid: int | None) -> str | None:
        u = self.users.get(uid)
        return u.full_name if u else None

    def client(self, w: NewWork) -> str | None:
        c = self.clients.get(w.client_id) if w.client_id else None
        return c.name if c else None

    def delegation(self, w: NewWork) -> WorkDelegation | None:
        return self.delegations.get(w.delegation_id) if w.delegation_id else None

    def stage(self, w: NewWork) -> str:
        return stage_of(w, self.delegation(w))

    def reminder(self, w: NewWork) -> dict | None:
        return follow_up(w, self.stage(w), self.now, self.name(w.fp_assigned_to))

    def row(self, w: NewWork) -> dict:
        dl = self.delegation(w)
        stage = stage_of(w, dl)
        cue = cue_status(w, dl)
        since = stage_since(w, stage)
        mail = self.mails.get(w.fp_mail_id) if w.fp_mail_id else None
        reminder = self.reminder(w)
        allotted = cue in ("assigned", "in_progress", "completed")
        cue_editor = (dl.assigned_to if dl else w.cue_assigned_to) if allotted else None
        return {
            "id": w.id, "title": w.title, "work_type": w.work_type, "work_type_label": TYPES.get(w.work_type, w.work_type),
            "remarks": w.remarks, "created_at": iso(w.created_at), "created_by_name": self.name(w.created_by),
            "client_id": w.client_id, "client_name": self.client(w), "video_link": w.video_link,
            "release_date": w.release_date.isoformat() if w.release_date else None,
            "release": release_info(w, local_today(self.now)),
            "release_type": w.release_type, "release_type_label": RELEASE_TYPES.get(w.release_type or ""),
            "ott": {"date": w.ott_date.isoformat() if w.ott_date else None, "platform": w.ott_platform,
                    "window_days": w.ott_window_days or settings.NEW_WORK_OTT_WINDOW_DAYS},
            "video": video_info(w, local_today(self.now), self.name(w.video_by)),
            "updated_at": iso(w.updated_at),
            "stage": stage, "stage_label": STAGES[stage], "stage_since": iso(since),
            "days_in_stage": days_since(since, self.now) if stage in PENDING_STAGES or stage == "awaiting_video" or stage.startswith("cue_") else None,
            "days_open": reminder["days_open"] if reminder else None,
            "bgm": {
                "state": w.bgm_state, "received": w.bgm_state == "received", "at": iso(w.bgm_at),
                "by_name": self.name(w.bgm_by), "skip_reason": w.bgm_skip_reason,
            },
            "fingerprint": {
                "status": w.fp_status, "status_label": FP_LABEL[w.fp_status],
                "assigned_to": w.fp_assigned_to, "assigned_to_name": self.name(w.fp_assigned_to),
                "assigned_by_name": self.name(w.fp_assigned_by), "assigned_at": iso(w.fp_assigned_at),
                "assigned_days": days_since(w.fp_assigned_at, self.now) if w.fp_assigned_at else None,
                "started_at": iso(w.fp_started_at), "done_at": iso(w.fp_done_at), "done_by_name": self.name(w.fp_done_by),
                "source": w.fp_source, "source_note": w.fp_source_note, "skip_reason": w.fp_skip_reason,
                "mail": mail_row(mail, self.name(w.fp_mail_linked_by), w.fp_mail_linked_at) if mail else None,
            },
            "cue": {
                "status": cue, "status_label": CUE_LABEL[cue],
                "assigned_to": cue_editor, "assigned_to_name": self.name(cue_editor),
                "assigned_by_name": self.name(w.cue_assigned_by) if allotted else None,
                "assigned_at": iso(w.cue_assigned_at) if allotted else None,
                "done_at": iso(w.cue_done_at), "skip_reason": w.cue_skip_reason,
                "delegation_id": dl.id if dl else None, "project_id": w.project_id,
                "client": dl.client if dl else None, "episode_range": dl.episode_range if dl else None,
                "week_target": dl.week_target if dl else None,
            },
            "locked": {"fingerprint": fingerprint_locked(w), "cue": w.fp_status not in ("completed", "skipped")},
            "reminder": reminder,
        }

    def rows(self) -> list[dict]:
        return [self.row(w) for w in self.works]


def mail_row(m: FingerprintMail, linked_by: str | None = None, linked_at: datetime | None = None) -> dict:
    return {
        "id": m.id, "subject": m.subject or "(no subject)", "from": m.from_addr, "snippet": m.snippet,
        "attachments": m.attachments, "received_at": iso(m.received_at),
        "linked_by_name": linked_by, "linked_at": iso(linked_at), "auto": linked_at is not None and linked_by is None,
    }


def summarize(rows: list[dict]) -> dict:
    """The numbers on the Work Delegator and Admin dashboards and in their weekly reports."""
    stage = {k: 0 for k in STAGES}
    for r in rows:
        stage[r["stage"]] += 1
    pending = [r for r in rows if r["reminder"]]
    return {
        "total": len(rows),
        "movies": sum(1 for r in rows if r["work_type"] == "movie"),
        "tv_shows": sum(1 for r in rows if r["work_type"] == "tv_show"),
        "awaiting_bgm": stage["awaiting_bgm"],
        "awaiting_video": sum(1 for r in rows if r["video"] and r["video"]["waiting"]),
        "video_overdue": sum(1 for r in rows if r["video"] and r["video"]["overdue"]),
        "bgm_received": sum(1 for r in rows if r["bgm"]["state"] == "received"),
        "bgm_skipped": sum(1 for r in rows if r["bgm"]["state"] == "skipped"),
        "fp_not_assigned": stage["fp_not_assigned"],
        "fp_assigned": stage["fp_assigned"],
        "fp_in_progress": stage["fp_in_progress"],
        "fp_completed": sum(1 for r in rows if r["fingerprint"]["status"] == "completed"),
        "fp_skipped": sum(1 for r in rows if r["fingerprint"]["status"] == "skipped"),
        "cue_pending": stage["cue_pending"],
        "cue_assigned": stage["cue_assigned"],
        "cue_in_progress": stage["cue_in_progress"],
        "completed": stage["completed"],
        "closed": stage["closed"],
        "pending": len(pending),
        "pending_15": sum(1 for r in pending if r["days_open"] >= LONG_PENDING[0]),
        "pending_30": sum(1 for r in pending if r["days_open"] >= LONG_PENDING[1]),
        "reminders": sum(1 for r in pending if r["reminder"]["due"]),
    }


async def history(db: AsyncSession, work_id: int | None = None, limit: int = 300) -> list[dict]:
    """Audit rows of one work, or of every work (newest first), each with who did it; no user means CueSync itself."""
    conds = [AuditLog.entity == ENTITY] + ([AuditLog.entity_id == work_id] if work_id else [])
    rows = (await db.execute(select(AuditLog).where(*conds).order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(limit))).scalars().all()
    uids = {r.user_id for r in rows if r.user_id}
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
    wids = {r.entity_id for r in rows if r.entity_id}
    titles = dict((await db.execute(select(NewWork.id, NewWork.title).where(NewWork.id.in_(wids)))).all()) if wids and not work_id else {}
    out = []
    for r in rows:
        u = users.get(r.user_id)
        out.append({
            "id": r.id, "action": r.action, "details": r.details, "at": iso(r.created_at),
            "work_id": r.entity_id, "work_title": titles.get(r.entity_id), "automated": r.user_id is None,
            "user_id": u.id if u else None, "user_name": u.full_name if u else "CueSync (automatic)",
            "user_role": u.role.value if u else None,
        })
    return out


async def report_data(db: AsyncSession) -> dict:
    """For the weekly reports: the dashboard numbers, the works to chase (longest pending first) and each
    editor's open fingerprinting."""
    data = await Loaded().load(db)
    rows = data.rows()
    by_editor: dict[int, list[dict]] = {}
    for r in rows:
        fp = r["fingerprint"]
        if fp["assigned_to"] and fp["status"] in ("assigned", "in_progress") and not r["locked"]["fingerprint"]:
            by_editor.setdefault(fp["assigned_to"], []).append(r)
    return {
        "summary": summarize(rows),
        "pending": sorted((r for r in rows if r["reminder"]), key=lambda r: (-r["days_open"], r["title"].lower())),
        "fingerprint_by_editor": by_editor,
        # Longest since release first; no release date last.
        "waiting_video": sorted((r for r in rows if r["video"] and r["video"]["waiting"]),
                                key=lambda r: (-(r["video"]["days_since_release"] or -1), r["title"].lower())),
    }


# ── writing ────────────────────────────────────────────────────────────────────
async def _log(db: AsyncSession, user: User | None, action: str, w: NewWork, details: str | None = None) -> None:
    await log_activity(db, user.id if user else None, action, ENTITY, w.id, details)


async def staff(db: AsyncSession, *extra: int | None, skip: int | None = None) -> list[int]:
    """Active admins and Work Delegators, plus the named users, minus whoever just did the thing."""
    ids = set((await db.execute(
        select(User.id).where(User.role.in_([r.value for r in WD_ROLES]), User.is_active.is_(True))
    )).scalars().all())
    wanted = {e for e in extra if e}
    if wanted:
        ids |= set((await db.execute(select(User.id).where(User.id.in_(wanted), User.is_active.is_(True)))).scalars().all())
    ids.discard(skip)
    return sorted(ids)


async def notify(db: AsyncSession, user_ids: list[int], title: str, body: str, w: NewWork, kind: str = EVENT) -> None:
    for uid in user_ids:
        db.add(Notification(user_id=uid, title=title[:500], body=body, entity_type=kind, entity_id=w.id))


async def clear_reminders(db: AsyncSession, w: NewWork) -> None:
    """The step moved on: its reminders in everyone's bell are no longer something to act on."""
    await db.execute(update(Notification).where(
        Notification.entity_type == REMINDER, Notification.entity_id == w.id, Notification.is_read.is_(False),
    ).values(is_read=True))


def release_fields(work_type: str, release_type: str | None, ott_platform: str | None, ott_window_days: int | None) -> tuple:
    """Checked release type, OTT platform and OTT gap; the OTT details only belong to a theatrical release."""
    if release_type is not None and release_type not in RELEASE_TYPES:
        raise HTTPException(400, "Release type must be Theatres first, OTT or TV.")
    if release_type == "theatrical" and work_type != "movie":
        raise HTTPException(400, "Only a movie is released in theatres. Pick OTT or TV for a TV show.")
    if ott_window_days is not None and ott_window_days not in OTT_WINDOWS:
        raise HTTPException(400, "The usual OTT gap must be 4 or 8 weeks.")
    if release_type != "theatrical":
        return release_type, None, None
    return release_type, " ".join((ott_platform or "").split())[:100] or None, ott_window_days


async def create(db: AsyncSession, user: User, title: str, work_type: str, remarks: str | None, client_id: int | None = None,
                 release_date: date | None = None, video_link: str | None = None, release_type: str | None = None,
                 ott_date: date | None = None, ott_platform: str | None = None, ott_window_days: int | None = None) -> NewWork:
    title = " ".join((title or "").split())
    key = title_key(title)
    if not key:
        raise HTTPException(400, "Enter the movie or TV show name.")
    if work_type not in TYPES:
        raise HTTPException(400, "Work type must be Movie or TV Show.")
    client = await client_of(db, client_id)
    link = clean_link(video_link)
    release_date, ott_date = sane_date(release_date, "release date"), sane_date(ott_date, "OTT date")
    release_type, ott_platform, ott_window_days = release_fields(work_type, release_type, ott_platform, ott_window_days)
    if release_type != "theatrical":
        ott_date = None
    data = await Loaded().load(db, NewWork.title_key == key, NewWork.work_type == work_type)
    twin = next((x for x in data.works if data.stage(x) not in ("completed", "closed")), None)
    if twin:
        raise HTTPException(409, f'"{twin.title}" is already in the New Work List ({STAGES[data.stage(twin)].lower()}).')
    today = local_today(datetime.now(timezone.utc))
    w = NewWork(title=title, title_key=key, work_type=work_type, remarks=(remarks or "").strip() or None, created_by=user.id,
                client_id=client.id, release_date=release_date, video_link=link,
                release_alert_level=release_level(release_date, today), release_type=release_type, ott_date=ott_date,
                ott_platform=ott_platform, ott_window_days=ott_window_days, video_state="waiting" if release_type == "theatrical" else None)
    db.add(w)
    await db.flush()
    if w.video_state:
        arm_video_checks(w, today)
    exp = expected_ott(w) if w.video_state else None
    parts = [TYPES[work_type], f"client {client.name}", release_type and RELEASE_TYPES[release_type].lower(),
             release_date and f"release {day(release_date)}",
             exp and f"{'OTT' if ott_date else 'expected on OTT around'} {day(exp)}{f' on {ott_platform}' if ott_platform else ''}",
             "status Awaiting BGM" + (", waiting for the video" if w.video_state else ""), link and f"video {link}", w.remarks]
    await _log(db, user, "new_work_add", w, " · ".join(p for p in parts if p))
    return w


async def _edit_release(db: AsyncSession, w: NewWork, fields: dict, changes: list, today: date, expected_before: date | None) -> None:
    """Release type and OTT details. Making a work theatrical sends it to "Waiting for video" while its
    fingerprinting hasn't started; making it OTT or TV ends the wait."""
    rtype = fields.get("release_type", w.release_type)
    rtype, platform, window = release_fields(w.work_type, rtype, fields.get("ott_platform", w.ott_platform),
                                             fields.get("ott_window_days", w.ott_window_days))
    started_waiting = False
    if rtype != w.release_type:
        changes.append(f"release {RELEASE_TYPES.get(w.release_type or '', 'not set').lower()} → {RELEASE_TYPES.get(rtype or '', 'not set').lower()}")
        w.release_type = rtype
        if rtype == "theatrical" and w.video_state != "available" and w.fp_status == "not_assigned":
            w.video_state, started_waiting = "waiting", True
            changes.append("waiting for the video")
        elif rtype != "theatrical" and w.video_state == "waiting":
            w.video_state = None
            changes.append("no longer waiting for the video")
    ott_date = sane_date(fields.get("ott_date", w.ott_date), "OTT date") if rtype == "theatrical" else None
    if ott_date != w.ott_date:
        changes.append(f"OTT date {day(w.ott_date) or 'none'} → {day(ott_date) or 'cleared'}")
        w.ott_date = ott_date
    if platform != w.ott_platform:
        changes.append(f"OTT platform {platform or 'cleared'}")
        w.ott_platform = platform
    if window != w.ott_window_days:
        if rtype == "theatrical":
            changes.append(f"usual OTT gap {(window or settings.NEW_WORK_OTT_WINDOW_DAYS) // 7} weeks")
        w.ott_window_days = window
    # New dates (or a new wait): the checks still ahead of them are owed, none of those already passed.
    if w.video_state == "waiting" and (started_waiting or expected_ott(w) != expected_before):
        arm_video_checks(w, today)


async def _no_twin(db: AsyncSession, w: NewWork, key: str, work_type: str) -> None:
    """A rename or retype must not make this work a second open entry for the same title."""
    data = await Loaded().load(db, NewWork.title_key == key, NewWork.work_type == work_type, NewWork.id != w.id)
    twin = next((x for x in data.works if data.stage(x) not in ("completed", "closed")), None)
    if twin:
        raise HTTPException(409, f'"{twin.title}" is already in the New Work List ({STAGES[data.stage(twin)].lower()}).')


async def edit(db: AsyncSession, w: NewWork, user: User, fields: dict) -> None:
    changes = []
    if "title" in fields:
        title = " ".join((fields["title"] or "").split())
        if not title_key(title):
            raise HTTPException(400, "Enter the movie or TV show name.")
        if title != w.title:
            await _no_twin(db, w, title_key(title), fields.get("work_type", w.work_type))
            changes.append(f"renamed {w.title} → {title}")
            w.title, w.title_key = title, title_key(title)
    if "work_type" in fields and fields["work_type"] != w.work_type:
        if fields["work_type"] not in TYPES:
            raise HTTPException(400, "Work type must be Movie or TV Show.")
        if w.delegation_id:
            raise HTTPException(409, "The cue sheet work is already allotted, so the work type can't change.")
        if fields["work_type"] != "movie" and fields.get("release_type", w.release_type) == "theatrical":
            raise HTTPException(400, "Only a movie is released in theatres. Pick OTT or TV for a TV show.")
        await _no_twin(db, w, w.title_key, fields["work_type"])
        changes.append(f"type {TYPES[w.work_type]} → {TYPES[fields['work_type']]}")
        w.work_type = fields["work_type"]
    if "client_id" in fields and fields["client_id"] != w.client_id:
        if w.client_id and w.delegation_id:
            raise HTTPException(409, "The cue sheet work is already allotted. Change its client under Editors and their serials.")
        client = await client_of(db, fields["client_id"])
        old = await db.get(Client, w.client_id) if w.client_id else None
        changes.append(f"client {old.name if old else 'none'} → {client.name}")
        w.client_id = client.id
    today = local_today(datetime.now(timezone.utc))
    expected_before = expected_ott(w)
    if "release_date" in fields and fields["release_date"] != w.release_date:
        new = sane_date(fields["release_date"], "release date")
        changes.append(f"release date {day(w.release_date) or 'none'} → {day(new) or 'cleared'}")
        w.release_date = new
        # Updates are owed again for whatever part of the new date is still ahead.
        w.release_alert_level = release_level(new, today)
    await _edit_release(db, w, fields, changes, today, expected_before)
    if "video_link" in fields:
        link = clean_link(fields["video_link"])
        if link != w.video_link:
            changes.append(f"video link {'changed' if w.video_link else 'added'}: {link}" if link else "video link removed")
            w.video_link = link
    if "remarks" in fields:
        remarks = (fields["remarks"] or "").strip() or None
        if remarks != w.remarks:
            changes.append(f"remarks: {remarks or 'cleared'}")
            w.remarks = remarks
    if changes:
        await _log(db, user, "new_work_edit", w, "; ".join(changes))


async def set_bgm(db: AsyncSession, w: NewWork, user: User, received: bool) -> None:
    if received:
        if w.bgm_state == "received":
            return
        if w.bgm_state == "skipped":
            raise HTTPException(409, "This step was skipped. Reopen it first.")
        w.bgm_state, w.bgm_at, w.bgm_by, w.bgm_skip_reason = "received", datetime.now(timezone.utc), user.id, None
        await _log(db, user, "new_work_bgm", w, "Date recorded automatically. " + (
            "Fingerprinting opens once the video is available." if w.video_state == "waiting" else "Fingerprinting can now be assigned."))
        await clear_reminders(db, w)
    else:
        await reopen(db, w, user, "bgm")


async def skip(db: AsyncSession, w: NewWork, user: User, step: str, reason: str | None) -> None:
    reason = reason_of(reason, "Say why this step is being skipped")
    now = datetime.now(timezone.utc)
    if step == "bgm":
        if w.bgm_state != "awaiting":
            raise HTTPException(409, "The BGM step is already closed.")
        w.bgm_state, w.bgm_at, w.bgm_by, w.bgm_skip_reason = "skipped", now, user.id, reason
    elif step == "fingerprint":
        if w.bgm_state == "awaiting":
            raise HTTPException(409, "Complete or skip the BGM step first.")
        if w.fp_status in ("completed", "skipped"):
            raise HTTPException(409, "The fingerprinting step is already closed.")
        _waiting_for_video(w)
        w.fp_status, w.fp_done_at, w.fp_done_by, w.fp_skip_reason = "skipped", now, user.id, reason
    elif step == "cue":
        if w.fp_status not in ("completed", "skipped"):
            raise HTTPException(409, "Complete or skip the fingerprinting step first.")
        if w.delegation_id or w.cue_done_at or w.cue_skip_reason is not None:
            raise HTTPException(409, "The cue sheet step is already allotted or closed.")
        w.cue_skip_reason, w.cue_done_at = reason, now
    else:
        raise HTTPException(400, "Unknown step.")
    await _log(db, user, "new_work_skip", w, f"{STEPS[step]}: {reason}")
    await clear_reminders(db, w)


async def reopen(db: AsyncSession, w: NewWork, user: User, step: str) -> None:
    """Undo a step that was ticked or skipped, as long as the step after it hasn't started."""
    if step == "bgm":
        if w.bgm_state == "awaiting":
            return
        if w.fp_status != "not_assigned":
            raise HTTPException(409, "Fingerprinting has already started. Unassign or reopen it first.")
        was = "skipped" if w.bgm_state == "skipped" else "received"
        w.bgm_state, w.bgm_at, w.bgm_by, w.bgm_skip_reason = "awaiting", None, None, None
        await _log(db, user, "new_work_reopen", w, f"{STEPS[step]}: was {was}, now awaiting BGM")
    elif step == "fingerprint":
        if w.fp_status not in ("completed", "skipped"):
            return
        if w.delegation_id or w.cue_done_at or w.cue_skip_reason is not None:
            raise HTTPException(409, "The cue sheet step has already started. Remove its allotment or reopen it first.")
        was = w.fp_status
        w.fp_status = "not_assigned" if not w.fp_assigned_to else "in_progress" if w.fp_started_at else "assigned"
        w.fp_done_at = w.fp_done_by = w.fp_source = w.fp_source_note = w.fp_skip_reason = None
        await _log(db, user, "new_work_reopen", w, f"{STEPS[step]}: was {was}, now {FP_LABEL[w.fp_status].lower()}")
    elif step == "cue":
        if w.cue_skip_reason is None:
            raise HTTPException(409, "Only a skipped cue sheet step can be reopened. To take back an allotment, delete it.")
        w.cue_skip_reason, w.cue_done_at = None, None
        await _log(db, user, "new_work_reopen", w, f"{STEPS[step]}: was skipped, now allocation pending")
    else:
        raise HTTPException(400, "Unknown step.")


def _waiting_for_video(w: NewWork) -> None:
    if w.video_state == "waiting":
        raise HTTPException(409, "This movie is waiting for its video (it is in theatres). Tick Video available once "
                                 "it is on OTT or the client has sent a copy; fingerprinting opens then.")


async def assign_fingerprint(db: AsyncSession, w: NewWork, user: User, editor_id: int | None) -> None:
    if w.bgm_state == "awaiting":
        raise HTTPException(409, "Fingerprinting opens once the BGM is received or that step is skipped.")
    if editor_id is not None:
        _waiting_for_video(w)
    if w.fp_status in ("completed", "skipped"):
        raise HTTPException(409, "The fingerprinting step is already closed. Reopen it to change who it is assigned to.")
    if editor_id == w.fp_assigned_to:
        return
    before = await db.get(User, w.fp_assigned_to) if w.fp_assigned_to else None
    if editor_id is None:
        w.fp_assigned_to = w.fp_assigned_by = w.fp_assigned_at = w.fp_started_at = None
        w.fp_status = "not_assigned"
        await _log(db, user, "new_work_fp_assign", w, f"Unassigned (was {before.full_name if before else 'someone'})")
        return
    editor = await db.get(User, editor_id)
    if not editor or not editor.is_active or editor.role != UserRole.EDITOR:
        raise HTTPException(400, "Pick an active editor.")
    w.fp_assigned_to, w.fp_assigned_by, w.fp_assigned_at = editor.id, user.id, datetime.now(timezone.utc)
    w.fp_status, w.fp_started_at = "assigned", None
    await _log(db, user, "new_work_fp_assign", w,
               f"To {editor.full_name}" + (f" (was {before.full_name})" if before else ""))
    await notify(db, [editor.id], f"Fingerprinting assigned: {w.title}",
                 f"Assigned by {user.full_name}. It's on your Dashboard under Fingerprinting assigned to you.", w)


async def set_fingerprint_status(db: AsyncSession, w: NewWork, user: User, status: str) -> None:
    if status not in ("assigned", "in_progress"):
        raise HTTPException(400, "Status must be Assigned or In progress. Tick Fingerprinting Completed to finish it.")
    if w.fp_status not in ("assigned", "in_progress"):
        raise HTTPException(409, "Assign the fingerprinting to someone first." if w.fp_status == "not_assigned"
                            else "The fingerprinting step is already closed.")
    if status == w.fp_status:
        return
    w.fp_status = status
    w.fp_started_at = datetime.now(timezone.utc) if status == "in_progress" else None
    await _log(db, user, "new_work_fp_status", w, FP_LABEL[status])


async def complete_fingerprint(db: AsyncSession, w: NewWork, user: User, source_note: str | None) -> None:
    """Tick "Fingerprinting Completed": allowed by the service's email for this work, or by saying where the
    fingerprinting came from when no email arrived."""
    if w.bgm_state == "awaiting":
        raise HTTPException(409, "Complete or skip the BGM step first.")
    if w.fp_status in ("completed", "skipped"):
        raise HTTPException(409, "The fingerprinting step is already closed.")
    if w.fp_status == "not_assigned":
        raise HTTPException(409, "Assign the fingerprinting to someone first.")
    _waiting_for_video(w)
    mail = await db.get(FingerprintMail, w.fp_mail_id) if w.fp_mail_id else None
    if mail:
        w.fp_source, w.fp_source_note = "bmat_mail", None
        how = f"{settings.FINGERPRINT_SENDER_NAME} email received {mail.received_at:%d %b %Y}: “{mail.subject or '(no subject)'}”"
    else:
        note = reason_of(source_note, f"No email from {settings.FINGERPRINT_SENDER_NAME} has arrived for this work. "
                                      "Say where the fingerprinting came from")
        w.fp_source, w.fp_source_note = "manual", note
        how = f"Manual entry, no {settings.FINGERPRINT_SENDER_NAME} email. Fingerprinting came from: {note}"
    w.fp_status, w.fp_done_at, w.fp_done_by, w.fp_skip_reason = "completed", datetime.now(timezone.utc), user.id, None
    await _log(db, user, "new_work_fp_done", w, how)
    await clear_reminders(db, w)
    await notify(db, await staff(db, skip=user.id), f"Fingerprinting completed: {w.title}",
                 f"Marked completed by {user.full_name}. Cue sheet work can now be allotted.", w)


async def link_mail(db: AsyncSession, w: NewWork, user: User, mail_id: int | None) -> None:
    """Attach (or detach) a fingerprinting email by hand, for one the title match missed or got wrong."""
    if w.fp_status in ("completed", "skipped"):
        raise HTTPException(409, "The fingerprinting step is already closed.")
    old = await db.get(FingerprintMail, w.fp_mail_id) if w.fp_mail_id else None
    if mail_id is None:
        if old:
            w.fp_mail_id = w.fp_mail_linked_by = w.fp_mail_linked_at = None
            await _log(db, user, "new_work_fp_mail_link", w, f"Unlinked email “{old.subject or '(no subject)'}”")
        return
    mail = await db.get(FingerprintMail, mail_id)
    if not mail:
        raise HTTPException(404, "Email not found")
    if old and old.id == mail.id:
        return
    w.fp_mail_id, w.fp_mail_linked_by, w.fp_mail_linked_at = mail.id, user.id, datetime.now(timezone.utc)
    await _log(db, user, "new_work_fp_mail_link", w,
               f"Linked email “{mail.subject or '(no subject)'}” received {mail.received_at:%d %b %Y}")


async def set_video(db: AsyncSession, w: NewWork, user: User, available: bool, source: str | None = None,
                    note: str | None = None, link: str | None = None) -> None:
    """Tick "Video available" (saying where it came from), or take it back while fingerprinting hasn't started."""
    now = datetime.now(timezone.utc)
    if available:
        if w.video_state == "available":
            return
        if w.video_state != "waiting":
            raise HTTPException(409, "This work is not waiting for a video.")
        if source not in VIDEO_SOURCES:
            raise HTTPException(400, "Say where the video came from: OTT, a copy from the client, TV or other.")
        note = " ".join((note or "").split()) or None
        if source == "other":
            note = reason_of(note, "Say where the video came from")
        if source == "ott":
            link = clean_link(link) or w.video_link
            if not link:
                raise HTTPException(400, "Add the OTT link of the movie.")
            if link != w.video_link:
                w.video_link = link
        w.video_state, w.video_at, w.video_by, w.video_source, w.video_note = "available", now, user.id, source, note
        parts = [VIDEO_SOURCES[source], note, source == "ott" and w.video_link]
        opens = "Fingerprinting can now be assigned." if w.bgm_state != "awaiting" else "Fingerprinting opens once the BGM step is done."
        await _log(db, user, "new_work_video", w, " · ".join(p for p in parts if p) + f". {opens}")
        await db.execute(update(Notification).where(
            Notification.entity_type == VIDEO, Notification.entity_id == w.id, Notification.is_read.is_(False),
        ).values(is_read=True))
        await notify(db, await staff(db, skip=user.id), f"Video available: {w.title}",
                     f"{VIDEO_SOURCES[source]}, ticked by {user.full_name}. {opens}", w)
        return
    if w.video_state != "available":
        return
    if w.release_type != "theatrical":
        raise HTTPException(409, "Only a movie released in theatres waits for its video.")
    if w.fp_status != "not_assigned":
        raise HTTPException(409, "Fingerprinting has already started. Unassign or reopen it first.")
    w.video_state, w.video_at, w.video_by, w.video_source, w.video_note = "waiting", None, None, None, None
    arm_video_checks(w, local_today(now))
    await _log(db, user, "new_work_video_undo", w, "Video taken back: waiting for the video again")


async def cue_allotted(db: AsyncSession, w: NewWork, user: User, dl: WorkDelegation, editor: User, summary: str) -> None:
    w.delegation_id, w.project_id = dl.id, dl.project_id
    w.cue_assigned_to, w.cue_assigned_by, w.cue_assigned_at = editor.id, user.id, datetime.now(timezone.utc)
    w.cue_done_at, w.cue_skip_reason = None, None
    await _log(db, user, "new_work_cue_assign", w, f"To {editor.full_name} · {summary}")
    await clear_reminders(db, w)


async def delegation_changed(db: AsyncSession, dl: WorkDelegation, user: User | None, was_status: str, was_editor: int) -> None:
    """A delegation made from a new work changed: keep that work's cue sheet step in step, and say so in its log."""
    works = (await db.execute(select(NewWork).where(NewWork.delegation_id == dl.id))).scalars().all()
    now = datetime.now(timezone.utc)
    for w in works:
        if dl.assigned_to != was_editor:
            editor = await db.get(User, dl.assigned_to)
            w.cue_assigned_to, w.cue_assigned_by, w.cue_assigned_at = dl.assigned_to, user.id if user else None, now
            await _log(db, user, "new_work_cue_assign", w, f"Re-assigned to {editor.full_name if editor else 'another editor'}")
        if dl.status != was_status:
            w.cue_done_at = now if dl.status == "completed" else None
            await _log(db, user, "new_work_cue_status", w, CUE_LABEL[CUE_FROM_DELEGATION.get(dl.status, "assigned")])


async def delegations_removed(db: AsyncSession, ids: list[int]) -> None:
    """Delegations are about to be deleted: works still in progress go back to "allocation pending"."""
    works = (await db.execute(select(NewWork).where(NewWork.delegation_id.in_(ids)))).scalars().all()
    for w in works:
        w.delegation_id = None
        if not w.cue_done_at:
            w.cue_assigned_to = w.cue_assigned_by = w.cue_assigned_at = None
            await _log(db, None, "new_work_cue_removed", w, "The allotment was deleted, so cue sheet allocation is pending again")
    await db.flush()


# ── reminders ──────────────────────────────────────────────────────────────────
async def send_reminders(db: AsyncSession, now: datetime | None = None) -> int:
    """Notify about every pending step that is due a reminder. Each reminder is claimed with a conditional
    UPDATE first, so the gunicorn workers running this at the same time send it once between them."""
    data = await Loaded().load(db)
    if now:
        data.now = now
    sent = 0
    for w in data.works:
        r = data.reminder(w)
        if not r:
            continue
        stage_due = r["count"] >= 1 and (w.reminder_stage != r["kind"] or w.reminder_count < r["count"])
        long_due = r["level"] > w.long_pending_level
        if not (stage_due or long_due):
            continue
        claimed = await db.execute(
            update(NewWork).where(
                NewWork.id == w.id,
                or_(NewWork.reminder_stage.is_distinct_from(r["kind"]), NewWork.reminder_count < r["count"],
                    NewWork.long_pending_level < r["level"]),
            ).values(reminder_stage=r["kind"], reminder_count=r["count"],
                     long_pending_level=max(r["level"], w.long_pending_level),
                     last_reminder_at=data.now, updated_at=NewWork.updated_at)   # a reminder is not an edit
        )
        if not claimed.rowcount:
            continue
        if long_due:
            title = f"Pending {r['level']}+ days: {w.title}"
            body = r["long_message"]
        else:
            title = f"Follow up, {REMINDER_TITLE[r['kind']]}: {w.title}"
            body = r["message"]
        chase = w.fp_assigned_to if r["kind"] == "fingerprint" else None
        await notify(db, await staff(db, chase), title, body, w, REMINDER)
        await _log(db, None, "new_work_reminder", w, body)
        sent += 1
    return sent


# ── release updates ────────────────────────────────────────────────────────────
def release_message(w: NewWork, data: Loaded, today: date, level: int) -> tuple[str, str]:
    """The update for a work whose release day (level 1) or the day RELEASE_FOLLOW_UP days after it (level 2) has come."""
    days = (today - w.release_date).days
    if level == 1:
        title = f"Released today: {w.title}" if days == 0 else f"Released: {w.title}"
        when = f"is released today, {day(w.release_date)}" if days == 0 else f"was released on {day(w.release_date)}"
    else:
        title = f"Released {days} days ago: {w.title}"
        when = f"was released on {day(w.release_date)}, {ago(days)}"
    row = data.row(w)
    who = (row["fingerprint"]["assigned_to_name"] if w.fp_status in ("assigned", "in_progress")
           else row["cue"]["assigned_to_name"] if row["stage"] in ("cue_assigned", "cue_in_progress") else None)
    client = data.client(w)
    body = (f"{w.title} ({TYPES.get(w.work_type, w.work_type)}{f', {client}' if client else ''}) {when}. "
            f"Current status: {row['stage_label']}{f' ({who})' if who else ''}.")
    if w.video_state == "waiting":
        exp = expected_ott(w)
        body += (f" It is in theatres: fingerprinting waits for the video, "
                 + (f"due on {w.ott_platform or 'OTT'} on {day(exp)}." if w.ott_date else
                    f"usually on OTT around {day(exp)}." if exp else "and no OTT date is known yet."))
    body += f" Video: {w.video_link}" if w.video_link else " No video link has been added yet."
    return title, body


async def send_release_updates(db: AsyncSession, now: datetime | None = None) -> int:
    """Tell the Admins and Work Delegators when a work's release day comes, and again RELEASE_FOLLOW_UP days later.
    Claimed with a conditional UPDATE like the reminders, so several workers send each update once. A work already
    completed or closed is passed over silently."""
    now = now or datetime.now(timezone.utc)
    today = local_today(now)
    data = await Loaded().load(db, NewWork.release_date.is_not(None), NewWork.release_date <= today, NewWork.release_alert_level < 2)
    data.now = now
    sent = 0
    for w in data.works:
        level = release_level(w.release_date, today)
        if level <= w.release_alert_level:
            continue
        claimed = await db.execute(
            update(NewWork).where(NewWork.id == w.id, NewWork.release_alert_level < level, NewWork.release_date == w.release_date)
            .values(release_alert_level=level, updated_at=NewWork.updated_at)   # an update is not an edit
        )
        if not claimed.rowcount or data.stage(w) in ("completed", "closed"):
            continue
        title, body = release_message(w, data, today, level)
        await notify(db, await staff(db), title, body, w, RELEASE)
        await _log(db, None, "new_work_release", w, body)
        sent += 1
    return sent


# ── is it on OTT yet? ─────────────────────────────────────────────────────────
def video_message(w: NewWork, data: Loaded, today: date, overdue: bool, nth: int) -> tuple[str, str]:
    client = data.client(w)
    name = f"{w.title} ({client})" if client else w.title
    exp = expected_ott(w)
    tick = "Tick Video available on the work once it is streaming or the client has sent a copy; fingerprinting opens then."
    if overdue:
        since = (f"released in theatres on {day(w.release_date)}, {ago((today - w.release_date).days)}" if w.release_date
                 else f"added {ago((today - _added_day(w)).days)}")
        return (f"No video {settings.NEW_WORK_VIDEO_OVERDUE_DAYS}+ days after release: {w.title}",
                f"{name} was {since}, and its video is still not available. Check with the client: it may be going to TV "
                f"instead, or they may send a copy. {tick}")
    if nth > 1:
        return (f"Still waiting for the video: {w.title}",
                f"There is still no video for {name}. " + (f"It was expected on {w.ott_platform or 'OTT'} on {day(exp)}. " if exp else "")
                + f"Check again, or ask the client for a copy. {tick}")
    if w.ott_date:
        when = "today" if w.ott_date == today else f"on {day(w.ott_date)}"
        return (f"Due on OTT: {w.title}", f"{name} is due on {w.ott_platform or 'OTT'} {when}. {tick}")
    if exp:
        weeks = (w.ott_window_days or settings.NEW_WORK_OTT_WINDOW_DAYS) // 7
        return (f"Check OTT: {w.title}",
                f"{name} was released in theatres on {day(w.release_date)}. Films usually reach OTT about {weeks} weeks "
                f"after release, so check whether it is streaming, or ask the client for a copy. {tick}")
    return (f"Ask about the video: {w.title}",
            f"No release or OTT date is known for {name}. Ask the client when it will be on OTT, or for a copy. {tick}")


async def send_video_checks(db: AsyncSession, now: datetime | None = None) -> int:
    """For each theatrical release still waiting for its video: ask on the expected OTT date and every
    NEW_WORK_VIDEO_CHECK_DAYS after it, and flag it once NEW_WORK_VIDEO_OVERDUE_DAYS after release. Claimed with
    conditional UPDATEs so several workers send each one once."""
    now = now or datetime.now(timezone.utc)
    today = local_today(now)
    data = await Loaded().load(db, NewWork.video_state == "waiting")
    data.now = now
    sent = 0
    for w in data.works:
        due = video_checks_due(w, today)
        overdue = video_overdue(w, today) and not w.video_overdue_sent
        if due <= w.video_check_count and not overdue:
            continue
        claimed = False
        if overdue:
            res = await db.execute(update(NewWork).where(NewWork.id == w.id, NewWork.video_state == "waiting",
                                                         NewWork.video_overdue_sent.is_(False))
                                   .values(video_overdue_sent=True, video_check_count=max(due, w.video_check_count),
                                           updated_at=NewWork.updated_at))
            claimed = bool(res.rowcount)
        else:
            res = await db.execute(update(NewWork).where(NewWork.id == w.id, NewWork.video_state == "waiting",
                                                         NewWork.video_check_count < due)
                                   .values(video_check_count=due, updated_at=NewWork.updated_at))
            claimed = bool(res.rowcount)
        if not claimed:
            continue
        title, body = video_message(w, data, today, overdue, due)
        await notify(db, await staff(db), title, body, w, VIDEO)
        await _log(db, None, "new_work_video_check", w, body)
        sent += 1
    return sent

