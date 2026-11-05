from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import require_roles, require_super_admin
from app.models.report_send import ReportSend
from app.models.user import User, UserRole
from app.services import brevo, weekly_reports

router = APIRouter()

ADMIN = require_roles(UserRole.ADMIN)
Role = Literal["editor", "work_delegator", "reviewer", "admin"]


class TestIn(BaseModel):
    role: Role


class RecipientIn(BaseModel):
    enabled: bool


@router.get("/status", dependencies=[Depends(ADMIN)])
async def report_status(db: AsyncSession = Depends(get_db)):
    now = datetime.now(timezone.utc)
    problem, next_at = None, None
    try:
        next_at = weekly_reports.next_run(now).isoformat()
    except ValueError as e:
        problem = str(e)
    last_key = (await db.execute(
        select(ReportSend.week_key).order_by(ReportSend.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    last = None
    if last_key:
        counts = dict((await db.execute(
            select(ReportSend.status, func.count()).where(ReportSend.week_key == last_key).group_by(ReportSend.status)
        )).all())
        errors = (await db.execute(
            select(ReportSend.email, ReportSend.error).where(ReportSend.week_key == last_key, ReportSend.status == "failed").limit(3)
        )).all()
        last = {"week": last_key, **{k: counts.get(k, 0) for k in ("sent", "failed", "sending")},
                "errors": [{"email": e, "error": m} for e, m in errors]}
    # What Brevo itself says: "sent" below only means Brevo took the email.
    sending, stats, brevo_error = None, None, None
    if not brevo.missing_config():
        try:
            sending = await brevo.sending_enabled()
            stats = await brevo.delivery_stats()
        except brevo.BrevoError as e:
            brevo_error = str(e)
    return {
        "enabled": settings.REPORT_ENABLED,
        "sending_enabled": sending,
        "delivery": stats,
        "brevo_error": brevo_error,
        "missing": brevo.missing_config(),
        "sender": settings.BREVO_SENDER_EMAIL,
        "sender_name": settings.BREVO_SENDER_NAME,
        "day": settings.REPORT_DAY.strip().title(),
        "time": settings.REPORT_TIME,
        "timezone": settings.REPORT_TIMEZONE,
        "next_run": next_at,
        "problem": problem,
        "last": last,
    }


async def _sample(db: AsyncSession, role: Role):
    sample = await weekly_reports.build_sample(db, UserRole(role), datetime.now(timezone.utc))
    if not sample:
        raise HTTPException(404, "There is no active user with this role.")
    return sample


@router.get("/preview", dependencies=[Depends(ADMIN)])
async def preview_report(role: Role, db: AsyncSession = Depends(get_db)):
    user, report = await _sample(db, role)
    return {"subject": report.subject, "html": report.html, "for_name": user.full_name}


@router.post("/test")
async def test_report(payload: TestIn, db: AsyncSession = Depends(get_db), current: User = Depends(ADMIN)):
    """Sends a sample report to the signed-in admin; nobody else receives anything."""
    missing = brevo.missing_config()
    if missing:
        raise HTTPException(400, "Brevo is not set up on the server yet. Missing: " + ", ".join(missing))
    user, report = await _sample(db, payload.role)
    try:
        if not await brevo.sending_enabled():
            raise HTTPException(409, "Brevo has sending turned off on this account, so nothing would be delivered. "
                                     "Authenticate your domain in Brevo and ask their support to activate transactional email.")
        await brevo.send(current.email, current.full_name, f"[Test] {report.subject}", report.html, report.text, "weekly-test")
    except brevo.BrevoError as e:
        raise HTTPException(502, str(e))
    return {"ok": True, "to": current.email, "for_name": user.full_name}


# ── Who receives it (super admin only; other admins don't know this exists) ──
def _recipient(u: User) -> dict:
    return {"id": u.id, "full_name": u.full_name, "email": u.email, "role": u.role.value, "enabled": u.weekly_report_enabled}


@router.get("/recipients", dependencies=[Depends(require_super_admin)])
async def report_recipients(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(User).where(User.is_active == True, User.role.in_(list(weekly_reports.BUILDERS)))  # noqa: E712
        .order_by(func.lower(User.full_name))
    )).scalars().all()
    return [_recipient(u) for u in rows]


@router.put("/recipients/{user_id}", dependencies=[Depends(require_super_admin)])
async def set_report_recipient(user_id: int, payload: RecipientIn, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user or not user.is_active or user.role not in weekly_reports.BUILDERS:
        raise HTTPException(404, "This person doesn't receive weekly reports.")
    user.weekly_report_enabled = payload.enabled
    await db.commit()
    await db.refresh(user)
    return _recipient(user)
