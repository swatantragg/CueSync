import json

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.cue import Contributor, CueEntry
from app.models.library import ContributorLibrary, MemberDirectory, SongLibrary
from app.models.user import User, UserRole
from app.schemas.cue import LibraryUpsertIn
from app.services.cue_rules import apply_share_rules
from app.services.library_sync import (
    cleanup_contributor_duplicates,
    cleanup_song_duplicates,
    dedup_contributors,
    find_autofill_library_match,
    normalize_ipi,
    pad_ipi,
    parse_contributors,
    reconcile_library,
    resolve_contributor_name,
    same_ipi,
    search_members,
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
    match = await find_autofill_library_match(db, title or None, isrc or None, None)
    return _lib_payload(match) if match else None


@router.post("/songs/upsert", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def upsert_song(payload: LibraryUpsertIn, db: AsyncSession = Depends(get_db)):
    entry = None
    if payload.isrc:
        entry = (await db.execute(select(SongLibrary).where(SongLibrary.isrc == payload.isrc))).scalar_one_or_none()
    if not entry:
        if not payload.isrc:
            entry = (await db.execute(select(SongLibrary).where(SongLibrary.title.ilike(payload.title.strip())))).scalar_one_or_none()

    contributors_json = json.dumps(apply_share_rules(dedup_contributors([c.model_dump() for c in payload.contributors])))

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
    results = []

    # Search member directory first (PA + PP names) — returns canonical PA entries
    if q and len(q.strip()) >= 2:
        member_rows = await search_members(db, q.strip(), limit=25)
        for m in member_rows:
            try:
                pp_names = json.loads(m.pp_names_json or "[]")
            except Exception:
                pp_names = []
            ipi_val = pad_ipi(m.ipi_number) if m.ipi_number else None
            results.append({
                "id": m.id,
                "name": m.pa_name,
                "role": m.role,
                "society": "IPRS",
                "ipi_number": ipi_val,
                "cae_number": None,
                "alt_names": {},
                "all_names": [m.pa_name] + pp_names,
                "from_member_directory": True,
            })

    # Also search contributor_library (curated past entries)
    stmt = select(ContributorLibrary)
    filters = []
    if q:
        filters.append(or_(
            ContributorLibrary.name.ilike(f"%{q}%"),
            ContributorLibrary.ipi_number.ilike(f"%{q}%"),
        ))
    if ipi:
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
    lib_rows = (await db.execute(stmt.limit(25))).scalars().all()
    if ipi:
        norm = normalize_ipi(ipi)
        lib_rows = [r for r in lib_rows if same_ipi(r.ipi_number, ipi) or same_ipi(r.cae_number, ipi)] or lib_rows

    # Merge: skip ContributorLibrary entries already covered by member directory
    member_pa_names = {r["name"].strip().lower() for r in results}
    for r in lib_rows:
        if r.name.strip().lower() not in member_pa_names:
            results.append(_contrib_payload(r))

    return results[:25]


@router.get("/contributors/lookup")
async def lookup_contributor(
    name: str = Query("", min_length=1),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if not name or len(name.strip()) < 2:
        return None
    n = name.strip()

    # Priority 1: member directory (PA/PP lookup → always returns PA name + IPI)
    member = await resolve_contributor_name(db, n)
    if member:
        ipi = pad_ipi(member["ipi_number"]) if member.get("ipi_number") else None
        return {
            "name": member["pa_name"],
            "role": member["role"],
            "society": "IPRS",
            "ipi_number": ipi,
            "all_names": [member["pa_name"]],
            "alt_names": {},
            "from_member_directory": True,
        }

    # Priority 2: contributor_library (curated past entries)
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

    # Priority 3: cue contributor table
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


# ── Member directory endpoints ─────────────────────────────────────────────

def _member_payload(row: MemberDirectory) -> dict:
    try:
        pp_names = json.loads(row.pp_names_json or "[]")
    except Exception:
        pp_names = []
    return {
        "id": row.id,
        "base_no": row.base_no,
        "pa_name": row.pa_name,
        "ipi_number": pad_ipi(row.ipi_number) if row.ipi_number else None,
        "role": row.role,
        "pp_names": pp_names,
        "all_names": [row.pa_name] + pp_names,
    }


@router.get("/members")
async def search_member_directory(
    q: str = Query("", min_length=1),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = await search_members(db, q, limit=25)
    return [_member_payload(r) for r in rows]


@router.get("/members/lookup")
async def lookup_member_by_name(
    name: str = Query("", min_length=2),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    result = await resolve_contributor_name(db, name)
    if not result:
        return None
    ipi = pad_ipi(result["ipi_number"]) if result.get("ipi_number") else None
    return {
        "pa_name": result["pa_name"],
        "ipi_number": ipi,
        "role": result["role"],
        "society": "IPRS",
    }
