"""Projects → Conversion: upload a finished IPRS, PRS or ASCAP cue sheet and get all three formats.

The converted sheets are saved per serial episode (or movie) so they can be downloaded in bulk or
emailed to a society later, from here or from the serial / movie page.
"""
import io
import json
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.work_files import fmt_ranges
from app.core.database import get_db, utcnow
from app.core.deps import get_current_user, require_roles
from app.models.client import Client
from app.models.conversion import Conversion
from app.models.episode import Episode
from app.models.project import Project, ProjectType
from app.models.society_submission import SocietySubmission
from app.models.user import User, UserRole
from app.services.audit import log_activity
from app.services.bulk_exports import bulk_name
from app.services.clients import name_key, resolve_client
from app.services.conversion_parser import FORMAT_NOTES, FORMATS, parse_cue_workbook
from app.services.conversions import (
    MOVIE_EPISODE, converted_bulk, conversions_in_range, is_movie, title_matches, to_stored,
)
from app.services.exporters._common import XLSX_MEDIA_TYPE, safe_filename
from app.services.sheet_kind import SheetFormatError
from app.services.society_mail import not_dead

router = APIRouter(dependencies=[Depends(require_roles(UserRole.ADMIN, UserRole.REVIEWER))])

SOCIETIES = ("iprs", "prs", "ascap")


class ProjectIn(BaseModel):
    title: str
    type: ProjectType

    @field_validator("type", mode="before")
    @classmethod
    def _upper(cls, v):
        return v.upper() if isinstance(v, str) else v


async def _project(db: AsyncSession, project_id: int) -> Project:
    proj = await db.get(Project, project_id)
    if not proj:
        raise HTTPException(404, "Serial or movie not found")
    return proj


async def _inspect(db: AsyncSession, proj: Project, f: UploadFile) -> dict:
    """Parse the upload and line its sheets up with the project. Writes nothing."""
    data = await f.read()  # size is capped by the request-size middleware (MAX_BODY_SIZE_MB)
    try:
        parsed = parse_cue_workbook(data, f.filename or "")
    except SheetFormatError as e:
        raise HTTPException(400, str(e))

    movie = is_movie(proj)
    episodes, skipped = [], list(parsed["skipped"])
    for ep in parsed["episodes"]:
        if movie:
            if episodes:
                skipped.append({"sheet": ep["sheet"], "reason": "A movie has one cue sheet; only the first sheet is used."})
                continue
            ep["episode_number"] = MOVIE_EPISODE
        elif not ep["episode_number"] or ep["episode_number"] < 1:
            skipped.append({"sheet": ep["sheet"], "reason": "No episode number in the sheet or its name."})
            continue
        elif any(e["episode_number"] == ep["episode_number"] for e in episodes):
            skipped.append({"sheet": ep["sheet"], "reason": f"Ep {ep['episode_number']} is in this file twice; the first one is used."})
            continue
        episodes.append(ep)
    if not episodes:
        raise HTTPException(400, "No episode could be read from this file: " + " ".join(
            f"{s['sheet']}: {s['reason']}" for s in skipped))

    sheet_title = next((e["meta"].get("title") for e in episodes if e["meta"].get("title")), None)
    return {
        "format": parsed["format"], "episodes": sorted(episodes, key=lambda e: e["episode_number"]),
        "skipped": skipped, "sheet_title": sheet_title,
        "title_mismatch": not title_matches(sheet_title, proj.title),
    }


