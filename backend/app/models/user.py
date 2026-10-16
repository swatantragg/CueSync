import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, Integer, String, false
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    WORK_DELEGATOR = "work_delegator"
    REVIEWER = "reviewer"
    EDITOR = "editor"
    VIEWER = "viewer"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, native_enum=False, length=50, values_callable=lambda x: [m.value for m in x]),
        default=UserRole.VIEWER, nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Hidden flag on top of role=admin. Exactly one account (settings.SUPER_ADMIN_EMAIL) holds it;
    # other admins see this user as a plain admin.
    is_super_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), nullable=False)
    # Set when an admin creates the account (or resets its password); cleared once the user picks their own.
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), nullable=False)
    # Last app version whose "what's new" popup this user dismissed.
    last_seen_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
