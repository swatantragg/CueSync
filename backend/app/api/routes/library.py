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
from app.services.library_sync import (
    cleanup_contributor_duplicates,
    cleanup_song_duplicates,
    dedup_contributors,
    find_library_match,
    normalize_ipi,
    pad_ipi,
    parse_contributors,
    reconcile_library,
    same_ipi,
    upsert_contributor_library,
)

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
        "alt_titles": json.loads(row.alt_titles) if row.alt_titles else [],
        "contributors": parse_contributors(row),
    }


def _contrib_payload(row: ContributorLibrary) -> dict:
    alt: dict = json.loads(row.alt_names) if row.alt_names else {}
    # all_names = primary + alternates (deduplicated, case-insensitive)
    seen: set[str] = {row.name.strip().lower()}
    all_names: list[str] = [row.name]
    for v in alt.values():
        v_s = (v or "").strip()
        if v_s and v_s.lower() not in seen:
            all_names.append(v_s)
            seen.add(v_s.lower())
    # Always return padded IPI
    ipi = pad_ipi(row.ipi_number) if row.ipi_number else (pad_ipi(row.cae_number) if row.cae_number else None)
    return {
        "id": row.id,
        "name": row.name,
        "role": row.role,
        "society": row.society,
        "ipi_number": ipi,
        "cae_number": row.cae_number,
        "alt_names": alt,
        "all_names": all_names,
    }


@router.get("/songs")
async def search_songs(
    q: str = Query("", min_length=0),
    song_code: str = Query("", min_length=0),
    isrc: str = Query("", min_length=0),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(SongLibrary)
    filters = []
    if q:
        filters.append(SongLibrary.title.ilike(f"%{q}%"))
    if song_code:
        filters.append(SongLibrary.song_code.ilike(f"%{song_code}%"))
    if isrc:
        filters.append(SongLibrary.isrc.ilike(f"%{isrc}%"))
    if filters:
        stmt = stmt.where(or_(*filters))
    rows = (await db.execute(stmt.limit(25))).scalars().all()
    return [_lib_payload(r) for r in rows]


@router.get("/songs/lookup")
async def lookup_song(
    title: str = "",
    isrc: str = "",
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    match = await find_library_match(db, title or None, isrc or None)
    return _lib_payload(match) if match else None


@router.post("/songs/upsert", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def upsert_song(payload: LibraryUpsertIn, db: AsyncSession = Depends(get_db)):
    entry = None
    if payload.isrc:
        entry = (await db.execute(select(SongLibrary).where(SongLibrary.isrc == payload.isrc))).scalar_one_or_none()
    if not entry:
        if not payload.isrc:
            entry = (await db.execute(select(SongLibrary).where(SongLibrary.title.ilike(payload.title.strip())))).scalar_one_or_none()

    contributors_json = json.dumps(dedup_contributors([c.model_dump() for c in payload.contributors]))

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

    for c in payload.contributors:
        await upsert_contributor_library(db, c.name, c.role or "Composer", c.ipi_number, c.society)

    await db.commit()
    await db.refresh(entry)
    return _lib_payload(entry)


@router.post("/cleanup", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def cleanup_library(db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    songs_merged = await cleanup_song_duplicates(db)
    contribs_merged = await cleanup_contributor_duplicates(db)
    await db.commit()
    return {"songs_merged": songs_merged, "contributors_merged": contribs_merged}


@router.get("/contributors")
async def search_contributors(
    q: str = Query("", min_length=0),
    ipi: str = Query("", min_length=0),
    role: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stmt = select(ContributorLibrary)
    filters = []
    if q:
        filters.append(or_(
            ContributorLibrary.name.ilike(f"%{q}%"),
            ContributorLibrary.ipi_number.ilike(f"%{q}%"),
        ))
    if ipi:
        # Normalize: strip leading zeros so "0001234" matches "1234" and "00001234"
        norm = normalize_ipi(ipi)
        if norm and norm != "0":
            filters.append(or_(
                ContributorLibrary.ipi_number.ilike(f"%{norm}%"),
                ContributorLibrary.cae_number.ilike(f"%{norm}%"),
            ))
    if filters:
        stmt = stmt.where(or_(*filters))
    if role:
        stmt = stmt.where(ContributorLibrary.role == role)
    rows = (await db.execute(stmt.limit(50))).scalars().all()

    # Post-filter: if IPI was given, keep only exact normalized matches
    if ipi:
        norm = normalize_ipi(ipi)
        rows = [r for r in rows if same_ipi(r.ipi_number, ipi) or same_ipi(r.cae_number, ipi)] or rows

    return [_contrib_payload(r) for r in rows[:25]]


@router.get("/contributors/lookup")
async def lookup_contributor(
    name: str = Query("", min_length=1),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not name or len(name.strip()) < 2:
        return None
    n = name.strip()

    lib_rows = (await db.execute(
        select(ContributorLibrary).where(ContributorLibrary.name.ilike(n)).limit(5)
    )).scalars().all()
    if lib_rows:
        best = max(lib_rows, key=lambda r: (
            1 if r.ipi_number else 0,
            1 if r.cae_number else 0,
            1 if r.society else 0,
        ))
        p = _contrib_payload(best)
        return {**p, "ipi_number": p["ipi_number"]}

    cue_rows = (await db.execute(
        select(Contributor).where(Contributor.name.ilike(f"%{n}%")).limit(20)
    )).scalars().all()
    if not cue_rows:
        return None

    best = max(cue_rows, key=lambda r: (
        1 if r.ipi_number else 0,
        1 if r.cae_number else 0,
        1 if r.society else 0,
    ))
    if not best.ipi_number and not best.cae_number and not best.society:
        return None
    ipi = pad_ipi(best.ipi_number or best.cae_number)
    return {
        "name": best.name, "role": best.role, "society": best.society,
        "ipi_number": ipi, "all_names": [best.name], "alt_names": {},
    }