from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Episode(Base):
    __tablename__ = "episodes"
    __table_args__ = (UniqueConstraint("project_id", "episode_number", name="uq_project_episode"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    episode_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(String(255))
    air_date: Mapped[str | None] = mapped_column(String(50))

    total_duration_sec: Mapped[int | None] = mapped_column(Integer)
    musical_duration_sec: Mapped[int | None] = mapped_column(Integer)
    bg_instrumental_duration_sec: Mapped[int | None] = mapped_column(Integer)
    bg_vocal_duration_sec: Mapped[int | None] = mapped_column(Integer)

    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    rejection_note: Mapped[str | None] = mapped_column(Text)
    review_note: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    project = relationship("Project", back_populates="episodes")
    cues = relationship("CueEntry", back_populates="episode", cascade="all, delete-orphan")