@router.post("/projects")
async def create_project(payload: ProjectIn, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    """The serial or movie converted sheets are filed under. A title that already exists (ignoring case,
    spacing and punctuation) is returned instead of creating a second one."""
    title = " ".join(payload.title.split())
    if not title:
        raise HTTPException(400, "Enter the title.")
    if len(title) > 255:
        raise HTTPException(400, "The title is too long (255 characters at most).")
    same = [p for p in (await db.execute(
        select(Project).where(Project.type == payload.type).order_by(Project.id)
    )).scalars().all() if name_key(p.title) == name_key(title)]
    if same:
        return {"id": same[0].id, "title": same[0].title, "type": same[0].type.value, "existing": True}
    proj = Project(title=title, type=payload.type, created_by_id=current.id)
    db.add(proj)
    await db.flush()
    kind = "movie" if payload.type == ProjectType.MOVIE else "serial"
    await log_activity(db, current.id, "conversion_project", "project", proj.id, f"Added the {kind} {title} for Conversion.")
    await db.commit()
    return {"id": proj.id, "title": proj.title, "type": proj.type.value, "existing": False}


@router.post("/preview")
async def preview_conversion(
    project_id: int = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """What the file holds and what saving it would do. Writes nothing."""
    proj = await _project(db, project_id)
    info = await _inspect(db, proj, file)
    saved = {c.episode_number for c in (await db.execute(
        select(Conversion).where(Conversion.project_id == proj.id)
    )).scalars().all()}
    status = dict((await db.execute(
        select(Episode.episode_number, Episode.status).where(Episode.project_id == proj.id)
    )).all())
    return {
        "project": {"id": proj.id, "title": proj.title, "type": proj.type.value},
        "filename": file.filename,
        "format": info["format"], "format_label": FORMATS[info["format"]],
        "sheet_title": info["sheet_title"], "title_mismatch": info["title_mismatch"],
        "notes": FORMAT_NOTES[info["format"]],
        "skipped": info["skipped"],
        "episodes": [{
            "episode_number": e["episode_number"], "sheet": e["sheet"], "title": e["title"], "air_date": e["air_date"],
            "cues": len(e["cues"]), "duration_sec": e["total_duration_sec"] or e["musical_duration_sec"],
            "contributors": sum(len(c["contributors"]) for c in e["cues"]),
            "already_converted": e["episode_number"] in saved,       # saving replaces the saved conversion
            "cue_sheet_status": status.get(e["episode_number"]),     # an episode made in CueSync has this number
        } for e in info["episodes"]],
    }


@router.post("/")
async def save_conversion(
    project_id: int = Form(...),
    client_id: int = Form(...),
    file: UploadFile = File(...),
    episode_numbers: str = Form(""),
    title_confirmed: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Save the file's cue sheets under the serial / movie. `episode_numbers` (JSON list) limits which
    sheets are saved; an episode converted before is replaced."""
    proj = await _project(db, project_id)
    cid, client = await resolve_client(db, client_id, None)
    info = await _inspect(db, proj, file)
    if info["title_mismatch"] and not title_confirmed:
        raise HTTPException(409, f'The file is titled "{info["sheet_title"]}", not "{proj.title}". '
                                 "Confirm it belongs to this title to save it.")
    episodes = info["episodes"]
    if episode_numbers.strip():
        try:
            wanted = {int(n) for n in json.loads(episode_numbers)}
        except Exception:
            raise HTTPException(400, "episode_numbers must be a JSON list of numbers")
        episodes = [e for e in episodes if e["episode_number"] in wanted]
    if not episodes:
        raise HTTPException(400, "Pick at least one episode to convert.")

    nums = [e["episode_number"] for e in episodes]
    existing = {c.episode_number: c for c in (await db.execute(
        select(Conversion).where(Conversion.project_id == proj.id, Conversion.episode_number.in_(nums))
    )).scalars().all()}
    now = utcnow()
    for e in episodes:
        fields = dict(
            client_id=cid, client=client, source_format=info["format"], source_filename=(file.filename or "")[:255] or None,
            data=to_stored(e), cue_count=len(e["cues"]), duration_sec=e["total_duration_sec"] or e["musical_duration_sec"],
            converted_by=current.id, converted_at=now,
        )
        row = existing.get(e["episode_number"])
        if row:
            for k, v in fields.items():
                setattr(row, k, v)
        else:
            db.add(Conversion(project_id=proj.id, episode_number=e["episode_number"], **fields))
    what = "the movie" if is_movie(proj) else f"Ep {fmt_ranges(nums)}"
    replaced = sorted(existing)
    await log_activity(
        db, current.id, "conversion", "project", proj.id,
        f"Converted {what} of {proj.title} from {FORMATS[info['format']]} ({file.filename}) for {client}."
        + (f" Replaced the earlier conversion of Ep {fmt_ranges(replaced)}." if replaced and not is_movie(proj) else ""),
    )
    await db.commit()
    return {
        "project_id": proj.id, "project_title": proj.title, "project_type": proj.type.value,
        "format": info["format"], "saved": sorted(nums), "replaced": replaced,
        "episode_from": min(nums), "episode_to": max(nums),
    }


@router.get("/")
async def list_conversions(db: AsyncSession = Depends(get_db)):
    """Every serial and movie with converted cue sheets, latest first."""
    rows = (await db.execute(
        select(Conversion.project_id, Conversion.episode_number, Conversion.client_id, Conversion.client,
               Conversion.source_format, Conversion.converted_at).order_by(Conversion.converted_at.desc())
    )).all()
    projects = {p.id: p for p in (await db.execute(
        select(Project).where(Project.id.in_({r.project_id for r in rows}))
    )).scalars().all()} if rows else {}
    names = dict((await db.execute(select(Client.id, Client.name))).all()) if rows else {}
    out: dict[int, dict] = {}
    for r in rows:
        proj = projects.get(r.project_id)
        if not proj:
            continue
        g = out.setdefault(proj.id, {
            "project_id": proj.id, "project_title": proj.title, "project_type": proj.type.value,
            "numbers": [], "formats": [], "clients": [],
            # rows come latest first, so the first one seen carries the latest client and date
            "client_id": r.client_id if r.client_id in names else None,
            "last_converted_at": r.converted_at.isoformat() if r.converted_at else None,
        })
        g["numbers"].append(r.episode_number)
        client = names.get(r.client_id) or r.client
        if client and client not in g["clients"]:
            g["clients"].append(client)
        if FORMATS[r.source_format] not in g["formats"]:
            g["formats"].append(FORMATS[r.source_format])
    for g in out.values():
        nums = sorted(g.pop("numbers"))
        g.update(episode_count=len(nums), episodes=fmt_ranges(nums), episode_from=nums[0], episode_to=nums[-1])
    return list(out.values())


@router.get("/project/{project_id}")
async def project_conversions(project_id: int, society_id: int | None = None, db: AsyncSession = Depends(get_db)):
    """The converted cue sheets of one serial / movie, and whether each was already emailed to `society_id`."""
    proj = await _project(db, project_id)
    rows = (await db.execute(
        select(Conversion).where(Conversion.project_id == proj.id).order_by(Conversion.episode_number)
    )).scalars().all()
    users = dict((await db.execute(
        select(User.id, User.full_name).where(User.id.in_({r.converted_by for r in rows if r.converted_by}))
    )).all()) if rows else {}
    names = dict((await db.execute(select(Client.id, Client.name))).all()) if rows else {}
    spans = (await db.execute(
        select(SocietySubmission.episode_from, SocietySubmission.episode_to).where(
            SocietySubmission.project_id == proj.id, SocietySubmission.society_id == society_id,
            SocietySubmission.sent_via.in_(("gmail", "gmail_detected")), not_dead,
        )
    )).all() if society_id else []
    return {
        "project_id": proj.id, "project_title": proj.title, "project_type": proj.type.value,
        "episodes": [{
            "id": r.id, "episode_number": r.episode_number, "cues": r.cue_count, "duration_sec": r.duration_sec,
            "source_format": r.source_format, "source_label": FORMATS[r.source_format], "source_filename": r.source_filename,
            "client_id": r.client_id if r.client_id in names else None, "client": names.get(r.client_id) or r.client,
            "converted_by": users.get(r.converted_by), "converted_at": r.converted_at.isoformat() if r.converted_at else None,
            "sent": any(a <= r.episode_number <= b for a, b in spans),
        } for r in rows],
    }


def _range(proj: Project, from_ep: int | None, to_ep: int | None) -> tuple[int, int]:
    if is_movie(proj):
        return MOVIE_EPISODE, MOVIE_EPISODE
    if not from_ep or not to_ep or from_ep > to_ep:
        raise HTTPException(400, "Enter a valid episode range (From ≤ To).")
    return from_ep, to_ep


@router.get("/project/{project_id}/download")
async def download_conversions(
    project_id: int,
    society: str = Query(..., pattern="^(iprs|prs|ascap|all)$"),
    from_ep: int | None = Query(None, ge=1),
    to_ep: int | None = Query(None, ge=1),
    db: AsyncSession = Depends(get_db),
):
    """The converted sheets of an episode range in one society's format, or `all` three in one ZIP.
    Episodes in the range that were never converted are left out; X-Episodes says how many are inside."""
    proj = await _project(db, project_id)
    a, b = _range(proj, from_ep, to_ep)
    convs = await conversions_in_range(db, proj.id, a, b)
    if not convs:
        raise HTTPException(404, "No converted cue sheet saved for this movie." if is_movie(proj)
                            else f"No converted cue sheets saved for Ep {a}–{b}.")
    headers = {"X-Episodes": str(len(convs))}
    if society == "all":
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for s in SOCIETIES:
                zf.writestr(safe_filename(bulk_name(proj, s.upper(), a, b)), converted_bulk(s, proj, convs))
        data, media, fname = buf.getvalue(), "application/zip", bulk_name(proj, "Converted", a, b, ext="zip")
    else:
        data, media, fname = converted_bulk(society, proj, convs), XLSX_MEDIA_TYPE, bulk_name(proj, society.upper(), a, b)
    headers["Content-Disposition"] = f'attachment; filename="{safe_filename(fname)}"'
    return StreamingResponse(io.BytesIO(data), media_type=media, headers=headers)


@router.delete("/{conversion_id}")
async def delete_conversion(conversion_id: int, db: AsyncSession = Depends(get_db), current: User = Depends(get_current_user)):
    row = await db.get(Conversion, conversion_id)
    if not row:
        raise HTTPException(404, "Converted cue sheet not found")
    proj = await db.get(Project, row.project_id)
    what = "the movie" if proj and is_movie(proj) else f"Ep {row.episode_number}"
    await log_activity(db, current.id, "conversion_remove", "project", row.project_id,
                       f"Removed the converted cue sheet of {what}{' of ' + proj.title if proj else ''}.")
    await db.delete(row)
    await db.commit()
    return {"ok": True}
