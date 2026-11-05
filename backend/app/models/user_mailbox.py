from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base, utcnow


class UserMailbox(Base):
    """A staff member's own Gmail, connected so CueSync can send their emails (Notify Editor).
    Same address as their CueSync account; holds a send-only refresh token, never a password."""
    __tablename__ = "user_mailboxes"

    id: Mapped[int]                = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int]           = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    email: Mapped[str]             = mapped_column(String(255), nullable=False)
    refresh_token_enc: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str]            = mapped_column(String(30), default="connected", nullable=False)  # connected / reconnect_needed
    connected_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_error: Mapped[str | None] = mapped_column(Text)
