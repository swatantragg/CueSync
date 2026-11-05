from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class Client(Base):
    """A client we work for. Delegations and society submissions point here instead of typing the name."""
    __tablename__ = "clients"

    id: Mapped[int]             = mapped_column(Integer, primary_key=True)
    name: Mapped[str]           = mapped_column(String(255), nullable=False)
    # Lowercase letters/digits only, so "Client-1", "client 1" and "CLIENT1" are one client.
    name_key: Mapped[str]       = mapped_column(String(255), nullable=False, unique=True, index=True)
    email: Mapped[str | None]   = mapped_column(String(255))
    notes: Mapped[str | None]   = mapped_column(Text)
    is_active: Mapped[bool]     = mapped_column(Boolean, default=True, nullable=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class ClientMailbox(Base):
    """The client's Gmail account connected through Google OAuth. Holds a refresh token, never a password."""
    __tablename__ = "client_mailboxes"

    id: Mapped[int]                = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int]         = mapped_column(ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, unique=True)
    provider: Mapped[str]          = mapped_column(String(20), default="google", nullable=False)
    email: Mapped[str]             = mapped_column(String(255), nullable=False)
    refresh_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    scopes: Mapped[str | None]     = mapped_column(Text)
    status: Mapped[str]            = mapped_column(String(30), default="connected", nullable=False)  # connected / reconnect_needed
    connected_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    connected_at: Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=utcnow)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error: Mapped[str | None]   = mapped_column(Text)
    # Sent-folder scan watermark (mail_sync): only mails sent after this are looked at again.
    last_sent_scan_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
