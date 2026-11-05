"""Send to Society: the cue sheet email a Reviewer sends to IPRS / PRS / ASCAP from the client's Gmail."""
from dataclasses import dataclass, field
from email.message import EmailMessage
from email.utils import formataddr

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client, ClientMailbox
from app.models.episode import Episode
from app.models.project import Project, ProjectType
from app.models.society import Society
from app.models.society_submission import SocietySubmission
from app.models.user import User
from app.services.bulk_exports import bulk_name, bulk_range, society_bulk, work_files_in_range
from app.services.exporters._common import XLSX_MEDIA_TYPE, safe_filename
from app.services.work_files import build_work_file_bulk

ATTACHMENTS = {"iprs": "IPRS sheet", "prs": "PRS sheet", "ascap": "ASCAP sheet", "workfile": "Work file"}

DEFAULT_SUBJECT = "{serial} | {episodes} | {society} Cue Sheet"
DEFAULT_BODY = (
    "Dear {society} Team,\n\n"
    "Please find attached the cue sheets for {serial} ({episodes}).\n\n"
    "Regards,\n{client}"
)
PLACEHOLDERS = ("serial", "episodes", "from_ep", "to_ep", "client", "society")

# Emails that no longer count as sent: they bounced, or bounced and were sent again.
DEAD_MAIL = ("bounced", "resent")
not_dead = or_(SocietySubmission.mail_status.is_(None), SocietySubmission.mail_status.notin_(DEAD_MAIL))


def split_emails(text: str | None) -> list[str]:
    return [e.strip() for e in (text or "").replace(";", ",").split(",") if e.strip()]


def join_emails(emails: list[str]) -> str:
    return ", ".join(emails)


def clean_emails(values: list[str], label: str) -> list[str]:
    """Validated, de-duplicated addresses; 400 naming the first bad one."""
    out: list[str] = []
    for raw in values:
        raw = raw.strip()
        if not raw:
            continue
        try:
            email = validate_email(raw, check_deliverability=False).normalized
        except EmailNotValidError:
            raise HTTPException(400, f'{label}: "{raw}" is not a valid email address.')
        if email.lower() not in (e.lower() for e in out):
            out.append(email)
    return out


def clean_attachments(kinds: list[str]) -> list[str]:
    bad = [k for k in kinds if k not in ATTACHMENTS]
    if bad:
        raise HTTPException(400, f"Unknown attachment: {', '.join(bad)}")
    return [k for k in ATTACHMENTS if k in kinds]


class _Keep(dict):
    def __missing__(self, key):  # unknown {placeholders} stay as typed
        return "{" + key + "}"


def fill(template: str, values: dict) -> str:
    try:
        return template.format_map(_Keep(values))
    except (ValueError, IndexError):  # stray braces: send the text as written
        return template


def episodes_label(proj: Project, from_ep: int, to_ep: int) -> str:
    if proj.type == ProjectType.MOVIE:
        return "Movie"
    return f"Ep {from_ep}" if from_ep == to_ep else f"Ep {from_ep}–{to_ep}"


def _numbers(nums: list[int], limit: int = 10) -> str:
    shown = ", ".join(f"Ep {n}" for n in nums[:limit])
    return shown + (f" and {len(nums) - limit} more" if len(nums) > limit else "")


@dataclass
class Draft:
    project: Project
    from_ep: int
    to_ep: int
    client: Client | None
    mailbox: ClientMailbox | None
    society: Society | None
    episodes: str
    problems: list[str] = field(default_factory=list)
    already_sent: list[dict] = field(default_factory=list)
    work_files: int = 0

    @property
    def values(self) -> dict:
        return {
            "serial": self.project.title, "episodes": self.episodes,
            "from_ep": self.from_ep, "to_ep": self.to_ep,
            "client": self.client.name if self.client else "",
            "society": self.society.name if self.society else "",
        }

    def filename(self, kind: str) -> str:
        label = "WorkFile" if kind == "workfile" else kind.upper()
        return safe_filename(bulk_name(self.project, label, self.from_ep, self.to_ep))


