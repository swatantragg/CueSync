import io
import zipfile

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.cue import CueEntry
from app.models.episode import Episode
from app.models.project import Project
from app.models.user import User
from app.services.bulk_exports import bulk_name, bulk_range, society_bulk, work_files_in_range
from app.services.exporters import build_export
from app.services.exporters._common import XLSX_MEDIA_TYPE, safe_filename
from app.services.work_files import build_work_file_bulk

router = APIRouter()

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
    total_ep_count = (await db.execute(
        select(func.count()).select_from(Episode).where(Episode.project_id == proj.id)
    )).scalar() or 0
    data = build_export(society, proj, ep, total_ep_count=total_ep_count)
    fname = f"{proj.title}_EP{ep.episode_number}_{society.upper()}.xlsx"
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/bulk/project/{project_id}")
async def bulk_export(
    project_id: int,
    society: str = Query(..., pattern="^(iprs|prs|ascap|workfile)$"),
    from_ep: int = Query(..., ge=1),
    to_ep: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if society == "workfile":
        proj = await db.get(Project, project_id)
        if not proj:
            raise HTTPException(404)
        files = await work_files_in_range(db, project_id, from_ep, to_ep)
        if not files:
            raise HTTPException(404, f"No work files uploaded for Ep {from_ep}–{to_ep}")
        data = build_work_file_bulk(files)
        fname = bulk_name(proj, "WorkFile", from_ep, to_ep)
    else:
        proj, eps, total_ep_count = await bulk_range(db, project_id, from_ep, to_ep)
        data = society_bulk(society, proj, eps, total_ep_count)
        fname = bulk_name(proj, society.upper(), from_ep, to_ep)
    return StreamingResponse(
        io.BytesIO(data),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{safe_filename(fname)}"'},
    )


@router.get("/bulk/project/{project_id}/all")
async def bulk_export_all(
    project_id: int,
    from_ep: int = Query(..., ge=1),
    to_ep: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """One ZIP with the IPRS, PRS and ASCAP bulk sheets plus the work file for the range (when uploaded)."""
    proj, eps, total_ep_count = await bulk_range(db, project_id, from_ep, to_ep)
    files = await work_files_in_range(db, project_id, from_ep, to_ep)
    if not eps and not files:
        raise HTTPException(404, f"No episodes or work files for Ep {from_ep}–{to_ep}")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if eps:
            for society in ("iprs", "prs", "ascap"):
                zf.writestr(
                    bulk_name(proj, society.upper(), from_ep, to_ep),
                    society_bulk(society, proj, eps, total_ep_count),
                )
        if files:
            zf.writestr(bulk_name(proj, "WorkFile", from_ep, to_ep), build_work_file_bulk(files))
    fname = bulk_name(proj, "All", from_ep, to_ep, ext="zip")
    return StreamingResponse(
        io.BytesIO(buf.getvalue()),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_filename(fname)}"',
            # Lets the UI say when the range had no work files (or no cue sheets) to include.
            "X-Work-Files": str(len(files)),
            "X-Episodes": str(len(eps)),
        },
    )


async def _load_episode(eid: int, db: AsyncSession) -> Episode | None:
    return (await db.execute(
        select(Episode).where(Episode.id == eid).options(selectinload(Episode.cues).selectinload(CueEntry.contributors))
    )).scalar_one_or_none()
