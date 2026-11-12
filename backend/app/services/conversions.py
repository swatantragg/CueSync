"""Conversion: cue sheets read from an uploaded IPRS / PRS / ASCAP file, rebuilt in all three formats."""
import json
from types import SimpleNamespace

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.conversion import Conversion
from app.models.project import Project, ProjectType
from app.services.bulk_exports import society_bulk
from app.services.clients import name_key
from app.services.cue_rules import computed_share

MOVIE_EPISODE = 1  # a movie is one cue sheet, stored (and emailed) as episode 1


def title_matches(sheet_title: str | None, project_title: str) -> bool:
    """Same name ignoring case, spacing and punctuation. A sheet with no title can't contradict the project."""
    return not name_key(sheet_title) or name_key(sheet_title) == name_key(project_title)


def to_stored(ep: dict) -> str:
    """The parsed episode as kept in conversions.data, with any share the sheet left blank worked out."""
    for cue in ep["cues"]:
        rows = cue["contributors"]
        for c in rows:
            if c.get("share_percent") is None:
                c["share_percent"] = computed_share(c, rows, char_code=cue["usage"])
    return json.dumps(ep, ensure_ascii=False)


def _episode(proj: Project, conv: Conversion) -> SimpleNamespace:
    """The stored sheet shaped like an Episode with cues, which is all the exporters read."""
    d = json.loads(conv.data)
    meta = d.get("meta") or {}
    cues = [SimpleNamespace(
        id=i, order_index=c.get("order_index") or i, song_title=c["song_title"],
        usage_type=SimpleNamespace(value=c.get("usage") or "bi"),
        duration_sec=c.get("duration_sec") or 0, usage_count=c.get("usage_count") or 1,
        isrc=c.get("isrc"), song_code=c.get("song_code"), work_number=c.get("work_number"),
        ascap_work_id=c.get("ascap_work_id"), validation_link=c.get("validation_link"), singer=c.get("singer"),
        contributors=[SimpleNamespace(
            name=p["name"], role=p.get("role") or "Composer", society=p.get("society"),
            share_percent=p.get("share_percent") or 0, ipi_number=p.get("ipi_number"), cae_number=None,
        ) for p in c.get("contributors") or []],
    ) for i, c in enumerate(d.get("cues") or [], 1)]
    return SimpleNamespace(
        id=conv.id, episode_number=conv.episode_number, title=d.get("title"), air_date=d.get("air_date"),
        total_duration_sec=d.get("total_duration_sec"), musical_duration_sec=d.get("musical_duration_sec"),
        # The sheet's own header wins over the project's, exactly as an episode's Cue Details do.
        cue_serial_title=meta.get("title") or proj.title, cue_channel=meta.get("channel"),
        cue_serial_type=meta.get("serial_type"), cue_language=meta.get("language"), cue_director=meta.get("director"),
        cue_genre=meta.get("genre"), cue_production_company=meta.get("production_company"),
        cue_country=meta.get("country"), cue_actors=meta.get("actors"), cue_producer=meta.get("producer"),
        cue_production_year=meta.get("production_year"), cue_bg_music_composer=meta.get("bg_music_composer"),
        cue_submitted_by=meta.get("submitted_by"), cues=cues,
        total_episodes=meta.get("total_episodes"),
    )


async def conversions_in_range(db: AsyncSession, project_id: int, from_ep: int, to_ep: int) -> list[Conversion]:
    return (await db.execute(
        select(Conversion).where(
            Conversion.project_id == project_id, Conversion.episode_number.between(from_ep, to_ep),
        ).order_by(Conversion.episode_number)
    )).scalars().all()


def converted_bulk(society: str, proj: Project, convs: list[Conversion]) -> bytes:
    """One workbook in `society` format with a sheet per converted episode."""
    if not convs:
        raise HTTPException(404, "No converted cue sheets in this range.")
    eps = [_episode(proj, c) for c in convs]
    total = next((e.total_episodes for e in eps if e.total_episodes), None)
    return society_bulk(society, proj, eps, total)


def is_movie(proj: Project) -> bool:
    return proj.type == ProjectType.MOVIE
