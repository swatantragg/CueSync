from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.notification import Notification
from app.models.user import User

router = APIRouter()


def _row(n: Notification) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "body": n.body,
        "entity_type": n.entity_type,
        "entity_id": n.entity_id,
        "is_read": n.is_read,
        "at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("/")
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(Notification).where(Notification.user_id == current.id)
        .order_by(Notification.created_at.desc()).limit(50)
    )).scalars().all()
    return [_row(r) for r in rows]


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(Notification).where(Notification.user_id == current.id, Notification.is_read == False)
    )).scalars().all()
    return {"count": len(rows)}


@router.post("/{nid}/read")
async def mark_read(
    nid: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    n = await db.get(Notification, nid)
    if n and n.user_id == current.id:
        n.is_read = True
        await db.commit()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(Notification).where(Notification.user_id == current.id, Notification.is_read == False)
    )).scalars().all()
    for r in rows:
        r.is_read = True
    await db.commit()
    return {"ok": True, "marked": len(rows)}
