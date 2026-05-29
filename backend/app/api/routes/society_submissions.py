from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.audit import AuditLog
from app.models.notification import Notification
from app.models.project import Project
from app.models.society_submission import SocietySubmission
from app.models.user import User, UserRole
from app.models.work_delegation import WorkDelegation

router = APIRouter()

_IPRS_ROLES = (UserRole.ADMIN, UserRole.REVIEWER)


class SubmissionCreate(BaseModel):
    project_id: int
    episode_from: int
    episode_to: int
    client: str | None = None
    notes: str | None = None


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
        "notes":                 s.notes,
        "submitted_by":          s.submitted_by,
        "submitted_by_name":     user.full_name if user else None,
        "submitted_at":          s.submitted_at.isoformat() if s.submitted_at else None,
        "submitted_to_iprs":     s.submitted_to_iprs,
        "submitted_to_iprs_at":  s.submitted_to_iprs_at.isoformat() if s.submitted_to_iprs_at else None,
        "accepted_by_iprs":      s.accepted_by_iprs,
        "accepted_by_iprs_at":   s.accepted_by_iprs_at.isoformat() if s.accepted_by_iprs_at else None,
        "followup_count":        s.followup_count or 0,
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


@router.post("/")
async def create_submission(
    payload: SubmissionCreate,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if payload.episode_from > payload.episode_to:
        raise HTTPException(400, "episode_from must be ≤ episode_to")

    proj = await db.get(Project, payload.project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    sub = SocietySubmission(
        project_id=payload.project_id,
        episode_from=payload.episode_from,
        episode_to=payload.episode_to,
        client=payload.client,
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
            f"{' Client: ' + payload.client if payload.client else ''}"
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
    """Return unique non-null client names from delegations + past submissions."""
    deleg_clients = (await db.execute(
        select(WorkDelegation.client).where(WorkDelegation.client.isnot(None)).distinct()
    )).scalars().all()
    sub_clients = (await db.execute(
        select(SocietySubmission.client).where(SocietySubmission.client.isnot(None)).distinct()
    )).scalars().all()
    merged = sorted({c.strip() for c in deleg_clients + sub_clients if c and c.strip()})
    return merged


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
