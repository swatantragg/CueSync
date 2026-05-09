from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SocietySubmission(Base):
    __tablename__ = "society_submissions"

    id: Mapped[int]          = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int]  = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    episode_from: Mapped[int] = mapped_column(Integer, nullable=False)
    episode_to: Mapped[int]   = mapped_column(Integer, nullable=False)
    client: Mapped[str | None] = mapped_column(String(255))
    notes: Mapped[str | None]  = mapped_column(Text)
    submitted_by: Mapped[int]  = mapped_column(ForeignKey("users.id"), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
