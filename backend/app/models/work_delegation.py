from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WorkDelegation(Base):
    __tablename__ = "work_delegations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True)
    serial_name: Mapped[str] = mapped_column(String(500), nullable=False)
    work_type: Mapped[str] = mapped_column(String(100), default="TV Cue Sheet")
    client: Mapped[str | None] = mapped_column(String(255))
    channel: Mapped[str | None] = mapped_column(String(255))
    episode_range: Mapped[str | None] = mapped_column(String(255))
    week_target: Mapped[int | None] = mapped_column(Integer)
    completed: Mapped[int | None] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(50), default="pending")  # pending/in_progress/completed
    notes: Mapped[str | None] = mapped_column(Text)
    assigned_to: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
