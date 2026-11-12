"""Read a finished IPRS, PRS or ASCAP cue sheet back into cue data, so Conversion can rebuild all three.

Each sheet of the workbook is one episode (or the movie). The three layouts are the ones CueSync's own
exporters write (services/exporters), which are the formats the societies receive.
"""
import re
from datetime import date, datetime, time, timedelta
from io import BytesIO

from openpyxl import load_workbook

from app.services.cue_rules import role_key
from app.services.sheet_kind import SheetFormatError, work_file_header_row

FORMATS = {"iprs": "IPRS", "prs": "PRS", "ascap": "ASCAP"}

# What the source format does not carry, said once in the preview so the Reviewer checks the result.
FORMAT_NOTES = {
    "iprs": [],
    "prs": [
        "A PRS sheet only says Background or Featured. Background becomes BI; Featured becomes FV, or FI when "
        "the title says instrumental, score or theme. Check Characteristics in the IPRS sheet.",
        "PRS sheets have no IPRS song code, ISRC or singer, so those stay empty.",
    ],
    "ascap": [
        "An ASCAP sheet has no IPI numbers, song codes, ISRC or singers, so those stay empty in IPRS and PRS.",
        "ASCAP lists composers and authors together, so every writer becomes a Composer.",
    ],
}

_NA = {"", "NA", "N/A", "N.A.", "NIL", "-", "--"}
_DATE_FORMATS = ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d", "%d-%b-%Y", "%d-%B-%Y", "%B %d, %Y")


# ── Cell helpers ──────────────────────────────────────────────────────────────

def _s(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return re.sub(r"\s+", " ", str(v)).strip()


def _val(v) -> str | None:
    """Cell text, with the 'NA' fillers the societies' forms use treated as empty."""
    s = _s(v)
    return None if s.upper() in _NA else s


def _up(v) -> str:
    return _s(v).upper()


def _seconds(v) -> int | None:
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.hour * 3600 + v.minute * 60 + v.second
    if isinstance(v, time):
        return v.hour * 3600 + v.minute * 60 + v.second
    if isinstance(v, timedelta):
        return int(v.total_seconds())
    if isinstance(v, (int, float)):
        return int(round(v * 86400)) if 0 < v < 1 else int(v)
    s = str(v).strip()
    m = re.match(r"^(\d+):(\d{1,2}):(\d{1,2})", s)
    if m:
        return int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])
    m = re.match(r"^(\d+):(\d{1,2})$", s)
    if m:
        return int(m[1]) * 60 + int(m[2])
    return None


def _date(v) -> str | None:
    """ISO date when the cell can be read as one (the exporters format ISO dates), else the text as typed."""
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date().isoformat()
    if isinstance(v, date):
        return v.isoformat()
    s = _val(v)
    if not s:
        return None
    plain = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", s, flags=re.I)
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(plain, fmt).date().isoformat()
        except ValueError:
            continue
    return s


def _int(v) -> int | None:
    m = re.search(r"\d+", _s(v))
    return int(m.group()) if m else None


