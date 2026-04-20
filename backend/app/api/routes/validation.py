from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.cue import CueEntry
from app.models.episode import Episode
from app.models.user import User
from app.services.validator import validate_episode

router = APIRouter()


@router.get("/episode/{episode_id}")
async def validate(episode_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    ep = (await db.execute(
        select(Episode).where(Episode.id == episode_id).options(selectinload(Episode.cues).selectinload(CueEntry.contributors))
    )).scalar_one_or_none()
    if not ep:
        return {"ok": False, "error": "not_found"}
    return validate_episode(ep)
