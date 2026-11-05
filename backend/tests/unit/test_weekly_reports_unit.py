from datetime import datetime, timedelta, timezone

import pytest

from app.core.config import settings
from app.services import weekly_reports as w

MON_0900_IST = datetime(2026, 11, 9, 3, 30, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def default_schedule(monkeypatch):
    monkeypatch.setattr(settings, "REPORT_DAY", "monday")
    monkeypatch.setattr(settings, "REPORT_TIME", "09:00")
    monkeypatch.setattr(settings, "REPORT_TIMEZONE", "Asia/Kolkata")


def test_due_only_inside_the_catch_up_window():
    assert w.due_key(MON_0900_IST - timedelta(minutes=1)) is None
    assert w.due_key(MON_0900_IST) == "2026-W46"
    assert w.due_key(MON_0900_IST + timedelta(hours=23, minutes=59)) == "2026-W46"
    assert w.due_key(MON_0900_IST + timedelta(hours=24)) is None


def test_next_run_rolls_to_next_week_at_the_moment_itself():
    assert w.next_run(MON_0900_IST - timedelta(hours=1)).date().isoformat() == "2026-11-09"
    assert w.next_run(MON_0900_IST).date().isoformat() == "2026-11-16"


def test_day_and_time_come_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "REPORT_DAY", "fri")
    monkeypatch.setattr(settings, "REPORT_TIME", "18:30")
    fri = datetime(2026, 11, 13, 13, 0, tzinfo=timezone.utc)
    assert w.due_key(fri) == "2026-W46" and w.due_key(MON_0900_IST) is None


def test_time_zone_comes_from_settings(monkeypatch):
    monkeypatch.setattr(settings, "REPORT_TIMEZONE", "Europe/London")
    assert w.next_run(datetime(2026, 11, 9, tzinfo=timezone.utc)).utcoffset() == timedelta(0)


@pytest.mark.parametrize("field,value", [("REPORT_DAY", "funday"), ("REPORT_DAY", ""), ("REPORT_TIME", "25:00"), ("REPORT_TIME", "nine"), ("REPORT_TIMEZONE", "Mars/Base")])
def test_bad_settings_name_the_problem(monkeypatch, field, value):
    monkeypatch.setattr(settings, field, value)
    with pytest.raises(ValueError, match=field):
        w.schedule()


def test_email_doc_escapes_every_field():
    doc = w.Doc("T <b>", "P <i>")
    doc.rating({"key": "under", "label": "Under <u>", "reasons": ["why <s>"]})
    doc.kpis([("K <k>", "<v>", "<n>")])
    doc.table("H <h>", ["C <c>"], [["cell <script>alert(1)</script>"]], note="N <n2>")
    doc.para("para <p2>")
    r = doc.render("subject")
    for raw in ("<b>", "<i>", "<u>", "<s>", "<k>", "<v>", "<n>", "<h>", "<c>", "<script>", "<n2>", "<p2>"):
        assert raw not in r.html, raw
    assert "cell <script>" in r.text


def test_empty_table_shows_its_empty_text():
    doc = w.Doc("T", "P")
    doc.table("H", ["A"], [], empty="Nothing here")
    assert "Nothing here" in doc.render("s").html


def test_numbers_right_aligned_text_left():
    doc = w.Doc("T", "P")
    doc.table("H", ["Name", "N"], [["x", 3]])
    html = doc.render("s").html
    assert "text-align:left" in html and "text-align:right" in html


def test_vs_and_count_wording():
    assert w._vs(5, 5) == "same as the week before"
    assert w._vs(7, 5) == "+2 on the week before" and w._vs(None, 2) == "-2 on the week before"
    assert w._count(1, "{} one", "{} many") == "1 one" and w._count(2, "{} one", "{} many") == "2 many"
