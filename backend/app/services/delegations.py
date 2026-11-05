import re

from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import Notification
from app.models.work_delegation import WorkDelegation

_SPAN_RE = re.compile(r"(\d+)\s*(?:-|–|—|to)\s*(\d+)", re.IGNORECASE)


def episode_spans(episode_range: str | None) -> list[tuple[int, int]]:
    """'1-30, 35' → [(1, 30), (35, 35)]. Empty/None → [] meaning the whole serial."""
    if not episode_range:
        return []
    spans = [(min(int(a), int(b)), max(int(a), int(b))) for a, b in _SPAN_RE.findall(episode_range)]
    spans += [(int(n), int(n)) for n in re.findall(r"\d+", _SPAN_RE.sub(" ", episode_range))]
    return spans


async def purge_delegations(db: AsyncSession, ids: list[int]) -> None:
    """Delete delegations together with their "work assigned" notifications."""
    if not ids:
        return
    await db.execute(sa_delete(Notification).where(Notification.entity_type == "delegation", Notification.entity_id.in_(ids)))
    await db.execute(sa_delete(WorkDelegation).where(WorkDelegation.id.in_(ids)))
