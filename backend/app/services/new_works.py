"""New Work tracking: an upcoming movie or TV show, from the day its name arrives until its cue sheet work is done.

Three steps, each done or skipped with a reason before the next one opens:
  1. BGM received
  2. Fingerprinting: assigned → in progress → completed. "Completed" needs the fingerprinting service's email for
     this title (services/fingerprint_mail.py), or a note of where the fingerprinting came from when no email arrived.
  3. Cue sheet work allotted: an ordinary delegation, whose status the work follows from then on.

A step left waiting is chased every NEW_WORK_REMINDER_DAYS days, and once more at 15 and at 30 days since the work
was added while its cue sheet work is still not allotted. Everything done here, by a person or by CueSync, is written
to the audit log under entity "new_work".
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.audit import AuditLog
from app.models.new_work import FingerprintMail, NewWork
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.work_delegation import WorkDelegation
from app.services.audit import log_activity

WD_ROLES = (UserRole.ADMIN, UserRole.WORK_DELEGATOR)
ENTITY = "new_work"
EVENT = "new_work"                 # notification about something that happened to a work
REMINDER = "new_work_reminder"     # notification chasing a pending step
TYPES = {"movie": "Movie", "tv_show": "TV Show"}
STEPS = {"bgm": "BGM received", "fingerprint": "Fingerprinting", "cue": "Cue sheet work"}
LONG_PENDING = (15, 30)            # days since added, cue sheet work still not allotted
MIN_REASON = 5                     # shortest reason / source note that says anything
RECENT_DONE = timedelta(days=14)   # how long finished fingerprinting stays on the editor's dashboard

STAGES = {
    "awaiting_bgm": "Awaiting BGM",
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


def stage_of(w: NewWork, dl: WorkDelegation | None) -> str:
    if w.bgm_state == "awaiting":
        return "awaiting_bgm"
    if w.fp_status not in ("completed", "skipped"):
        return f"fp_{w.fp_status}"
    return {"not_assigned": "cue_pending", "assigned": "cue_assigned", "in_progress": "cue_in_progress",
            "completed": "completed", "skipped": "closed"}[cue_status(w, dl)]


def stage_since(w: NewWork, stage: str) -> datetime | None:
    """When the step the work is waiting on opened."""
    if stage == "awaiting_bgm":
        return w.created_at
    if stage.startswith("fp_"):
        return w.bgm_at or w.created_at
    if stage == "cue_pending":
        return w.fp_done_at or w.bgm_at or w.created_at
    if stage in ("cue_assigned", "cue_in_progress"):
        return w.cue_assigned_at or w.fp_done_at
    return w.cue_done_at


def _long_message(w: NewWork, kind: str, days_open: int, days: int, message: str) -> str:
    if kind == "bgm":   # both count from the day it was added: say it once
        return (f"{w.title} was added {ago(days_open)}. The BGM has still not been received, so cue sheet work "
                "has not been assigned. Please follow up.")
    if kind == "cue":   # the step itself is "not allotted": don't say it twice
        done = "skipped" if w.fp_status == "skipped" else "completed"
        return (f"{w.title} was added {ago(days_open)}, but cue sheet work has still not been assigned. "
                f"Fingerprinting was {done} {ago(days)}.")
    return f"{w.title} was added {ago(days_open)}, but cue sheet work has still not been assigned. {message}"


def follow_up(w: NewWork, stage: str, now: datetime, assignee: str | None = None) -> dict | None:
    """What still has to be chased for this work, in the words of its reminder. None once cue sheet work is allotted."""
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
        start = (f"The BGM step for {w.title} was skipped {ago(days)}" if w.bgm_state == "skipped"
                 else f"BGM for {w.title} was received {ago(days)}")
        who = " It is not assigned to anyone yet." if stage == "fp_not_assigned" else f" Assigned to {assignee}." if assignee else ""
        message = f"{start}, but fingerprinting is still pending.{who}"
    every = max(1, settings.NEW_WORK_REMINDER_DAYS)
    days_open = days_since(w.created_at, now)
    level = max((n for n in LONG_PENDING if days_open >= n), default=0)
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
                     w.cue_assigned_to, w.cue_assigned_by}
        uids |= {d.assigned_to for d in self.delegations.values()}
        uids.discard(None)
        self.users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_(uids)))).scalars().all()} if uids else {}
        return self

    def name(self, uid: int | None) -> str | None:
        u = self.users.get(uid)
        return u.full_name if u else None

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
            "updated_at": iso(w.updated_at),
            "stage": stage, "stage_label": STAGES[stage], "stage_since": iso(since),
            "days_in_stage": days_since(since, self.now) if stage in PENDING_STAGES or stage.startswith("cue_") else None,
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
            "locked": {"fingerprint": w.bgm_state == "awaiting", "cue": w.fp_status not in ("completed", "skipped")},
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


async def create(db: AsyncSession, user: User, title: str, work_type: str, remarks: str | None) -> NewWork:
    title = " ".join((title or "").split())
    key = title_key(title)
    if not key:
        raise HTTPException(400, "Enter the movie or TV show name.")
    if work_type not in TYPES:
        raise HTTPException(400, "Work type must be Movie or TV Show.")
    data = await Loaded().load(db, NewWork.title_key == key, NewWork.work_type == work_type)
    twin = next((x for x in data.works if data.stage(x) not in ("completed", "closed")), None)
    if twin:
        raise HTTPException(409, f'"{twin.title}" is already in the New Work List ({STAGES[data.stage(twin)].lower()}).')
    w = NewWork(title=title, title_key=key, work_type=work_type, remarks=(remarks or "").strip() or None, created_by=user.id)
    db.add(w)
    await db.flush()
    await _log(db, user, "new_work_add", w, f"{TYPES[work_type]} · status Awaiting BGM" + (f" · {w.remarks}" if w.remarks else ""))
    return w


async def edit(db: AsyncSession, w: NewWork, user: User, fields: dict) -> None:
    changes = []
    if "title" in fields:
        title = " ".join((fields["title"] or "").split())
        if not title_key(title):
            raise HTTPException(400, "Enter the movie or TV show name.")
        if title != w.title:
            changes.append(f"renamed {w.title} → {title}")
            w.title, w.title_key = title, title_key(title)
    if "work_type" in fields and fields["work_type"] != w.work_type:
        if fields["work_type"] not in TYPES:
            raise HTTPException(400, "Work type must be Movie or TV Show.")
        if w.delegation_id:
            raise HTTPException(409, "The cue sheet work is already allotted, so the work type can't change.")
        changes.append(f"type {TYPES[w.work_type]} → {TYPES[fields['work_type']]}")
        w.work_type = fields["work_type"]
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
        await _log(db, user, "new_work_bgm", w, "Date recorded automatically. Fingerprinting can now be assigned.")
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


async def assign_fingerprint(db: AsyncSession, w: NewWork, user: User, editor_id: int | None) -> None:
    if w.bgm_state == "awaiting":
        raise HTTPException(409, "Fingerprinting opens once the BGM is received or that step is skipped.")
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