def _share(v) -> float | None:
    """'25%', 25 and 0.25 (a percent-formatted cell) all mean 25."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return round(float(v) * 100, 2) if 0 < v <= 1 else float(v)
    m = re.search(r"\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def _next_value(row: list, i: int, is_label):
    """The value belonging to the label in cell i: the next filled cell, unless that is the next label."""
    for v in row[i + 1:]:
        if v is None or _s(v) == "":
            continue
        return None if isinstance(v, str) and is_label(v) else v
    return None


def _columns(header: list, wanted: dict[str, tuple[str, ...]]) -> dict[str, int]:
    """Column index of each wanted field, matched on the header text."""
    cols: dict[str, int] = {}
    for i, cell in enumerate(header):
        text = _up(cell)
        if not text:
            continue
        for key, needles in wanted.items():
            if key not in cols and any(n in text for n in needles):
                cols[key] = i
                break
    return cols


def _cell(row: list, cols: dict, key: str):
    i = cols.get(key)
    return row[i] if i is not None and i < len(row) else None


def _new_episode(sheet: str) -> dict:
    return {
        "sheet": sheet, "episode_number": None, "title": None, "air_date": None,
        "total_duration_sec": None, "musical_duration_sec": None, "meta": {}, "cues": [],
    }


def _new_cue(order: int, title: str, usage: str, duration) -> dict:
    return {
        "song_title": title, "usage": usage, "usage_count": 1, "duration_sec": _seconds(duration) or 0,
        "song_code": None, "isrc": None, "work_number": None, "ascap_work_id": None,
        "singer": None, "validation_link": None, "order_index": order, "contributors": [],
    }


# ── IPRS ──────────────────────────────────────────────────────────────────────

_IPRS_LABELS = (
    ("SERIAL TITLE", "title"), ("CHANNEL", "channel"), ("SERIAL TYPE", "serial_type"), ("DIRECTOR", "director"),
    ("GENRE", "genre"), ("BANNER", "production_company"), ("PRODUCTION COMPANY", "production_company"),
    ("LANGUAGE", "language"), ("PRINCIPAL ACTOR", "actors"), ("PRODUCTION NUMBER", "_"),
    ("TOTAL MUSICAL DURATION", "musical_duration"), ("TOTAL EPISODE DURATION", "total_duration"),
    ("TOTAL MOVIE DURATION", "total_duration"), ("TOTAL NO. OF EPISODE", "total_episodes"),
    ("TOTAL NO OF EPISODE", "total_episodes"), ("DATE OF", "air_date"), ("PRODUCTION YEAR", "production_year"),
    ("BACKGROUND MUSIC COMPOSER", "bg_music_composer"), ("SUBMITTED BY", "submitted_by"),
    ("EPISODE NO", "episode_number"), ("EPISODE TITLE", "episode_title"),
    # Rough-sheet rows CueSync has no field for; listed so they are never read as the value of the label before them.
    ("TOTAL BACKGROUND", "_"), ("LENGTH IN", "_"), ("MOVIE REGISTRATION", "_"), ("SUPPORTING ACTOR", "_"), ("SCRIPTWRITER", "_"),
)

_IPRS_COLUMNS = {
    "title": ("SONG TITLE",), "usage": ("CHARACTERISTICS", "CODE"), "count": ("NO. OF USAGE", "NO OF USAGE"),
    "song_code": ("SONG CODE", "INTERNAL NO"), "isrc": ("ISRC",), "duration": ("DURATION",), "role": ("ROLE",),
    "name": ("NAMES OF",), "society": ("SOCIETY",), "share": ("SHARE",), "ipi": ("IPI",), "singer": ("SINGER",),
    "link": ("VALIDATION",),
}
# "Internal No/Song Code" also contains CODE: match it before the short "Code" characteristics header.
_IPRS_COLUMN_ORDER = ("title", "song_code", "usage", "count", "isrc", "duration", "role", "name", "society", "share", "ipi", "singer", "link")

_ROUGH_TITLE = re.compile(r"^(.+?)[\s\-_]+(?:s\d+[\s\-_]+)?ep[\s\-_]*(\d+)\b(.*)$", re.I)

_IPRS_ROLES = {"C": "Composer", "A": "Author", "E": "Publisher", "P": "Publisher", "CA": "CA", "C/A": "CA", "AR": "Arranger"}


def _iprs_key(label) -> str | None:
    text = _up(label)
    if text == "TITLE":
        return "title"
    if text.startswith("PRODUCER"):
        return "producer"
    for needle, key in _IPRS_LABELS:
        if text.startswith(needle):
            return key
    return None


def _iprs_header(rows: list) -> int | None:
    for i, r in enumerate(rows[:40]):
        if "SONG TITLE" in _up(r[0] if r else None):
            return i
    return None


def _apply_meta(ep: dict, key: str, value) -> None:
    meta = ep["meta"]
    if key == "_":
        return
    if key == "total_duration":
        ep["total_duration_sec"] = _seconds(value)
    elif key == "musical_duration":
        ep["musical_duration_sec"] = _seconds(value)
    elif key == "air_date":
        ep["air_date"] = _date(value)
    elif key == "episode_number":
        ep["episode_number"] = _int(value) if _val(value) else None
    elif key == "episode_title":
        ep["title"] = _val(value)
    elif key in ("production_year", "total_episodes"):
        meta[key] = _int(value) if _val(value) else None
    elif _val(value):
        meta[key] = _val(value)


def _read_labels(ep: dict, rows: list, key_of) -> None:
    is_label = lambda v: key_of(v) is not None  # noqa: E731
    for row in rows:
        for i, cell in enumerate(row):
            if not isinstance(cell, str):
                continue
            key = key_of(cell)
            if key:
                _apply_meta(ep, key, _next_value(row, i, is_label))


def _parse_iprs(rows: list, sheet: str) -> dict:
    ep = _new_episode(sheet)
    head = _iprs_header(rows)
    _read_labels(ep, rows[:head], _iprs_key)

    # A rough sheet's title is the video file name: "Kothha-ep-51-03 february 2024.mp4".
    m = _ROUGH_TITLE.match(ep["meta"].get("title") or "")
    if m:
        ep["meta"]["title"] = m[1].strip(" -_") or ep["meta"]["title"]
        ep["episode_number"] = ep["episode_number"] or int(m[2])
        tail = re.sub(r"\.\w{2,4}$", "", m[3]).strip(" -_")
        day = _date(tail)
        if not ep["air_date"] and day and day != tail:
            ep["air_date"] = day

    cols: dict[str, int] = {}
    for key in _IPRS_COLUMN_ORDER:  # one column per field, most specific header first
        for i, cell in enumerate(rows[head]):
            if i not in cols.values() and any(n in _up(cell) for n in _IPRS_COLUMNS[key]):
                cols[key] = i
                break

    cue = None
    for row in rows[head + 1:]:
        first = _up(row[0] if row else None)
        if first.startswith(("CODES", "NOTE:", "CUE SHEET PREPARED")) or "CHARACTERISTICS :-" in first:
            break
        title = _s(_cell(row, cols, "title"))
        if title:
            code = _up(_cell(row, cols, "usage")) or "BI"
            cue = _new_cue(len(ep["cues"]) + 1, title, code.lower(), _cell(row, cols, "duration"))
            cue.update(
                usage_count=_int(_cell(row, cols, "count")) or 1,
                song_code=_val(_cell(row, cols, "song_code")), isrc=_val(_cell(row, cols, "isrc")),
                singer=_val(_cell(row, cols, "singer")), validation_link=_val(_cell(row, cols, "link")),
            )
            ep["cues"].append(cue)
        name = _val(_cell(row, cols, "name"))
        if cue and name:
            role = _up(_cell(row, cols, "role"))
            cue["contributors"].append({
                "name": name, "role": role_key(_IPRS_ROLES.get(role, role or "Composer")),
                "society": _val(_cell(row, cols, "society")), "share_percent": _share(_cell(row, cols, "share")),
                "ipi_number": _val(_cell(row, cols, "ipi")),
            })
    return ep


# ── PRS ───────────────────────────────────────────────────────────────────────

_PRS_LABELS = (
    ("FILM/SERIES/ITEM TITLE", "title"), ("PRODUCTION CO", "production_company"), ("COUNTRY OF ORIGIN", "country"),
    ("TRAILER", "_"), ("EPISODE TITLE", "episode_title"), ("PRODUCTION NO", "_"), ("PRODUCTION YEAR", "production_year"),
    ("TX TIME", "_"), ("EPISODE NO", "episode_number"), ("DIRECTOR", "director"), ("FIRST TX DATE", "air_date"),
    ("FILM DURATION", "total_duration"), ("FILM/ITEM NO", "_"), ("PRINCIPAL ACTOR", "actors"),
    ("MUSIC DURATION", "musical_duration"), ("ALTERNATIVE TITLE", "_"),
)

_PRS_COLUMNS = {
    "seq": ("SEQ",), "title": ("TITLE",), "role": ("ROLE",), "name": ("INTERESTED PART",), "ipi": ("CAE", "IPI"),
    "share": ("SHARE",), "society": ("SOCIETY",), "usage": ("USAGE",), "duration": ("DURATION",), "work": ("WORK NUMBER", "WORK NO"),
}

_INSTRUMENTAL = re.compile(r"instrumental|\bscore\b|theme music|\bbgm\b", re.I)


def _prs_key(label) -> str | None:
    text = _up(label)
    if text == "CHANNEL":
        return "channel"
    for needle, key in _PRS_LABELS:
        if text.startswith(needle):
            return key
    return None


def _prs_header(rows: list) -> int | None:
    for i, r in enumerate(rows[:40]):
        cells = [_up(v) for v in r]
        if cells and cells[0] == "SEQ" and "TITLE" in cells and any("INTERESTED" in c for c in cells):
            return i
    return None


def _prs_usage(code: str, title: str) -> str:
    if code.startswith("B"):
        return "bi"
    return "fi" if _INSTRUMENTAL.search(title) else "fv"


def _parse_prs(rows: list, sheet: str) -> dict:
    ep = _new_episode(sheet)
    head = _prs_header(rows)
    _read_labels(ep, rows[:head], _prs_key)
    cols = _columns(rows[head], _PRS_COLUMNS)

    cue = None
    for row in rows[head + 1:]:
        if _up(row[0] if row else None).startswith("CUE SHEET PREPARED"):
            break
        title = _s(_cell(row, cols, "title"))
        if title:
            cue = _new_cue(len(ep["cues"]) + 1, title, _prs_usage(_up(_cell(row, cols, "usage")), title), _cell(row, cols, "duration"))
            cue["work_number"] = _val(_cell(row, cols, "work"))
            ep["cues"].append(cue)
        name = _val(_cell(row, cols, "name"))
        if cue and name:
            society = _val(_cell(row, cols, "society"))
            cue["contributors"].append({
                "name": name, "role": role_key(_s(_cell(row, cols, "role")) or "Composer"),
                # The PRS sheet writes IPRS members as PRS (exporters/prs._prs_society); turn that back.
                "society": "IPRS" if (society or "").upper() == "PRS" else society,
                "share_percent": _share(_cell(row, cols, "share")), "ipi_number": _val(_cell(row, cols, "ipi")),
            })
    return ep


# ── ASCAP ─────────────────────────────────────────────────────────────────────

_ASCAP_COLUMNS = {
    "seq": ("CUE #", "CUE NO"), "title": ("CUE TITLE",), "usage": ("USE",), "duration": ("TIMING",),
    "composers": ("COMPOSER",), "publishers": ("PUBLISHER",), "work": ("WORK ID",),
}
_ASCAP_USE = {"BI": "bi", "BV": "bv", "VI": "fi", "VV": "fv", "MT": "oi", "ET": "ci", "T": "oi"}
_ASCAP_PARTY = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*(\d+(?:\.\d+)?)\s*%?$")
_ASCAP_HEADLINE = re.compile(r"\(\s*([^()]*?)\s*(?:serial|movie|film)\s*\)", re.I)


def _ascap_header(rows: list) -> int | None:
    for i, r in enumerate(rows[:40]):
        cells = [_up(v) for v in r]
        if cells and cells[0].startswith("CUE") and any(c.startswith("CUE TITLE") for c in cells):
            return i
    return None


def _ascap_parties(text, role: str) -> list[dict]:
    out = []
    for part in re.split(r"\s{3,}|[\r\n]+", str(text or "").replace("\t", " ")):
        part = re.sub(r"\s+", " ", part).strip()
        if not part:
            continue
        m = _ASCAP_PARTY.match(part)
        name, society, share = (m[1].strip(), m[2].strip(), float(m[3])) if m else (part, None, None)
        if not name:
            continue
        if society and society.upper().startswith("NON"):
            society = "NS"
        # The ASCAP sheet doubles the IPRS share (exporters/ascap._fmt_contribs): halve it back.
        out.append({"name": name, "role": role, "society": society or None,
                    "share_percent": round(share / 2, 2) if share is not None else None, "ipi_number": None})
    return out


def _parse_ascap(rows: list, sheet: str) -> dict:
    ep = _new_episode(sheet)
    head = _ascap_header(rows)
    meta = ep["meta"]
    for row in rows[:head]:
        for cell in row:
            text = _s(cell)
            if ":" not in text:
                m = _ASCAP_HEADLINE.search(text)
                if m and m[1].strip():
                    meta["language"] = m[1].strip()
                continue
            label, value = (p.strip() for p in text.split(":", 1))
            label = label.upper()
            if label in ("SERIES/FILM TITLE", "FILM TITLE", "SERIES TITLE"):
                meta["title"] = _val(value)
            elif label in ("EPISODE TITLE/NUMBER", "FILM TITLE/NUMBER"):
                m = re.match(r"^(\d+)\s*(.*)$", value)
                if m and label.startswith("EPISODE"):
                    ep["episode_number"], ep["title"] = int(m[1]), _val(m[2])
            elif label == "ESTIMATED AIRDATE":
                ep["air_date"] = _date(value)
            elif label == "PROGRAM LENGTH":
                ep["total_duration_sec"] = _seconds(value)
            elif label == "CONTACT" and _val(value):
                meta["submitted_by"] = _val(value)

    cols = _columns(rows[head], _ASCAP_COLUMNS)
    for row in rows[head + 1:]:
        first = _up(row[0] if row else None)
        if first.startswith(("*USE CODES", "USE CODES", "CUE SHEET PREPARED")):
            break
        title = _s(_cell(row, cols, "title"))
        if not title:
            continue
        use = _up(_cell(row, cols, "usage"))
        cue = _new_cue(len(ep["cues"]) + 1, title, _ASCAP_USE.get(use, "bi"), _cell(row, cols, "duration"))
        cue["ascap_work_id"] = _val(_cell(row, cols, "work"))
        cue["contributors"] = (_ascap_parties(_cell(row, cols, "composers"), "Composer")
                               + _ascap_parties(_cell(row, cols, "publishers"), "Publisher"))
        ep["cues"].append(cue)
    return ep


# ── Workbook ──────────────────────────────────────────────────────────────────

_DETECT = (("iprs", _iprs_header, _parse_iprs), ("prs", _prs_header, _parse_prs), ("ascap", _ascap_header, _parse_ascap))


def _xlsx_sheets(data: bytes) -> list[tuple[str, list]]:
    try:
        wb = load_workbook(BytesIO(data), data_only=True)
    except Exception:
        raise SheetFormatError("This file can't be opened as an Excel workbook. Save it as .xlsx and try again.")
    return [(ws.title, [list(r) for r in ws.iter_rows(values_only=True)]) for ws in wb.worksheets]


def _xls_sheets(data: bytes) -> list[tuple[str, list]]:
    try:
        import xlrd
    except ImportError:
        raise SheetFormatError("Old .xls files can't be read on this server. Open it in Excel, save as .xlsx and try again.")
    try:
        wb = xlrd.open_workbook(file_contents=data)
    except Exception:
        raise SheetFormatError("This file can't be opened as an Excel workbook. Save it as .xlsx and try again.")
    out = []
    for ws in wb.sheets():
        rows = []
        for r in range(ws.nrows):
            row = []
            for c in range(ws.ncols):
                cell = ws.cell(r, c)
                if cell.ctype == xlrd.XL_CELL_DATE:
                    try:
                        stamp = xlrd.xldate_as_datetime(cell.value, wb.datemode)
                        row.append(stamp.time() if cell.value < 1 else stamp)
                    except Exception:
                        row.append(cell.value)
                elif cell.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK) or cell.value == "":
                    row.append(None)
                else:
                    row.append(cell.value)
            rows.append(row)
        out.append((ws.name, rows))
    return out


def parse_cue_workbook(data: bytes, filename: str = "") -> dict:
    """{"format": iprs|prs|ascap, "episodes": [...], "skipped": [{"sheet", "reason"}]}.

    Raises SheetFormatError when no sheet is an IPRS, PRS or ASCAP cue sheet, or the sheets mix formats.
    """
    name = (filename or "").lower()
    if not name.endswith((".xlsx", ".xlsm", ".xls")):
        raise SheetFormatError("Upload an Excel file (.xlsx or .xls).")
    sheets = _xls_sheets(data) if name.endswith(".xls") else _xlsx_sheets(data)

    found: dict[str, list] = {}
    skipped: list[dict] = []
    for sheet, rows in sheets:
        width = max((len(r) for r in rows), default=0)
        rows = [r + [None] * (width - len(r)) for r in rows]
        if not any(any(v is not None and _s(v) for v in r) for r in rows):
            continue
        if work_file_header_row(rows) is not None:
            raise SheetFormatError("This is a Work File, not an IPRS, PRS or ASCAP cue sheet.")
        for fmt, header, parse in _DETECT:
            if header(rows) is not None:
                ep = parse(rows, sheet)
                if ep["cues"]:
                    found.setdefault(fmt, []).append(ep)
                else:
                    skipped.append({"sheet": sheet, "reason": "No songs in this sheet."})
                break
        else:
            skipped.append({"sheet": sheet, "reason": "Not an IPRS, PRS or ASCAP cue sheet."})

    if not found:
        raise SheetFormatError(
            "No IPRS, PRS or ASCAP cue sheet found in this file. Upload the finished sheet in one of those three formats."
        )
    if len(found) > 1:
        raise SheetFormatError(
            f"This file mixes {' and '.join(FORMATS[f] for f in found)} sheets. Upload one format at a time."
        )
    fmt, episodes = next(iter(found.items()))
    for ep in episodes:
        if ep["episode_number"] is None:
            ep["episode_number"] = _int(ep["sheet"])
        if ep["musical_duration_sec"] is None:
            ep["musical_duration_sec"] = sum(c["duration_sec"] for c in ep["cues"]) or None
    return {"format": fmt, "episodes": episodes, "skipped": skipped}
