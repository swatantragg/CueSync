"""Range exports shared by the Download buttons and the society emails (Send to Society)."""
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.cue import CueEntry
from app.models.episode import Episode
from app.models.project import Project
from app.models.work_file import WorkFile
from app.services.exporters.ascap import build_ascap_bulk
from app.services.exporters.iprs import build_iprs_bulk
from app.services.exporters.prs import build_prs_bulk


async def bulk_range(db: AsyncSession, project_id: int, from_ep: int, to_ep: int):
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


def society_bulk(society: str, proj: Project, eps: list, total_ep_count: int) -> bytes:
    if society == "iprs":
        return build_iprs_bulk(proj, eps, total_ep_count=total_ep_count)
    if society == "prs":
        return build_prs_bulk(proj, eps)
    return build_ascap_bulk(proj, eps)


async def work_files_in_range(db: AsyncSession, project_id: int, from_ep: int, to_ep: int) -> list[WorkFile]:
    return (await db.execute(
        select(WorkFile).where(
            WorkFile.project_id == project_id,
            WorkFile.episode_number >= from_ep,
            WorkFile.episode_number <= to_ep,
        )
    )).scalars().all()


def bulk_name(proj: Project, kind: str, from_ep: int, to_ep: int, ext: str = "xlsx") -> str:
    return f"{proj.title}_{kind}_EP{from_ep}-{to_ep}.{ext}"
