from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class Society(Base):
    """A society cue sheets are emailed to (IPRS, PRS, ASCAP…), with the addresses and template used."""
    __tablename__ = "societies"

    id: Mapped[int]                = mapped_column(Integer, primary_key=True)
    name: Mapped[str]              = mapped_column(String(100), nullable=False)
    name_key: Mapped[str]          = mapped_column(String(100), nullable=False, unique=True, index=True)
    # Comma-separated address lists; cc/bcc are the defaults the Reviewer can change before sending.
    to_emails: Mapped[str]         = mapped_column(Text, nullable=False)
    cc_emails: Mapped[str | None]  = mapped_column(Text)
    bcc_emails: Mapped[str | None] = mapped_column(Text)
    # Files attached by default: comma-separated iprs / prs / ascap / workfile.
    attachments: Mapped[str]       = mapped_column(String(100), default="", nullable=False)
    subject_template: Mapped[str | None] = mapped_column(Text)
    body_template: Mapped[str | None]    = mapped_column(Text)
    notes: Mapped[str | None]      = mapped_column(Text)
    is_active: Mapped[bool]        = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
