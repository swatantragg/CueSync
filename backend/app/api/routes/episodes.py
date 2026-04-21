from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.cue import Contributor, CueEntry
from app.models.episode import Episode
from app.models.user import User, UserRole
from app.schemas.episode import EpisodeCloneIn, EpisodeCreate, EpisodeOut, EpisodeUpdate, ReviewNoteIn
from app.services.audit import log_activity

router = APIRouter()


@router.post("/project/{project_id}", response_model=EpisodeOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def create_episode(project_id: int, payload: EpisodeCreate, db: AsyncSession = Depends(get_db)):
    ep = Episode(project_id=project_id, **payload.model_dump())
    db.add(ep)
    await db.commit()
    await db.refresh(ep)
    return ep


@router.get("/project/{project_id}", response_model=list[EpisodeOut])
async def list_episodes(project_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return (await db.execute(select(Episode).where(Episode.project_id == project_id).order_by(Episode.episode_number))).scalars().all()


@router.get("/{eid}", response_model=EpisodeOut)
async def get_episode(eid: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    ep = await db.get(Episode, eid)
    if not ep:
        raise HTTPException(404)
    return ep


@router.put("/{eid}", response_model=EpisodeOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def update_episode(eid: int, payload: EpisodeUpdate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ep = await db.get(Episode, eid)
    if not ep:
        raise HTTPException(404)
    for k, v in payload.model_dump().items():
        setattr(ep, k, v)
    await log_activity(db, current.id, "update", "episode", eid, "Edited episode details")
    await db.commit()
    await db.refresh(ep)
    return ep


@router.delete("/{eid}", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def delete_episode(eid: int, db: AsyncSession = Depends(get_db)):
    ep = await db.get(Episode, eid)
    if not ep:
        raise HTTPException(404)
    await db.delete(ep)
    await db.commit()
    return {"ok": True}


@router.post("/{eid}/submit", response_model=EpisodeOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def submit_episode(eid: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ep = await db.get(Episode, eid)
    if not ep:
        raise HTTPException(404)
    ep.status = "submitted"
    ep.rejection_note = None
    await log_activity(db, current.id, "submit", "episode", eid, "Submitted for approval")
    await db.commit()
    await db.refresh(ep)
    return ep


@router.post("/{eid}/approve", response_model=EpisodeOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def approve_episode(eid: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ep = await db.get(Episode, eid)
    if not ep:
        raise HTTPException(404)
    ep.status = "approved"
    ep.rejection_note = None
    await log_activity(db, current.id, "approve", "episode", eid, "Approved episode")
    await db.commit()
    await db.refresh(ep)
    return ep


@router.post("/{eid}/reject", response_model=EpisodeOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def reject_episode(eid: int, payload: ReviewNoteIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ep = await db.get(Episode, eid)
    if not ep:
        raise HTTPException(404)
    if not payload.note.strip():
        raise HTTPException(400, "Rejection note required")
    ep.status = "rejected"
    ep.rejection_note = payload.note.strip()
    await log_activity(db, current.id, "reject", "episode", eid, f"Rejected — {payload.note.strip()}")
    await db.commit()
    await db.refresh(ep)
    return ep


@router.post("/{eid}/suggest", response_model=EpisodeOut, dependencies=[Depends(require_roles(UserRole.ADMIN))])
async def suggest_changes(eid: int, payload: ReviewNoteIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    ep = await db.get(Episode, eid)
    if not ep:
        raise HTTPException(404)
    if not payload.note.strip():
        raise HTTPException(400, "Suggestion note required")
    ep.status = "edited"
    ep.review_note = payload.note.strip()
    await log_activity(db, current.id, "suggest", "episode", eid, f"Suggested changes — {payload.note.strip()}")
    await db.commit()
    await db.refresh(ep)
    return ep


@router.post("/clone", response_model=EpisodeOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def clone_episode(payload: EpisodeCloneIn, db: AsyncSession = Depends(get_db)):
    src = (await db.execute(
        select(Episode).where(Episode.id == payload.source_episode_id).options(selectinload(Episode.cues).selectinload(CueEntry.contributors))
    )).scalar_one_or_none()
    if not src:
        raise HTTPException(404, "Source episode not found")
    new_ep = Episode(
        project_id=src.project_id,
        episode_number=payload.new_episode_number,
        title=payload.new_title or src.title,
        total_duration_sec=src.total_duration_sec,
        musical_duration_sec=src.musical_duration_sec,
        bg_instrumental_duration_sec=src.bg_instrumental_duration_sec,
        bg_vocal_duration_sec=src.bg_vocal_duration_sec,
    )
    db.add(new_ep)
    await db.flush()
    for c in src.cues:
        nc = CueEntry(
            episode_id=new_ep.id,
            song_title=c.song_title,
            usage_type=c.usage_type,
            duration_sec=c.duration_sec,
            usage_count=c.usage_count,
            isrc=c.isrc,
            song_code=c.song_code,
            work_number=c.work_number,
            ascap_work_id=c.ascap_work_id,
            validation_link=c.validation_link,
            order_index=c.order_index,
        )
        db.add(nc)
        await db.flush()
        for ctb in c.contributors:
            db.add(Contributor(
                cue_id=nc.id, name=ctb.name, role=ctb.role, society=ctb.society,
                share_percent=ctb.share_percent, ipi_number=ctb.ipi_number, cae_number=ctb.cae_number,
            ))
    await db.commit()
    await db.refresh(new_ep)
    return new_ep
