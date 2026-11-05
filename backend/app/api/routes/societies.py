from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.society import Society
from app.models.society_submission import SocietySubmission
from app.models.user import User, UserRole
from app.services.audit import log_activity
from app.services.clients import name_key
from app.services.society_mail import (
    ATTACHMENTS, DEFAULT_BODY, DEFAULT_SUBJECT, PLACEHOLDERS,
    clean_attachments, clean_emails, join_emails, split_emails,
)

router = APIRouter()

EDIT_ROLES = (UserRole.ADMIN, UserRole.REVIEWER)


class SocietyIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    to_emails: list[str]
    cc_emails: list[str] = []
    bcc_emails: list[str] = []
    attachments: list[str] = []
    subject_template: str | None = None
    body_template: str | None = None
    notes: str | None = None


class SocietyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    to_emails: list[str] | None = None
    cc_emails: list[str] | None = None
    bcc_emails: list[str] | None = None
    attachments: list[str] | None = None
    subject_template: str | None = None
    body_template: str | None = None
    notes: str | None = None
    is_active: bool | None = None


def _guess_attachments(name: str) -> list[str]:
    """IPRS → IPRS sheet, etc. Used when a society is added without choosing files."""
    key = name_key(name)
    return [k for k in ("iprs", "prs", "ascap") if key.startswith(k)] or ["iprs"]


async def _rows(db: AsyncSession, societies: list[Society]) -> list[dict]:
    sent = dict((await db.execute(
        select(SocietySubmission.society_id, func.count())
        .where(SocietySubmission.society_id.isnot(None)).group_by(SocietySubmission.society_id)
    )).all())
    return [{
        "id": s.id,
        "name": s.name,
        "to_emails": split_emails(s.to_emails),
        "cc_emails": split_emails(s.cc_emails),
        "bcc_emails": split_emails(s.bcc_emails),
        "attachments": [a for a in (s.attachments or "").split(",") if a],
        "subject_template": s.subject_template or DEFAULT_SUBJECT,
        "body_template": s.body_template or DEFAULT_BODY,
        "notes": s.notes,
        "is_active": s.is_active,
        "submissions": sent.get(s.id, 0),
    } for s in societies]


async def _get(db: AsyncSession, sid: int) -> Society:
    s = await db.get(Society, sid)
    if not s:
        raise HTTPException(404, "Society not found")
    return s


async def _check_name(db: AsyncSession, name: str, own_id: int | None = None) -> str:
    key = name_key(name)
    if not key:
        raise HTTPException(400, "Enter a society name with letters or numbers.")
    other = (await db.execute(select(Society).where(Society.name_key == key))).scalar_one_or_none()
    if other and other.id != own_id:
        raise HTTPException(409, f'"{other.name}" is already in the society list.')
    return key


def _to_list(values: list[str]) -> list[str]:
    to = clean_emails(values, "To")
    if not to:
        raise HTTPException(400, "Add at least one email address the society receives cue sheets at.")
    return to


@router.get("/")
async def list_societies(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    rows = (await db.execute(select(Society).order_by(Society.name))).scalars().all()
    return await _rows(db, rows)


@router.get("/options")
async def society_options(_: User = Depends(get_current_user)):
    """Attachment kinds, placeholders and default template for the society form."""
    return {
        "attachments": [{"key": k, "label": v} for k, v in ATTACHMENTS.items()],
        "placeholders": list(PLACEHOLDERS),
        "subject_template": DEFAULT_SUBJECT,
        "body_template": DEFAULT_BODY,
    }


@router.post("/", dependencies=[Depends(require_roles(*EDIT_ROLES))])
async def create_society(payload: SocietyIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    name = payload.name.strip()
    s = Society(
        name=name, name_key=await _check_name(db, name),
        to_emails=join_emails(_to_list(payload.to_emails)),
        cc_emails=join_emails(clean_emails(payload.cc_emails, "CC")) or None,
        bcc_emails=join_emails(clean_emails(payload.bcc_emails, "BCC")) or None,
        attachments=",".join(clean_attachments(payload.attachments) or _guess_attachments(name)),
        subject_template=(payload.subject_template or "").strip() or DEFAULT_SUBJECT,
        body_template=(payload.body_template or "").strip() or DEFAULT_BODY,
        notes=(payload.notes or "").strip() or None,
        created_by=current.id,
    )
    db.add(s)
    await db.flush()
    await log_activity(db, current.id, "society_add", "society", s.id, f"{s.name} · {s.to_emails}")
    await db.commit()
    return (await _rows(db, [s]))[0]


@router.put("/{sid}", dependencies=[Depends(require_roles(*EDIT_ROLES))])
async def update_society(sid: int, payload: SocietyUpdate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    s = await _get(db, sid)
    fields = payload.model_fields_set
    changes = []
    if "name" in fields and payload.name and payload.name.strip() != s.name:
        name = payload.name.strip()
        s.name_key = await _check_name(db, name, s.id)
        changes.append(f"renamed {s.name} → {name}")
        s.name = name
    if "to_emails" in fields and payload.to_emails is not None:
        to = join_emails(_to_list(payload.to_emails))
        if to != s.to_emails:
            changes.append(f"to {to}")
            s.to_emails = to
    if "cc_emails" in fields:
        s.cc_emails = join_emails(clean_emails(payload.cc_emails or [], "CC")) or None
    if "bcc_emails" in fields:
        s.bcc_emails = join_emails(clean_emails(payload.bcc_emails or [], "BCC")) or None
    if "attachments" in fields and payload.attachments is not None:
        s.attachments = ",".join(clean_attachments(payload.attachments))
    if "subject_template" in fields:
        s.subject_template = (payload.subject_template or "").strip() or DEFAULT_SUBJECT
    if "body_template" in fields:
        s.body_template = (payload.body_template or "").strip() or DEFAULT_BODY
    if "notes" in fields:
        s.notes = (payload.notes or "").strip() or None
    if "is_active" in fields and payload.is_active is not None and payload.is_active != s.is_active:
        s.is_active = payload.is_active
        changes.append("activated" if s.is_active else "deactivated")
    await log_activity(db, current.id, "society_edit", "society", s.id, f"{s.name}" + (" · " + ", ".join(changes) if changes else ""))
    await db.commit()
    return (await _rows(db, [s]))[0]


@router.delete("/{sid}", dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def delete_society(sid: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    s = await _get(db, sid)
    used = (await db.execute(
        select(func.count()).select_from(SocietySubmission).where(SocietySubmission.society_id == s.id)
    )).scalar()
    if used:
        raise HTTPException(409, f"{s.name} has {used} sent submission(s). Deactivate it instead.")
    await log_activity(db, current.id, "society_remove", "society", s.id, s.name)
    await db.delete(s)
    await db.commit()
    return {"ok": True}
