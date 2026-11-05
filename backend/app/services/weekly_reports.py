"""The weekly email reports, sent through Brevo from the admin's address: every active editor, Work Delegator,
reviewer and admin gets last week's numbers for their role, unless the super admin switched them off. When: REPORT_DAY / REPORT_TIME / REPORT_TIMEZONE; off
until REPORT_ENABLED is true. A ReportSend row is claimed per person per week before sending, so gunicorn workers and
restarts never email anyone twice; a failed send is tried again later the same day.
"""
import html
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.client import Client, ClientMailbox
from app.models.detected_mail import DetectedMail
from app.models.editor_notice import EditorNotice
from app.models.report_send import ReportSend
from app.models.user import User, UserRole
from app.services import brevo, insights
from app.services.insights import _Data, _sent_at, _sub_episodes

DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
CATCH_UP = timedelta(hours=24)         # a run missed by more than this waits for next week
MAX_ATTEMPTS = 3
RETRY_AFTER = timedelta(minutes=10)
WAITING_LIST = 15                      # longest "oldest first" lists in an email

DARK, MID, SUB, TINT, LINE = "#1B3A2D", "#2D5F4A", "#4A7A63", "#E0FBE2", "#ACE1AF"
TONES = {"good": ("#2E7D32", "#E8F5E9"), "decent": ("#1565C0", "#E3F2FD"), "under": ("#C62828", "#FFEBEE"), "none": ("#374151", "#F3F4F6")}


# ── schedule ───────────────────────────────────────────────────────────────────
@dataclass
class Schedule:
    weekday: int
    hour: int
    minute: int
    tz: ZoneInfo


def schedule() -> Schedule:
    """The REPORT_* settings; ValueError names the one that's wrong."""
    day = settings.REPORT_DAY.strip().lower()
    match = [i for i, d in enumerate(DAYS) if len(day) >= 3 and d.startswith(day)]
    if not match:
        raise ValueError(f"REPORT_DAY must be a weekday name, not '{settings.REPORT_DAY}'")
    try:
        hour, minute = (int(x) for x in settings.REPORT_TIME.strip().split(":"))
        if not (0 <= hour < 24 and 0 <= minute < 60):
            raise ValueError
    except ValueError:
        raise ValueError(f"REPORT_TIME must be 24-hour HH:MM, not '{settings.REPORT_TIME}'")
    try:
        tz = ZoneInfo(settings.REPORT_TIMEZONE.strip())
    except Exception:
        raise ValueError(f"REPORT_TIMEZONE is not a time zone: '{settings.REPORT_TIMEZONE}'")
    return Schedule(match[0], hour, minute, tz)


def _moment(s: Schedule, now: datetime) -> datetime:
    """This calendar week's send time."""
    local = now.astimezone(s.tz)
    day = local.date() - timedelta(days=local.weekday()) + timedelta(days=s.weekday)
    return datetime(day.year, day.month, day.day, s.hour, s.minute, tzinfo=s.tz)


def next_run(now: datetime) -> datetime:
    s = schedule()
    at = _moment(s, now)
    return at if at > now else at + timedelta(days=7)


def due_key(now: datetime) -> str | None:
    """The week to send now (e.g. "2026-W45"), or None between send times."""
    s = schedule()
    at = _moment(s, now)
    if not at <= now < at + CATCH_UP:
        return None
    year, week, _ = at.isocalendar()
    return f"{year}-W{week:02d}"


# ── email building blocks ──────────────────────────────────────────────────────
@dataclass
class Report:
    subject: str
    html: str
    text: str


