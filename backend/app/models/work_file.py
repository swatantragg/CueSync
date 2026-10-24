from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, LargeBinary, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class WorkFile(Base):
    """Editor-uploaded work file (Source 1 format), one per serial episode number.

    Keyed by episode number rather than episode id so it can be uploaded before the
    rough sheet creates the episode, and survives the episode being re-imported.
    """
    __tablename__ = "work_files"
    __table_args__ = (UniqueConstraint("project_id", "episode_number", name="uq_work_file_project_episode"),)

    id: Mapped[int]             = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int]     = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    filename: Mapped[str]       = mapped_column(String(255), nullable=False)
    content: Mapped[bytes]      = mapped_column(LargeBinary, nullable=False)
    cue_count: Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    uploaded_by: Mapped[int | None]  = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_at: Mapped[datetime]    = mapped_column(DateTime(timezone=True), default=utcnow)
