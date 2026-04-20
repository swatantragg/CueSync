from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.cue import Contributor, CueEntry, UsageType
from app.models.episode import Episode
from app.models.project import Project
from app.models.user import User, UserRole
from app.services.rough_parser import parse_rough_workbook

router = APIRouter()


@router.post("/rough/project/{project_id}", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def upload_rough(
    project_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    data = await file.read()
    try:
        parsed = parse_rough_workbook(data)
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
        created_eps.append(e.id)

    await db.flush()
    await _autofill_from_neighbors(db, project_id)
    await db.commit()
    return {"ok": True, "project_id": project_id, "episodes_created": len(created_eps), "meta": meta}


async def _autofill_from_neighbors(db: AsyncSession, project_id: int):
    """For each cue with no contributors, copy from any other episode in the
    project that has the same song_title and contributor data. Also copy
    missing scalar fields (isrc, song_code, work_number, ascap_work_id)."""
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
            for field in ("isrc", "song_code", "work_number", "ascap_work_id"):
                if not getattr(cue, field) and getattr(src, field):
                    setattr(cue, field, getattr(src, field))
