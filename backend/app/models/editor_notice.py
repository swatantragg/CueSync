from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class EditorNotice(Base):
    """An email a Work Delegator sent an editor from their own Gmail about pending work. The editor sees it
    on their Dashboard; the reasons and work list are kept as they were when it was sent."""
    __tablename__ = "editor_notices"

    id: Mapped[int]                 = mapped_column(Integer, primary_key=True)
    editor_id: Mapped[int]          = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    sent_by: Mapped[int | None]     = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    sent_by_name: Mapped[str]       = mapped_column(String(255), nullable=False)
    from_email: Mapped[str]         = mapped_column(String(255), nullable=False)
    to_email: Mapped[str]           = mapped_column(String(255), nullable=False)
    subject: Mapped[str]            = mapped_column(Text, nullable=False)
    message: Mapped[str]            = mapped_column(Text, nullable=False)
    reasons_json: Mapped[str]       = mapped_column(Text, default="[]", nullable=False)
    work_json: Mapped[str]          = mapped_column(Text, default="[]", nullable=False)
    gmail_message_id: Mapped[str | None] = mapped_column(String(100))
    gmail_thread_id: Mapped[str | None]  = mapped_column(String(100))
    sent_at: Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
