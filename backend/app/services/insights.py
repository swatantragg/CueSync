"""Numbers behind the Admin and Work Delegator Dashboards: who did how much this week / month / year, per client and per quarter.

Submitted work = cue sheets emailed to a society from the client's Gmail (Send to Society, or a hand-sent email
confirmed from the Sent folder); bounced emails don't count. Episodes recorded as sent before email tracking
existed still stop counting as pending. Weeks run Monday–Saturday in IST; Sunday work counts in the week that
just ended.
"""
from bisect import bisect_right
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

import orjson
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog
from app.models.client import Client, ClientMailbox
from app.models.editor_notice import EditorNotice
from app.models.episode import Episode
from app.models.project import Project, ProjectType
from app.models.society import Society
from app.models.society_submission import SocietySubmission
from app.models.user import User, UserRole
from app.models.work_delegation import WorkDelegation
from app.services.delegations import episode_spans
from app.services.society_mail import DEAD_MAIL

IST = timezone(timedelta(hours=5, minutes=30))
EMAILED = ("gmail", "gmail_detected")
REVIEW_ACTIONS = ("approve", "reject", "suggest")
WORK_ACTIONS = ("create", "update", "delete", "upload", "submit")   # an editor actually working on a serial
MAX_SPAN = 2000   # a typo like "1-100000" must not expand forever
WORK_DAYS = 6     # Monday–Saturday

# Underperformance thresholds
PACE_MIN = 0.6         # editor approved < 60% of the target due so far
REJECT_MIN = 2         # … or at least this many rejections
REJECT_RATE = 0.3      # … making up 30% of their reviewed episodes
TEAM_SHARE_MIN = 0.5   # reviewer under half the reviewer average
SLOW_REVIEW_HOURS = 72
IDLE_GRACE = timedelta(days=2)   # work allotted this recently can't be called "not started" yet
GOOD_RATE = 0.8        # "Performing well" needs at least this approval rate …
RATINGS = {
    "good": "Performing well",
    "decent": "Decent",
    "under": "Underperforming",
    "none": "No work allotted",
}


@dataclass
class Period:
    key: str
    start: datetime
    end: datetime
    label: str
    work_days: int  # Mon–Sat days of the period up to today

    def has(self, at: datetime | None) -> bool:
        return at is not None and self.start <= at < self.end

    def out(self) -> dict:
        return {"label": self.label, "from": self.start.isoformat(), "to": self.end.isoformat(), "work_days": self.work_days}


def _work_days(start: datetime, today: datetime) -> int:
    return sum(1 for i in range((today - start).days + 1) if (start + timedelta(days=i)).weekday() < WORK_DAYS)


def periods(now: datetime | None = None) -> dict[str, Period]:
    today = (now or datetime.now(timezone.utc)).astimezone(IST).replace(hour=0, minute=0, second=0, microsecond=0)
    week = today - timedelta(days=today.weekday())
    sat = week + timedelta(days=5)
    month = today.replace(day=1)
    year = today.replace(month=1, day=1)
    return {
        "week": Period("week", week, week + timedelta(days=7),
                       f"Mon {week.day} {week:%b} – Sat {sat.day} {sat:%b %Y}", _work_days(week, today)),
        "month": Period("month", month, (month + timedelta(days=32)).replace(day=1),
                        f"{month:%B %Y}", _work_days(month, today)),
        "year": Period("year", year, year.replace(year=year.year + 1), str(year.year), _work_days(year, today)),
    }


def past_week(now: datetime, back: int = 1) -> Period:
    """A finished Monday–Sunday week; back=1 is the last one (what the weekly reports cover)."""
    start = periods(now)["week"].start - timedelta(days=7 * back)
    sat = start + timedelta(days=5)
    return Period("week", start, start + timedelta(days=7), f"Mon {start.day} {start:%b} – Sat {sat.day} {sat:%b %Y}", WORK_DAYS)


def _sub_episodes(s: SocietySubmission) -> int:
    return max(1, s.episode_to - s.episode_from + 1)


def _sent_at(s: SocietySubmission) -> datetime | None:
    return s.mail_sent_at or s.submitted_at


def _client_key(client_id: int | None, client: str | None) -> str | None:
    if client_id:
        return f"c{client_id}"
    if client and client.strip():
        return "n:" + client.strip().lower()
    return None


