"""Notify Editor: the email a Work Delegator sends an editor from their own Gmail, listing the reasons and
the pending work. The list is rebuilt from live data when sending, so it can't go stale in an open window."""
import html
from dataclasses import dataclass
from email.message import EmailMessage
from email.utils import formataddr

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.user_mailbox import UserMailbox
from app.services import insights


@dataclass
class Draft:
    editor: User
    reasons: list[str]
    work: list[dict]
    period_label: str
    subject: str
    message: str


def first_name(user: User) -> str:
    return (user.full_name or user.email).strip().split()[0]


def _totals(work: list[dict]) -> dict:
    return {k: sum(r[k] for r in work) for k in ("to_do", "rejected", "changes", "overdue")}


async def make_draft(db: AsyncSession, sender: User, editor: User, period: str) -> Draft:
    ps = insights.periods()
    p = ps[period]
    d = await insights._Data().load(db, min(x.start for x in ps.values()))
    _, rating = insights.rate_editor(d, editor, p)
    work = insights.pending_rows(insights.work_rows(d, editor.id, open_only=True))
    t = _totals(work)
    left = t["to_do"] + t["rejected"] + t["changes"]
    subject = (f"Pending work on CueSync: {left} episode{'' if left == 1 else 's'} to complete"
               if left else "CueSync: your work this week")
    lines = [f"Hi {first_name(editor)},", ""]
    if rating["reasons"]:
        lines += [f"This needs your attention ({p.label}):"] + [f"- {r}" for r in rating["reasons"]] + [""]
    if t["overdue"]:
        lines += [f"{t['overdue']} episode{' is' if t['overdue'] == 1 else 's are'} past the due date. Please finish {'it' if t['overdue'] == 1 else 'them'} first.", ""]
    lines += ["Please complete the pending work listed below and submit it for review." if left
              else "You have nothing pending right now.", "", "Regards,", sender.full_name]
    return Draft(editor, rating["reasons"], work, p.label, subject, "\n".join(lines))


def work_text(work: list[dict]) -> str:
    if not work:
        return ""
    lines, client = ["PENDING WORK"], None
    for r in work:
        if r["client"] != client:
            client = r["client"]
            lines += ["", client]
        lines.append(f"  {r['title']}")
        for label, eps in (("To do", r["to_do_eps"]), ("Rejected, fix and resubmit", r["rejected_eps"]),
                           ("Changes asked", r["changes_eps"]), ("Overdue", r["overdue_eps"])):
            if eps:
                lines.append(f"    {label}: {eps}")
        lines += [f"    Note on Ep {n['episode']}: {n['note']}" for n in r["notes"]]
    return "\n".join(lines)


def work_html(work: list[dict]) -> str:
    if not work:
        return ""
    esc = html.escape
    th = "text-align:left;padding:8px 10px;font-size:12px;color:#4A7A63;border-bottom:2px solid #ACE1AF;"
    td = "padding:8px 10px;font-size:13px;color:#1B3A2D;border-bottom:1px solid #E0FBE2;vertical-align:top;"
    rows = []
    for r in work:
        detail = "".join(
            f'<div style="margin-top:3px;font-size:12px;color:{c};"><b>{label}:</b> {esc(eps)}</div>'
            for label, eps, c in (("To do", r["to_do_eps"], "#4A7A63"), ("Rejected", r["rejected_eps"], "#C62828"),
                                  ("Changes asked", r["changes_eps"], "#1565C0"), ("Overdue", r["overdue_eps"], "#BF360C")) if eps)
        notes = "".join(f'<div style="margin-top:3px;font-size:12px;color:#4A7A63;"><i>Ep {n["episode"]}: {esc(n["note"])}</i></div>' for n in r["notes"])
        rows.append(f'<tr><td style="{td}">{esc(r["client"])}</td>'
                    f'<td style="{td}"><b>{esc(r["title"])}</b>{detail}{notes}</td>'
                    f'<td style="{td}text-align:right;"><b>{r["to_do"] + r["rejected"] + r["changes"]}</b></td></tr>')
    return ('<h3 style="font-size:15px;color:#1B3A2D;margin:20px 0 8px;">Pending work</h3>'
            '<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;width:100%;max-width:640px;">'
            f'<tr><th style="{th}">Client</th><th style="{th}">Serial / movie</th><th style="{th}text-align:right;">Pending</th></tr>'
            f'{"".join(rows)}</table>')


def build_message(sender: User, mailbox: UserMailbox, editor: User, subject: str, message: str, work: list[dict]) -> bytes:
    msg = EmailMessage()
    msg["From"] = formataddr((sender.full_name, mailbox.email))
    msg["To"] = formataddr((editor.full_name, editor.email))
    msg["Subject"] = subject
    msg["X-CueSync-Ref"] = f"editor-notice;editor-{editor.id}"
    msg.set_content(f"{message}\n\n{work_text(work)}".strip() + "\n")
    body = html.escape(message).replace("\n", "<br>")
    msg.add_alternative(
        f'<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1B3A2D;">{body}{work_html(work)}</div>',
        subtype="html",
    )
    return msg.as_bytes()


async def get_mailbox(db: AsyncSession, user_id: int) -> UserMailbox | None:
    return (await db.execute(select(UserMailbox).where(UserMailbox.user_id == user_id))).scalar_one_or_none()