class Doc:
    """Builds the HTML and plain-text versions of an email side by side. Inline styles and tables: email clients."""

    def __init__(self, title: str, period: str):
        self.title, self.period = title, period
        self.body: list[str] = []
        self.lines: list[str] = [title, period, ""]

    def rating(self, rating: dict) -> None:
        fg, bg = TONES[rating["key"]]
        reasons = "".join(f'<div style="margin-top:4px;font-size:13px;color:{DARK};">{html.escape(r)}</div>' for r in rating["reasons"])
        self.body.append(f'<div style="margin:0 0 16px;padding:12px 14px;border-radius:8px;background:{bg};">'
                         f'<div style="font-size:15px;font-weight:700;color:{fg};">{html.escape(rating["label"])}</div>{reasons}</div>')
        self.lines += [f"Rating: {rating['label']}"] + [f"  - {r}" for r in rating["reasons"]] + [""]

    def kpis(self, tiles: list[tuple]) -> None:
        """(label, value) or (label, value, note) tiles, three per row."""
        rows = []
        for i in range(0, len(tiles), 3):
            cells = []
            for t in tiles[i:i + 3]:
                note = f'<div style="font-size:11px;color:{SUB};">{html.escape(str(t[2]))}</div>' if len(t) > 2 and t[2] else ""
                cells.append(f'<td width="33%" style="padding:10px 12px;border:1px solid {LINE};vertical-align:top;">'
                             f'<div style="font-size:12px;color:{SUB};">{html.escape(t[0])}</div>'
                             f'<div style="font-size:22px;font-weight:700;color:{DARK};">{html.escape(str(t[1]))}</div>{note}</td>')
            cells += ['<td width="33%"></td>'] * (3 - len(cells))
            rows.append(f'<tr>{"".join(cells)}</tr>')
            self.lines += [f"{t[0]}: {t[1]}" + (f" ({t[2]})" if len(t) > 2 and t[2] else "") for t in tiles[i:i + 3]]
        self.body.append(f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 16px;">{"".join(rows)}</table>')
        self.lines.append("")

    def table(self, title: str, headers: list[str], rows: list[list], empty: str = "Nothing to show.", note: str | None = None) -> None:
        self.body.append(f'<h3 style="font-size:15px;color:{DARK};margin:20px 0 4px;">{html.escape(title)}</h3>')
        self.lines.append(title.upper())
        if note:
            self.body.append(f'<div style="font-size:12px;color:{SUB};margin-bottom:6px;">{html.escape(note)}</div>')
        if not rows:
            self.body.append(f'<div style="font-size:13px;color:{SUB};padding:6px 0;">{html.escape(empty)}</div>')
            self.lines += [empty, ""]
            return
        def align(v):
            return "right" if isinstance(v, (int, float)) else "left"
        head = "".join(f'<th style="text-align:{align(rows[0][i])};padding:6px 8px;font-size:11px;color:{SUB};border-bottom:2px solid {LINE};">{html.escape(h)}</th>'
                       for i, h in enumerate(headers))
        body = "".join("<tr>" + "".join(
            f'<td style="text-align:{align(v)};padding:6px 8px;font-size:13px;color:{DARK};border-bottom:1px solid {TINT};vertical-align:top;">{html.escape(str(v))}</td>'
            for v in row) + "</tr>" for row in rows)
        self.body.append(f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">'
                         f'<tr>{head}</tr>{body}</table>')
        self.lines += [" | ".join(f"{h}: {v}" for h, v in zip(headers, row)) for row in rows] + [""]

    def para(self, text: str) -> None:
        self.body.append(f'<p style="font-size:13px;color:{DARK};margin:12px 0;">{html.escape(text)}</p>')
        self.lines += [text, ""]

    def render(self, subject: str) -> Report:
        link = settings.FRONTEND_URL.rstrip("/")
        when = ""
        try:
            s = schedule()
            when = f"every {DAYS[s.weekday].title()}"
        except ValueError:
            pass
        page = (
            f'<!doctype html><html><body style="margin:0;padding:0;background:#F6FFF8;font-family:Arial,Helvetica,sans-serif;">'
            f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:20px 10px;">'
            f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#FFFFFF;border:1px solid {LINE};border-radius:12px;">'
            f'<tr><td style="background:{DARK};padding:18px 20px;border-radius:11px 11px 0 0;">'
            f'<div style="font-size:12px;letter-spacing:2px;color:{LINE};">CUESYNC WEEKLY REPORT</div>'
            f'<div style="font-size:21px;font-weight:700;color:#FFFFFF;margin-top:4px;">{html.escape(self.title)}</div>'
            f'<div style="font-size:13px;color:{LINE};margin-top:2px;">{html.escape(self.period)}</div></td></tr>'
            f'<tr><td style="padding:18px 20px;">{"".join(self.body)}</td></tr>'
            f'<tr><td style="padding:12px 20px;border-top:1px solid {TINT};font-size:11px;color:{SUB};">'
            f'Sent by CueSync {when}. <a href="{html.escape(link)}" style="color:{MID};">Open CueSync</a></td></tr>'
            f'</table></td></tr></table></body></html>'
        )
        return Report(subject, page, "\n".join(self.lines + [f"Open CueSync: {link}"]))


def _vs(now, before) -> str:
    diff = (now or 0) - (before or 0)
    return "same as the week before" if not diff else f"{diff:+d} on the week before"


def _count(n: int, one: str, many: str) -> str:
    return (one if n == 1 else many).format(n)


def _when(at: datetime | None) -> str:
    return f"{at.astimezone(insights.IST):%d %b}" if at else "—"


def _eps(s) -> str:
    return f"Ep {s.episode_from}" if s.episode_from == s.episode_to else f"Ep {s.episode_from}–{s.episode_to}"


# ── data shared by every report of a run ───────────────────────────────────────
class Ctx:
    async def load(self, db: AsyncSession, now: datetime) -> "Ctx":
        self.now = now
        self.week = insights.past_week(now)
        self.prev = insights.past_week(now, 2)
        self.d = d = await _Data().load(db, self.prev.start)
        self.editors = insights._editors(d, self.week)
        self.reviewers = insights._reviewers(d, self.week)
        self.weak_editors = insights._weak_editors(d, self.week, self.editors)
        self.weak_reviewers = insights._weak_reviewers(d, self.week, self.reviewers)
        self.pipeline = insights._pipeline(d)
        self.clients = insights._client_rows(d)
        self.waiting_reply = sorted((s for s in d.emailed if s.mail_status == "sent" and not s.accepted_by_iprs),
                                    key=lambda s: _sent_at(s) or now)
        self.detected = len((await db.execute(select(DetectedMail.id).where(DetectedMail.status == "pending"))).all())
        self.notices = (await db.execute(select(EditorNotice).where(
            EditorNotice.sent_at >= self.week.start, EditorNotice.sent_at < self.week.end))).scalars().all()
        self.lost_mailboxes = (await db.execute(
            select(Client.name, ClientMailbox.email).join(ClientMailbox, ClientMailbox.client_id == Client.id)
            .where(ClientMailbox.status != "connected")
        )).all()
        return self

    def project_title(self, pid: int) -> str:
        p = self.d.projects.get(pid)
        return p.title if p else "Deleted serial"

    def sent_in(self, p: insights.Period) -> list:
        return [s for s in self.d.emailed if p.has(_sent_at(s))]

    def approved_in(self, p: insights.Period) -> set[int]:
        return {eid for _, act, eid, at in self.d.audits if act == "approve" and eid and p.has(at)}

    def waiting_review(self) -> list[tuple]:
        """(submitted at, episode id, editor) of episodes waiting for a reviewer, oldest first."""
        rows = []
        for eid, (_, _, st) in self.d.ep_by_id.items():
            if st == "submitted":
                hit = self.d.last_submit(eid, self.now)
                rows.append((hit[0] if hit else self.now, eid, self.d.name(hit[1]) if hit else "—"))
        return sorted(rows, key=lambda r: r[0])


def _pending_table(doc: Doc, rows: list[dict]) -> None:
    doc.table("Pending work", ["Client", "Serial / movie", "To do", "Rejected", "Changes", "Overdue"],
              [[r["client"], r["title"], r["to_do"], r["rejected"], r["changes"], r["overdue"]] for r in rows],
              empty="Nothing pending. Well done.",
              note="To do = not submitted yet. Overdue = past the date your weekly target sets.")
    for r in rows:
        eps = " · ".join(f"{label} {v}" for label, v in (("To do:", r["to_do_eps"]), ("Rejected:", r["rejected_eps"]), ("Changes:", r["changes_eps"])) if v)
        if eps:
            doc.para(f"{r['title']}: {eps}")


# ── the four reports ───────────────────────────────────────────────────────────
def editor_report(c: Ctx, u: User) -> Report:
    d = c.d
    counts, rating = insights.rate_editor(d, u, c.week, c.editors)
    before = insights.editor_counts(d, u.id, c.prev)
    rows = insights.work_rows(d, u.id, open_only=True)
    pending = insights.pending_rows(rows)
    timed = counts["on_time"] + counts["late"]
    doc = Doc(f"Your week, {u.full_name.split()[0]}", c.week.label)
    doc.rating(rating)
    doc.kpis([
        ("Approved", counts["approved"], _vs(counts["approved"], before["approved"])),
        ("Submitted for review", counts["submitted"], _vs(counts["submitted"], before["submitted"])),
        ("Rejected", counts["rejected"], _vs(counts["rejected"], before["rejected"])),
        ("Changes asked", counts["changes"]),
        ("Approval rate", f"{counts['approval_rate']}%" if counts["approval_rate"] is not None else "—"),
        ("Submitted on time", f"{counts['on_time']} of {timed}" if timed else "—", "of work with a weekly target"),
    ])
    target = sum(r["week_target"] or 0 for r in rows)
    if target:
        doc.para(f"Your weekly target: {target} episode{'' if target == 1 else 's'} approved.")
    if rating["key"] == "none" and not pending:
        doc.para("No work is allotted to you right now.")
    else:
        _pending_table(doc, pending)
    notes = [(r["title"], n) for r in pending for n in r["notes"]]
    if notes:
        doc.table("Reviewer notes to act on", ["Serial", "Episode", "Note"], [[t, f"Ep {n['episode']}", n["note"]] for t, n in notes])
    got = [n for n in c.notices if n.editor_id == u.id]
    if got:
        doc.table("Emails from your Work Delegator", ["From", "Subject", "Date"], [[n.sent_by_name, n.subject, _when(n.sent_at)] for n in got])
    return doc.render(f"Your CueSync week: {rating['label']} · {counts['approved']} approved · {sum(r['to_do'] + r['rejected'] + r['changes'] for r in pending)} pending")


def wd_report(c: Ctx, u: User) -> Report:
    d = c.d
    mine = [dl for dl in d.delegations if dl.created_by == u.id]
    if not mine:
        doc = Doc(f"Your allotted work, {u.full_name.split()[0]}", c.week.label)
        doc.para("You have no work allotted to editors right now, so there is nothing to track this week.")
        return doc.render("Your CueSync week: no work allotted")
    approved_week = {(d.ep_by_id[e][0], d.ep_by_id[e][1]) for e in c.approved_in(c.week) if e in d.ep_by_id}

    by_client: dict[str, dict] = defaultdict(lambda: {"received": 0, "projects": set(), "units": set(), "approved": 0, "sent": 0})
    by_editor: dict[int, set] = defaultdict(set)
    for dl in mine:
        units = d.units(dl)
        key = insights._client_key(dl.client_id, dl.client) or "none"
        row = by_client[key]
        row["units"] |= {(dl.project_id, n) for n in units}
        if c.week.has(dl.created_at):
            row["received"] += len(units)
            row["projects"].add(dl.project_id)
        if dl.status != "completed":
            by_editor[dl.assigned_to] |= {(dl.project_id, n) for n in units}

    sent_units = {(s.project_id, n) for s in c.sent_in(c.week) for n in range(s.episode_from, s.episode_to + 1)}
    client_rows, totals = [], defaultdict(int)
    for key, row in by_client.items():
        approved = len(row["units"] & approved_week)
        sent = len(row["units"] & sent_units)
        not_sent = [u_ for u_ in row["units"] if not d.covered(*u_)]
        ready = sum(1 for pid, n in not_sent if d.ep_status.get((pid, n)) == "approved")
        client_rows.append([d.client_names.get(key, "No client"), row["received"], approved, sent, len(not_sent) - ready, ready, len(not_sent)])
        for k, v in (("received", row["received"]), ("approved", approved), ("sent", sent), ("pending", len(not_sent))):
            totals[k] += v
    client_rows.sort(key=lambda r: (-r[6], r[0].lower()))

    stats = {r["id"]: r for r in c.editors}
    editor_rows, attention = [], 0
    for eid, units in by_editor.items():
        editor = d.users.get(eid)
        if not editor:
            continue
        counts, rating = insights.rate_editor(d, editor, c.week, c.editors)
        pending = sum(1 for pid, n in units if d.ep_status.get((pid, n)) not in ("approved", "submitted"))
        overdue = sum(r["overdue"] for r in insights.work_rows(d, eid, open_only=True) if r["project_id"] in {pid for pid, _ in units})
        attention += rating["key"] == "under"
        s = stats.get(eid, {})
        editor_rows.append([editor.full_name, len(units), s.get("approved", 0), s.get("submitted", 0), s.get("rejected", 0), pending, overdue, rating["label"]])
    editor_rows.sort(key=lambda r: (-r[6], -r[5], r[0].lower()))

    sent_notices = [n for n in c.notices if n.sent_by == u.id]
    doc = Doc(f"Your allotted work, {u.full_name.split()[0]}", c.week.label)
    doc.kpis([
        ("Work received", f"{totals['received']} episodes", "allotted by you last week"),
        ("Approved", totals["approved"], "of your allotted episodes"),
        ("Submitted to societies", totals["sent"], "of your allotted episodes"),
        ("Pending", totals["pending"], "allotted, not sent to a society yet"),
        ("Editors needing attention", attention),
        ("Emails to editors", len(sent_notices), "sent from your Gmail"),
    ])
    doc.table("Clients: received, submitted, pending",
              ["Client", "Received", "Approved", "Submitted", "In progress", "Ready to send", "Pending"], client_rows,
              note="Received = episodes you allotted last week. Approved and Submitted = last week. Pending = everything not sent to a society yet.")
    doc.table("Editors you allotted work to",
              ["Editor", "Active eps", "Approved", "Submitted", "Rejected", "Pending", "Overdue", "Last week"], editor_rows,
              empty="None of your allotments is active.",
              note="Approved, Submitted and Rejected = last week. Pending and Overdue = now.")
    needs = [r for r in c.weak_editors if r["id"] in by_editor]
    if needs:
        doc.table("Needs attention", ["Editor", "Why"], [[r["name"], "; ".join(r["flags"])] for r in needs],
                  note="Use Notify on your Dashboard to email them the list of pending work.")
    return doc.render(f"Your CueSync week: {totals['received']} received · {totals['sent']} submitted · {totals['pending']} pending")


def reviewer_report(c: Ctx, u: User) -> Report:
    d = c.d
    sent = c.sent_in(c.week)
    sent_before = c.sent_in(c.prev)
    waiting = c.waiting_review()
    own = next((r for r in c.reviewers if r["id"] == u.id), None) or {}
    doc = Doc(f"Society work, {u.full_name.split()[0]}", c.week.label)
    doc.kpis([
        ("Sent to societies", f"{sum(_sub_episodes(s) for s in sent)} episodes",
         f"{len(sent)} email{'' if len(sent) == 1 else 's'}, {_vs(len(sent), len(sent_before))}"),
        ("Pending review", len(waiting), f"oldest waiting {(c.now - waiting[0][0]).days} days" if waiting else "nothing waiting"),
        ("Approved, not sent yet", c.pipeline["approved_not_sent"], _count(c.pipeline["approved_not_sent_projects"], "in {} serial or movie", "in {} serials and movies")),
        ("Waiting for a reply", len(c.waiting_reply), "emails to societies"),
        ("Replies to act on", len(d.replied), "mark accepted, or keep waiting"),
        ("Bounced, to resend", len(d.bounced)),
    ])
    if own:
        hours = own.get("avg_review_hours")
        doc.para(f"You last week: {own['approved']} approved, {own['rejected']} rejected, {_count(own['suggested'], '{} change asked', '{} changes asked')}, "
                 f"{own['sent_episodes']} episodes emailed to societies"
                 + (f", average {round(hours / 24, 1)} days from submit to review." if hours else "."))
    by_pair: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])
    for s in sent:
        key = insights._client_key(s.client_id, s.client) or d.project_client.get(s.project_id)
        row = by_pair[(d.client_names.get(key, "No client"), s.society_name or "Society")]
        row[0] += 1
        row[1] += _sub_episodes(s)
    doc.table("Sent last week, by client and society", ["Client", "Society", "Emails", "Episodes"],
              [[a, b, v[0], v[1]] for (a, b), v in sorted(by_pair.items(), key=lambda x: (x[0][0].lower(), x[0][1]))],
              empty="Nothing was sent to a society last week.")
    ready = sorted((r for r in c.clients if r["awaiting_send"]), key=lambda r: -r["awaiting_send"])
    doc.table("Approved, pending to send", ["Client", "Episodes ready", "Still in editing"],
              [[r["name"], r["awaiting_send"], r["in_editing"]] for r in ready], empty="Everything approved has been sent.")
    doc.table(f"Pending review (oldest {WAITING_LIST})", ["Serial", "Episode", "Submitted by", "Waiting"],
              [[c.project_title(d.ep_by_id[e][0]), f"Ep {d.ep_by_id[e][1]}", who, f"{(c.now - at).days} days"] for at, e, who in waiting[:WAITING_LIST]],
              empty="Nothing is waiting for review.",
              note=f"{len(waiting)} in total." if len(waiting) > WAITING_LIST else None)
    doc.table(f"Emails waiting for a reply (oldest {WAITING_LIST})", ["Serial", "Episodes", "Society", "Sent", "Waiting"],
              [[c.project_title(s.project_id), _eps(s), s.society_name or "Society", _when(_sent_at(s)), f"{(c.now - (_sent_at(s) or c.now)).days} days"]
               for s in c.waiting_reply[:WAITING_LIST]],
              empty="No email is waiting for a reply.",
              note=f"{len(c.waiting_reply)} in total." if len(c.waiting_reply) > WAITING_LIST else None)
    if d.bounced:
        doc.table("Bounced, to resend", ["Serial", "Episodes", "Society", "Sent"],
                  [[c.project_title(s.project_id), _eps(s), s.society_name or "Society", _when(_sent_at(s))] for s in d.bounced[:WAITING_LIST]])
    if c.detected:
        doc.para(f"{c.detected} email{' was' if c.detected == 1 else 's were'} sent from a client's Gmail outside CueSync and need confirming on your Dashboard.")
    return doc.render(f"CueSync society work: {sum(_sub_episodes(s) for s in sent)} sent · {len(waiting)} to review · {len(c.waiting_reply)} waiting for a reply")


