import re
from io import BytesIO
from openpyxl import load_workbook

from app.services.cue_rules import apply_share_rules, role_key, usage_value_from_code
from app.services.sheet_kind import (
    WORK_FILE_AS_ROUGH_MSG, SheetFormatError, has_rough_song_table, work_file_header_row,
)

CODE_MAP = {
    "BI": "Background Instrumental",
    "BV": "Background Vocal",
    "FV": "Featured Vocal",
    "FI": "Featured Instrumental",
    "OI": "Opening / Title",
    "VI": "Visual Instrumental",
    "VV": "Visual Vocal",
}

USAGE_TO_ENUM = {
    # IPRS codes
    "Background Instrumental": "bi",
    "Background Vocal":        "bv",
    "Featured Vocal":          "fv",
    "Featured Instrumental":   "fi",
    "Opening / Title":         "theme",
    "Visual Instrumental":     "visual",
    "Visual Vocal":            "visual",
    # VSG / plain-text usage labels
    "Opening Theme":           "theme",
    "Background Music":        "bi",
    "Visual":                  "visual",
    "Featured":                "fv",
    "End Title":               "theme",
    "Logo":                    "theme",
}

ROLE_MAP = {"C": "Composer", "A": "Author", "E": "Publisher", "P": "Publisher"}

def _s(v):
    if v is None:
        return ""
    return str(v).strip()


def _dur_to_sec(v):
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        if 0 < v < 1:
            return int(round(v * 86400))
        return int(v)
    s = str(v).strip()
    m = re.match(r"^(\d+):(\d+):(\d+)", s)
    if m:
        return int(m[1]) * 3600 + int(m[2]) * 60 + int(m[3])
    m = re.match(r"^(\d+):(\d+)$", s)
    if m:
        return int(m[1]) * 60 + int(m[2])
    try:
        return int(float(s))
    except Exception:
        return 0


# ── IPRS / standard format helpers ────────────────────────────────────────────

