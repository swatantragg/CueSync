import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class UsageType(str, enum.Enum):
    BI = "bi"
    BV = "bv"
    FI = "fi"
    FV = "fv"
    OI = "oi"
    CI = "ci"
    THEME = "theme"
    BACKGROUND = "background"
    VISUAL = "visual"
    VOCAL = "vocal"
    INSTRUMENTAL = "instrumental"
    OTHER = "other"


class CueEntry(Base):
    __tablename__ = "cue_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    episode_id: Mapped[int] = mapped_column(ForeignKey("episodes.id", ondelete="CASCADE"), index=True, nullable=False)

    song_title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    usage_type: Mapped[UsageType] = mapped_column(Enum(UsageType, native_enum=False, length=50), default=UsageType.BI)
    duration_sec: Mapped[int] = mapped_column(Integer, nullable=False)
    usage_count: Mapped[int] = mapped_column(Integer, default=1)

    isrc: Mapped[str | None] = mapped_column(String(50))
    song_code: Mapped[str | None] = mapped_column(String(50))
    work_number: Mapped[str | None] = mapped_column(String(50))
    ascap_work_id: Mapped[str | None] = mapped_column(String(50))
    validation_link: Mapped[str | None] = mapped_column(String(500))

    singer: Mapped[str | None] = mapped_column(String(255))
    library_id: Mapped[int | None] = mapped_column(ForeignKey("song_library.id", ondelete="SET NULL"), index=True)

    order_index: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    episode = relationship("Episode", back_populates="cues")
    contributors = relationship("Contributor", back_populates="cue", cascade="all, delete-orphan")


class Contributor(Base):
    __tablename__ = "contributors"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    cue_id: Mapped[int] = mapped_column(ForeignKey("cue_entries.id", ondelete="CASCADE"), index=True, nullable=False)

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)  # composer / author / publisher / arranger
    society: Mapped[str | None] = mapped_column(String(50))  # IPRS / PRS / ASCAP / etc
    share_percent: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    ipi_number: Mapped[str | None] = mapped_column(String(50))
    cae_number: Mapped[str | None] = mapped_column(String(50))

    cue = relationship("CueEntry", back_populates="contributors")
