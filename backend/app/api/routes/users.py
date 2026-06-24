from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.core.security import hash_password
from app.models.audit import AuditLog
from app.models.notification import Notification
from app.models.project import Project
from app.models.society_submission import SocietySubmission
from app.models.user import User, UserRole
from app.models.work_delegation import WorkDelegation
from app.schemas.auth import UserCreate, UserOut

router = APIRouter()


class RoleUpdateIn(BaseModel):
    role: UserRole


class ActiveUpdateIn(BaseModel):
    is_active: bool


@router.post("/", response_model=UserOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email exists")
    user = User(
        email=payload.email,
        full_name=payload.full_name,
        hashed_password=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


@router.get("/", response_model=list[UserOut], dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def list_users(db: AsyncSession = Depends(get_db)):
    return (await db.execute(select(User).order_by(User.id))).scalars().all()


@router.get("/editors", response_model=list[UserOut])
async def list_editors(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    if current.role not in (UserRole.ADMIN, UserRole.WORK_DELEGATOR):
        raise HTTPException(403)
    rows = (await db.execute(
        select(User).where(User.role == UserRole.EDITOR, User.is_active == True).order_by(User.full_name)
    )).scalars().all()
    return rows


@router.get("/me", response_model=UserOut)
async def me(current: User = Depends(get_current_user)):
    return current


@router.put("/{user_id}/role", response_model=UserOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def update_user_role(user_id: int, payload: RoleUpdateIn, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404)
    try:
        user.role = payload.role
        await db.commit()
        await db.refresh(user)
        return user
    except Exception:
        await db.rollback()
        raise HTTPException(500, "Role update failed. Please try again.")


@router.put("/{user_id}/active", response_model=UserOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def toggle_user_active(user_id: int, payload: ActiveUpdateIn, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404)
    try:
        user.is_active = payload.is_active
        await db.commit()
        await db.refresh(user)
        return user
    except Exception:
        await db.rollback()
        raise HTTPException(500, "Status update failed. Please try again.")


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN)),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current.id:
        raise HTTPException(400, "You cannot delete your own account.")

    # Block deletion when the user owns records we must not silently destroy.
    # projects.created_by_id and society_submissions.submitted_by are NOT NULL.
    project_count = (await db.execute(
        select(func.count()).select_from(Project).where(Project.created_by_id == user_id)
    )).scalar_one()
    submission_count = (await db.execute(
        select(func.count()).select_from(SocietySubmission).where(SocietySubmission.submitted_by == user_id)
    )).scalar_one()
    if project_count or submission_count:
        parts = []
        if project_count:
            parts.append(f"{project_count} project(s)")
        if submission_count:
            parts.append(f"{submission_count} society submission(s)")
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete {user.full_name}: still owns {' and '.join(parts)}. "
            "Reassign or delete those first.",
        )

    try:
        # Remove user-scoped rows that FK users.id (no ON DELETE on these columns).
        await db.execute(sa_delete(Notification).where(Notification.user_id == user_id))
        await db.execute(
            sa_delete(WorkDelegation).where(
                (WorkDelegation.assigned_to == user_id) | (WorkDelegation.created_by == user_id)
            )
        )
        # Keep audit history but detach it from the deleted user (user_id is nullable).
        await db.execute(update(AuditLog).where(AuditLog.user_id == user_id).values(user_id=None))

        await db.delete(user)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Cannot delete {user.full_name}: other records still reference this user.",
        )
    return {"ok": True}
