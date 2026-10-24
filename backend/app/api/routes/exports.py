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
from app.models.work_file import WorkFile
from app.services.exporters import build_export
from app.services.exporters._common import XLSX_MEDIA_TYPE, safe_filename
from app.services.exporters.ascap import build_ascap_bulk
from app.services.exporters.iprs import build_iprs_bulk
from app.services.exporters.prs import build_prs_bulk
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


async def _bulk_range(db: AsyncSession, project_id: int, from_ep: int, to_ep: int):
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
    total_ep_count = (await db.execute(
        select(func.count()).select_from(Episode).where(Episode.project_id == project_id)
    )).scalar() or 0
    return proj, eps, total_ep_count


def _society_bulk(society: str, proj: Project, eps: list, total_ep_count: int) -> bytes:
    if society == "iprs":
        return build_iprs_bulk(proj, eps, total_ep_count=total_ep_count)
    if society == "prs":
        return build_prs_bulk(proj, eps)
    return build_ascap_bulk(proj, eps)


async def _work_files_in_range(db: AsyncSession, project_id: int, from_ep: int, to_ep: int) -> list[WorkFile]:
    return (await db.execute(
        select(WorkFile).where(
            WorkFile.project_id == project_id,
            WorkFile.episode_number >= from_ep,
            WorkFile.episode_number <= to_ep,
        )
    )).scalars().all()


def _bulk_name(proj: Project, kind: str, from_ep: int, to_ep: int, ext: str = "xlsx") -> str:
    return f"{proj.title}_{kind}_EP{from_ep}-{to_ep}.{ext}"


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
        files = await _work_files_in_range(db, project_id, from_ep, to_ep)
        if not files:
            raise HTTPException(404, f"No work files uploaded for Ep {from_ep}–{to_ep}")
        data = build_work_file_bulk(files)
        fname = _bulk_name(proj, "WorkFile", from_ep, to_ep)
    else:
        proj, eps, total_ep_count = await _bulk_range(db, project_id, from_ep, to_ep)
        data = _society_bulk(society, proj, eps, total_ep_count)
        fname = _bulk_name(proj, society.upper(), from_ep, to_ep)
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
    proj, eps, total_ep_count = await _bulk_range(db, project_id, from_ep, to_ep)
    files = await _work_files_in_range(db, project_id, from_ep, to_ep)
    if not eps and not files:
        raise HTTPException(404, f"No episodes or work files for Ep {from_ep}–{to_ep}")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        if eps:
            for society in ("iprs", "prs", "ascap"):
                zf.writestr(
                    _bulk_name(proj, society.upper(), from_ep, to_ep),
                    _society_bulk(society, proj, eps, total_ep_count),
                )
        if files:
            zf.writestr(_bulk_name(proj, "WorkFile", from_ep, to_ep), build_work_file_bulk(files))
    fname = _bulk_name(proj, "All", from_ep, to_ep, ext="zip")
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