def _parse_iprs_sheet(rows: list, sheet_name: str, project_meta: dict, episodes: list) -> None:
    """Parse one IPRS-style sheet. Mutates project_meta and episodes in-place."""
    ep_num = None
    try:
        ep_num = int(re.sub(r"\D", "", sheet_name) or 0) or None
    except Exception:
        ep_num = None

    ep = {
        "episode_number": ep_num,
        "title": None,
        "air_date": None,
        "total_duration_sec": None,
        "musical_duration_sec": None,
        "bg_instrumental_duration_sec": None,
        "bg_vocal_duration_sec": None,
        "cues": [],
    }
    ex: dict = {}
    song_start = -1

    def match(label, val_raw):
        L = label.upper()
        val = _s(val_raw)
        if L.startswith("TITLE"):
            m = re.search(r"EP[- ]?(\d+)", val.upper())
            if m and not ep["episode_number"]:
                ep["episode_number"] = int(m.group(1))
            m2 = re.search(r"(\d{1,2}\s+\w+\s+\d{4})", val)
            if m2:
                ep["air_date"] = m2.group(1)
            if val:
                ep["title"] = val
        elif "DIRECTOR" in L:
            if val: ex["director"] = val
        elif "GENRE" in L:
            if val: ex["genre"] = val
        elif "LANGUAGE" in L:
            if val: ex["language"] = val
        elif "BANNER" in L or "PRODUCTION COMPANY" in L:
            if val: ex["production_company"] = val
        elif "PRINCIPAL ACTOR" in L or L.startswith("ACTOR"):
            if val: ex["actors"] = val
        elif L.startswith("PRODUCER"):
            if val: ex["producer"] = val
        elif "BACKGROUND MUSIC COMPOSER" in L:
            if val: ex["bg_music_composer"] = val
        elif "TOTAL" in L and ("MOVIE" in L or "EPISODE" in L) and "DURATION" in L:
            ep["total_duration_sec"] = _dur_to_sec(val_raw)
        elif "TOTAL MUSICAL DURATION" in L:
            ep["musical_duration_sec"] = _dur_to_sec(val_raw)
        elif "BACKGROUND INSTRUMENTAL" in L:
            ep["bg_instrumental_duration_sec"] = _dur_to_sec(val_raw)
        elif "BACKGROUND VOCAL" in L and "INSTRUMENTAL" not in L:
            ep["bg_vocal_duration_sec"] = _dur_to_sec(val_raw)

    for i, row in enumerate(rows[:40]):
        a0 = _s(row[0])
        if "SONG TITLE" in a0.upper():
            song_start = i + 1
            break
        if a0:
            match(a0, row[1] if len(row) > 1 else None)
        a6 = _s(row[6]) if len(row) > 6 else ""
        if a6:
            match(a6, row[7] if len(row) > 7 else None)

    if song_start > 0:
        current = None
        order = 0
        for row in rows[song_start:]:
            title = _s(row[0])
            upper0 = title.upper()
            if upper0.startswith("CODES") or "CHARACTERISTICS :-" in upper0 or upper0.startswith("NOTE:"):
                break
            code   = _s(row[1])
            role_c = _s(row[5])
            name   = _s(row[6])
            if title:
                if current:
                    current["contributors"] = apply_share_rules(current["contributors"])
                    ep["cues"].append(current)
                order += 1
                usage = CODE_MAP.get(code.upper(), code or "Background Instrumental")
                current = {
                    "song_title":  title,
                    "usage_type":  USAGE_TO_ENUM.get(usage, usage_value_from_code(code or usage)),
                    "usage_label": usage,
                    "usage_count": int(row[2]) if isinstance(row[2], (int, float)) else 1,
                    "song_code":   _s(row[3]) or None,
                    "duration_sec": _dur_to_sec(row[4]),
                    "order_index": order,
                    "contributors": [],
                }
            if current and name and role_c:
                current["contributors"].append({
                    "name":          name,
                    "role":          role_key(ROLE_MAP.get(role_c.upper(), role_c)),
                    "society":       _s(row[7]) or None,
                    "share_percent": float(row[8]) if isinstance(row[8], (int, float)) else 0,
                    "ipi_number":    _s(row[9]) or None,
                })
        if current:
            current["contributors"] = apply_share_rules(current["contributors"])
            ep["cues"].append(current)

    if ep["episode_number"]:
        episodes.append(ep)

    for k, v in ex.items():
        if v and not project_meta.get(k):
            project_meta[k] = v


# ── Public entry point ────────────────────────────────────────────────────────

def parse_rough_workbook(data: bytes, filename: str = "") -> dict:
    """
    Parse an IPRS-format rough xlsx (one sheet per episode, SONG TITLE header).

    Raises SheetFormatError for a Work File (TITLE / CONTRIBUTORS layout) or a workbook
    with no rough-sheet song table, so neither lands in the wrong place.
    Returns {'meta': {...}, 'episodes': [{...}]}.
    """
    wb = load_workbook(BytesIO(data), data_only=True)
    project_meta: dict = {}
    episodes: list[dict] = []
    found_song_table = False

    for sheet_name in wb.sheetnames:
        ws = wb[sheet_name]
        rows = []
        for r in ws.iter_rows(values_only=True):
            rows.append(list(r) + [None] * max(0, 12 - len(r)))

        if work_file_header_row(rows) is not None:
            raise SheetFormatError(WORK_FILE_AS_ROUGH_MSG)
        if has_rough_song_table(rows):
            found_song_table = True
        _parse_iprs_sheet(rows, sheet_name, project_meta, episodes)

    if not found_song_table:
        raise SheetFormatError(
            "Not a Rough Sheet: no 'SONG TITLE / TRACK NAME' table found. "
            "Upload the IPRS rough format (one sheet per episode)."
        )
    if not episodes:
        raise SheetFormatError("No episodes found in this Rough Sheet. Check the sheet names or TITLE row carry the episode number.")

    return {"meta": project_meta, "episodes": episodes}
