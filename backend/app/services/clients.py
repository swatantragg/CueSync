import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.client import Client, ClientMailbox
from app.models.notification import Notification
from app.models.society_submission import SocietySubmission
from app.models.user import User
from app.models.work_delegation import WorkDelegation
from app.services import gmail
from app.services.audit import log_activity

# Tables that name a client: free text (legacy) plus client_id once linked to the client list.
CLIENT_TABLES = (WorkDelegation, SocietySubmission)

MAILBOX_CHECK_EVERY = timedelta(hours=20)


def name_key(name: str | None) -> str:
    """'Client-1', 'client 1' and 'CLIENT1' all become 'client1'."""
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


async def resolve_client(db: AsyncSession, client_id: int | None, client: str | None) -> tuple[int | None, str | None]:
    """(client_id, client name) to store on a delegation or submission. Unknown clients are refused,
    so a typo can't create a second spelling of the same client."""
    if client_id:
        c = await db.get(Client, client_id)
        if not c or not c.is_active:
            raise HTTPException(400, "Pick an active client from the client list.")
        return c.id, c.name
    if not (client or "").strip():
        return None, None
    c = (await db.execute(select(Client).where(Client.name_key == name_key(client)))).scalar_one_or_none()
    if not c or not c.is_active:
        raise HTTPException(400, f'"{client.strip()}" is not in the client list. Ask an Admin or Reviewer to add it under Clients.')
    return c.id, c.name


async def link_names(db: AsyncSession, client: Client, names: list[str]) -> int:
    """Point unlinked rows whose client text is one of `names` at this client. Returns rows linked."""
    names = [n for n in names if n]
    if not names:
        return 0
    linked = 0
    for model in CLIENT_TABLES:
        res = await db.execute(
            update(model).where(model.client_id.is_(None), model.client.in_(names))
            .values(client_id=client.id, client=client.name)
        )
        linked += res.rowcount or 0
    return linked


async def legacy_names(db: AsyncSession) -> dict[str, dict]:
    """Unlinked client spellings grouped by name key → {"names": {spelling: rows}, "delegations", "submissions"}."""
    groups: dict[str, dict] = {}
    for model, field in ((WorkDelegation, "delegations"), (SocietySubmission, "submissions")):
        rows = (await db.execute(
            select(model.client, func.count()).where(model.client_id.is_(None), model.client.isnot(None))
            .group_by(model.client)
        )).all()
        for name, count in rows:
            key = name_key(name)
            if not key:
                continue
            g = groups.setdefault(key, {"names": {}, "delegations": 0, "submissions": 0})
            g["names"][name] = g["names"].get(name, 0) + count
            g[field] += count
    return groups


async def link_matching(db: AsyncSession, client: Client) -> int:
    """Link every unlinked spelling of this client's name (same name key)."""
    group = (await legacy_names(db)).get(client.name_key)
    return await link_names(db, client, list(group["names"])) if group else 0


async def rename_everywhere(db: AsyncSession, client: Client) -> None:
    for model in CLIENT_TABLES:
        await db.execute(update(model).where(model.client_id == client.id).values(client=client.name))


async def usage_counts(db: AsyncSession) -> dict[int, dict[str, int]]:
    out: dict[int, dict[str, int]] = {}
    for model, field in ((WorkDelegation, "delegations"), (SocietySubmission, "submissions")):
        for cid, count in (await db.execute(
            select(model.client_id, func.count()).where(model.client_id.isnot(None)).group_by(model.client_id)
        )).all():
            out.setdefault(cid, {"delegations": 0, "submissions": 0})[field] = count
    return out


async def _notify_lost(db: AsyncSession, client: Client, reason: str) -> None:
    users = (await db.execute(
        select(User).where(User.role.in_(["admin", "reviewer"]), User.is_active.is_(True))
    )).scalars().all()
    for u in users:
        db.add(Notification(
            user_id=u.id,
            title=f"Reconnect Gmail — {client.name}",
            body=f"CueSync can no longer use {client.name}'s mailbox. {reason}",
            entity_type="client", entity_id=client.id,
        ))


async def mark_lost(db: AsyncSession, mb: ClientMailbox, reason: str) -> None:
    """Flag the mailbox reconnect_needed and tell admins and reviewers — once, since several
    workers (or a check and a send) may notice at the same time."""
    res = await db.execute(
        update(ClientMailbox).where(ClientMailbox.id == mb.id, ClientMailbox.status == "connected")
        .values(status="reconnect_needed", last_error=reason, last_checked_at=datetime.now(timezone.utc))
    )
    if res.rowcount:
        client = await db.get(Client, mb.client_id)
        await _notify_lost(db, client, reason)
        await log_activity(db, None, "mailbox_lost", "client", client.id, f"{client.name} · {mb.email} — {reason}")
    await db.refresh(mb)


async def check_mailbox(db: AsyncSession, mb: ClientMailbox) -> None:
    """Make sure the stored token still works. A dead token flips the mailbox to reconnect_needed
    (once — several workers may check at the same time) and tells admins and reviewers."""
    now = datetime.now(timezone.utc)
    try:
        token = await gmail.access_token(gmail.decrypt_token(mb.refresh_token_enc))
        address = await gmail.gmail_address(token)
        if not gmail.same_address(address, mb.email):
            raise gmail.MailboxRevoked(f"The connection now belongs to {address}, not {mb.email}.")
    except gmail.MailboxRevoked as e:
        await mark_lost(db, mb, str(e))
        return
    except gmail.MailError as e:
        mb.last_error, mb.last_checked_at = str(e), now  # Google hiccup: keep the status, try again later
        return
    mb.status, mb.last_error, mb.last_checked_at = "connected", None, now


async def check_due_mailboxes(db: AsyncSession) -> int:
    """Daily health check of connected mailboxes (called from the hourly background loop)."""
    if gmail.missing_config():
        return 0
    cutoff = datetime.now(timezone.utc) - MAILBOX_CHECK_EVERY
    due = (await db.execute(
        select(ClientMailbox).where(
            ClientMailbox.status == "connected",
            or_(ClientMailbox.last_checked_at.is_(None), ClientMailbox.last_checked_at < cutoff),
        )
    )).scalars().all()
    for mb in due:
        await check_mailbox(db, mb)
    return len(due)
