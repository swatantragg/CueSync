from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

from app.services import insights
from app.services.insights import IST, RATINGS, _month_weeks, editor_rating, past_week, periods


def at(*args):  # a moment given in IST
    return datetime(*args, tzinfo=IST)


def test_week_runs_monday_to_sunday_in_ist():
    wed = at(2026, 11, 4, 12)
    p = periods(wed)["week"]
    assert p.start == at(2026, 11, 2) and p.end == at(2026, 11, 9)
    assert p.has(at(2026, 11, 8, 23, 59)) and not p.has(at(2026, 11, 9))


def test_utc_late_night_belongs_to_next_ist_day():
    # 19:00 UTC on Sunday is already Monday 00:30 in India: a new week.
    p = periods(datetime(2026, 11, 8, 19, 0, tzinfo=timezone.utc))["week"]
    assert p.start == at(2026, 11, 9)


def test_work_days_count_excludes_sunday():
    assert periods(at(2026, 11, 8, 12))["week"].work_days == 6
    assert periods(at(2026, 11, 2, 12))["week"].work_days == 1


def test_month_and_year_edges():
    ps = periods(at(2026, 12, 31, 23))
    assert ps["month"].end == at(2027, 1, 1)
    assert ps["year"].start == at(2026, 1, 1) and ps["year"].end == at(2027, 1, 1)


def test_past_week_is_the_finished_one():
    now = at(2026, 11, 9, 9)
    last, before = past_week(now), past_week(now, 2)
    assert last.start == at(2026, 11, 2) and last.end == at(2026, 11, 9) and last.work_days == 6
    assert before.end == last.start
    assert "Mon 2 Nov" in last.label and "Sat 7 Nov" in last.label


def test_month_weeks_cover_the_month_without_gaps():
    start, end = at(2026, 11, 1), at(2026, 12, 1)
    weeks = _month_weeks(start, end)
    assert weeks[0][1] == start and weeks[-1][2] == end
    assert all(a[2] == b[1] for a, b in zip(weeks, weeks[1:]))
    assert all(w[2].weekday() == 0 or w[2] == end for w in weeks)
    assert weeks[0][0] == "1" and weeks[1][0] == "2–8" and weeks[-1][0] == "30"


COUNTS = {"approved": 0, "submitted": 0, "rejected": 0}


@pytest.mark.parametrize("counts,flags,has_work,due,key", [
    ({**COUNTS, "approved": 10}, [], True, 10, "good"),
    ({**COUNTS, "approved": 4, "rejected": 1}, [], True, 4, "good"),       # 80% exactly
    ({**COUNTS, "approved": 3, "rejected": 1}, [], True, 3, "decent"),     # 75%
    ({**COUNTS, "approved": 5}, [], True, 10, "decent"),                   # below target, nothing flagged
    ({**COUNTS, "approved": 10}, ["Behind"], True, 10, "under"),           # a flag always wins
    ({**COUNTS}, [], False, 0, "none"),
    ({**COUNTS}, [], True, 0, "decent"),
    ({**COUNTS, "approved": 2}, [], True, 0, "good"),                      # no target: any approved work at a high rate
])
def test_editor_rating(counts, flags, has_work, due, key):
    r = editor_rating(counts, flags, has_work, due)
    assert r["key"] == key and r["label"] == RATINGS[key] and r["reasons"] == flags


def _data(**kw):
    d = insights._Data()
    d.numbers, d.projects = {}, {1: SimpleNamespace(type=None, total_episodes=4)}
    for k, v in kw.items():
        setattr(d, k, v)
    return d


def test_due_dates_follow_the_weekly_target():
    created = at(2026, 1, 1)
    dl = SimpleNamespace(week_target=2, created_at=created, episode_range="1-5", project_id=1)
    due = _data().due_dates(dl)
    assert due[1] == due[2] == created + timedelta(days=7)
    assert due[3] == due[4] == created + timedelta(days=14)
    assert due[5] == created + timedelta(days=21)


@pytest.mark.parametrize("target", [None, 0, -1])
def test_no_target_means_no_due_dates(target):
    dl = SimpleNamespace(week_target=target, created_at=at(2026, 1, 1), episode_range="1-5", project_id=1)
    assert _data().due_dates(dl) == {}


def test_huge_typo_range_cannot_expand_forever():
    dl = SimpleNamespace(week_target=None, created_at=at(2026, 1, 1), episode_range="1-100000000", project_id=1)
    assert len(_data().units(dl)) == insights.MAX_SPAN
