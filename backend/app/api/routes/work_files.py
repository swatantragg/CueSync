import io
import json
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db, utcnow
from app.core.deps import get_current_user, require_roles
from app.models.episode import Episode
from app.models.project import Project
from app.models.user import User, UserRole
from app.models.work_file import WorkFile
from app.services.audit import log_activity
from app.services.exporters._common import XLSX_MEDIA_TYPE, safe_filename
from app.services.sheet_kind import SheetFormatError
from app.services.work_files import inspect_work_file

router = APIRouter()

_UPLOAD_ROLES = Depends(require_roles(UserRole.ADMIN, UserRole.EDITOR))

def fmt_ranges(nums: list[int]) -> str:
    """[25, 26, 27, 28, 30] → '25–28, 30'"""
    out, nums = [], sorted(set(nums))
    i = 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(str(nums[i]) if i == j else f"{nums[i]}–{nums[j]}")
        i = j + 1
    return ", ".join(out)


async def _project_or_404(db: AsyncSession, project_id: int) -> Project:
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Project not found")
    return proj


async def _read_and_inspect(f: UploadFile, project_title: str) -> tuple[bytes, dict]:
    if os.path.splitext(f.filename or "")[1].lower() != ".xlsx":
        raise SheetFormatError("Work files must be .xlsx.")
    data = await f.read()
    return data, inspect_work_file(data, f.filename or "", project_title)


@router.post("/project/{project_id}/preview", dependencies=[_UPLOAD_ROLES])
async def preview_work_files(
    project_id: int,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Validate each file and report what would be saved. Writes nothing."""
    proj = await _project_or_404(db, project_id)
    episode_numbers = (await db.execute(
        select(Episode.episode_number).where(Episode.project_id == project_id)
    )).scalars().all()
    with_work_file = (await db.execute(
        select(WorkFile.episode_number).where(WorkFile.project_id == project_id)
    )).scalars().all()

    out = []
    for i, f in enumerate(files):
        row = {"index": i, "filename": f.filename}
        try:
            _, info = await _read_and_inspect(f, proj.title)
        except SheetFormatError as e:
            out.append({**row, "error": str(e)})
            continue
        out.append({**row, **info})
    return {
        "files": out,
        "episode_numbers": sorted(episode_numbers),
        "work_file_episode_numbers": sorted(with_work_file),
    }


@router.post("/project/{project_id}", dependencies=[_UPLOAD_ROLES])
async def upload_work_files(
    project_id: int,
    files: list[UploadFile] = File(...),
    episode_numbers: str = Form(...),
    serial_confirmed: str = Form("[]"),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Save work files.

    `episode_numbers` and `serial_confirmed` are JSON lists aligned with `files`. A file whose title
    names a different serial is only saved when the uploader confirmed it belongs to this one.
    """
    proj = await _project_or_404(db, project_id)
    try:
        nums = [int(n) for n in json.loads(episode_numbers)]
        confirmed = [bool(v) for v in json.loads(serial_confirmed)]
    except Exception:
        raise HTTPException(400, "episode_numbers / serial_confirmed must be JSON lists")
    if len(nums) != len(files):
        raise HTTPException(400, "One episode number is required per file")
    confirmed += [False] * (len(files) - len(confirmed))
    if any(n < 1 for n in nums):
        raise HTTPException(400, "Episode numbers must be 1 or higher")
    dupes = sorted({n for n in nums if nums.count(n) > 1})
    if dupes:
        raise HTTPException(400, f"More than one file for Ep {fmt_ranges(dupes)}")

    # Re-validate everything before writing anything — a bad file aborts the whole batch.
    checked, errors, renamed = [], [], set()
    for f, n, ok in zip(files, nums, confirmed):
        try:
            data, info = await _read_and_inspect(f, proj.title)
        except SheetFormatError as e:
            errors.append(f"{f.filename}: {e}")
            continue
        if info["serial_mismatch"]:
            if not ok:
                errors.append(
                    f"{f.filename}: titled '{info['serial_in_file']}', not '{proj.title}'. "
                    "Confirm it is this serial's work file before uploading."
                )
                continue
            renamed.add(info["serial_in_file"] or "untitled")
        checked.append((f.filename or f"EP{n}.xlsx", n, data, info))
    if errors:
        raise HTTPException(400, "\n".join(errors))

    existing = {
        wf.episode_number: wf for wf in (await db.execute(
            select(WorkFile).where(WorkFile.project_id == project_id, WorkFile.episode_number.in_(nums))
        )).scalars().all()
    }
    for filename, n, data, info in checked:
        wf = existing.get(n) or WorkFile(project_id=project_id, episode_number=n)
        wf.filename = filename[:255]
        wf.content = data
        wf.cue_count = info["cue_count"]
        wf.duration_sec = info["duration_sec"]
        wf.uploaded_by = current.id
        wf.uploaded_at = utcnow()
        db.add(wf)

    note = f" (confirmed despite title: {', '.join(sorted(renamed))})" if renamed else ""
    await log_activity(
        db, current.id, "upload", "project", project_id,
        f"Uploaded work file{'s' if len(nums) != 1 else ''} — Ep {fmt_ranges(nums)}{note}",
    )
    await db.commit()
    return {"saved": len(checked), "episode_numbers": sorted(nums)}


@router.get("/project/{project_id}")
async def list_work_files(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = (await db.execute(
        select(
            WorkFile.episode_number, WorkFile.filename, WorkFile.cue_count,
            WorkFile.duration_sec, WorkFile.uploaded_at, User.full_name,
        )
        .outerjoin(User, User.id == WorkFile.uploaded_by)
        .where(WorkFile.project_id == project_id)
        .order_by(WorkFile.episode_number)
    )).all()
    return [{
        "episode_number": r.episode_number,
        "filename": r.filename,
        "cue_count": r.cue_count,
        "duration_sec": r.duration_sec,
        "uploaded_at": r.uploaded_at.isoformat() if r.uploaded_at else None,
        "uploaded_by": r.full_name,
    } for r in rows]


@router.get("/project/{project_id}/episode/{episode_number}")
async def download_work_file(
    project_id: int,
    episode_number: int,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    proj = await _project_or_404(db, project_id)
    wf = (await db.execute(
        select(WorkFile).where(WorkFile.project_id == project_id, WorkFile.episode_number == episode_number)
    )).scalar_one_or_none()
    if not wf:
        raise HTTPException(404, f"No work file uploaded for Ep {episode_number}")
    fname = safe_filename(f"{proj.title}_EP{episode_number}_WorkFile") + ".xlsx"
    return StreamingResponse(
        io.BytesIO(wf.content),
        media_type=XLSX_MEDIA_TYPE,
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.delete("/project/{project_id}/episode/{episode_number}", dependencies=[_UPLOAD_ROLES])
async def delete_work_file(
    project_id: int,
    episode_number: int,
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    wf = (await db.execute(
        select(WorkFile).where(WorkFile.project_id == project_id, WorkFile.episode_number == episode_number)
    )).scalar_one_or_none()
    if not wf:
        raise HTTPException(404, f"No work file uploaded for Ep {episode_number}")
    await db.delete(wf)
    await log_activity(db, current.id, "delete", "project", project_id, f"Removed work file — Ep {episode_number}")
    await db.commit()
    return {"ok": True}