def admin_report(c: Ctx, u: User) -> Report:
    d = c.d
    orders = insights._orders(d, c.week)
    orders_before = insights._orders(d, c.prev)
    sent, sent_before = c.sent_in(c.week), c.sent_in(c.prev)
    approved, approved_before = len(c.approved_in(c.week)), len(c.approved_in(c.prev))
    eps = sum(r["episodes"] for r in orders)
    eps_before = sum(r["episodes"] for r in orders_before)
    sent_eps = sum(_sub_episodes(s) for s in sent)
    sent_eps_before = sum(_sub_episodes(s) for s in sent_before)
    waiting = c.waiting_review()

    doc = Doc("CueSync last week", c.week.label)
    doc.kpis([
        ("Work allotted", f"{eps} episodes", _vs(eps, eps_before)),
        ("Approved", approved, _vs(approved, approved_before)),
        ("Sent to societies", f"{sent_eps} episodes", _vs(sent_eps, sent_eps_before)),
        ("Pending review", len(waiting), f"oldest waiting {(c.now - waiting[0][0]).days} days" if waiting else "nothing waiting"),
        ("Approved, not sent yet", c.pipeline["approved_not_sent"]),
        ("Waiting for a reply", len(c.waiting_reply), f"{len(d.bounced)} bounced, {len(d.replied)} replies to act on"),
    ])

    ranked = {r["id"]: r for r in c.editors}
    editor_rows = []
    for e in (x for x in d.users.values() if x.role == UserRole.EDITOR and x.is_active):
        counts, rating = insights.rate_editor(d, e, c.week, c.editors)
        pending = insights.pending_rows(insights.work_rows(d, e.id, open_only=True))
        s = ranked.get(e.id, {})
        editor_rows.append([e.full_name, s.get("approved", 0), s.get("submitted", 0), s.get("rejected", 0),
                            sum(r["to_do"] + r["rejected"] + r["changes"] for r in pending), sum(r["overdue"] for r in pending), rating["label"]])
    order = {insights.RATINGS["under"]: 0, insights.RATINGS["decent"]: 1, insights.RATINGS["good"]: 2, insights.RATINGS["none"]: 3}
    editor_rows.sort(key=lambda r: (order[r[6]], -r[4], r[0].lower()))
    doc.table("Editors", ["Editor", "Approved", "Submitted", "Rejected", "Pending", "Overdue", "Rating"], editor_rows, empty="No active editors.")

    doc.table("Reviewers", ["Reviewer", "Approved", "Rejected", "Changes", "Emails sent", "Episodes sent"],
              [[r["name"], r["approved"], r["rejected"], r["suggested"], r["sent_reports"], r["sent_episodes"]] for r in c.reviewers],
              empty="No reviewers.")
    doc.table("Work Delegators", ["Name", "Serials / movies", "Episodes", "Editors", "Clients"],
              [[r["name"], r["projects"], r["episodes"], r["editors"], r["clients"]] for r in insights._allocators(d, c.week)],
              empty="No Work Delegators.")
    doc.table("Clients", ["Client", "Emails sent, all time", "In editing", "Ready to send", "Serials pending"],
              [[r["name"], r["reports"], r["in_editing"], r["awaiting_send"], r["pending_count"]] for r in c.clients if r["reports"] or r["pending_count"]],
              empty="No client work yet.")
    attention = [[r["name"], "Editor", "; ".join(r["flags"])] for r in c.weak_editors] + [[r["name"], "Reviewer", "; ".join(r["flags"])] for r in c.weak_reviewers]
    doc.table("Needs attention", ["Name", "Role", "Why"], attention, empty="Everyone is on track.")
    if c.notices:
        doc.table("Emails to editors about pending work", ["To", "From", "Subject", "Date"],
                  [[d.name(n.editor_id), n.sent_by_name, n.subject, _when(n.sent_at)] for n in c.notices])
    if c.lost_mailboxes:
        doc.table("Client Gmail connections to fix", ["Client", "Gmail"], [[a, b] for a, b in c.lost_mailboxes],
                  note="CueSync can't read or send from these until they are connected again under Clients.")
    return doc.render(f"CueSync last week: {eps} allotted · {approved} approved · {sent_eps} sent")