class _Data:
    """Everything the dashboard reads, loaded once per request."""

    async def load(self, db: AsyncSession, since: datetime, until: datetime | None = None) -> "_Data":
        self.now = datetime.now(timezone.utc)
        self.users = {u.id: u for u in (await db.execute(select(User))).scalars().all()}
        self.projects = {p.id: p for p in (await db.execute(select(Project))).scalars().all()}
        self.clients = {c.id: c for c in (await db.execute(select(Client))).scalars().all()}
        self.mailbox = dict((await db.execute(select(ClientMailbox.client_id, ClientMailbox.status))).all())
        self.delegations = (await db.execute(
            select(WorkDelegation).where(WorkDelegation.project_id.isnot(None)).order_by(WorkDelegation.created_at)
        )).scalars().all()

        self.ep_by_id: dict[int, tuple[int, int, str]] = {}
        self.ep_status: dict[tuple[int, int], str] = {}
        self.ep_notes: dict[tuple[int, int], str] = {}
        self.numbers: dict[int, list[int]] = defaultdict(list)
        for eid, pid, num, status, rejection, review in (await db.execute(
            select(Episode.id, Episode.project_id, Episode.episode_number, Episode.status, Episode.rejection_note, Episode.review_note)
        )).all():
            self.ep_by_id[eid] = (pid, num, status or "pending")
            self.ep_status[(pid, num)] = status or "pending"
            self.numbers[pid].append(num)
            if rejection or review:
                self.ep_notes[(pid, num)] = rejection or review

        subs = (await db.execute(select(SocietySubmission))).scalars().all()
        self.subs = subs
        # Sent = really went to a society and didn't bounce. Emailed = the part tracked through Gmail.
        self.sent = [s for s in subs if (s.submitted_to_iprs or s.sent_via in EMAILED) and s.mail_status not in DEAD_MAIL]
        self.emailed = [s for s in self.sent if s.sent_via in EMAILED]
        self.cover: dict[int, list[tuple[int, int, int | None]]] = defaultdict(list)
        for s in self.sent:
            self.cover[s.project_id].append((s.episode_from, s.episode_to, s.society_id))
        self.bounced = [s for s in subs if s.mail_status == "bounced"]
        self.replied = [s for s in subs if s.mail_status == "replied" and not s.accepted_by_iprs]

        conds = [AuditLog.entity == "episode", AuditLog.action.in_(("submit",) + REVIEW_ACTIONS), AuditLog.created_at >= since]
        if until:
            conds.append(AuditLog.created_at < until)
        self.audits = (await db.execute(
            select(AuditLog.user_id, AuditLog.action, AuditLog.entity_id, AuditLog.created_at).where(*conds)
        )).all()

        # Hours in which each user worked on each serial (songs edited, sheets uploaded, episodes submitted).
        self.worked: dict[tuple[int, int], list[datetime]] = defaultdict(list)
        hour = func.date_trunc("hour", AuditLog.created_at)
        work_conds = [AuditLog.entity.in_(("episode", "project")), AuditLog.action.in_(WORK_ACTIONS),
                      AuditLog.user_id.isnot(None), AuditLog.created_at >= since]
        if until:
            work_conds.append(AuditLog.created_at < until)
        for uid, entity, eid, at in (await db.execute(
            select(AuditLog.user_id, AuditLog.entity, AuditLog.entity_id, hour).where(*work_conds)
            .group_by(AuditLog.user_id, AuditLog.entity, AuditLog.entity_id, hour)
        )).all():
            pid = eid if entity == "project" else self.ep_by_id.get(eid, (None,))[0]
            if pid:
                self.worked[(uid, pid)].append(at)

        # The latest email each editor got about pending work.
        self.last_notice: dict[int, EditorNotice] = {}
        for n in (await db.execute(select(EditorNotice).order_by(EditorNotice.sent_at))).scalars().all():
            self.last_notice[n.editor_id] = n

        # Who submitted each episode, and when — older submissions too, so a review is credited to its editor.
        waiting = {eid for eid, (_, _, st) in self.ep_by_id.items() if st == "submitted"}
        reviewed = {eid for _, act, eid, _ in self.audits if act in REVIEW_ACTIONS}
        self.submits: dict[int, list[tuple[datetime, int]]] = defaultdict(list)
        for uid, act, eid, at in self.audits:
            if act == "submit" and eid and at:
                self.submits[eid].append((at, uid))
        older = (reviewed | waiting) - {None}
        if older:
            for uid, eid, at in (await db.execute(
                select(AuditLog.user_id, AuditLog.entity_id, AuditLog.created_at).where(
                    AuditLog.entity == "episode", AuditLog.action == "submit",
                    AuditLog.entity_id.in_(older), AuditLog.created_at < since,
                )
            )).all():
                if at:
                    self.submits[eid].append((at, uid))
        for rows in self.submits.values():
            rows.sort(key=lambda r: r[0])

        # Serial → client: the latest delegation that names one, else the latest submission.
        self.project_client: dict[int, str] = {}
        for s in sorted(subs, key=lambda s: s.submitted_at or since):
            key = _client_key(s.client_id, s.client)
            if key:
                self.project_client[s.project_id] = key
        for d in self.delegations:
            key = _client_key(d.client_id, d.client)
            if key:
                self.project_client[d.project_id] = key
        self.client_names: dict[str, str] = {f"c{c.id}": c.name for c in self.clients.values()}
        for row in list(self.delegations) + subs:
            key = _client_key(row.client_id, row.client)
            if key and key not in self.client_names and row.client:
                self.client_names[key] = row.client.strip()
        return self

    # ── helpers ────────────────────────────────────────────────────────────
    def name(self, uid: int | None) -> str:
        u = self.users.get(uid)
        return u.full_name if u else "Unknown"

    def last_submit(self, eid: int, at: datetime) -> tuple[datetime, int] | None:
        rows = self.submits.get(eid) or []
        i = bisect_right([r[0] for r in rows], at)
        return rows[i - 1] if i else None

    def editor_of(self, eid: int, at: datetime) -> int | None:
        hit = self.last_submit(eid, at)
        return hit[1] if hit else None

    def covered(self, pid: int, num: int, society_id: int | None = None) -> bool:
        return any(a <= num <= b and (society_id is None or sid == society_id) for a, b, sid in self.cover.get(pid, ()))

    def units(self, d: WorkDelegation) -> set[int]:
        """Episode numbers a delegation allots; no range means the whole serial."""
        spans = episode_spans(d.episode_range)
        if spans:
            return {n for a, b in spans for n in range(a, min(b, a + MAX_SPAN - 1) + 1)}
        if self.numbers.get(d.project_id):
            return set(self.numbers[d.project_id])
        proj = self.projects.get(d.project_id)
        if proj and proj.type == ProjectType.MOVIE:
            return {1}
        return set(range(1, min(proj.total_episodes or 0, MAX_SPAN) + 1)) if proj else set()

    def due_dates(self, dl: WorkDelegation) -> dict[int, datetime]:
        """Episode → due date: `week_target` episodes per 7 days from the allotment, in episode order.
        Work without a weekly target has no due dates."""
        if not dl.week_target or dl.week_target <= 0 or not dl.created_at:
            return {}
        return {n: dl.created_at + timedelta(days=7 * (i // dl.week_target + 1)) for i, n in enumerate(sorted(self.units(dl)))}

    def worked_in(self, uid: int, pid: int, p: Period) -> bool:
        return any(p.has(at) for at in self.worked.get((uid, pid), ()))

    def is_role(self, uid: int | None, *roles: UserRole) -> bool:
        u = self.users.get(uid)
        return bool(u and u.role in roles)


# ── per-period rankings ────────────────────────────────────────────────────────
def _editors(d: _Data, p: Period) -> list[dict]:
    approved, rejected, submitted = defaultdict(set), defaultdict(set), defaultdict(set)
    for uid, act, eid, at in d.audits:
        if not p.has(at) or not eid:
            continue
        if act == "submit":
            submitted[uid].add(eid)
        elif act in ("approve", "reject"):
            editor = d.editor_of(eid, at)
            if editor:
                (approved if act == "approve" else rejected)[editor].add(eid)
    ids = {u for u in set(approved) | set(rejected) | set(submitted) if d.is_role(u, UserRole.EDITOR)}
    rows = [{"id": u, "name": d.name(u), "approved": len(approved[u]), "rejected": len(rejected[u]),
             "submitted": len(submitted[u])} for u in ids]
    return sorted(rows, key=lambda r: (-r["approved"], -r["submitted"], r["name"].lower()))


def _reviewers(d: _Data, p: Period) -> list[dict]:
    acts: dict[int, dict[str, set]] = defaultdict(lambda: {a: set() for a in REVIEW_ACTIONS})
    hours: dict[int, list[float]] = defaultdict(list)
    for uid, act, eid, at in d.audits:
        if act not in REVIEW_ACTIONS or not p.has(at) or not eid:
            continue
        acts[uid][act].add(eid)
        hit = d.last_submit(eid, at)
        if hit:
            hours[uid].append((at - hit[0]).total_seconds() / 3600)
    sent_reports, sent_eps = defaultdict(int), defaultdict(int)
    for s in d.emailed:
        if p.has(_sent_at(s)):
            sent_reports[s.submitted_by] += 1
            sent_eps[s.submitted_by] += _sub_episodes(s)
    ids = set(acts) | set(sent_reports)
    ids |= {u.id for u in d.users.values() if u.role == UserRole.REVIEWER and u.is_active}
    rows = []
    for u in ids:
        if not d.is_role(u, UserRole.REVIEWER, UserRole.ADMIN):
            continue
        a = acts.get(u) or {x: set() for x in REVIEW_ACTIONS}
        h = hours.get(u) or []
        rows.append({
            "id": u, "name": d.name(u), "role": d.users[u].role.value,
            "approved": len(a["approve"]), "rejected": len(a["reject"]), "suggested": len(a["suggest"]),
            "reviewed": len(a["approve"] | a["reject"] | a["suggest"]),
            "sent_reports": sent_reports[u], "sent_episodes": sent_eps[u],
            "avg_review_hours": round(sum(h) / len(h), 1) if h else None,
        })
    # Admins appear only when they actually reviewed or sent something.
    rows = [r for r in rows if r["role"] == UserRole.REVIEWER.value or r["reviewed"] or r["sent_reports"]]
    return sorted(rows, key=lambda r: (-r["approved"], -r["sent_episodes"], r["name"].lower()))


def _orders(d: _Data, p: Period) -> list[dict]:
    """Clients ranked by how many serials/movies were allotted for them in the period."""
    by_client: dict[str, dict[int, set]] = defaultdict(lambda: defaultdict(set))
    for dl in d.delegations:
        key = _client_key(dl.client_id, dl.client)
        if key and p.has(dl.created_at):
            by_client[key][dl.project_id] |= d.units(dl)
    rows = []
    for key, projects in by_client.items():
        movies = sum(1 for pid in projects if (proj := d.projects.get(pid)) and proj.type == ProjectType.MOVIE)
        rows.append({"key": key, "name": d.client_names.get(key, "Unknown"), "projects": len(projects),
                     "serials": len(projects) - movies, "movies": movies,
                     "episodes": sum(len(u) for u in projects.values())})
    return sorted(rows, key=lambda r: (-r["projects"], -r["episodes"], r["name"].lower()))


def _allocators(d: _Data, p: Period) -> list[dict]:
    """Work Delegators (and admins who allotted work) by what they allotted in the period."""
    acc: dict[int, dict] = {}
    for u in d.users.values():
        if u.role == UserRole.WORK_DELEGATOR and u.is_active:
            acc[u.id] = {"delegations": 0, "projects": set(), "episodes": 0, "editors": set(), "clients": set()}
    for dl in d.delegations:
        if not p.has(dl.created_at):
            continue
        a = acc.setdefault(dl.created_by, {"delegations": 0, "projects": set(), "episodes": 0, "editors": set(), "clients": set()})
        a["delegations"] += 1
        a["projects"].add(dl.project_id)
        a["episodes"] += len(d.units(dl))
        a["editors"].add(dl.assigned_to)
        if key := _client_key(dl.client_id, dl.client):
            a["clients"].add(key)
    rows = [{"id": u, "name": d.name(u), "role": d.users[u].role.value if u in d.users else None,
             "delegations": a["delegations"], "projects": len(a["projects"]), "episodes": a["episodes"],
             "editors": len(a["editors"]), "clients": len(a["clients"])} for u, a in acc.items()]
    return sorted(rows, key=lambda r: (-r["projects"], -r["episodes"], r["name"].lower()))


# ── underperformers ────────────────────────────────────────────────────────────
def _idle_serials(d: _Data, uid: int, open_work: list[WorkDelegation], p: Period) -> list[str]:
    """Allotted serials with work left that this editor hasn't touched at all during the period."""
    idle = set()
    cutoff = min(p.end, d.now) - IDLE_GRACE
    for dl in open_work:
        if not dl.created_at or dl.created_at > cutoff or d.worked_in(uid, dl.project_id, p):
            continue
        if any(d.ep_status.get((dl.project_id, n)) not in ("approved", "submitted") for n in d.units(dl)):
            idle.add(dl.serial_name)
    return sorted(idle, key=str.lower)


def _weak_editors(d: _Data, p: Period, ranked: list[dict]) -> list[dict]:
    stats = {r["id"]: r for r in ranked}
    open_work: dict[int, list[WorkDelegation]] = defaultdict(list)
    for dl in d.delegations:
        if dl.status != "completed":
            open_work[dl.assigned_to].append(dl)
    out = []
    for u in d.users.values():
        if u.role != UserRole.EDITOR or not u.is_active:
            continue
        s = stats.get(u.id, {"approved": 0, "rejected": 0, "submitted": 0})
        weekly = sum(dl.week_target or 0 for dl in open_work.get(u.id, []))
        due = weekly * p.work_days / WORK_DAYS
        flags = []
        if due >= 1 and s["approved"] < PACE_MIN * due:
            flags.append(f"Behind target: {s['approved']} approved of {round(due)} due")
        if open_work.get(u.id) and not s["submitted"] and p.work_days >= 2:
            flags.append("Nothing submitted for review")
        idle = _idle_serials(d, u.id, open_work.get(u.id, []), p)
        if idle and p.work_days >= 2:
            flags.append("Not working on " + ", ".join(idle[:4]) + (f" and {len(idle) - 4} more" if len(idle) > 4 else ""))
        done = s["approved"] + s["rejected"]
        if s["rejected"] >= REJECT_MIN and s["rejected"] >= REJECT_RATE * done:
            flags.append(f"Low approval rate: {round(100 * s['approved'] / done)}% ({s['approved']} approved, {s['rejected']} rejected)")
        if flags:
            notice = d.last_notice.get(u.id)
            out.append({"id": u.id, "name": u.full_name, "approved": s["approved"], "submitted": s["submitted"],
                        "rejected": s["rejected"], "due": round(due, 1), "weekly_target": weekly,
                        "open_delegations": len(open_work.get(u.id, [])),
                        "pace": round(s["approved"] / due, 2) if due else None, "flags": flags,
                        "last_notified_at": notice.sent_at.isoformat() if notice and notice.sent_at else None,
                        "last_notified_by": notice.sent_by_name if notice else None,
                        "last_notice_read": bool(notice and notice.read_at)})
    return sorted(out, key=lambda r: (-len(r["flags"]), r["pace"] if r["pace"] is not None else 9, r["name"].lower()))


def _weak_reviewers(d: _Data, p: Period, ranked: list[dict]) -> list[dict]:
    team = [r for r in ranked if r["role"] == UserRole.REVIEWER.value]
    avg = sum(r["reviewed"] for r in team) / len(team) if team else 0
    team_busy = any(r["reviewed"] for r in ranked)
    bounced = defaultdict(int)
    for s in d.bounced:
        bounced[s.submitted_by] += 1
    out = []
    for r in team:
        flags = []
        if avg >= 2 and r["reviewed"] < TEAM_SHARE_MIN * avg:
            flags.append(f"Reviewed {r['reviewed']} vs team average {round(avg, 1)}")
        if team_busy and not r["reviewed"] and not r["sent_reports"] and p.work_days >= 2:
            flags.append("No reviews or society emails")
        if r["avg_review_hours"] and r["avg_review_hours"] > SLOW_REVIEW_HOURS:
            flags.append(f"Slow: {round(r['avg_review_hours'] / 24, 1)} days from submit to review")
        if bounced[r["id"]]:
            flags.append(f"{bounced[r['id']]} bounced email{'s' if bounced[r['id']] > 1 else ''} not resent")
        if flags:
            out.append({**r, "team_avg": round(avg, 1), "flags": flags})
    return sorted(out, key=lambda r: (-len(r["flags"]), r["reviewed"], r["name"].lower()))


# ── clients ────────────────────────────────────────────────────────────────────
def _client_rows(d: _Data) -> list[dict]:
    rows: dict[str, dict] = {}

    def row(key: str) -> dict:
        if key not in rows:
            cid = int(key[1:]) if key.startswith("c") else None
            rows[key] = {"key": key, "client_id": cid, "name": d.client_names.get(key, "Unknown"),
                         "mailbox": d.mailbox.get(cid) if cid else None,
                         "reports": 0, "episodes_sent": 0, "by_society": defaultdict(lambda: [0, 0]),
                         "recent": [], "last_sent_at": None, "projects": {}}
        return rows[key]

    for c in d.clients.values():
        if c.is_active:
            row(f"c{c.id}")

    for s in sorted(d.emailed, key=lambda s: _sent_at(s) or datetime.min.replace(tzinfo=timezone.utc), reverse=True):
        key = _client_key(s.client_id, s.client) or d.project_client.get(s.project_id)
        if not key:
            continue
        r = row(key)
        r["reports"] += 1
        r["episodes_sent"] += _sub_episodes(s)
        soc = r["by_society"][s.society_name or "Society"]
        soc[0] += 1
        soc[1] += _sub_episodes(s)
        at = _sent_at(s)
        r["last_sent_at"] = r["last_sent_at"] or (at.isoformat() if at else None)
        if len(r["recent"]) < 8:
            proj = d.projects.get(s.project_id)
            r["recent"].append({
                "serial": proj.title if proj else "Deleted serial",
                "episodes": "Movie" if proj and proj.type == ProjectType.MOVIE
                else f"Ep {s.episode_from}" if s.episode_from == s.episode_to else f"Ep {s.episode_from}–{s.episode_to}",
                "society": s.society_name, "sent_at": at.isoformat() if at else None,
                "sent_by": d.name(s.submitted_by), "status": s.mail_status,
            })

    for dl in d.delegations:
        key = _client_key(dl.client_id, dl.client)
        if not key:
            continue
        pr = row(key)["projects"].setdefault(dl.project_id, {"units": set(), "editors": set(), "open": False})
        pr["units"] |= d.units(dl)
        pr["editors"].add(dl.assigned_to)
        pr["open"] |= dl.status != "completed"

    out = []
    for r in rows.values():
        pending, in_editing, awaiting, allotted, sent = [], 0, 0, 0, 0
        projects = r.pop("projects")
        for pid, pr in projects.items():
            proj = d.projects.get(pid)
            done = sum(1 for n in pr["units"] if d.covered(pid, n))
            edit = sum(1 for n in pr["units"] if not d.covered(pid, n) and d.ep_status.get((pid, n)) != "approved")
            wait = len(pr["units"]) - done - edit
            allotted += len(pr["units"])
            sent += done
            if edit or wait or (not pr["units"] and pr["open"]):
                in_editing += edit
                awaiting += wait
                pending.append({
                    "project_id": pid, "title": proj.title if proj else "Deleted serial",
                    "type": proj.type.value if proj else None,
                    "editors": sorted(d.name(u) for u in pr["editors"]),
                    "allotted": len(pr["units"]), "in_editing": edit, "awaiting_send": wait, "sent": done,
                })
        out.append({
            **r, "by_society": [{"society": k, "reports": v[0], "episodes": v[1]} for k, v in sorted(r["by_society"].items())],
            "pending_projects": sorted(pending, key=lambda x: -(x["in_editing"] + x["awaiting_send"])),
            "pending_count": len(pending), "in_editing": in_editing, "awaiting_send": awaiting,
            # Allotted episodes = in editing + approved, not sent + sent (of those allotted).
            "projects_count": len(projects), "allotted": allotted, "sent_allotted": sent,
        })
    return sorted(out, key=lambda r: (-r["pending_count"], -r["reports"], r["name"].lower()))


def _pipeline(d: _Data) -> dict:
    """Every episode by where it is now; approved ones split into sent / not sent yet."""
    status = defaultdict(int)
    awaiting_eps, awaiting_projects = 0, set()
    for pid, num, st in d.ep_by_id.values():
        status[st] += 1
        if st == "approved" and not d.covered(pid, num):
            awaiting_eps += 1
            awaiting_projects.add(pid)
    users_by_role = defaultdict(int)
    for u in d.users.values():
        if u.is_active:
            users_by_role[u.role.value] += 1
    return {
        "episodes": dict(status),
        "approved_not_sent": awaiting_eps,
        "approved_not_sent_projects": len(awaiting_projects),
        "serials": sum(1 for p in d.projects.values() if p.type == ProjectType.SERIAL),
        "movies": sum(1 for p in d.projects.values() if p.type == ProjectType.MOVIE),
        "users_by_role": dict(users_by_role),
    }


# ── one editor's work ──────────────────────────────────────────────────────────
def ep_list(nums: list[int]) -> str:
    """[1, 2, 3, 5] → 'Ep 1–3, 5'."""
    spans: list[list[int]] = []
    for n in sorted(nums):
        if spans and n == spans[-1][1] + 1:
            spans[-1][1] = n
        else:
            spans.append([n, n])
    return ("Ep " + ", ".join(str(a) if a == b else f"{a}–{b}" for a, b in spans)) if spans else ""


def work_rows(d: _Data, editor_id: int, open_only: bool = False) -> list[dict]:
    """The editor's allotted work, one row per serial/movie: where every allotted episode is right now.
    To do = not submitted yet; rejected and changes-asked episodes also need the editor; overdue counts those past due."""
    merged: dict[int, dict] = {}
    for dl in d.delegations:
        if dl.assigned_to != editor_id or (open_only and dl.status == "completed"):
            continue
        m = merged.setdefault(dl.project_id, {"dl": dl, "due": {}, "units": set(), "ranges": [], "target": 0, "open": False})
        m["units"] |= d.units(dl)
        due = d.due_dates(dl)
        for n, at in due.items():
            m["due"][n] = min(m["due"].get(n, at), at)
        if dl.episode_range:
            m["ranges"].append(dl.episode_range)
        if dl.status != "completed":
            m["open"] = True
            m["target"] += dl.week_target or 0

    rows = []
    for pid, m in merged.items():
        dl, proj = m["dl"], d.projects.get(pid)
        movie = bool(proj and proj.type == ProjectType.MOVIE)
        groups: dict[str, list[int]] = {"approved": [], "submitted": [], "rejected": [], "edited": [], "to_do": []}
        for n in m["units"]:
            status = d.ep_status.get((pid, n))
            groups[status if status in ("approved", "submitted", "rejected", "edited") else "to_do"].append(n)
        needs_editor = groups["to_do"] + groups["rejected"] + groups["edited"]
        overdue = [n for n in needs_editor if n in m["due"] and m["due"][n] < d.now]
        upcoming = [m["due"][n] for n in needs_editor if n in m["due"] and m["due"][n] >= d.now]
        key = _client_key(dl.client_id, dl.client)
        label = (lambda nums: ("Movie" if nums else "")) if movie else ep_list
        rows.append({
            "project_id": pid,
            "title": proj.title if proj else dl.serial_name,
            "type": "movie" if movie else "serial",
            "client_key": key or "none",
            "client": d.client_names.get(key, "No client") if key else "No client",
            "assigned_by": d.name(dl.created_by),
            "episode_range": ", ".join(m["ranges"]) or None,
            "week_target": m["target"] or None,
            "open": m["open"],
            "allotted": len(m["units"]),
            "approved": len(groups["approved"]),
            "waiting": len(groups["submitted"]),
            "rejected": len(groups["rejected"]),
            "changes": len(groups["edited"]),
            "to_do": len(groups["to_do"]),
            "overdue": len(overdue),
            "to_do_eps": label(groups["to_do"]),
            "rejected_eps": label(groups["rejected"]),
            "changes_eps": label(groups["edited"]),
            "overdue_eps": label(overdue),
            "next_due": min(upcoming).isoformat() if upcoming else None,
            "notes": [{"episode": n, "status": s, "note": d.ep_notes[(pid, n)]}
                      for s, nums in (("rejected", groups["rejected"]), ("changes", groups["edited"]))
                      for n in sorted(nums) if (pid, n) in d.ep_notes],
        })
    return sorted(rows, key=lambda r: (r["client"].lower(), -r["overdue"], r["title"].lower()))


def pending_rows(rows: list[dict]) -> list[dict]:
    """Rows that still need the editor to do something."""
    return [r for r in rows if r["open"] and (r["to_do"] or r["rejected"] or r["changes"])]


def _editor_due(d: _Data, uid: int) -> dict[tuple[int, int], datetime]:
    due: dict[tuple[int, int], datetime] = {}
    for dl in d.delegations:
        if dl.assigned_to == uid:
            for n, at in d.due_dates(dl).items():
                due.setdefault((dl.project_id, n), at)
    return due


def editor_counts(d: _Data, uid: int, p: Period, due: dict[tuple[int, int], datetime] | None = None) -> dict:
    """What this editor did in the period. A review is credited to whoever last submitted the episode, and an
    approved episode was on time when that submission beat the due date."""
    due = _editor_due(d, uid) if due is None else due
    seen: dict[str, set] = {"submit": set(), "approve": set(), "reject": set(), "suggest": set()}
    on_time, late, no_target = 0, 0, 0
    for who, act, eid, at in d.audits:
        if not eid or not p.has(at) or (who if act == "submit" else d.editor_of(eid, at)) != uid or eid in seen[act]:
            continue
        seen[act].add(eid)
        ep = d.ep_by_id.get(eid)
        if act == "approve" and ep:
            when = due.get((ep[0], ep[1]))
            handed_in = d.last_submit(eid, at)
            if when is None or not handed_in:
                no_target += 1
            elif handed_in[0] <= when:
                on_time += 1
            else:
                late += 1
    approved, rejected = len(seen["approve"]), len(seen["reject"])
    reviewed = approved + rejected
    return {
        "submitted": len(seen["submit"]), "approved": approved, "rejected": rejected, "changes": len(seen["suggest"]),
        "approval_rate": round(100 * approved / reviewed) if reviewed else None,
        "on_time": on_time, "late": late, "no_target": no_target,
    }


def editor_rating(counts: dict, flags: list[str], has_open_work: bool, due: float) -> dict:
    """Underperforming when anything is flagged; Performing well when the target is met at a high approval rate."""
    if flags:
        key = "under"
    elif not has_open_work and not (counts["approved"] or counts["submitted"] or counts["rejected"]):
        key = "none"
    else:
        reviewed = counts["approved"] + counts["rejected"]
        met_target = counts["approved"] >= due if due >= 1 else counts["approved"] > 0
        key = "good" if met_target and reviewed and counts["approved"] / reviewed >= GOOD_RATE else "decent"
    return {"key": key, "label": RATINGS[key], "reasons": flags}


def rate_editor(d: _Data, user: User, p: Period, ranked: list[dict] | None = None) -> tuple[dict, dict]:
    """(counts, rating) of one editor for a period."""
    ranked = _editors(d, p) if ranked is None else ranked
    weak = next((r for r in _weak_editors(d, p, ranked) if r["id"] == user.id), None)
    open_work = [dl for dl in d.delegations if dl.assigned_to == user.id and dl.status != "completed"]
    due = sum(dl.week_target or 0 for dl in open_work) * p.work_days / WORK_DAYS
    counts = editor_counts(d, user.id, p)
    return counts, editor_rating(counts, weak["flags"] if weak else [], bool(open_work), due)


def _month_weeks(month_start: datetime, month_end: datetime) -> list[tuple[str, datetime, datetime]]:
    """Monday-based weeks of a month, cut at the month's edges: ("1–2", start, end), ("3–9", …), …"""
    out, start = [], month_start
    while start < month_end:
        end = min(start + timedelta(days=7 - start.weekday()), month_end)
        last = (end - timedelta(days=1)).day
        out.append((str(start.day) if last == start.day else f"{start.day}–{last}", start, end))
        start = end
    return out


def _buckets(ps: dict[str, Period]) -> dict[str, list[tuple[str, datetime, datetime]]]:
    week = ps["week"].start
    out = {"week": [(f"{week + timedelta(days=i):%a}", week + timedelta(days=i), week + timedelta(days=i + 1)) for i in range(7)]}
    out["month"] = _month_weeks(ps["month"].start, ps["month"].end)
    year = ps["year"].start
    out["year"] = [(f"{year.replace(month=m):%b}", year.replace(month=m),
                    year.replace(month=m + 1) if m < 12 else ps["year"].end) for m in range(1, 13)]
    return out


def _series(d: _Data, uid: int, buckets: list[tuple[str, datetime, datetime]]) -> list[dict]:
    due = _editor_due(d, uid)
    out = []
    for label, a, b in buckets:
        c = editor_counts(d, uid, Period("", a, b, "", 0), due)
        out.append({"label": label, "submitted": c["submitted"], "approved": c["approved"], "rejected": c["rejected"], "changes": c["changes"]})
    return out


def notice_row(n: EditorNotice) -> dict:
    return {
        "id": n.id, "sent_by": n.sent_by_name, "from_email": n.from_email, "to_email": n.to_email,
        "subject": n.subject, "message": n.message,
        "reasons": orjson.loads(n.reasons_json or "[]"), "work": orjson.loads(n.work_json or "[]"),
        "sent_at": n.sent_at.isoformat() if n.sent_at else None,
        "read_at": n.read_at.isoformat() if n.read_at else None,
    }


async def editor_dashboard(db: AsyncSession, user: User) -> dict:
    """Editor Dashboard: the client-wise work allotted to this editor, their progress and the emails they got."""
    now = datetime.now(timezone.utc)
    ps = periods(now)
    d = await _Data().load(db, ps["year"].start)
    rows = work_rows(d, user.id)
    clients: dict[str, dict] = {}
    totals = ("allotted", "approved", "waiting", "rejected", "changes", "to_do", "overdue")
    for r in rows:
        c = clients.setdefault(r["client_key"], {"key": r["client_key"], "name": r["client"], "projects": [], **{k: 0 for k in totals}})
        c["projects"].append(r)
        for k in totals:
            c[k] += r[k]
    buckets = _buckets(ps)
    stats = {k: editor_counts(d, user.id, p) for k, p in ps.items()}
    _, rating = rate_editor(d, user, ps["week"])
    notices = (await db.execute(
        select(EditorNotice).where(EditorNotice.editor_id == user.id).order_by(EditorNotice.sent_at.desc()).limit(20)
    )).scalars().all()
    return {
        "generated_at": now.isoformat(),
        "periods": {k: p.out() for k, p in ps.items()},
        "rating": rating,
        "stats": stats,
        "series": {k: _series(d, user.id, b) for k, b in buckets.items()},
        "totals": {k: sum(r[k] for r in rows) for k in totals},
        "clients": sorted(clients.values(), key=lambda c: (-(c["to_do"] + c["rejected"] + c["changes"]), c["name"].lower())),
        "weekly_target": sum(r["week_target"] or 0 for r in rows),
        "notices": [notice_row(n) for n in notices],
    }


# ── entry points ───────────────────────────────────────────────────────────────
async def dashboard(db: AsyncSession) -> dict:
    now = datetime.now(timezone.utc)
    ps = periods(now)
    d = await _Data().load(db, min(p.start for p in ps.values()))

    editors = {k: _editors(d, p) for k, p in ps.items()}
    reviewers = {k: _reviewers(d, p) for k, p in ps.items()}
    pipeline = _pipeline(d)
    waits = [hit[0] for eid, (_, _, st) in d.ep_by_id.items()
             if st == "submitted" and (hit := d.last_submit(eid, now))]

    week = ps["week"]
    week_orders = _orders(d, week)
    week_sent = [s for s in d.emailed if week.has(_sent_at(s))]

    return {
        "generated_at": now.isoformat(),
        "periods": {k: p.out() for k, p in ps.items()},
        "kpis": {
            "allotted_projects": sum(r["projects"] for r in week_orders),
            "allotted_episodes": sum(r["episodes"] for r in week_orders),
            "approved": len({eid for _, act, eid, at in d.audits if act == "approve" and week.has(at)}),
            "sent_reports": len(week_sent),
            "sent_episodes": sum(_sub_episodes(s) for s in week_sent),
            "waiting_review": pipeline["episodes"].get("submitted", 0),
            "oldest_wait_days": (now - min(waits)).days if waits else None,
            "awaiting_society": pipeline["approved_not_sent"],
            "awaiting_society_projects": pipeline["approved_not_sent_projects"],
            "society_replies": len(d.replied),
            "bounced": len(d.bounced),
        },
        "pipeline": pipeline,
        "editors": editors,
        "reviewers": reviewers,
        "orders": {k: _orders(d, p) for k, p in ps.items()},
        "allocators": {k: _allocators(d, p) for k, p in ps.items()},
        "underperformers": {
            k: {"editors": _weak_editors(d, ps[k], editors[k]), "reviewers": _weak_reviewers(d, ps[k], reviewers[k])}
            for k in ("week", "month")
        },
        "clients": _client_rows(d),
    }


async def wd_dashboard(db: AsyncSession) -> dict:
    """Work Delegator Dashboard: the editor and client side of the Admin Dashboard."""
    now = datetime.now(timezone.utc)
    ps = periods(now)
    d = await _Data().load(db, min(p.start for p in ps.values()))
    editors = {k: _editors(d, p) for k, p in ps.items()}
    return {
        "generated_at": now.isoformat(),
        "periods": {k: p.out() for k, p in ps.items()},
        "pipeline": _pipeline(d),
        "editors": editors,
        "orders": {k: _orders(d, p) for k, p in ps.items()},
        "underperformers": {k: {"editors": _weak_editors(d, ps[k], editors[k])} for k in ("week", "month")},
        "clients": _client_rows(d),
    }


REVIEW_LABEL = {"submit": "submitted", "approve": "approved", "reject": "rejected", "suggest": "changes"}


async def reviewer_calendar(db: AsyncSession, year: int, client_id: int | None = None, society_id: int | None = None) -> dict:
    """Reviewer's Activity Calendar, per month of `year` (IST). Episodes count once per month and per action, however
    many times they went back and forth. `to_review` adds up to what is waiting now: each waiting episode sits in the
    month of its latest submission. A picked society narrows the email columns; a picked client narrows everything."""
    start = datetime(year, 1, 1, tzinfo=IST)
    end = datetime(year + 1, 1, 1, tzinfo=IST)
    d = await _Data().load(db, start, end)
    want = f"c{client_id}" if client_id else None

    bounds = {m: (datetime(year, m, 1, tzinfo=IST), datetime(year + (m == 12), m % 12 + 1, 1, tzinfo=IST)) for m in range(1, 13)}
    week_list = {m: _month_weeks(*bounds[m]) for m in bounds}

    def month_of(at: datetime) -> int:
        return at.astimezone(IST).month

    def week_of(at: datetime) -> str:
        return next(label for label, a, b in week_list[month_of(at)] if a <= at < b)

    def in_year(at: datetime | None) -> bool:
        return at is not None and start <= at < end

    def counts() -> dict:
        return {k: 0 for k in ("submitted", "approved", "rejected", "changes", "reviewed", "sent_reports", "sent_episodes")}

    months = {m: {**counts(), "to_review": 0, "ready_to_send": 0, "waiting_reply": 0, "replied": 0, "accepted": 0, "failed": 0,
                  "societies": defaultdict(int), "clients": defaultdict(counts), "reviewers": defaultdict(counts),
                  "weeks": {label: counts() for label, _, _ in week_list[m]}} for m in bounds}

    # Reviews and submissions: one count per episode, per action, per place it's listed.
    seen: set[tuple] = set()

    def tally(row: dict, tag: tuple, eid: int, act: str) -> None:
        for key, field in ((act, REVIEW_LABEL[act]),) + (() if act == "submit" else (("reviewed", "reviewed"),)):
            if (tag, key, eid) not in seen:
                seen.add((tag, key, eid))
                row[field] += 1

    last_approval: dict[int, int] = {}
    for uid, act, eid, at in sorted(d.audits, key=lambda r: r[3]):
        ep = d.ep_by_id.get(eid)
        if not ep or not at:
            continue
        key = d.project_client.get(ep[0])
        if want and key != want:
            continue
        m = month_of(at)
        row = months[m]
        tally(row, (m,), eid, act)
        tally(row["weeks"][week_of(at)], (m, "w", week_of(at)), eid, act)
        tally(row["clients"][d.client_names.get(key, "No client")], (m, "c", key), eid, act)
        if act != "submit" and uid:
            tally(row["reviewers"][d.name(uid)], (m, "r", uid), eid, act)
        if act == "approve":
            last_approval[eid] = m

    # Approved, and still not emailed to the society (or to any society).
    for eid, m in last_approval.items():
        pid, num, status = d.ep_by_id[eid]
        if status == "approved" and not d.covered(pid, num, society_id):
            months[m]["ready_to_send"] += 1

    # Waiting for a reviewer right now, under the month of the latest submission.
    waiting = {eid for eid, (pid, _, st) in d.ep_by_id.items()
               if st == "submitted" and (not want or d.project_client.get(pid) == want)}
    if waiting:
        latest = dict((await db.execute(
            select(AuditLog.entity_id, func.max(AuditLog.created_at)).where(
                AuditLog.entity == "episode", AuditLog.action == "submit", AuditLog.entity_id.in_(waiting),
            ).group_by(AuditLog.entity_id)
        )).all())
        touched = dict((await db.execute(select(Episode.id, Episode.updated_at).where(Episode.id.in_(waiting)))).all())
        for eid in waiting:
            at = latest.get(eid) or touched.get(eid)  # sheets submitted before audit logging have no submit row
            if in_year(at):
                months[month_of(at)]["to_review"] += 1

    # Emails to societies. Bounced ones never count as sent, and show as failed instead.
    for s in d.subs:
        key = _client_key(s.client_id, s.client) or d.project_client.get(s.project_id)
        if (want and key != want) or (society_id and s.society_id != society_id):
            continue
        at = _sent_at(s)
        if in_year(at):
            row = months[month_of(at)]
            if s.mail_status in DEAD_MAIL:
                row["failed"] += 1
            elif s.sent_via in EMAILED:
                n = _sub_episodes(s)
                row["sent_reports"] += 1
                row["sent_episodes"] += n
                row["societies"][s.society_name or "Society"] += n
                row["weeks"][week_of(at)]["sent_episodes"] += n
                row["clients"][d.client_names.get(key, "No client")]["sent_episodes"] += n
                row["reviewers"][d.name(s.submitted_by)]["sent_episodes"] += n
                if s.mail_status == "sent" and not s.accepted_by_iprs:
                    row["waiting_reply"] += 1
        if in_year(s.reply_at) and s.mail_status not in DEAD_MAIL:
            months[month_of(s.reply_at)]["replied"] += 1
        if s.accepted_by_iprs and in_year(s.accepted_by_iprs_at):
            months[month_of(s.accepted_by_iprs_at)]["accepted"] += 1

    def named(rows: dict) -> list[dict]:
        return sorted(({"name": n, **c} for n, c in rows.items()), key=lambda c: c["name"].lower())

    societies = (await db.execute(select(Society.id, Society.name).order_by(Society.name))).all()
    return {
        "year": year,
        "months": {str(m): {
            **{k: v for k, v in row.items() if k not in ("societies", "clients", "reviewers", "weeks")},
            "societies": dict(row["societies"]),
            "clients": named(row["clients"]),
            "reviewers": named(row["reviewers"]),
            "weeks": [{"label": label, **row["weeks"][label]} for label, _, _ in week_list[m]],
        } for m, row in months.items()},
        "clients": [{"id": c.id, "name": c.name} for c in sorted(d.clients.values(), key=lambda c: c.name.lower())],
        "societies": [{"id": i, "name": n} for i, n in societies],
    }


async def calendar(db: AsyncSession, year: int, client_id: int | None = None, society_id: int | None = None) -> dict:
    """Per month of `year` (IST): episodes allotted, approved, emailed to societies, and still pending."""
    start = datetime(year, 1, 1, tzinfo=IST)
    end = datetime(year + 1, 1, 1, tzinfo=IST)
    d = await _Data().load(db, start, end)
    want = f"c{client_id}" if client_id else None

    def blank():
        return {"allotted": 0, "approved": 0, "sent_reports": 0, "sent_episodes": 0, "pending": 0,
                "societies": defaultdict(int), "clients": defaultdict(lambda: defaultdict(int))}
    months = {m: blank() for m in range(1, 13)}

    def month(at: datetime) -> int:
        return at.astimezone(IST).month

    # Allotted that month, and how much of it is still not sent (to the chosen society, if one is picked).
    allotted: dict[tuple[int, str, int], set] = defaultdict(set)
    for dl in d.delegations:
        key = _client_key(dl.client_id, dl.client)
        if dl.created_at and start <= dl.created_at < end and (not want or key == want):
            allotted[(month(dl.created_at), key or "", dl.project_id)] |= d.units(dl)
    for (m, key, pid), units in allotted.items():
        left = sum(1 for n in units if not d.covered(pid, n, society_id))
        name = d.client_names.get(key, "No client")
        months[m]["allotted"] += len(units)
        months[m]["pending"] += left
        months[m]["clients"][name]["allotted"] += len(units)
        months[m]["clients"][name]["pending"] += left

    seen = set()
    for _, act, eid, at in d.audits:
        if act != "approve" or not eid or eid not in d.ep_by_id or (month(at), eid) in seen:
            continue
        pid = d.ep_by_id[eid][0]
        key = d.project_client.get(pid)
        if want and key != want:
            continue
        seen.add((month(at), eid))
        months[month(at)]["approved"] += 1
        months[month(at)]["clients"][d.client_names.get(key, "No client")]["approved"] += 1

    for s in d.emailed:
        at = _sent_at(s)
        key = _client_key(s.client_id, s.client) or d.project_client.get(s.project_id)
        if not at or not (start <= at < end) or (want and key != want) or (society_id and s.society_id != society_id):
            continue
        m = months[month(at)]
        m["sent_reports"] += 1
        m["sent_episodes"] += _sub_episodes(s)
        m["societies"][s.society_name or "Society"] += _sub_episodes(s)
        m["clients"][d.client_names.get(key, "No client")]["sent"] += _sub_episodes(s)

    societies = (await db.execute(select(Society.id, Society.name).order_by(Society.name))).all()
    return {
        "year": year,
        "months": {str(m): {
            **{k: v for k, v in row.items() if k not in ("societies", "clients")},
            "societies": dict(row["societies"]),
            "clients": sorted(({"name": n, **{f: c.get(f, 0) for f in ("allotted", "approved", "sent", "pending")}}
                               for n, c in row["clients"].items()), key=lambda c: c["name"].lower()),
        } for m, row in months.items()},
        "clients": [{"id": c.id, "name": c.name} for c in sorted(d.clients.values(), key=lambda c: c.name.lower())],
        "societies": [{"id": i, "name": n} for i, n in societies],
    }
