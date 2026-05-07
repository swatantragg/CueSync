import json
import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile

_ALLOWED_EXTENSIONS = {".xlsx", ".xls"}
_ALLOWED_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "application/octet-stream",
    "application/zip",  # .xlsx is a zip container
}


def _validate_excel(file: UploadFile) -> None:
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXTENSIONS:
        raise HTTPException(400, "Only Excel files (.xlsx, .xls) are accepted")
    ct = (file.content_type or "").split(";")[0].strip()
    if ct and ct not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(400, "Invalid file type. Upload an Excel file (.xlsx or .xls)")
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.cue import Contributor, CueEntry, UsageType
from app.models.episode import Episode
from app.models.library import ContributorLibrary, SongLibrary
from app.models.project import Project
from app.models.user import User, UserRole
from app.services.cue_rules import apply_share_rules, usage_code as get_char_code
from app.services.audit import log_activity
from app.services.library_sync import (
    apply_library_to_cue,
    dedup_contributors,
    find_autofill_library_match,
    find_strict_library_match,
    resolve_contributor_name,
)
from app.services.rough_parser import parse_rough_workbook

router = APIRouter()


# ── Contributor name-based enrichment (independent of song match) ─────────────

async def _enrich_contrib_by_name(db: AsyncSession, contrib: dict) -> dict:
    """Fill missing IPI/CAE and society; resolve PP → PA name via member directory."""
    name = (contrib.get("name") or "").strip()
    if not name or len(name) < 2:
        return contrib

    result = {**contrib}

    # Priority 0: member directory — resolves PP/PG → PA and fills IPI
    member = await resolve_contributor_name(db, name)
    if member:
        result["name"] = member["pa_name"]  # always use real/registered name
        if not result.get("ipi_number"):
            result["ipi_number"] = member["ipi_number"] or result.get("ipi_number")
        if not result.get("society"):
            result["society"] = "IPRS"
        if not result.get("role") or result.get("role") == "Composer":
            result["role"] = member["role"]
        return result

    has_ipi = bool(result.get("ipi_number") or result.get("cae_number"))
    has_society = bool(result.get("society"))
    if has_ipi and has_society:
        return result

    # Priority 1: ContributorLibrary (curated past entries)
    cl_rows = (await db.execute(
        select(ContributorLibrary).where(ContributorLibrary.name.ilike(name)).limit(5)
    )).scalars().all()
    if cl_rows:
        best = max(cl_rows, key=lambda r: (bool(r.ipi_number), bool(r.cae_number), bool(r.society)))
        if not has_ipi and (best.ipi_number or best.cae_number):
            result["ipi_number"] = best.ipi_number or best.cae_number
        if not has_society and best.society:
            result["society"] = best.society
        return result

    # Priority 2: Contributor table (from any cue entry)
    cue_rows = (await db.execute(
        select(Contributor).where(Contributor.name.ilike(f"%{name}%")).limit(20)
    )).scalars().all()
    if cue_rows:
        best = max(cue_rows, key=lambda r: (bool(r.ipi_number), bool(r.cae_number), bool(r.society)))
        if not has_ipi and (best.ipi_number or best.cae_number):
            result["ipi_number"] = best.ipi_number or best.cae_number
        if not has_society and best.society:
            result["society"] = best.society

    return result


# ── Pydantic schemas for commit payload ───────────────────────────────────────

class ContributorIn(BaseModel):
    name: str
    role: str = "Composer"
    society: str | None = None
    share_percent: float = 0
    ipi_number: str | None = None


class CueIn(BaseModel):
    song_title: str
    usage_type: str = "bi"
    duration_sec: int = 0
    usage_count: int = 1
    song_code: str | None = None
    isrc: str | None = None
    singer: str | None = None
    library_id: int | None = None
    order_index: int = 0
    contributors: list[ContributorIn] = []


