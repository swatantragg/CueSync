from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SocietySubmission(Base):
    __tablename__ = "society_submissions"

    id: Mapped[int]           = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int]   = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    episode_from: Mapped[int] = mapped_column(Integer, nullable=False)
    episode_to: Mapped[int]   = mapped_column(Integer, nullable=False)
    client: Mapped[str | None]  = mapped_column(String(255))
    notes: Mapped[str | None]   = mapped_column(Text)
    submitted_by: Mapped[int]   = mapped_column(ForeignKey("users.id"), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    # IPRS lifecycle tracking
    submitted_to_iprs: Mapped[bool]           = mapped_column(Boolean, default=False, nullable=False)
    submitted_to_iprs_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by_iprs: Mapped[bool]            = mapped_column(Boolean, default=False, nullable=False)
    accepted_by_iprs_at: Mapped[datetime | None]  = mapped_column(DateTime(timezone=True))

    # Followup notification tracking
    last_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    followup_count: Mapped[int]               = mapped_column(Integer, default=0, nullable=False)
