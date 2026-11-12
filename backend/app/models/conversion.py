from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class Conversion(Base):
    """One episode's (or the movie's) cue sheet read from an uploaded IPRS / PRS / ASCAP file.

    Kept apart from `episodes`: nobody edited or approved it in CueSync, so it stays out of the editor
    workflow and its statistics. The IPRS, PRS and ASCAP sheets are rebuilt from `data` on every download.
    Movies use episode_number 1.
    """
    __tablename__ = "conversions"
    __table_args__ = (UniqueConstraint("project_id", "episode_number", name="uq_conversion_project_episode"),)

    id: Mapped[int]             = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int]     = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)
    client: Mapped[str | None]    = mapped_column(String(255))
    source_format: Mapped[str]    = mapped_column(String(10), nullable=False)  # iprs / prs / ascap
    source_filename: Mapped[str | None] = mapped_column(String(255))
    data: Mapped[str]             = mapped_column(Text, nullable=False)  # JSON: one parsed episode (services/conversion_parser)
    cue_count: Mapped[int]        = mapped_column(Integer, default=0, nullable=False)
    duration_sec: Mapped[int | None] = mapped_column(Integer)
    converted_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    converted_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)
