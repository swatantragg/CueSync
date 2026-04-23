import json

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cue import Contributor, CueEntry
from app.models.library import SongLibrary


async def reconcile_library(db: AsyncSession, title: str | None, isrc: str | None) -> SongLibrary | None:
    """Merge duplicate SongLibrary rows for the same song.
    Rules: same title + same ISRC -> merge. Same title + NULL ISRC rows -> fold into
    the ISRC row (if any) else collapse to one. Different ISRC -> keep separate."""
    if not title:
        return None
    t = title.strip()
    rows = (await db.execute(select(SongLibrary).where(SongLibrary.title.ilike(t)))).scalars().all()
    if not rows:
        return None
    if isrc:
        keep = next((r for r in rows if r.isrc == isrc), None)
        if not keep:
            return None
        losers = [r for r in rows if r.id != keep.id and (r.isrc == isrc or not r.isrc)]
    else:
        no_isrc = [r for r in rows if not r.isrc]
        if not no_isrc:
            return None
        keep = no_isrc[0]
        losers = no_isrc[1:]
    for l in losers:
        for f in ("isrc", "song_code", "work_number", "ascap_work_id", "singer", "contributors_json"):
            if not getattr(keep, f) and getattr(l, f):
                setattr(keep, f, getattr(l, f))
        await db.execute(update(CueEntry).where(CueEntry.library_id == l.id).values(library_id=keep.id))
        await db.delete(l)
    await db.flush()
    return keep


def _norm_title(t: str | None) -> str:
    return (t or "").strip().lower()


async def find_library_match(db: AsyncSession, title: str | None, isrc: str | None) -> SongLibrary | None:
    """ISRC is authoritative; title is a fallback for songs with no ISRC."""
    if isrc:
        row = (await db.execute(select(SongLibrary).where(SongLibrary.isrc == isrc))).scalar_one_or_none()
        if row:
            return row
    if title:
        rows = (await db.execute(select(SongLibrary).where(SongLibrary.title.ilike(title.strip())))).scalars().all()
        # Prefer rows with no ISRC (to avoid cross-wiring distinct recordings)
        no_isrc = [r for r in rows if not r.isrc]
        if no_isrc:
            return no_isrc[0]
        if rows and not isrc:
            return rows[0]
    return None


def serialize_contributors(cue: CueEntry) -> str:
    payload = [
        {
            "name": c.name, "role": c.role, "society": c.society,
            "share_percent": float(c.share_percent or 0),
            "ipi_number": c.ipi_number, "cae_number": c.cae_number,
        }
        for c in (cue.contributors or [])
    ]
    return json.dumps(payload)


def parse_contributors(entry: SongLibrary) -> list[dict]:
    if not entry.contributors_json:
        return []
    try:
        return json.loads(entry.contributors_json)
    except Exception:
        return []


async def propagate_cue_to_siblings(db: AsyncSession, source: CueEntry) -> int:
    """Copy scalar fields + contributors from `source` to same-title/same-ISRC cues
    across the whole DB where that data is missing. Idempotent. Returns count affected."""
    if not source.song_title and not source.isrc:
        return 0
    stmt = select(CueEntry).where(CueEntry.id != source.id).options(selectinload(CueEntry.contributors))
    if source.isrc:
        stmt = stmt.where(CueEntry.isrc == source.isrc)
    else:
        stmt = stmt.where(CueEntry.song_title.ilike(source.song_title.strip()), CueEntry.isrc.is_(None))
    siblings = (await db.execute(stmt)).scalars().all()
    src_contribs = source.contributors or []
    count = 0
    for s in siblings:
        changed = False
        for field in ("isrc", "song_code", "work_number", "ascap_work_id", "singer", "library_id"):
            if not getattr(s, field) and getattr(source, field):
                setattr(s, field, getattr(source, field))
                changed = True
        if not s.contributors and src_contribs:
            for pc in src_contribs:
                db.add(Contributor(
                    cue_id=s.id, name=pc.name, role=pc.role, society=pc.society,
                    share_percent=pc.share_percent, ipi_number=pc.ipi_number, cae_number=pc.cae_number,
                ))
            changed = True
        if changed:
            count += 1
    return count


async def find_library_match_extended(
    db: AsyncSession,
    title: str | None,
    isrc: str | None,
    song_code: str | None,
) -> tuple["SongLibrary | None", str]:
    """Find best library match. Returns (match, match_type).
    Priority: song_code > isrc > title."""
    if song_code:
        row = (await db.execute(
            select(SongLibrary).where(or_(
                SongLibrary.song_code == song_code,
                SongLibrary.work_number == song_code,
                SongLibrary.ascap_work_id == song_code,
            ))
        )).scalar_one_or_none()
        if row:
            return row, "code"
    if isrc:
        row = (await db.execute(
            select(SongLibrary).where(SongLibrary.isrc == isrc)
        )).scalar_one_or_none()
        if row:
            return row, "isrc"
    if title:
        rows = (await db.execute(
            select(SongLibrary).where(SongLibrary.title.ilike(title.strip()))
        )).scalars().all()
        no_isrc = [r for r in rows if not r.isrc]
        if no_isrc:
            return no_isrc[0], "title"
        if rows:
            return rows[0], "title"
    return None, "none"


async def apply_library_to_cue(db: AsyncSession, cue: CueEntry, entry: SongLibrary, force: bool = False) -> None:
    """Fill missing cue fields from library entry; optionally replace contributors if cue has none."""
    for field in ("isrc", "song_code", "work_number", "ascap_work_id", "singer"):
        if force or not getattr(cue, field):
            val = getattr(entry, field)
            if val:
                setattr(cue, field, val)
    cue.library_id = entry.id
    contrib_count = (await db.execute(
        select(func.count(Contributor.id)).where(Contributor.cue_id == cue.id)
    )).scalar() or 0
    if contrib_count == 0:
        for c in parse_contributors(entry):
            db.add(Contributor(
                cue_id=cue.id,
                name=c.get("name", ""), role=c.get("role", "Composer"),
                society=c.get("society"),
                share_percent=float(c.get("share_percent") or 0),
                ipi_number=c.get("ipi_number"), cae_number=c.get("cae_number"),
            ))
