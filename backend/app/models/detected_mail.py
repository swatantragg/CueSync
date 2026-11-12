from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class DetectedMail(Base):
    """A cue sheet email found in a client's Sent folder that was not sent through CueSync.
    A Reviewer confirms it (→ Submit Cue entry) or dismisses it."""
    __tablename__ = "detected_mails"

    id: Mapped[int]                  = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int]           = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True)
    mailbox_email: Mapped[str]       = mapped_column(String(255), nullable=False)
    gmail_message_id: Mapped[str]    = mapped_column(String(100), nullable=False, unique=True)
    gmail_thread_id: Mapped[str | None] = mapped_column(String(100))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    mail_to: Mapped[str | None]      = mapped_column(Text)
    mail_cc: Mapped[str | None]      = mapped_column(Text)
    subject: Mapped[str | None]      = mapped_column(Text)
    attachments: Mapped[str | None]  = mapped_column(Text)
    # Best guesses from the recipients, subject and file names; the Reviewer can change them.
    society_id: Mapped[int | None]   = mapped_column(ForeignKey("societies.id", ondelete="SET NULL"))
    project_id: Mapped[int | None]   = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    episode_from: Mapped[int | None] = mapped_column(Integer)
    episode_to: Mapped[int | None]   = mapped_column(Integer)
    status: Mapped[str]              = mapped_column(String(20), default="pending", nullable=False)  # pending / confirmed / dismissed
    submission_id: Mapped[int | None] = mapped_column(ForeignKey("society_submissions.id", ondelete="SET NULL"))
    decided_by: Mapped[int | None]   = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime]     = mapped_column(DateTime(timezone=True), default=utcnow)
