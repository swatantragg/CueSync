"""Keeps exactly one hidden super admin: the account at settings.SUPER_ADMIN_EMAIL."""
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User, UserRole


def super_admin_email() -> str:
    return settings.SUPER_ADMIN_EMAIL.strip().lower()


def is_super_admin_email(email: str | None) -> bool:
    return (email or "").strip().lower() == super_admin_email()


async def ensure_super_admin(db: AsyncSession) -> str:
    email = super_admin_email()

    # Strip the flag from anyone else so there is only ever one super admin.
    await db.execute(
        update(User)
        .where(User.is_super_admin == True, func.lower(User.email) != email)  # noqa: E712
        .values(is_super_admin=False)
    )

    user = (await db.execute(select(User).where(func.lower(User.email) == email))).scalar_one_or_none()
    if user:
        user.is_super_admin = True
        user.role = UserRole.ADMIN
        user.is_active = True
        return f"promoted existing account {email}"

    if not settings.SUPER_ADMIN_PASSWORD:
        return f"{email} not found and SUPER_ADMIN_PASSWORD unset — not created"

    db.add(User(
        email=email,
        full_name="Super Admin",
        hashed_password=hash_password(settings.SUPER_ADMIN_PASSWORD),
        role=UserRole.ADMIN,
        is_super_admin=True,
    ))
    return f"created {email}"
