from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class SocietySubmission(Base):
    __tablename__ = "society_submissions"

    id: Mapped[int]           = mapped_column(Integer, primary_key=True)
    project_id: Mapped[int]   = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    episode_from: Mapped[int] = mapped_column(Integer, nullable=False)
    episode_to: Mapped[int]   = mapped_column(Integer, nullable=False)
    client: Mapped[str | None]  = mapped_column(String(255))
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)
    notes: Mapped[str | None]   = mapped_column(Text)
    submitted_by: Mapped[int]   = mapped_column(ForeignKey("users.id"), nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # IPRS lifecycle tracking
    submitted_to_iprs: Mapped[bool]           = mapped_column(Boolean, default=False, nullable=False)
    submitted_to_iprs_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_by_iprs: Mapped[bool]            = mapped_column(Boolean, default=False, nullable=False)
    accepted_by_iprs_at: Mapped[datetime | None]  = mapped_column(DateTime(timezone=True))

    # Followup notification tracking
    last_followup_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    followup_count: Mapped[int]               = mapped_column(Integer, default=0, nullable=False)

    # Email sent from the client's Gmail by Send to Society (sent_via "gmail"); typed entries have none.
    society_id: Mapped[int | None]       = mapped_column(ForeignKey("societies.id", ondelete="SET NULL"), index=True)
    society_name: Mapped[str | None]     = mapped_column(String(100))
    sent_via: Mapped[str | None]         = mapped_column(String(20))
    mail_from: Mapped[str | None]        = mapped_column(String(255))
    mail_to: Mapped[str | None]          = mapped_column(Text)
    mail_cc: Mapped[str | None]          = mapped_column(Text)
    mail_bcc: Mapped[str | None]         = mapped_column(Text)
    mail_subject: Mapped[str | None]     = mapped_column(Text)
    mail_body: Mapped[str | None]        = mapped_column(Text)
    mail_attachments: Mapped[str | None] = mapped_column(Text)
    gmail_message_id: Mapped[str | None] = mapped_column(String(100))
    gmail_thread_id: Mapped[str | None]  = mapped_column(String(100))
    mail_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # The attachments were built from Conversion rows (Projects → Conversion), not from approved episodes.
    from_conversion: Mapped[bool]        = mapped_column(Boolean, default=False, nullable=False, server_default="false")

    # What happened after sending, read from the client's Gmail thread by services/mail_sync.
    # mail_status: sent (awaiting the society) / replied / bounced / resent (a bounced email that was sent again)
    mail_status: Mapped[str | None]       = mapped_column(String(20))
    mail_watch_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # only later messages count
    mail_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reply_at: Mapped[datetime | None]     = mapped_column(DateTime(timezone=True))
    reply_from: Mapped[str | None]        = mapped_column(String(255))
    reply_subject: Mapped[str | None]     = mapped_column(Text)
    reply_snippet: Mapped[str | None]     = mapped_column(Text)
    reply_message_id: Mapped[str | None]  = mapped_column(String(100))
    bounce_reason: Mapped[str | None]     = mapped_column(Text)
