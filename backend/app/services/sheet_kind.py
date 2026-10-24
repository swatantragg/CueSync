"""Tell the two upload formats apart so neither can be uploaded in the other's place.

- Rough sheet: IPRS-style workbook, one sheet per episode with a "SONG TITLE / TRACK NAME" table.
- Work file:   one "Cue Sheet" per episode with a TITLE | CONTRIBUTORS | … | TIME IN | TIME OUT header.
"""


class SheetFormatError(ValueError):
    """The workbook is readable but is the wrong kind of file for this upload."""


WORK_FILE_REQUIRED_HEADERS = ("TITLE", "CONTRIBUTORS", "TIME IN", "TIME OUT", "DURATION")

ROUGH_AS_WORK_FILE_MSG = (
    "This is a Rough Sheet (IPRS format), not a Work File. Use Import Rough Sheet instead."
)
WORK_FILE_AS_ROUGH_MSG = (
    "This is a Work File, not a Rough Sheet. Use Upload Work File instead."
)


def _cell(v) -> str:
    return "" if v is None else str(v).strip().upper()


def work_file_header_row(rows: list) -> int | None:
    """Index of the work-file table header (TITLE, CONTRIBUTORS, …, TIME IN, TIME OUT), or None."""
    for i, r in enumerate(rows[:15]):
        cells = [_cell(v) for v in r]
        if len(cells) >= 2 and cells[0] == "TITLE" and cells[1] == "CONTRIBUTORS":
            if all(h in cells for h in WORK_FILE_REQUIRED_HEADERS):
                return i
    return None


def has_rough_song_table(rows: list) -> bool:
    """True when the sheet carries the IPRS rough-sheet "SONG TITLE / TRACK NAME" table."""
    return any("SONG TITLE" in _cell(r[0] if r else None) for r in rows[:40])
