from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import require_roles
from app.models.user import User, UserRole
from app.services import insights

router = APIRouter()

ADMIN = [Depends(require_roles(UserRole.ADMIN))]
WD = [Depends(require_roles(UserRole.ADMIN, UserRole.WORK_DELEGATOR))]
REVIEWER = [Depends(require_roles(UserRole.ADMIN, UserRole.REVIEWER))]


@router.get("/dashboard", dependencies=ADMIN)
async def admin_dashboard(db: AsyncSession = Depends(get_db)):
    """Admin Dashboard: rankings for this week / month / year, under-performers, clients and the work pipeline."""
    return await insights.dashboard(db)


@router.get("/wd-dashboard", dependencies=WD)
async def wd_dashboard(db: AsyncSession = Depends(get_db)):
    """Work Delegator Dashboard: top editors, ordering clients, pending work per client and editors behind."""
    return await insights.wd_dashboard(db)


@router.get("/editor-dashboard")
async def editor_dashboard(db: AsyncSession = Depends(get_db), current: User = Depends(require_roles(UserRole.EDITOR))):
    """Editor Dashboard: client-wise allotted work, progress by week / month / year and emails from the Work Delegator."""
    return await insights.editor_dashboard(db, current)


@router.get("/reviewer-calendar", dependencies=REVIEWER)
async def reviewer_calendar(
    year: int = Query(default_factory=lambda: datetime.now(insights.IST).year, ge=2020, le=2100),
    client_id: int | None = None,
    society_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Month by month: episodes submitted, approved, rejected, changes asked, waiting; emails sent, replied, failed."""
    return await insights.reviewer_calendar(db, year, client_id, society_id)


@router.get("/calendar", dependencies=WD)
async def quarter_calendar(
    year: int = Query(default_factory=lambda: datetime.now(insights.IST).year, ge=2020, le=2100),
    client_id: int | None = None,
    society_id: int | None = None,
    db: AsyncSession = Depends(get_db),
):
    """Month by month: episodes allotted, approved, emailed to societies and still pending."""
    return await insights.calendar(db, year, client_id, society_id)
