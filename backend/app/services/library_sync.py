import json
import re
from difflib import SequenceMatcher

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cue import Contributor, CueEntry
from app.models.library import SongLibrary

_TITLE_TOKEN_RE = re.compile(r"[a-z0-9]+")
_TITLE_STOPWORDS = {
    "a", "an", "and", "background", "family", "feat", "featuring", "film",
    "from", "motion", "mp3", "mp4", "music", "of", "official", "original",
    "ost", "picture", "score", "soundtrack", "theme", "the", "track",
    "version",
}


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
    if not t:
        return ""
    s = (t or "").strip().lower()
    s = s.replace("&", " and ")
    s = re.sub(r"\((?:\s*from\b[^)]*)\)", " ", s)
    s = re.sub(r"\[(?:\s*from\b[^\]]*)\]", " ", s)
    s = re.sub(r"[\"'`]+", "", s)
    s = re.sub(r"[\[\]{}()]+", " ", s)
    s = s.replace("-", " ")
    tokens = [tok for tok in _TITLE_TOKEN_RE.findall(s) if tok not in _TITLE_STOPWORDS]
    return " ".join(tokens)


def _match_terms(title: str | None) -> list[str]:
    tokens = _norm_title(title).split()
    terms = [tok for tok in tokens if len(tok) >= 3]
    return sorted(dict.fromkeys(terms), key=lambda tok: (-len(tok), tok))[:3]


def _title_score(needle: str | None, candidate: str | None) -> float:
    a = _norm_title(needle)
    b = _norm_title(candidate)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    a_words = set(a.split())
    b_words = set(b.split())
    if not a_words or not b_words:
        return 0.0
    overlap = len(a_words & b_words) / max(1, min(len(a_words), len(b_words)))
    contains = 1.0 if a_words <= b_words or b_words <= a_words else 0.0
    seq = SequenceMatcher(None, a, b).ratio()
    return max(overlap, contains, seq)


def _entry_richness(entry: SongLibrary) -> tuple[int, int, int, int, int, int]:
    return (
        1 if entry.isrc else 0,
        1 if entry.song_code else 0,
        1 if entry.work_number else 0,
        1 if entry.ascap_work_id else 0,
        1 if entry.singer else 0,
        1 if entry.contributors_json else 0,
    )


def _tail_match_len(needle: str | None, candidate: str | None) -> int:
    a = _norm_title(needle).split()
    b = _norm_title(candidate).split()
    matched = 0
    while matched < min(len(a), len(b)) and a[-(matched + 1)] == b[-(matched + 1)]:
        matched += 1
    return matched


def _head_match_len(needle: str | None, candidate: str | None) -> int:
    a = _norm_title(needle).split()
    b = _norm_title(candidate).split()
    matched = 0
    while matched < min(len(a), len(b)) and a[matched] == b[matched]:
        matched += 1
    return matched


def _pick_best_title_match(rows: list[SongLibrary], title: str | None) -> SongLibrary | None:
    best = None
    best_key = None
    for row in rows:
        score = _title_score(title, row.title)
        if score < 0.72:
            continue
        key = (
            score,
            _tail_match_len(title, row.title),
            _head_match_len(title, row.title),
            *_entry_richness(row),
            row.id,
        )
        if best_key is None or key > best_key:
            best_key = key
            best = row
    return best


async def _lookup_by_title(db: AsyncSession, title: str | None) -> SongLibrary | None:
    if not title:
        return None

    exact_rows = (await db.execute(
        select(SongLibrary).where(SongLibrary.title.ilike(title.strip()))
    )).scalars().all()
    best_exact = _pick_best_title_match(exact_rows, title)
    if best_exact:
        return best_exact

    terms = _match_terms(title)
    if not terms:
        return None
    fuzzy_rows = (await db.execute(
        select(SongLibrary)
        .where(or_(*[SongLibrary.title.ilike(f"%{term}%") for term in terms]))
        .limit(200)
    )).scalars().all()
    return _pick_best_title_match(fuzzy_rows, title)


async def find_library_match(db: AsyncSession, title: str | None, isrc: str | None) -> SongLibrary | None:
    """ISRC is authoritative; title is a fallback for songs with no ISRC."""
    if isrc:
        row = (await db.execute(
            select(SongLibrary).where(SongLibrary.isrc == isrc).order_by(SongLibrary.id.desc())
        )).scalars().first()
        if row:
            return row
    return await _lookup_by_title(db, title)


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
        raw = json.loads(entry.contributors_json)
        seen: set[tuple] = set()
        unique: list[dict] = []
        for c in raw:
            key = (c.get("name", "").strip().lower(), c.get("role", "").strip().lower())
            if key not in seen:
                seen.add(key)
                unique.append(c)
        return unique
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
            .order_by(SongLibrary.id.desc())
        )).scalars().first()
        if row:
            return row, "code"
    if isrc:
        row = (await db.execute(
            select(SongLibrary).where(SongLibrary.isrc == isrc)
            .order_by(SongLibrary.id.desc())
        )).scalars().first()
        if row:
            return row, "isrc"
    row = await _lookup_by_title(db, title)
    return (row, "title") if row else (None, "none")


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
