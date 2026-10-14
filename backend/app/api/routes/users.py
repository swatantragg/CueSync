from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import delete as sa_delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles, require_super_admin
from app.core.security import hash_password
from app.models.audit import AuditLog
from app.models.notification import Notification
from app.models.project import Project
from app.models.society_submission import SocietySubmission
from app.models.user import User, UserRole
from app.models.work_delegation import WorkDelegation
from app.schemas.auth import UserCreate, UserOut, UserUpdate
from app.services.login_tracker import clear_failed_logins
from app.services.super_admin import is_super_admin_email

router = APIRouter()


class RoleUpdateIn(BaseModel):
    role: UserRole


class ActiveUpdateIn(BaseModel):
    is_active: bool


# Deliberately says "protected admin", not "super admin" — the role stays hidden from other admins.
def _guard_super_admin(user: User, action: str) -> None:
    if user.is_super_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"This admin account is protected and cannot be {action}.")


@router.post("/", response_model=UserOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def create_user(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = (await db.execute(select(User).where(User.email == payload.email))).scalar_one_or_none()
    if existing or is_super_admin_email(payload.email):
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


@router.get("/", response_model=list[UserOut])
async def list_users(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(require_roles(UserRole.ADMIN)),
):
    users = (await db.execute(select(User).order_by(User.id))).scalars().all()
    if current.is_super_admin:
        return users
    # Regular admins see the super admin as a plain admin.
    return [UserOut.model_validate(u).model_copy(update={"is_super_admin": False}) for u in users]


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
    _guard_super_admin(user, "changed to another role")
    try:
        user.role = payload.role
        await db.commit()
        await db.refresh(user)
        return user
    except Exception:
        await db.rollback()
        raise HTTPException(500, "Role update failed. Please try again.")


@router.put("/{user_id}", response_model=UserOut, dependencies=[Depends(require_super_admin)])
async def update_user(user_id: int, payload: UserUpdate, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if payload.full_name is not None:
        name = payload.full_name.strip()
        if not name:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Name cannot be empty")
        user.full_name = name

    if payload.email is not None:
        email = payload.email.strip().lower()
        if not email:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email cannot be empty")
        if email != user.email.lower():
            # The super admin is pinned to SUPER_ADMIN_EMAIL; moving either side would lose or leak it.
            if user.is_super_admin or is_super_admin_email(email):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "The super admin email cannot be changed or reused.")
            taken = (await db.execute(
                select(User.id).where(func.lower(User.email) == email, User.id != user_id)
            )).first()
            if taken:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email exists")
            user.email = email

    if payload.password:
        user.hashed_password = hash_password(payload.password)

    try:
        await db.commit()
        await db.refresh(user)
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email exists")
    if payload.password:
        # A fresh password should also lift any lockout from earlier failed attempts.
        await clear_failed_logins(user.email)
    return user


@router.put("/{user_id}/active", response_model=UserOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def toggle_user_active(user_id: int, payload: ActiveUpdateIn, db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404)
    _guard_super_admin(user, "deactivated")
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
    _guard_super_admin(user, "deleted")
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
