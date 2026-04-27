import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.cue import Contributor, CueEntry
from app.models.library import ContributorLibrary, SongLibrary
from app.models.user import User, UserRole
from app.schemas.cue import LibraryUpsertIn
from app.services.library_sync import find_library_match, parse_contributors, reconcile_library

router = APIRouter()


def _lib_payload(row: SongLibrary) -> dict:
    return {
        "id": row.id,
        "title": row.title,
        "isrc": row.isrc,
        "song_code": row.song_code,
        "work_number": row.work_number,
        "ascap_work_id": row.ascap_work_id,
        "singer": row.singer,
        "contributors": parse_contributors(row),
    }


@router.get("/songs")
async def search_songs(q: str = Query("", min_length=0), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(SongLibrary)
    if q:
        stmt = stmt.where(SongLibrary.title.ilike(f"%{q}%"))
    rows = (await db.execute(stmt.limit(25))).scalars().all()
    return [_lib_payload(r) for r in rows]


@router.get("/songs/lookup")
async def lookup_song(title: str = "", isrc: str = "", db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    match = await find_library_match(db, title or None, isrc or None)
    return _lib_payload(match) if match else None


@router.post("/songs/upsert", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def upsert_song(payload: LibraryUpsertIn, db: AsyncSession = Depends(get_db)):
    entry = None
    if payload.isrc:
        entry = (await db.execute(select(SongLibrary).where(SongLibrary.isrc == payload.isrc))).scalar_one_or_none()
    if not entry:
        # Fallback by title (case-insensitive exact) only when no ISRC, to preserve ISRC uniqueness guarantee
        if not payload.isrc:
            entry = (await db.execute(select(SongLibrary).where(SongLibrary.title.ilike(payload.title.strip())))).scalar_one_or_none()

    contributors_json = json.dumps([c.model_dump() for c in payload.contributors])

    if entry:
        entry.title = payload.title.strip()
        entry.isrc = payload.isrc or entry.isrc
        entry.song_code = payload.song_code
        entry.work_number = payload.work_number
        entry.ascap_work_id = payload.ascap_work_id
        entry.singer = payload.singer
        entry.contributors_json = contributors_json
    else:
        entry = SongLibrary(
            title=payload.title.strip(),
            isrc=payload.isrc,
            song_code=payload.song_code,
            work_number=payload.work_number,
            ascap_work_id=payload.ascap_work_id,
            singer=payload.singer,
            contributors_json=contributors_json,
        )
        db.add(entry)
    await db.flush()
    merged = await reconcile_library(db, entry.title, entry.isrc)
    if merged:
        entry = merged

    if payload.cue_id:
        cue = await db.get(CueEntry, payload.cue_id)
        if cue:
            cue.library_id = entry.id

    # Upsert contributors into ContributorLibrary for future name-based lookup
    for c in payload.contributors:
        if not c.name:
            continue
        existing_cl = (await db.execute(
            select(ContributorLibrary).where(
                ContributorLibrary.name.ilike(c.name.strip()),
                ContributorLibrary.role == (c.role or "Composer"),
            )
        )).scalar_one_or_none()
        if existing_cl:
            if c.ipi_number and not existing_cl.ipi_number:
                existing_cl.ipi_number = c.ipi_number
            if c.society and not existing_cl.society:
                existing_cl.society = c.society
        else:
            db.add(ContributorLibrary(
                name=c.name.strip(),
                role=c.role or "Composer",
                society=c.society or None,
                ipi_number=c.ipi_number or None,
            ))

    await db.commit()
    await db.refresh(entry)
    return _lib_payload(entry)


@router.get("/contributors")
async def search_contributors(q: str = Query("", min_length=0), role: str | None = None, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    stmt = select(ContributorLibrary)
    if q:
        stmt = stmt.where(or_(ContributorLibrary.name.ilike(f"%{q}%"), ContributorLibrary.ipi_number.ilike(f"%{q}%")))
    if role:
        stmt = stmt.where(ContributorLibrary.role == role)
    return (await db.execute(stmt.limit(25))).scalars().all()


@router.get("/contributors/lookup")
async def lookup_contributor(name: str = Query("", min_length=1), db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    """Return IPI/CAE, society, role for a contributor name. Checks ContributorLibrary first, then Contributor records."""
    if not name or len(name.strip()) < 2:
        return None
    n = name.strip()

    # 1. ContributorLibrary (curated, highest priority)
    lib_rows = (await db.execute(
        select(ContributorLibrary).where(ContributorLibrary.name.ilike(n)).limit(5)
    )).scalars().all()
    if lib_rows:
        best = max(lib_rows, key=lambda r: (
            1 if r.ipi_number else 0,
            1 if r.cae_number else 0,
            1 if r.society else 0,
        ))
        return {"name": best.name, "role": best.role, "society": best.society,
                "ipi_number": best.ipi_number or best.cae_number}

    # 2. Contributor table (from cue entries) — fuzzy ilike
    cue_rows = (await db.execute(
        select(Contributor).where(Contributor.name.ilike(f"%{n}%")).limit(20)
    )).scalars().all()
    if not cue_rows:
        return None

    # Pick richest record (has IPI/CAE)
    best = max(cue_rows, key=lambda r: (
        1 if r.ipi_number else 0,
        1 if r.cae_number else 0,
        1 if r.society else 0,
    ))
    if not best.ipi_number and not best.cae_number and not best.society:
        return None
    return {"name": best.name, "role": best.role, "society": best.society,
            "ipi_number": best.ipi_number or best.cae_number}
