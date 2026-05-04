from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SongLibrary(Base):
    __tablename__ = "song_library"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    isrc: Mapped[str | None] = mapped_column(String(50), index=True)
    song_code: Mapped[str | None] = mapped_column(String(50))
    work_number: Mapped[str | None] = mapped_column(String(50))
    ascap_work_id: Mapped[str | None] = mapped_column(String(50))
    singer: Mapped[str | None] = mapped_column(String(255))
    contributors_json: Mapped[str | None] = mapped_column(Text)
    alt_titles: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class ContributorLibrary(Base):
    __tablename__ = "contributor_library"
    __table_args__ = (UniqueConstraint("name", "role", name="uq_contrib_name_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(50), nullable=False)
    society: Mapped[str | None] = mapped_column(String(50))
    ipi_number: Mapped[str | None] = mapped_column(String(50))
    cae_number: Mapped[str | None] = mapped_column(String(50))
    alt_names: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class MemberDirectory(Base):
    """IPRS member list: PA (real name) + PP/PG (stage names) grouped by BASE NO.
    PA = legal/registered name; PP/PG = performing/stage names.
    pp_names_json is a JSON array of alternate/stage names."""
    __tablename__ = "member_directory"
    __table_args__ = (
        UniqueConstraint("base_no", name="uq_member_base_no"),
        Index("ix_member_pa_name", "pa_name"),
        Index("ix_member_ipi", "ipi_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    base_no: Mapped[str] = mapped_column(String(50), nullable=False)
    pa_name: Mapped[str] = mapped_column(String(255), nullable=False)
    ipi_number: Mapped[str | None] = mapped_column(String(50))
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="Composer")
    pp_names_json: Mapped[str | None] = mapped_column(Text)
