from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class ReportSend(Base):
    """One person's weekly report. The unique row is the claim that keeps gunicorn workers (and restarts)
    from emailing anyone twice for the same week."""
    __tablename__ = "report_sends"
    __table_args__ = (UniqueConstraint("week_key", "user_id"),)

    id: Mapped[int]             = mapped_column(Integer, primary_key=True)
    week_key: Mapped[str]       = mapped_column(String(10), nullable=False, index=True)  # e.g. 2026-W45
    user_id: Mapped[int]        = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[str]           = mapped_column(String(50), nullable=False)
    email: Mapped[str]          = mapped_column(String(255), nullable=False)
    status: Mapped[str]         = mapped_column(String(20), default="sending", nullable=False)  # sending / sent / failed
    attempts: Mapped[int]       = mapped_column(Integer, default=1, nullable=False)
    error: Mapped[str | None]   = mapped_column(Text)
    message_id: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
