from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.library import ContributorLibrary, SongLibrary
from app.models.user import User

router = APIRouter()


@router.get("/songs")
async def search_songs(q: str = Query("", min_length=0), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(SongLibrary)
    if q:
        stmt = stmt.where(SongLibrary.title.ilike(f"%{q}%"))
    return (await db.execute(stmt.limit(25))).scalars().all()


@router.get("/contributors")
async def search_contributors(q: str = Query("", min_length=0), role: str | None = None, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(ContributorLibrary)
    if q:
        stmt = stmt.where(or_(ContributorLibrary.name.ilike(f"%{q}%"), ContributorLibrary.ipi_number.ilike(f"%{q}%")))
    if role:
        stmt = stmt.where(ContributorLibrary.role == role)
    return (await db.execute(stmt.limit(25))).scalars().all()
