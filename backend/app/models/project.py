import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProjectType(str, enum.Enum):
    MOVIE = "MOVIE"
    SERIAL = "SERIAL"


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    type: Mapped[ProjectType] = mapped_column(Enum(ProjectType), nullable=False)
    language: Mapped[str | None] = mapped_column(String(100))
    genre: Mapped[str | None] = mapped_column(String(100))
    production_company: Mapped[str | None] = mapped_column(String(255))
    director: Mapped[str | None] = mapped_column(String(255))
    producer: Mapped[str | None] = mapped_column(String(255))
    actors: Mapped[str | None] = mapped_column(Text)
    production_year: Mapped[int | None] = mapped_column(Integer)
    channel_name: Mapped[str | None] = mapped_column(String(255))
    country: Mapped[str | None] = mapped_column(String(100))
    total_episodes: Mapped[int | None] = mapped_column(Integer)
    bg_music_composer: Mapped[str | None] = mapped_column(String(255))
    submitted_by: Mapped[str | None] = mapped_column(String(255))

    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    episodes = relationship("Episode", back_populates="project", cascade="all, delete-orphan")