class EpisodeIn(BaseModel):
    episode_number: int
    title: str | None = None
    air_date: str | None = None
    total_duration_sec: int | None = None
    musical_duration_sec: int | None = None
    bg_instrumental_duration_sec: int | None = None
    bg_vocal_duration_sec: int | None = None
    existing_episode_id: int | None = None
    cues: list[CueIn] = []


class CommitPayload(BaseModel):
    episodes: list[EpisodeIn]


# ── Existing direct upload (kept for backward compat) ─────────────────────────

@router.post("/rough/project/{project_id}", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def upload_rough(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    _validate_excel(file)
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    data = await file.read()
    try:
        parsed = parse_rough_workbook(data, filename=file.filename or "")
    except Exception:
        raise HTTPException(400, "Failed to parse the Excel file. Ensure it is a valid rough sheet.")

    meta = parsed["meta"]
    for k in ("director", "genre", "language", "production_company", "actors", "producer", "bg_music_composer"):
        if meta.get(k) and not getattr(proj, k, None):
            setattr(proj, k, meta[k])

    created_eps = []
    for ep in parsed["episodes"]:
        existing = (await db.execute(
            select(Episode).where(Episode.project_id == project_id, Episode.episode_number == ep["episode_number"])
        )).scalar_one_or_none()
        if existing:
            continue
        e = Episode(
            project_id=project_id,
            episode_number=ep["episode_number"],
            title=ep["title"],
            air_date=ep["air_date"],
            total_duration_sec=ep["total_duration_sec"],
            musical_duration_sec=ep["musical_duration_sec"],
            bg_instrumental_duration_sec=ep["bg_instrumental_duration_sec"],
            bg_vocal_duration_sec=ep["bg_vocal_duration_sec"],
        )
        db.add(e)
        await db.flush()
        for c in ep["cues"]:
            try:
                ut = UsageType(c["usage_type"])
            except Exception:
                ut = UsageType.BI
            cue = CueEntry(
                episode_id=e.id,
                song_title=c["song_title"],
                usage_type=ut,
                duration_sec=c["duration_sec"] or 0,
                usage_count=c["usage_count"],
                song_code=c.get("song_code"),
                order_index=c["order_index"],
            )
            db.add(cue)
            await db.flush()
            for ctb in c["contributors"]:
                db.add(Contributor(cue_id=cue.id, **ctb))
            await db.flush()  # flush before library check so contrib count is accurate
            lib = await find_autofill_library_match(db, cue.song_title, cue.isrc, cue.song_code)
            if lib:
                await apply_library_to_cue(db, cue, lib)
        created_eps.append(e.id)
        await log_activity(
            db, current.id, "upload", "episode", e.id,
            f"Uploaded rough sheet ({file.filename}) — Episode {ep['episode_number']}",
        )

    await db.flush()
    await _autofill_from_neighbors(db, project_id)
    await log_activity(
        db, current.id, "upload", "project", project_id,
        f"Uploaded rough sheet ({file.filename}) — {len(created_eps)} episodes",
    )
    await db.commit()
    return {"ok": True, "project_id": project_id, "episodes_created": len(created_eps), "meta": meta}


# ── Preview: parse + tally against DB, no writes ──────────────────────────────

@router.post("/rough/project/{project_id}/preview", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def preview_rough(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    try:
        _validate_excel(file)
        proj = await db.get(Project, project_id)
        if not proj:
            raise HTTPException(404, "Project not found")
        data = await file.read()
        try:
            parsed = parse_rough_workbook(data, filename=file.filename or "")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(400, "Failed to parse the Excel file. Ensure it is a valid rough sheet.")

        enriched_episodes = []
        for ep in parsed["episodes"]:
            existing = (await db.execute(
                select(Episode).where(
                    Episode.project_id == project_id,
                    Episode.episode_number == ep["episode_number"],
                )
            )).scalar_one_or_none()

            enriched_cues = []
            for cue in ep["cues"]:
                lib, match_type = await find_strict_library_match(
                    db,
                    isrc=cue.get("isrc"),
                    song_code=cue.get("song_code"),
                )
                if not lib:
                    lib = await find_autofill_library_match(
                        db,
                        title=cue.get("song_title"),
                        isrc=cue.get("isrc"),
                        song_code=cue.get("song_code"),
                    )
                    match_type = "title" if lib else "none"

                enriched_cue: dict = {
                    "song_title":    cue["song_title"],
                    "usage_type":    cue["usage_type"],
                    "usage_label":   cue.get("usage_label", ""),
                    "duration_sec":  cue["duration_sec"],
                    "usage_count":   cue["usage_count"],
                    "song_code":     cue.get("song_code"),
                    "isrc":          cue.get("isrc"),
                    "singer":        cue.get("singer"),
                    "order_index":   cue["order_index"],
                    "library_id":    None,
                    "library_match": match_type,
                    "contributors":  [],
                }

                # ── Song-level fields from library (fills only missing fields) ──
                if lib:
                    enriched_cue["library_id"] = lib.id
                    if not enriched_cue["isrc"] and lib.isrc:
                        enriched_cue["isrc"] = lib.isrc
                    if not enriched_cue["singer"] and lib.singer:
                        enriched_cue["singer"] = lib.singer
                    if not enriched_cue["song_code"] and lib.song_code:
                        enriched_cue["song_code"] = lib.song_code

                # ── Contributors: always use rough sheet, enrich by name lookup ──
                raw_contribs: list[dict] = cue.get("contributors", [])
                enriched_raw: list[dict] = []
                for rc in raw_contribs:
                    ec = await _enrich_contrib_by_name(db, rc)
                    enriched_raw.append({
                        **ec,
                        "library_match": bool(ec.get("ipi_number") and ec.get("ipi_number") != rc.get("ipi_number")),
                    })

                preview_char_code = get_char_code(cue.get("usage_type"), cue.get("song_title"))
                enriched_cue["contributors"] = apply_share_rules(enriched_raw, char_code=preview_char_code)

                enriched_cues.append(enriched_cue)

            enriched_episodes.append({
                **ep,
                "cues":               enriched_cues,
                "existing_episode_id": existing.id if existing else None,
            })

        return {"meta": parsed["meta"], "episodes": enriched_episodes}

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "Preview failed. Please try again.")


# ── Commit: save edited preview data to DB ────────────────────────────────────

@router.post("/rough/project/{project_id}/commit", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def commit_rough(
    project_id: int,
    payload: CommitPayload,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")

    created_eps = []
    try:
        for ep_data in payload.episodes:
            if ep_data.existing_episode_id:
                continue  # already in DB — skip

            existing = (await db.execute(
                select(Episode).where(
                    Episode.project_id == project_id,
                    Episode.episode_number == ep_data.episode_number,
                )
            )).scalar_one_or_none()
            if existing:
                continue

            e = Episode(
                project_id=project_id,
                episode_number=ep_data.episode_number,
                title=ep_data.title,
                air_date=ep_data.air_date,
                total_duration_sec=ep_data.total_duration_sec,
                musical_duration_sec=ep_data.musical_duration_sec,
                bg_instrumental_duration_sec=ep_data.bg_instrumental_duration_sec,
                bg_vocal_duration_sec=ep_data.bg_vocal_duration_sec,
            )
            db.add(e)
            await db.flush()

            seen_cues: set[tuple] = set()
            for cue_data in ep_data.cues:
                dedup_key = (cue_data.song_title.strip().lower(), cue_data.order_index)
                if dedup_key in seen_cues:
                    continue
                seen_cues.add(dedup_key)
                try:
                    ut = UsageType(cue_data.usage_type)
                except Exception:
                    ut = UsageType.BI

                cue = CueEntry(
                    episode_id=e.id,
                    song_title=cue_data.song_title,
                    usage_type=ut,
                    duration_sec=cue_data.duration_sec or 0,
                    usage_count=cue_data.usage_count or 1,
                    song_code=cue_data.song_code,
                    isrc=cue_data.isrc,
                    singer=cue_data.singer,
                    library_id=cue_data.library_id,
                    order_index=cue_data.order_index,
                )
                db.add(cue)
                await db.flush()

                # Fill work_number / ascap_work_id from library (not in commit payload)
                lib_entry = None
                if cue_data.library_id:
                    lib_entry = await db.get(SongLibrary, cue_data.library_id)
                if lib_entry is None:
                    lib_entry = await find_autofill_library_match(
                        db,
                        title=cue_data.song_title,
                        isrc=cue_data.isrc,
                        song_code=cue_data.song_code,
                    )
                if lib_entry:
                    for field in ("work_number", "ascap_work_id"):
                        if not getattr(cue, field) and getattr(lib_entry, field):
                            setattr(cue, field, getattr(lib_entry, field))
                    if not cue.library_id:
                        cue.library_id = lib_entry.id

                cue_char_code = get_char_code(cue_data.usage_type, cue_data.song_title)
                for ctb in apply_share_rules(
                    dedup_contributors([{
                        "name": c.name, "role": c.role, "society": c.society,
                        "share_percent": c.share_percent or 0, "ipi_number": c.ipi_number,
                    } for c in cue_data.contributors]),
                    char_code=cue_char_code,
                    preserve_manual=True,
                ):
                    db.add(Contributor(cue_id=cue.id, **ctb))

            created_eps.append(e.id)
            await log_activity(
                db, current.id, "upload", "episode", e.id,
                f"Committed rough sheet — Episode {ep_data.episode_number}",
            )

        await log_activity(
            db, current.id, "upload", "project", project_id,
            f"Committed rough sheet — {len(created_eps)} new episodes",
        )
        await db.commit()
    except SQLAlchemyError:
        await db.rollback()
        raise HTTPException(500, "Commit failed. Please try again.")
    return {"ok": True, "project_id": project_id, "episodes_created": len(created_eps)}


# ── Internal helper ───────────────────────────────────────────────────────────

async def _autofill_from_neighbors(db: AsyncSession, project_id: int):
    def identity_keys(cue: CueEntry) -> list[tuple[str, str]]:
        keys: list[tuple[str, str]] = []
        if cue.isrc and cue.isrc.strip():
            keys.append(("isrc", cue.isrc.strip().lower()))
        for field in ("song_code", "work_number", "ascap_work_id"):
            value = (getattr(cue, field) or "").strip()
            if value:
                keys.append(("code", value.lower()))
        return keys

    all_cues = (await db.execute(
        select(CueEntry).options(selectinload(CueEntry.contributors))
    )).scalars().all()

    library: dict[tuple[str, str], CueEntry] = {}
    for c in all_cues:
        for key in identity_keys(c):
            if key not in library and c.contributors:
                library[key] = c

    target_eps = (await db.execute(
        select(Episode).where(Episode.project_id == project_id)
        .options(selectinload(Episode.cues).selectinload(CueEntry.contributors))
    )).scalars().all()
    for ep in target_eps:
        for cue in ep.cues:
            src = next((library[k] for k in identity_keys(cue) if k in library), None)
            if not src or src.id == cue.id:
                continue
            if not cue.contributors and src.contributors:
                for pc in src.contributors:
                    db.add(Contributor(
                        cue_id=cue.id, name=pc.name, role=pc.role, society=pc.society,
                        share_percent=pc.share_percent, ipi_number=pc.ipi_number, cae_number=pc.cae_number,
                    ))
            for field in ("isrc", "song_code", "work_number", "ascap_work_id", "singer", "library_id"):
                if not getattr(cue, field) and getattr(src, field):
                    setattr(cue, field, getattr(src, field))
