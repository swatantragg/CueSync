import json

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.cue import Contributor, CueEntry, UsageType
from app.models.episode import Episode
from app.models.library import SongLibrary
from app.models.project import Project
from app.models.user import User, UserRole
from app.services.audit import log_activity
from app.services.library_sync import (
    apply_library_to_cue,
    find_library_match,
    find_library_match_extended,
    parse_contributors,
)
from app.services.rough_parser import parse_rough_workbook

router = APIRouter()


# ── Pydantic schemas for commit payload ───────────────────────────────────────

class ContributorIn(BaseModel):
    name: str
    role: str = "Composer"
    society: str | None = None
    share_percent: float = 0
    ipi_number: str | None = None


class CueIn(BaseModel):
    song_title: str
    usage_type: str = "background"
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
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    data = await file.read()
    try:
        parsed = parse_rough_workbook(data, filename=file.filename or "")
    except Exception as e:
        raise HTTPException(400, f"Parse error: {e}")

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
                ut = UsageType.BACKGROUND
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
            lib = await find_library_match(db, cue.song_title, cue.isrc)
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
        proj = await db.get(Project, project_id)
        if not proj:
            raise HTTPException(404, "Project not found")
        data = await file.read()
        try:
            parsed = parse_rough_workbook(data, filename=file.filename or "")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(400, f"Parse error: {e}")

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
                lib, match_type = await find_library_match_extended(
                    db,
                    title=cue["song_title"],
                    isrc=cue.get("isrc"),
                    song_code=cue.get("song_code"),
                )

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

                lib_contribs: list[dict] = []
                if lib:
                    enriched_cue["library_id"] = lib.id
                    # Always fill from library when match found — authoritative source
                    if lib.isrc:
                        enriched_cue["isrc"] = lib.isrc
                    if lib.singer:
                        enriched_cue["singer"] = lib.singer
                    if lib.song_code:
                        enriched_cue["song_code"] = lib.song_code
                    lib_contribs = parse_contributors(lib)

                raw_contribs: list[dict] = cue.get("contributors", [])
                if lib_contribs:
                    # Library contributors are authoritative — show them first
                    enriched_cue["contributors"] = [
                        {**c, "library_match": True} for c in lib_contribs
                    ]
                    # Append rough-sheet contributors not already present in library
                    lib_names = {c.get("name", "").lower() for c in lib_contribs}
                    for c in raw_contribs:
                        if c.get("name", "").lower() not in lib_names:
                            enriched_cue["contributors"].append({**c, "library_match": False})
                elif raw_contribs:
                    enriched_cue["contributors"] = [
                        {**c, "library_match": False} for c in raw_contribs
                    ]

                enriched_cues.append(enriched_cue)

            enriched_episodes.append({
                **ep,
                "cues":               enriched_cues,
                "existing_episode_id": existing.id if existing else None,
            })

        return {"meta": parsed["meta"], "episodes": enriched_episodes}

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(500, f"Preview failed: {exc}")


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

        for cue_data in ep_data.cues:
            try:
                ut = UsageType(cue_data.usage_type)
            except Exception:
                ut = UsageType.BACKGROUND

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
                lib_entry, _ = await find_library_match_extended(
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

            for ctb in cue_data.contributors:
                db.add(Contributor(
                    cue_id=cue.id,
                    name=ctb.name,
                    role=ctb.role,
                    society=ctb.society,
                    share_percent=ctb.share_percent or 0,
                    ipi_number=ctb.ipi_number,
                ))

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
    return {"ok": True, "project_id": project_id, "episodes_created": len(created_eps)}


# ── Internal helper ───────────────────────────────────────────────────────────

async def _autofill_from_neighbors(db: AsyncSession, project_id: int):
    all_cues = (await db.execute(
        select(CueEntry).options(selectinload(CueEntry.contributors))
    )).scalars().all()

    library: dict[str, CueEntry] = {}
    for c in all_cues:
        key = (c.song_title or "").strip().lower()
        if not key:
            continue
        if key not in library and c.contributors:
            library[key] = c

    target_eps = (await db.execute(
        select(Episode).where(Episode.project_id == project_id)
        .options(selectinload(Episode.cues).selectinload(CueEntry.contributors))
    )).scalars().all()
    for ep in target_eps:
        for cue in ep.cues:
            key = (cue.song_title or "").strip().lower()
            src = library.get(key)
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
