from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.audit import AuditLog
from app.models.project import Project
from app.models.society_submission import SocietySubmission
from app.models.user import User
from app.models.work_delegation import WorkDelegation

router = APIRouter()


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
        "id":                s.id,
        "project_id":        s.project_id,
        "project_title":     proj.title if proj else None,
        "episode_from":      s.episode_from,
        "episode_to":        s.episode_to,
        "client":            s.client,
        "notes":             s.notes,
        "submitted_by":      s.submitted_by,
        "submitted_by_name": user.full_name if user else None,
        "submitted_at":      s.submitted_at.isoformat() if s.submitted_at else None,
    }


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
