import json
import re
from difflib import SequenceMatcher

from sqlalchemy import func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cue import Contributor, CueEntry
from app.models.library import ContributorLibrary, MemberDirectory, SongLibrary

_TITLE_TOKEN_RE = re.compile(r"[a-z0-9]+")

# ── IPI/CAE normalization ─────────────────────────────────────────────────────

def normalize_ipi(ipi: str | None) -> str:
    """Strip leading zeros for comparison. '0001234567' == '1234567' → '1234567'."""
    if not ipi:
        return ""
    return (ipi.strip() or "").lstrip("0") or "0"


def pad_ipi(ipi: str | None, length: int = 11) -> str:
    """Pad IPI/CAE to standard 11-digit CISAC format with leading zeros."""
    if not ipi:
        return ""
    core = (ipi.strip() or "").lstrip("0") or "0"
    return core.zfill(length)


def same_ipi(a: str | None, b: str | None) -> bool:
    """True if two IPI/CAE numbers refer to the same person (ignoring leading zeros)."""
    na, nb = normalize_ipi(a), normalize_ipi(b)
    return bool(na and nb and na == nb and na != "0")
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


def dedup_contributors(contribs: list[dict]) -> list[dict]:
    """Remove duplicate contributors sharing same normalized IPI or same name+role."""
    seen_ipi: set[str] = set()
    seen_name_role: set[tuple] = set()
    unique: list[dict] = []
    for c in contribs:
        ipi = c.get("ipi_number") or c.get("cae_number")
        norm = normalize_ipi(ipi)
        key = ((c.get("name") or "").strip().lower(), (c.get("role") or "").strip().lower())
        if norm and norm != "0":
            if norm in seen_ipi:
                continue
            seen_ipi.add(norm)
        elif key in seen_name_role:
            continue
        seen_name_role.add(key)
        unique.append(c)
    return unique


