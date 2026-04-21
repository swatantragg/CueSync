from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


async def log_activity(
    db: AsyncSession,
    user_id: int | None,
    action: str,
    entity: str,
    entity_id: int | None,
    details: str | None = None,
):
    db.add(AuditLog(
        user_id=user_id,
        action=action,
        entity=entity,
        entity_id=entity_id,
        details=details,
    ))
    await db.flush()
