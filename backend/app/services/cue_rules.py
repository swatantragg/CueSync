from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable


USAGE_ORDER = {"BI": 0, "BV": 1, "FI": 2, "FV": 3}


def role_key(role: str | None) -> str:
    value = (role or "").strip().lower().replace("&", "and")
    compact = re.sub(r"[^a-z]+", " ", value).strip()
    if value.upper() == "CA" or compact in {"ca", "composer author", "composer and author"} or ("composer" in compact and "author" in compact):
        return "CA"
    if compact in {"c", "composer", "music composer"}:
        return "Composer"
    if compact in {"a", "author", "lyricist", "writer"}:
        return "Author"
    if compact in {"e", "publisher", "publishing"}:
        return "Publisher"
    if compact in {"performer", "singer", "interpreter"}:
        return "Performer"
    if compact == "arranger":
        return "Arranger"
    return role or "Composer"


def role_label(role: str | None) -> str:
    key = role_key(role)
    return "Composer and Author" if key == "CA" else key


def iprs_role_code(role: str | None) -> str:
    return {
        "CA": "CA",
        "Composer": "C",
        "Author": "A",
        "Publisher": "E",
        "Arranger": "AR",
        "Performer": "P",
    }.get(role_key(role), role or "")


def _rounded(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def computed_share(
    contributor, contributors: Iterable, *, char_code: str | None = None
) -> float:
    rows = list(contributors or [])
    role = role_key(getattr(contributor, "role", None) if not isinstance(contributor, dict) else contributor.get("role"))

    def row_role(row):
        return role_key(getattr(row, "role", None) if not isinstance(row, dict) else row.get("role"))

    composers  = [r for r in rows if row_role(r) in {"Composer", "CA"}]
    authors    = [r for r in rows if row_role(r) in {"Author", "CA"}]
    publishers = [r for r in rows if row_role(r) == "Publisher"]

    # BI songs or songs with no author: composer total pool rises to 50 %
    code_upper = (char_code or "").strip().upper()
    no_author  = len(authors) == 0
    is_bi      = code_upper == "BI"
    composer_pool = 50 if (is_bi or no_author) else 25

    share = 0.0
    if role in {"Composer", "CA"} and composers:
        share += composer_pool / len(composers)
    # Authors only get a slice when the song is NOT BI and authors exist
    if role in {"Author", "CA"} and authors and not (is_bi or no_author):
        share += 25 / len(authors)
    if role == "Publisher" and publishers:
        share += 50 / len(publishers)
    return _rounded(share)


def apply_share_rules(
    contributors: list[dict],
    *,
    char_code: str | None = None,
    preserve_manual: bool = False,
) -> list[dict]:
    rows = [{**c, "role": role_key(c.get("role"))} for c in contributors]
    # When preserve_manual=True, keep any non-zero share that was explicitly set
    if preserve_manual and any(float(c.get("share_percent") or 0) != 0 for c in rows):
        return rows
    for row in rows:
        row["share_percent"] = computed_share(row, rows, char_code=char_code)
    return rows


def usage_code(usage_type, song_title: str | None = None) -> str:
    value = getattr(usage_type, "value", usage_type)
    raw = str(value or "").strip().lower()
    title = (song_title or "").strip().lower()
    haystack = f"{raw} {title}"

    if raw in {"bi", "bv", "fi", "fv", "oi", "ci"}:
        return raw.upper()
    if raw in {"background", "instrumental", "other"}:
        return "BI"
    if raw == "vocal":
        return "BV"
    if "feature" in haystack or "featured" in haystack:
        return "FV" if "vocal" in haystack or "song" in haystack else "FI"
    if "background" in haystack or "backgrou" in haystack or re.search(r"\bbg\b", haystack):
        return "BV" if "vocal" in haystack else "BI"
    if "vocal" in haystack:
        return "BV"
    if "instrumental" in haystack:
        return "BI"
    return "BI"


def usage_value_from_code(code: str | None) -> str:
    normalized = (code or "").strip().upper()
    if normalized in USAGE_ORDER:
        return normalized.lower()
    if normalized in ("OI", "CI"):
        return normalized.lower()
    return {
        "BACKGROUND INSTRUMENTAL": "bi",
        "BACKGROUND VOCAL": "bv",
        "FEATURED INSTRUMENTAL": "fi",
        "FEATURED VOCAL": "fv",
        "BG INSTRUMENTAL": "bi",
        "BG VOCAL": "bv",
        "FEATURE INSTRUMENTAL": "fi",
        "FEATURE VOCAL": "fv",
        "INSTRUMENTAL": "bi",
        "VOCAL": "bv",
        "BACKGROUND": "bi",
        "OPENING INSTRUMENTAL": "oi",
        "CLOSING INSTRUMENTAL": "ci",
        "MAIN TITLE": "oi",
        "END TITLE": "ci",
    }.get(normalized, "bi")


def cue_sort_key(cue, index: int = 0) -> tuple:
    code = usage_code(getattr(cue, "usage_type", None), getattr(cue, "song_title", None))
    title = (getattr(cue, "song_title", "") or "").lower()
    order_index = getattr(cue, "order_index", None)
    if order_index is None:
        order_index = index
    background_title_rank = 0 if code == "BI" and ("background" in title or "backgrou" in title) else 1
    return (USAGE_ORDER.get(code, 99), background_title_rank, order_index, getattr(cue, "id", 0) or 0)


def sorted_cues(cues) -> list:
    return sorted(list(cues or []), key=lambda cue: cue_sort_key(cue))