def parse_contributors(entry: SongLibrary) -> list[dict]:
    if not entry.contributors_json:
        return []
    try:
        return dedup_contributors(json.loads(entry.contributors_json))
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
    Priority: song_code > isrc > title (fuzzy — use only for interactive search).
    DO NOT use this for automated upload matching — use find_strict_library_match instead."""
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


async def find_strict_library_match(
    db: AsyncSession,
    isrc: str | None,
    song_code: str | None,
) -> tuple["SongLibrary | None", str]:
    """Exact-only match: song_code or ISRC. NEVER falls back to fuzzy title.
    Use this for all automated upload/commit paths to prevent wrong song matches."""
    if song_code and song_code.strip():
        row = (await db.execute(
            select(SongLibrary).where(or_(
                SongLibrary.song_code == song_code.strip(),
                SongLibrary.work_number == song_code.strip(),
                SongLibrary.ascap_work_id == song_code.strip(),
            )).order_by(SongLibrary.id.desc())
        )).scalars().first()
        if row:
            return row, "code"
    if isrc and isrc.strip():
        row = (await db.execute(
            select(SongLibrary).where(SongLibrary.isrc == isrc.strip())
            .order_by(SongLibrary.id.desc())
        )).scalars().first()
        if row:
            return row, "isrc"
    return None, "none"


async def upsert_cue_to_library(db: AsyncSession, cue: CueEntry) -> SongLibrary | None:
    """Auto-save a cue's song to the library when user saves.
    - If already linked: update the library entry with latest cue data.
    - If not linked: try strict match (code/ISRC), create new entry if not found.
    Contributors JSON is refreshed from current cue contributors.
    Returns the library entry."""
    # Reload with contributors
    cue_with_contribs = (await db.execute(
        select(CueEntry).where(CueEntry.id == cue.id).options(selectinload(CueEntry.contributors))
    )).scalar_one_or_none()
    if not cue_with_contribs:
        return None
    cue = cue_with_contribs

    if not cue.song_title or cue.song_title.strip().lower() in ("", "unknown"):
        return None

    contribs_json = serialize_contributors(cue) if cue.contributors else None

    # Already linked to library — update it with fresh data
    if cue.library_id:
        entry = await db.get(SongLibrary, cue.library_id)
        if entry:
            for field, val in [
                ("isrc", cue.isrc), ("song_code", cue.song_code),
                ("work_number", cue.work_number), ("ascap_work_id", cue.ascap_work_id),
                ("singer", cue.singer),
            ]:
                if val:
                    setattr(entry, field, val)
            if contribs_json:
                entry.contributors_json = contribs_json
            return entry

    # Not linked — try strict match first
    existing, _ = await find_strict_library_match(db, cue.isrc, cue.song_code)
    if existing:
        cue.library_id = existing.id
        for field, val in [
            ("isrc", cue.isrc), ("song_code", cue.song_code),
            ("work_number", cue.work_number), ("ascap_work_id", cue.ascap_work_id),
            ("singer", cue.singer),
        ]:
            if val and not getattr(existing, field):
                setattr(existing, field, val)
        if contribs_json and not existing.contributors_json:
            existing.contributors_json = contribs_json
        return existing

    # Not in library at all — create new entry
    entry = SongLibrary(
        title=cue.song_title.strip(),
        isrc=cue.isrc,
        song_code=cue.song_code,
        work_number=cue.work_number,
        ascap_work_id=cue.ascap_work_id,
        singer=cue.singer,
        contributors_json=contribs_json,
    )
    db.add(entry)
    await db.flush()
    cue.library_id = entry.id
    return entry


async def upsert_contributor_library(
    db: AsyncSession, name: str, role: str, ipi_number: str | None, society: str | None
) -> None:
    """Insert or update contributor in library.
    Dedup strategy: match by normalized IPI first, then by name+role.
    Pads IPI to 11 digits. Merges alt names into JSON if name differs."""
    if not name or len(name.strip()) < 2:
        return
    try:
        clean_name = name.strip()
        padded_ipi = pad_ipi(ipi_number) if ipi_number and ipi_number.strip() else None
        norm_ipi = normalize_ipi(ipi_number) if ipi_number else ""

        existing: ContributorLibrary | None = None

        # Priority 1: match by normalized IPI (same person, possibly zero-padded differently)
        if norm_ipi and norm_ipi != "0":
            all_rows = (await db.execute(select(ContributorLibrary))).scalars().all()
            for row in all_rows:
                if same_ipi(row.ipi_number, ipi_number) or same_ipi(row.cae_number, ipi_number):
                    existing = row
                    break

        # Priority 2: match by name + role
        if not existing:
            existing = (await db.execute(
                select(ContributorLibrary).where(
                    ContributorLibrary.name.ilike(clean_name),
                    ContributorLibrary.role == (role or "Composer"),
                )
            )).scalar_one_or_none()

        if existing:
            # Upgrade IPI to padded format
            if padded_ipi and not existing.ipi_number:
                existing.ipi_number = padded_ipi
            elif padded_ipi and existing.ipi_number and same_ipi(existing.ipi_number, padded_ipi):
                existing.ipi_number = padded_ipi  # always store padded
            if society and not existing.society:
                existing.society = society
            # Merge name into alt_names if this is a different spelling
            existing_lower = existing.name.strip().lower()
            new_lower = clean_name.lower()
            if new_lower != existing_lower:
                alt: dict = json.loads(existing.alt_names) if existing.alt_names else {}
                known = {v.strip().lower() for v in alt.values()} | {existing_lower}
                if new_lower not in known:
                    alt[f"name{len(alt) + 2}"] = clean_name
                    existing.alt_names = json.dumps(alt)
        else:
            db.add(ContributorLibrary(
                name=clean_name,
                role=role or "Composer",
                society=society or None,
                ipi_number=padded_ipi or None,
            ))
    except Exception:
        pass


def _merge_song_group(keep: "SongLibrary", losers: list["SongLibrary"]) -> None:
    """Merge loser rows into keep: fill missing fields, accumulate alt_titles."""
    seen_titles: set[str] = set()
    existing_alts: list[str] = json.loads(keep.alt_titles) if keep.alt_titles else []
    all_titles: list[str] = [keep.title.strip()]
    seen_titles.add(keep.title.strip().lower())
    for t in existing_alts:
        if t.strip().lower() not in seen_titles:
            all_titles.append(t.strip())
            seen_titles.add(t.strip().lower())
    for loser in losers:
        if loser.title and loser.title.strip().lower() not in seen_titles:
            all_titles.append(loser.title.strip())
            seen_titles.add(loser.title.strip().lower())
        for t in (json.loads(loser.alt_titles) if loser.alt_titles else []):
            if t.strip().lower() not in seen_titles:
                all_titles.append(t.strip())
                seen_titles.add(t.strip().lower())
        for f in ("isrc", "song_code", "work_number", "ascap_work_id", "singer", "contributors_json"):
            if not getattr(keep, f) and getattr(loser, f):
                setattr(keep, f, getattr(loser, f))
    keep.alt_titles = json.dumps(all_titles) if len(all_titles) > 1 else None


async def cleanup_song_duplicates(db: AsyncSession) -> int:
    """Comprehensive SongLibrary dedup.
    Phase 1 — same song_code (case-insensitive).
    Phase 2 — same ISRC (after phase 1).
    Richest row wins; all alt titles collected in JSON array."""
    merged = 0
    deleted_ids: set[int] = set()

    # ── Phase 1: group by song_code ─────────────────────────────────────────────
    rows = (await db.execute(select(SongLibrary).where(SongLibrary.song_code.isnot(None)))).scalars().all()
    by_code: dict[str, list[SongLibrary]] = {}
    for r in rows:
        key = r.song_code.strip().lower()
        if key:
            by_code.setdefault(key, []).append(r)

    for _key, group in by_code.items():
        if len(group) < 2:
            continue
        keep = max(group, key=_entry_richness)
        losers = [r for r in group if r.id != keep.id]
        _merge_song_group(keep, losers)
        for loser in losers:
            await db.execute(update(CueEntry).where(CueEntry.library_id == loser.id).values(library_id=keep.id))
            await db.delete(loser)
            deleted_ids.add(loser.id)
            merged += 1

    await db.flush()

    # ── Phase 2: group by ISRC ───────────────────────────────────────────────────
    rows2 = (await db.execute(select(SongLibrary).where(SongLibrary.isrc.isnot(None)))).scalars().all()
    by_isrc: dict[str, list[SongLibrary]] = {}
    for r in rows2:
        if r.id not in deleted_ids:
            key = r.isrc.strip().upper()
            if key:
                by_isrc.setdefault(key, []).append(r)

    for _key, group in by_isrc.items():
        if len(group) < 2:
            continue
        keep = max(group, key=_entry_richness)
        losers = [r for r in group if r.id != keep.id]
        _merge_song_group(keep, losers)
        for loser in losers:
            await db.execute(update(CueEntry).where(CueEntry.library_id == loser.id).values(library_id=keep.id))
            await db.delete(loser)
            deleted_ids.add(loser.id)
            merged += 1

    await db.flush()
    return merged


def _merge_contrib_group(keep: "ContributorLibrary", losers: list["ContributorLibrary"]) -> None:
    """Merge loser rows into keep: fill missing fields, merge all names into alt_names JSON."""
    keep.ipi_number = pad_ipi(keep.ipi_number or keep.cae_number)
    existing_alt: dict = json.loads(keep.alt_names) if keep.alt_names else {}
    keep_lower = keep.name.strip().lower()
    all_known: set[str] = {keep_lower} | {v.strip().lower() for v in existing_alt.values()}
    next_i = max((int(k.replace("name", "") or 1) for k in existing_alt if k.startswith("name")), default=1) + 1
    for loser in losers:
        if not keep.society and loser.society:
            keep.society = loser.society
        if not keep.cae_number and loser.cae_number:
            keep.cae_number = loser.cae_number
        if not keep.ipi_number and loser.ipi_number:
            keep.ipi_number = pad_ipi(loser.ipi_number)
        for name_str in [loser.name] + list((json.loads(loser.alt_names) if loser.alt_names else {}).values()):
            nl = (name_str or "").strip().lower()
            if nl and nl not in all_known:
                existing_alt[f"name{next_i}"] = name_str.strip()
                all_known.add(nl)
                next_i += 1
    if existing_alt:
        keep.alt_names = json.dumps({"name1": keep.name, **existing_alt})


async def cleanup_contributor_duplicates(db: AsyncSession) -> int:
    """Comprehensive ContributorLibrary dedup.
    Phase 1 — same normalized IPI or CAE (strips leading zeros, both fields checked).
    Phase 2 — same name+role with no IPI/CAE (name-only duplicates).
    Winner: most data (society, cae, longest IPI, longest name). IPI padded to 11 digits."""
    rows = (await db.execute(select(ContributorLibrary))).scalars().all()
    merged = 0
    deleted_ids: set[int] = set()

    # ── Phase 1: group by normalized IPI/CAE ────────────────────────────────────
    # A row can match via ipi_number OR cae_number — collect all norms per row
    by_norm: dict[str, list[ContributorLibrary]] = {}
    for r in rows:
        norms: set[str] = set()
        for val in (r.ipi_number, r.cae_number):
            n = normalize_ipi(val)
            if n and n != "0":
                norms.add(n)
        for n in norms:
            by_norm.setdefault(n, []).append(r)

    # Deduplicate groups that overlap (a row might appear in multiple norms)
    processed: set[int] = set()
    for _norm, group in by_norm.items():
        group = [r for r in group if r.id not in processed]
        if len(group) < 2:
            continue
        keep = max(group, key=lambda r: (
            bool(r.society), bool(r.cae_number),
            len(r.ipi_number or ""), len(r.cae_number or ""), len(r.name or ""),
        ))
        losers = [r for r in group if r.id != keep.id]
        _merge_contrib_group(keep, losers)
        for loser in losers:
            await db.delete(loser)
            deleted_ids.add(loser.id)
            processed.add(loser.id)
            merged += 1
        processed.add(keep.id)

    await db.flush()

    # ── Phase 2: same name+role, no IPI/CAE ─────────────────────────────────────
    rows2 = (await db.execute(select(ContributorLibrary))).scalars().all()
    by_name_role: dict[tuple, list[ContributorLibrary]] = {}
    for r in rows2:
        if r.id in deleted_ids:
            continue
        if r.ipi_number or r.cae_number:
            continue  # already handled in phase 1
        key = (r.name.strip().lower(), (r.role or "").strip().lower())
        by_name_role.setdefault(key, []).append(r)

    for _key, group in by_name_role.items():
        if len(group) < 2:
            continue
        keep = max(group, key=lambda r: (bool(r.society), len(r.name or "")))
        losers = [r for r in group if r.id != keep.id]
        _merge_contrib_group(keep, losers)
        for loser in losers:
            await db.delete(loser)
            deleted_ids.add(loser.id)
            merged += 1

    await db.flush()
    return merged


async def normalize_library_contributors_json(db: AsyncSession) -> int:
    """Re-save contributors_json for all SongLibrary rows, deduplicating by normalized IPI.
    Cleans up any dirty data already stored in the DB."""
    rows = (await db.execute(select(SongLibrary).where(SongLibrary.contributors_json.isnot(None)))).scalars().all()
    cleaned = 0
    for row in rows:
        try:
            raw = json.loads(row.contributors_json)
            deduped = dedup_contributors(raw)
            if len(deduped) < len(raw):
                row.contributors_json = json.dumps(deduped)
                cleaned += 1
        except Exception:
            pass
    await db.flush()
    return cleaned


async def cleanup_cue_contributor_duplicates(db: AsyncSession) -> int:
    """Remove duplicate Contributor rows within each cue where IPI matches (normalized).
    Keeps the row with the highest share_percent or most data. Run at startup."""
    all_contribs = (await db.execute(select(Contributor))).scalars().all()
    by_cue: dict[int, list[Contributor]] = {}
    for c in all_contribs:
        by_cue.setdefault(c.cue_id, []).append(c)

    removed = 0
    for _cue_id, rows in by_cue.items():
        seen_ipi: set[str] = set()
        seen_name_role: set[tuple] = set()
        for row in sorted(rows, key=lambda r: (-(r.share_percent or 0), -(len(r.ipi_number or r.cae_number or "")))):
            ipi = row.ipi_number or row.cae_number
            norm = normalize_ipi(ipi)
            key = ((row.name or "").strip().lower(), (row.role or "").strip().lower())
            if norm and norm != "0":
                if norm in seen_ipi:
                    await db.delete(row)
                    removed += 1
                    continue
                seen_ipi.add(norm)
            elif key in seen_name_role:
                await db.delete(row)
                removed += 1
                continue
            seen_name_role.add(key)

    await db.flush()
    return removed


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


# ── Member Directory (IPRS PA/PP lookup) ──────────────────────────────────

def _norm_name(name: str) -> str:
    """Normalize name for fuzzy comparison."""
    s = (name or "").strip().lower()
    s = re.sub(r"[,.\-_]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


async def lookup_member(db: AsyncSession, name: str) -> MemberDirectory | None:
    """Find a MemberDirectory row where name matches PA name or any PP/PG name.
    Returns the row (which always has the canonical PA name)."""
    if not name or len(name.strip()) < 2:
        return None
    n = name.strip()
    norm = _norm_name(n)

    # Exact PA match (case-insensitive)
    row = (await db.execute(
        select(MemberDirectory).where(MemberDirectory.pa_name.ilike(n))
    )).scalars().first()
    if row:
        return row

    # Partial PA match (contains)
    rows = (await db.execute(
        select(MemberDirectory).where(MemberDirectory.pa_name.ilike(f"%{n}%")).limit(20)
    )).scalars().all()
    for r in rows:
        if _norm_name(r.pa_name) == norm:
            return r

    # PP/PG match: scan pp_names_json (PostgreSQL JSON containment not available,
    # use LIKE on the raw JSON text which is fast enough for <20k rows)
    pp_rows = (await db.execute(
        select(MemberDirectory).where(
            MemberDirectory.pp_names_json.ilike(f"%{n}%")
        ).limit(50)
    )).scalars().all()
    for r in pp_rows:
        try:
            pp_list = json.loads(r.pp_names_json or "[]")
        except Exception:
            continue
        for pp in pp_list:
            if _norm_name(pp) == norm:
                return r

    return None


async def resolve_contributor_name(db: AsyncSession, name: str) -> dict | None:
    """Given any name (PA or PP), return dict with canonical pa_name, ipi_number, role.
    Returns None if not found in member directory."""
    member = await lookup_member(db, name)
    if not member:
        return None
    return {
        "pa_name": member.pa_name,
        "ipi_number": member.ipi_number or None,
        "role": member.role,
    }


async def search_members(db: AsyncSession, q: str, limit: int = 25) -> list[MemberDirectory]:
    """Search member directory by PA name or PP names."""
    if not q or len(q.strip()) < 1:
        return []
    q = q.strip()
    rows = (await db.execute(
        select(MemberDirectory).where(
            or_(
                MemberDirectory.pa_name.ilike(f"%{q}%"),
                MemberDirectory.pp_names_json.ilike(f"%{q}%"),
            )
        ).limit(limit)
    )).scalars().all()
    return rows