BUILDERS = {
    UserRole.EDITOR: editor_report,
    UserRole.WORK_DELEGATOR: wd_report,
    UserRole.REVIEWER: reviewer_report,
    UserRole.ADMIN: admin_report,
}


# ── sending ────────────────────────────────────────────────────────────────────
def _retryable(row: ReportSend, now: datetime) -> bool:
    return row.status == "failed" and row.attempts < MAX_ATTEMPTS and row.updated_at <= now - RETRY_AFTER


async def _claim(engine, key: str, u: User, now: datetime) -> bool:
    """True when this worker now owns sending to `u` for this week."""
    async with AsyncSession(engine) as db:
        inserted = await db.execute(
            insert(ReportSend).values(week_key=key, user_id=u.id, role=u.role.value, email=u.email, status="sending", attempts=1,
                                      created_at=now, updated_at=now)
            .on_conflict_do_nothing(index_elements=["week_key", "user_id"]).returning(ReportSend.id))
        got = inserted.first() is not None
        if not got:
            retried = await db.execute(
                update(ReportSend).where(ReportSend.week_key == key, ReportSend.user_id == u.id, ReportSend.status == "failed",
                                         ReportSend.attempts < MAX_ATTEMPTS, ReportSend.updated_at <= now - RETRY_AFTER)
                .values(status="sending", attempts=ReportSend.attempts + 1, updated_at=now).returning(ReportSend.id))
            got = retried.first() is not None
        await db.commit()
        return got