async def make_draft(db: AsyncSession, project_id: int, from_ep: int, to_ep: int,
                     client_id: int | None, society_id: int | None) -> Draft:
    """Everything the email needs, plus the reasons it can't be sent yet (`problems`)."""
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Serial or movie not found")
    if from_ep > to_ep:
        raise HTTPException(400, "Episode From must be ≤ Episode To.")
    client = await db.get(Client, client_id) if client_id else None
    society = await db.get(Society, society_id) if society_id else None
    mailbox = (await db.execute(
        select(ClientMailbox).where(ClientMailbox.client_id == client.id)
    )).scalar_one_or_none() if client else None
    d = Draft(proj, from_ep, to_ep, client, mailbox, society, episodes_label(proj, from_ep, to_ep))

    status = dict((await db.execute(
        select(Episode.episode_number, Episode.status).where(
            Episode.project_id == proj.id, Episode.episode_number.between(from_ep, to_ep))
    )).all())
    missing = [n for n in range(from_ep, to_ep + 1) if n not in status]
    unapproved = sorted(n for n, s in status.items() if s != "approved")
    if missing:
        d.problems.append(f"No cue sheet yet for {_numbers(missing)}.")
    if unapproved:
        d.problems.append(f"Not approved yet: {_numbers(unapproved)}. Only approved episodes can be sent.")

    if not client:
        d.problems.append("Pick the client whose Gmail sends this email.")
    elif not client.is_active:
        d.problems.append(f"{client.name} is deactivated.")
    elif not mailbox:
        d.problems.append(f"Connect {client.name}'s Gmail first (Clients tab → Connect Gmail).")
    elif mailbox.status != "connected":
        d.problems.append(f"{client.name}'s Gmail needs reconnecting (Clients tab → Reconnect).")

    if not society:
        d.problems.append("Pick the society to send to.")
    elif not society.is_active:
        d.problems.append(f"{society.name} is deactivated.")
    elif not split_emails(society.to_emails):
        d.problems.append(f"{society.name} has no email address. Add one under Societies.")

    d.work_files = len(await work_files_in_range(db, proj.id, from_ep, to_ep))

    if society:
        earlier = (await db.execute(
            select(SocietySubmission).where(
                SocietySubmission.project_id == proj.id,
                SocietySubmission.society_id == society.id,
                SocietySubmission.sent_via.in_(("gmail", "gmail_detected")),
                not_dead,
                SocietySubmission.episode_from <= to_ep,
                SocietySubmission.episode_to >= from_ep,
            ).order_by(SocietySubmission.mail_sent_at.desc())
        )).scalars().all()
        senders = {u.id: u.full_name for u in (await db.execute(
            select(User).where(User.id.in_({s.submitted_by for s in earlier}))
        )).scalars().all()} if earlier else {}
        d.already_sent = [{
            "id": s.id,
            "episodes": episodes_label(proj, s.episode_from, s.episode_to),
            "sent_at": s.mail_sent_at.isoformat() if s.mail_sent_at else None,
            "sent_by": senders.get(s.submitted_by),
            "mail_from": s.mail_from,
        } for s in earlier]
    return d


async def build_files(db: AsyncSession, d: Draft, kinds: list[str]) -> list[tuple[str, bytes]]:
    files: list[tuple[str, bytes]] = []
    sheets = [k for k in kinds if k != "workfile"]
    if sheets:
        proj, eps, total = await bulk_range(db, d.project.id, d.from_ep, d.to_ep)
        files += [(d.filename(k), society_bulk(k, proj, eps, total)) for k in sheets]
    if "workfile" in kinds:
        wfs = await work_files_in_range(db, d.project.id, d.from_ep, d.to_ep)
        if not wfs:
            raise HTTPException(400, f"No work files uploaded for {d.episodes}. Untick Work file or upload them first.")
        files.append((d.filename("workfile"), build_work_file_bulk(wfs)))
    return files


def build_message(d: Draft, to: list[str], cc: list[str], bcc: list[str], subject: str, body: str,
                  files: list[tuple[str, bytes]]) -> bytes:
    msg = EmailMessage()
    msg["From"] = formataddr((d.client.name, d.mailbox.email))
    msg["To"] = join_emails(to)
    if cc:
        msg["Cc"] = join_emails(cc)
    if bcc:
        msg["Bcc"] = join_emails(bcc)  # Gmail delivers to these and drops the header
    msg["Subject"] = subject
    # Lets a later reply/Sent-folder check match this email to its Submitted Cue entry.
    msg["X-CueSync-Ref"] = f"project-{d.project.id};ep-{d.from_ep}-{d.to_ep};society-{d.society.id}"
    msg.set_content(body)
    maintype, subtype = XLSX_MEDIA_TYPE.split("/", 1)
    for name, data in files:
        msg.add_attachment(data, maintype=maintype, subtype=subtype, filename=name)
    return msg.as_bytes()
