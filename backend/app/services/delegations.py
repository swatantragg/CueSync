from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.work_delegation import WorkDelegation


async def purge_delegations(db: AsyncSession, ids: list[int]) -> None:
    """Delete delegations together with their "work assigned" notifications."""
    if not ids:
        return
    await db.execute(sa_delete(Notification).where(Notification.entity_type == "delegation", Notification.entity_id.in_(ids)))
    await db.execute(sa_delete(WorkDelegation).where(WorkDelegation.id.in_(ids)))