async def _finish(engine, key: str, u: User, status: str, error: str | None = None, message_id: str | None = None) -> None:
    async with AsyncSession(engine) as db:
        await db.execute(update(ReportSend).where(ReportSend.week_key == key, ReportSend.user_id == u.id).values(
            status=status, error=error, message_id=message_id, updated_at=datetime.now(timezone.utc)))
        await db.commit()


async def send_week(engine, key: str, now: datetime) -> dict:
    # Everything read here stays usable while _claim/_finish commit on their own sessions.
    async with AsyncSession(engine, expire_on_commit=False) as db:
        users = (await db.execute(select(User).where(
            User.is_active == True, User.weekly_report_enabled == True, User.role.in_(list(BUILDERS))  # noqa: E712
        ))).scalars().all()
        rows = {r.user_id: r for r in (await db.execute(select(ReportSend).where(ReportSend.week_key == key))).scalars().all()}
        todo = [u for u in users if u.id not in rows or _retryable(rows[u.id], now)]
        result = {"sent": 0, "failed": 0}
        if not todo:
            return result
        ctx = await Ctx().load(db, now)
        for u in todo:
            if not await _claim(engine, key, u, now):
                continue
            try:
                report = BUILDERS[u.role](ctx, u)
                message_id = await brevo.send(u.email, u.full_name, report.subject, report.html, report.text, f"weekly-{u.role.value}")
                await _finish(engine, key, u, "sent", message_id=message_id)
                result["sent"] += 1
            except Exception as e:
                print(f"[weekly-reports] {u.email}: {e!r}")
                await _finish(engine, key, u, "failed", error=str(e)[:500])
                result["failed"] += 1
    print(f"[weekly-reports] {key}: {result}")
    return result


async def run_if_due(engine) -> None:
    if not settings.REPORT_ENABLED or brevo.missing_config():
        return
    now = datetime.now(timezone.utc)
    key = due_key(now)
    if not key:
        return
    # Brevo accepts emails while sending is off and then drops them; don't record anyone as sent. Tried again next tick.
    if not await brevo.sending_enabled():
        print("[weekly-reports] Brevo sending is disabled on this account; nothing sent. Ask Brevo to activate transactional email.")
        return
    await send_week(engine, key, now)


async def build_sample(db: AsyncSession, role: UserRole, now: datetime) -> tuple[User, Report] | None:
    """Admin preview / test: the first active person of this role."""
    ctx = await Ctx().load(db, now)
    user = (await db.execute(select(User).where(User.is_active == True, User.role == role).order_by(User.id).limit(1))).scalar_one_or_none()  # noqa: E712
    return (user, BUILDERS[role](ctx, user)) if user else None
