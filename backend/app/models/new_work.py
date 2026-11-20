from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class NewWork(Base):
    """An upcoming movie or TV show, tracked from the day its name arrives: BGM received → fingerprinting →
    cue sheet work allotted. Each step is done, or skipped with a reason, before the next one opens."""
    __tablename__ = "new_works"

    id: Mapped[int]             = mapped_column(Integer, primary_key=True)
    title: Mapped[str]          = mapped_column(String(500), nullable=False)
    # Lowercase letters and digits only: spots a duplicate entry whatever the spacing or punctuation.
    title_key: Mapped[str]      = mapped_column(String(500), nullable=False, index=True)
    work_type: Mapped[str]      = mapped_column(String(20), default="movie", nullable=False)  # movie / tv_show
    remarks: Mapped[str | None] = mapped_column(Text)
    # Whose work it is (required when a work is added; older rows may have none) and where it can be seen.
    client_id: Mapped[int | None]       = mapped_column(ForeignKey("clients.id", ondelete="SET NULL"), index=True)
    release_date: Mapped[date | None]   = mapped_column(Date)
    video_link: Mapped[str | None]      = mapped_column(Text)
    # Release updates already sent: 0 none, 1 on the release day, 2 seven days after. Set to what has already
    # passed whenever the date is entered, so only dates still ahead get an update.
    release_alert_level: Mapped[int]    = mapped_column(Integer, default=0, nullable=False)
    # Where it is released first: theatrical / ott / tv. A theatrical release has no video to work from until it
    # reaches OTT (or the client sends a copy), so its fingerprinting waits for "Video available".
    release_type: Mapped[str | None]    = mapped_column(String(20))
    ott_date: Mapped[date | None]       = mapped_column(Date)          # announced OTT date
    ott_platform: Mapped[str | None]    = mapped_column(String(100))
    ott_window_days: Mapped[int | None] = mapped_column(Integer)       # theatre → OTT gap to expect when no OTT date
    video_state: Mapped[str | None]     = mapped_column(String(20))    # NULL not tracked / waiting / available
    video_at: Mapped[datetime | None]   = mapped_column(DateTime(timezone=True))
    video_by: Mapped[int | None]        = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    video_source: Mapped[str | None]    = mapped_column(String(20))    # ott / client / tv / other
    video_note: Mapped[str | None]      = mapped_column(Text)
    # "Is it on OTT yet?" checks already sent, and the one-time overdue flag; preset to what had passed when the
    # dates were entered, like release_alert_level.
    video_check_count: Mapped[int]      = mapped_column(Integer, default=0, nullable=False)
    video_overdue_sent: Mapped[bool]    = mapped_column(Boolean, default=False, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    # Step 1: BGM
    bgm_state: Mapped[str]              = mapped_column(String(20), default="awaiting", nullable=False)  # awaiting / received / skipped
    bgm_at: Mapped[datetime | None]     = mapped_column(DateTime(timezone=True))  # received, or the step skipped
    bgm_by: Mapped[int | None]          = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    bgm_skip_reason: Mapped[str | None] = mapped_column(Text)

    # Step 2: fingerprinting
    fp_status: Mapped[str]                  = mapped_column(String(20), default="not_assigned", nullable=False)  # not_assigned / assigned / in_progress / completed / skipped
    fp_assigned_to: Mapped[int | None]      = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    fp_assigned_by: Mapped[int | None]      = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    fp_assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    fp_started_at: Mapped[datetime | None]  = mapped_column(DateTime(timezone=True))
    fp_done_at: Mapped[datetime | None]     = mapped_column(DateTime(timezone=True))  # completed, or the step skipped
    fp_done_by: Mapped[int | None]          = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # What allowed "Fingerprinting Completed" to be ticked: the service's email, or a typed source when none came.
    fp_source: Mapped[str | None]           = mapped_column(String(20))  # bmat_mail / manual
    fp_source_note: Mapped[str | None]      = mapped_column(Text)
    fp_skip_reason: Mapped[str | None]      = mapped_column(Text)
    fp_mail_id: Mapped[int | None]          = mapped_column(ForeignKey("fingerprint_mails.id", ondelete="SET NULL"))
    fp_mail_linked_by: Mapped[int | None]   = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))  # NULL: matched automatically
    fp_mail_linked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Step 3: cue sheet work. Assigned / in progress / completed follow the delegation it created.
    delegation_id: Mapped[int | None]        = mapped_column(ForeignKey("work_delegations.id", ondelete="SET NULL"), index=True)
    project_id: Mapped[int | None]           = mapped_column(ForeignKey("projects.id", ondelete="SET NULL"))
    cue_assigned_to: Mapped[int | None]      = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    cue_assigned_by: Mapped[int | None]      = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    cue_assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cue_done_at: Mapped[datetime | None]     = mapped_column(DateTime(timezone=True))  # completed, or the step skipped
    cue_skip_reason: Mapped[str | None]      = mapped_column(Text)

    # Reminders already sent, so each one goes out once however many workers are running.
    reminder_stage: Mapped[str | None]         = mapped_column(String(20))
    reminder_count: Mapped[int]                = mapped_column(Integer, default=0, nullable=False)
    long_pending_level: Mapped[int]            = mapped_column(Integer, default=0, nullable=False)  # 0 / 15 / 30 days
    last_reminder_at: Mapped[datetime | None]  = mapped_column(DateTime(timezone=True))


class FingerprintMail(Base):
    """An email from the fingerprinting service found in the watched mailbox. A new work that points at one
    (matched by its title, or linked by hand) may be ticked "Fingerprinting Completed"."""
    __tablename__ = "fingerprint_mails"

    id: Mapped[int]                     = mapped_column(Integer, primary_key=True)
    gmail_message_id: Mapped[str]       = mapped_column(String(100), nullable=False, unique=True)
    gmail_thread_id: Mapped[str | None] = mapped_column(String(100))
    mailbox_email: Mapped[str]          = mapped_column(String(255), nullable=False)
    from_addr: Mapped[str | None]       = mapped_column(String(500))
    subject: Mapped[str | None]         = mapped_column(Text)
    snippet: Mapped[str | None]         = mapped_column(Text)
    attachments: Mapped[str | None]     = mapped_column(Text)
    # Subject, body and file names as plain lowercase words: what a work's title is looked for in.
    match_text: Mapped[str | None]      = mapped_column(Text)
    received_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime]        = mapped_column(DateTime(timezone=True), default=utcnow)


class SystemMailbox(Base):
    """A mailbox CueSync reads for its own tracking, connected once by an Admin through Google with read-only
    access. purpose "fingerprint": where the fingerprinting service's emails arrive."""
    __tablename__ = "system_mailboxes"

    id: Mapped[int]                = mapped_column(Integer, primary_key=True)
    purpose: Mapped[str]           = mapped_column(String(30), nullable=False, unique=True)
    email: Mapped[str]             = mapped_column(String(255), nullable=False)
    refresh_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str]            = mapped_column(String(30), default="connected", nullable=False)  # connected / reconnect_needed
    connected_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    connected_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None]   = mapped_column(Text)
