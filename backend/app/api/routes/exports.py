import io
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.cue import CueEntry
from app.models.episode import Episode
from app.models.project import Project
from app.models.user import User
from app.services.exporters import build_export

router = APIRouter()

SOCIETIES = {"iprs", "prs", "ascap"}


@router.get("/episode/{episode_id}")
async def export_episode(
    episode_id: int,
    society: str = Query(..., pattern="^(iprs|prs|ascap)$"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    ep = await _load_episode(episode_id, db)
    if not ep:
        raise HTTPException(404)
    proj = await db.get(Project, ep.project_id)
    data = build_export(society, proj, ep)
    fname = f"{proj.title}_EP{ep.episode_number}_{society.upper()}.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/bulk/project/{project_id}")
async def bulk_export(
    project_id: int,
    society: str = Query(..., pattern="^(iprs|prs|ascap)$"),
    from_ep: int = Query(..., ge=1),
    to_ep: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404)
    eps = (await db.execute(
        select(Episode).where(
            Episode.project_id == project_id,
            Episode.episode_number >= from_ep,
            Episode.episode_number <= to_ep,
        ).options(selectinload(Episode.cues).selectinload(CueEntry.contributors)).order_by(Episode.episode_number)
    )).scalars().all()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for ep in eps:
            data = build_export(society, proj, ep)
            zf.writestr(f"EP{ep.episode_number:03d}_{society.upper()}.xlsx", data)
    buf.seek(0)
    fname = f"{proj.title}_{society.upper()}_EP{from_ep}-{to_ep}.zip"
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


async def _load_episode(eid: int, db: AsyncSession) -> Episode | None:
    return (await db.execute(
        select(Episode).where(Episode.id == eid).options(selectinload(Episode.cues).selectinload(CueEntry.contributors))
    )).scalar_one_or_none()
