from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user, require_roles
from app.models.cue import Contributor, CueEntry
from app.models.user import User, UserRole
from app.schemas.cue import CueCreate, CueOut, CueUpdate
from app.services.cue_rules import apply_share_rules, usage_code as get_char_code
from app.services.audit import log_activity
from app.services.library_sync import (
    apply_library_to_cue,
    dedup_contributors,
    find_autofill_library_match,
    propagate_cue_to_siblings,
    reconcile_library,
    upsert_contributor_library,
    upsert_cue_to_library,
)

router = APIRouter()


@router.post("/episode/{episode_id}", response_model=CueOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def create_cue(episode_id: int, payload: CueCreate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    data = payload.model_dump(exclude={"contributors"})
    cue = CueEntry(episode_id=episode_id, **data)
    db.add(cue)
    await db.flush()
    char_code = get_char_code(payload.usage_type, payload.song_title)
    for cd in apply_share_rules(dedup_contributors([co.model_dump() for co in payload.contributors]), char_code=char_code):
        db.add(Contributor(cue_id=cue.id, **cd))
    await db.flush()
    lib = await find_autofill_library_match(db, cue.song_title, cue.isrc, cue.song_code)
    if lib:
        await apply_library_to_cue(db, cue, lib)
    await propagate_cue_to_siblings(db, await _get_cue(cue.id, db))
    await log_activity(db, current.id, "create", "episode", episode_id, f"Added song '{payload.song_title}'")
    await db.commit()
    return await _get_cue(cue.id, db)


@router.get("/episode/{episode_id}", response_model=list[CueOut])
async def list_cues(episode_id: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    res = await db.execute(
        select(CueEntry).where(CueEntry.episode_id == episode_id)
        .options(selectinload(CueEntry.contributors)).order_by(CueEntry.order_index, CueEntry.id)
    )
    return res.scalars().all()


@router.get("/{cid}", response_model=CueOut)
async def get_cue(cid: int, db: AsyncSession = Depends(get_db), _: User = Depends(get_current_user)):
    return await _get_cue(cid, db)


@router.put("/{cid}", response_model=CueOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def update_cue(cid: int, payload: CueUpdate, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    cue = (await db.execute(select(CueEntry).where(CueEntry.id == cid).options(selectinload(CueEntry.contributors)))).scalar_one_or_none()
    if not cue:
        raise HTTPException(404)
    ep_id = cue.episode_id
    for k, v in payload.model_dump(exclude={"contributors"}).items():
        setattr(cue, k, v)
    for old in list(cue.contributors):
        await db.delete(old)
    await db.flush()
    char_code = get_char_code(payload.usage_type, payload.song_title)
    for cd in apply_share_rules(
        dedup_contributors([co.model_dump() for co in payload.contributors]),
        char_code=char_code,
        preserve_manual=True,
    ):
        db.add(Contributor(cue_id=cue.id, **cd))
    await db.flush()
    await reconcile_library(db, cue.song_title, cue.isrc)
    await propagate_cue_to_siblings(db, await _get_cue(cue.id, db))
    # Auto-save song + contributors to library on every user save
    await upsert_cue_to_library(db, await _get_cue(cue.id, db))
    for co in payload.contributors:
        if co.name and co.ipi_number:
            await upsert_contributor_library(db, co.name, co.role or "Composer", co.ipi_number, co.society)
    await log_activity(db, current.id, "update", "episode", ep_id, f"Edited song '{payload.song_title}'")
    await db.commit()
    return await _get_cue(cid, db)


@router.post("/{cid}/copy-to/{target_episode_id}", response_model=CueOut, dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def copy_cue_to_episode(cid: int, target_episode_id: int, db: AsyncSession = Depends(get_db)):
    src = (await db.execute(select(CueEntry).where(CueEntry.id == cid).options(selectinload(CueEntry.contributors)))).scalar_one_or_none()
    if not src:
        raise HTTPException(404, "Source cue not found")
    nc = CueEntry(
        episode_id=target_episode_id, song_title=src.song_title, usage_type=src.usage_type,
        duration_sec=src.duration_sec, usage_count=src.usage_count, isrc=src.isrc,
        song_code=src.song_code, work_number=src.work_number, ascap_work_id=src.ascap_work_id,
        validation_link=src.validation_link, order_index=src.order_index,
    )
    db.add(nc)
    await db.flush()
    for ct in src.contributors:
        db.add(Contributor(cue_id=nc.id, name=ct.name, role=ct.role, society=ct.society,
                           share_percent=ct.share_percent, ipi_number=ct.ipi_number, cae_number=ct.cae_number))
    await db.commit()
    return await _get_cue(nc.id, db)


@router.delete("/{cid}", dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))])
async def delete_cue(cid: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    cue = await db.get(CueEntry, cid)
    if not cue:
        raise HTTPException(404)
    ep_id = cue.episode_id
    title = cue.song_title
    await db.delete(cue)
    await log_activity(db, current.id, "delete", "episode", ep_id, f"Removed song '{title}'")
    await db.commit()
    return {"ok": True}


async def _get_cue(cid: int, db: AsyncSession) -> CueEntry:
    cue = (await db.execute(select(CueEntry).where(CueEntry.id == cid).options(selectinload(CueEntry.contributors)))).scalar_one_or_none()
    if not cue:
        raise HTTPException(404)
    return cue
