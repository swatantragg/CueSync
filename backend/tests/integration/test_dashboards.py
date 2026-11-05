"""Editor Dashboard, Reviewer Activity Calendar and the Admin / WD attention lists, from history set up directly."""
from datetime import datetime, timedelta, timezone

import pytest

from app.models.society_submission import SocietySubmission
from app.services.insights import IST, periods


def ist(*a):
    return datetime(*a, tzinfo=IST)


@pytest.fixture
def world(make, login):
    wd = make.user("work_delegator")
    rev, rev2 = make.user("reviewer", name="Ravi"), make.user("reviewer", name="Rina")
    editor, idle = make.user("editor", name="Esha"), make.user("editor", name="Ira")
    sun, moon = make.client("Sun Music"), make.client("Moon Records")
    kothha, rang = make.project("Kothha", owner=wd), make.project("Rang", owner=wd)
    return dict(wd=wd, rev=rev, rev2=rev2, editor=editor, idle=idle, sun=sun, moon=moon, kothha=kothha, rang=rang, login=login, make=make)


# ── Editor Dashboard ────────────────────────────────────────────────────────
def test_editor_dashboard_groups_by_client_and_counts_every_state(world):
    make, editor, wd = world["make"], world["editor"], world["wd"]
    make.delegation(world["kothha"], editor, wd, client=world["sun"], episode_range="1-6", status="in_progress")
    make.delegation(world["rang"], editor, wd, client=world["moon"], episode_range="1-2")
    for n, st in ((1, "approved"), (2, "submitted"), (3, "rejected"), (4, "edited"), (5, "pending")):
        make.episode(world["kothha"], n, st)
    d = world["login"](editor).get("/api/insights/editor-dashboard").json()
    t = d["totals"]
    assert (t["allotted"], t["approved"], t["waiting"], t["rejected"], t["changes"], t["to_do"]) == (8, 1, 1, 1, 1, 4)
    by = {c["name"]: c for c in d["clients"]}
    assert by["Sun Music"]["allotted"] == 6 and by["Moon Records"]["to_do"] == 2
    assert by["Sun Music"]["projects"][0]["to_do_eps"] == "Ep 5–6"


def test_editor_sees_only_their_own_work(world):
    make, wd = world["make"], world["wd"]
    make.delegation(world["kothha"], world["idle"], wd, episode_range="1-9")
    d = world["login"](world["editor"]).get("/api/insights/editor-dashboard").json()
    assert d["clients"] == [] and d["totals"]["allotted"] == 0 and d["rating"]["key"] == "none"


def test_on_time_is_measured_from_the_submission_before_approval(world):
    make, editor, rev = world["make"], world["editor"], world["rev"]
    now = datetime.now(timezone.utc)
    start = periods(now)["year"].start
    make.delegation(world["kothha"], editor, world["wd"], episode_range="1-2", week_target=1, created_at=start + timedelta(days=1))
    # Ep 1 due day 8; handed in on day 3, rejected, handed in again on day 6, approved day 20: on time.
    ep1 = make.episode(world["kothha"], 1, "approved")
    make.audit(editor, "submit", ep1, start + timedelta(days=3))
    make.audit(rev, "reject", ep1, start + timedelta(days=4))
    make.audit(editor, "submit", ep1, start + timedelta(days=6))
    make.audit(rev, "approve", ep1, start + timedelta(days=20))
    # Ep 2 due day 15; handed in day 18: late.
    ep2 = make.episode(world["kothha"], 2, "approved")
    make.audit(editor, "submit", ep2, start + timedelta(days=18))
    make.audit(rev, "approve", ep2, start + timedelta(days=19))
    y = world["login"](editor).get("/api/insights/editor-dashboard").json()["stats"]["year"]
    assert (y["approved"], y["on_time"], y["late"], y["no_target"], y["rejected"], y["approval_rate"]) == (2, 1, 1, 0, 1, 67)


def test_series_buckets_add_up_to_the_period_totals(world):
    make, editor, rev = world["make"], world["editor"], world["rev"]
    now = datetime.now(timezone.utc)
    ep = make.episode(world["kothha"], 1, "approved")
    make.delegation(world["kothha"], editor, world["wd"], episode_range="1-1")
    make.audit(editor, "submit", ep, now - timedelta(minutes=2))
    make.audit(rev, "approve", ep, now - timedelta(minutes=1))
    d = world["login"](editor).get("/api/insights/editor-dashboard").json()
    for span in ("week", "month", "year"):
        assert sum(b["approved"] for b in d["series"][span]) == d["stats"][span]["approved"] == 1


def test_review_is_credited_to_whoever_last_submitted(world):
    make, editor, idle, rev = world["make"], world["editor"], world["idle"], world["rev"]
    now = datetime.now(timezone.utc)
    ep = make.episode(world["kothha"], 1, "approved")
    make.audit(idle, "submit", ep, now - timedelta(minutes=5))
    make.audit(editor, "submit", ep, now - timedelta(minutes=3))
    make.audit(rev, "approve", ep, now - timedelta(minutes=1))
    assert world["login"](editor).get("/api/insights/editor-dashboard").json()["stats"]["year"]["approved"] == 1
    assert world["login"](idle).get("/api/insights/editor-dashboard").json()["stats"]["year"]["approved"] == 0


# ── Attention list ──────────────────────────────────────────────────────────
def test_untouched_allotted_serial_is_flagged(world):
    make = world["make"]
    make.delegation(world["kothha"], world["idle"], world["wd"], episode_range="1-5", created_at=datetime.now(timezone.utc) - timedelta(days=40))
    d = world["login"](world["wd"]).get("/api/insights/wd-dashboard").json()
    flags = next(r for r in d["underperformers"]["month"]["editors"] if r["name"] == "Ira")["flags"]
    assert any(f == "Not working on Kothha" for f in flags)


def test_just_allotted_serial_is_not_flagged_yet(world):
    make = world["make"]
    make.delegation(world["kothha"], world["idle"], world["wd"], episode_range="1-5", created_at=datetime.now(timezone.utc) - timedelta(hours=2))
    d = world["login"](world["wd"]).get("/api/insights/wd-dashboard").json()
    rows = [r for r in d["underperformers"]["month"]["editors"] if r["name"] == "Ira"]
    assert not rows or not any(f.startswith("Not working on") for f in rows[0]["flags"])


def test_finished_serial_is_not_flagged_as_not_working(world):
    make = world["make"]
    make.delegation(world["kothha"], world["idle"], world["wd"], episode_range="1-1", created_at=datetime.now(timezone.utc) - timedelta(days=40))
    make.episode(world["kothha"], 1, "approved")
    d = world["login"](world["wd"]).get("/api/insights/wd-dashboard").json()
    rows = [r for r in d["underperformers"]["month"]["editors"] if r["name"] == "Ira"]
    assert not rows or not any(f.startswith("Not working on") for f in rows[0]["flags"])


# ── Reviewer Activity Calendar ──────────────────────────────────────────────
YEAR = 2026


def cal(world, **params):
    res = world["login"](world["rev"]).get("/api/insights/reviewer-calendar", params={"year": YEAR, **params})
    assert res.status_code == 200, res.text
    return res.json()


def sub(db, project, **kw):
    row = SocietySubmission(project_id=project.id, submitted_by=kw.pop("by"), episode_from=kw.pop("a", 1), episode_to=kw.pop("b", 1),
                            sent_via=kw.pop("via", "gmail"), mail_status=kw.pop("status", "sent"), submitted_to_iprs=True,
                            submitted_at=kw["mail_sent_at"], **kw)
    db.add(row)
    db.commit()
    return row


def test_every_decision_is_tracked_not_only_approvals(world):
    make, editor, rev = world["make"], world["editor"], world["rev"]
    make.delegation(world["kothha"], editor, world["wd"], client=world["sun"], episode_range="1-9")
    for n, act in ((1, "approve"), (2, "reject"), (3, "suggest")):
        ep = make.episode(world["kothha"], n, {"approve": "approved", "reject": "rejected", "suggest": "edited"}[act])
        make.audit(editor, "submit", ep, ist(YEAR, 3, 10, 12))
        make.audit(rev, act, ep, ist(YEAR, 3, 11, 12))
    m = cal(world)["months"]["3"]
    assert (m["submitted"], m["approved"], m["rejected"], m["changes"], m["reviewed"]) == (3, 1, 1, 1, 3)


def test_back_and_forth_counts_an_episode_once_per_month(world):
    make, editor, rev = world["make"], world["editor"], world["rev"]
    ep = make.episode(world["kothha"], 1, "submitted")
    for day in (1, 3, 5):
        make.audit(editor, "submit", ep, ist(YEAR, 4, day, 10))
    make.audit(rev, "reject", ep, ist(YEAR, 4, 2, 10))
    make.audit(rev, "reject", ep, ist(YEAR, 4, 4, 10))
    m = cal(world)["months"]["4"]
    assert m["submitted"] == 1 and m["rejected"] == 1 and m["reviewed"] == 1


def test_months_follow_india_time_not_utc(world):
    make, editor = world["make"], world["editor"]
    ep = make.episode(world["kothha"], 1, "pending")
    # 31 May 20:00 UTC is already 1 June 01:30 in India.
    make.audit(editor, "submit", ep, datetime(YEAR, 5, 31, 20, 0, tzinfo=timezone.utc))
    d = cal(world)
    assert d["months"]["5"]["submitted"] == 0 and d["months"]["6"]["submitted"] == 1


def test_year_edge_follows_india_time(world):
    make, editor = world["make"], world["editor"]
    ep = make.episode(world["kothha"], 1, "pending")
    make.audit(editor, "submit", ep, datetime(YEAR - 1, 12, 31, 20, 0, tzinfo=timezone.utc))  # 1 Jan in India
    assert cal(world)["months"]["1"]["submitted"] == 1


def test_to_review_adds_up_to_what_is_waiting_now(world):
    make, editor, rev = world["make"], world["editor"], world["rev"]
    waiting = make.episode(world["kothha"], 1, "submitted")
    make.audit(editor, "submit", waiting, ist(YEAR, 2, 1, 10))
    make.audit(rev, "reject", waiting, ist(YEAR, 2, 2, 10))
    make.audit(editor, "submit", waiting, ist(YEAR, 7, 1, 10))  # latest submission decides the month
    done = make.episode(world["kothha"], 2, "approved")
    make.audit(editor, "submit", done, ist(YEAR, 2, 1, 10))
    make.audit(rev, "approve", done, ist(YEAR, 2, 3, 10))
    months = cal(world)["months"]
    assert months["7"]["to_review"] == 1 and months["2"]["to_review"] == 0
    assert sum(m["to_review"] for m in months.values()) == 1


def test_emails_are_tracked_and_bounces_do_not_count_as_sent(world, db):
    k, rev = world["kothha"], world["rev"]
    sent = ist(YEAR, 8, 5, 10)
    sub(db, k, by=rev.id, a=1, b=3, society_name="IPRS", mail_sent_at=sent)
    sub(db, k, by=rev.id, a=4, b=4, society_name="PRS", mail_sent_at=sent, status="bounced")
    sub(db, k, by=rev.id, a=5, b=5, society_name="PRS", mail_sent_at=sent, status="resent")
    sub(db, k, by=rev.id, a=6, b=7, society_name="IPRS", mail_sent_at=sent, status="replied", reply_at=ist(YEAR, 9, 1, 10))
    sub(db, k, by=rev.id, a=8, b=8, society_name="IPRS", mail_sent_at=sent, accepted_by_iprs=True, accepted_by_iprs_at=ist(YEAR, 10, 2, 10))
    sub(db, k, by=rev.id, a=9, b=9, via="gmail_detected", society_name="ASCAP", mail_sent_at=sent)
    months = cal(world)["months"]
    a = months["8"]
    assert (a["sent_reports"], a["sent_episodes"], a["failed"], a["waiting_reply"]) == (4, 7, 2, 2)
    assert a["societies"] == {"IPRS": 6, "ASCAP": 1}
    assert months["9"]["replied"] == 1 and months["10"]["accepted"] == 1


def test_typed_entries_without_an_email_do_not_count_as_sent(world, db):
    sub(db, world["kothha"], by=world["rev"].id, via=None, status=None, mail_sent_at=ist(YEAR, 8, 5, 10))
    assert cal(world)["months"]["8"]["sent_reports"] == 0


def test_filters_narrow_the_right_columns(world, db, make):
    editor, rev = world["editor"], world["rev"]
    make.delegation(world["kothha"], editor, world["wd"], client=world["sun"], episode_range="1-9")
    make.delegation(world["rang"], editor, world["wd"], client=world["moon"], episode_range="1-9")
    for project in (world["kothha"], world["rang"]):
        ep = make.episode(project, 1, "approved")
        make.audit(editor, "submit", ep, ist(YEAR, 3, 1, 10))
        make.audit(rev, "approve", ep, ist(YEAR, 3, 2, 10))
    iprs, prs = make.society("IPRS"), make.society("PRS")
    sub(db, world["kothha"], by=rev.id, society_name="IPRS", society_id=iprs.id, client_id=world["sun"].id, client="Sun Music", mail_sent_at=ist(YEAR, 3, 3, 10))
    sub(db, world["rang"], by=rev.id, society_name="PRS", society_id=prs.id, client_id=world["moon"].id, client="Moon Records", mail_sent_at=ist(YEAR, 3, 3, 10))
    assert cal(world)["months"]["3"]["sent_reports"] == 2
    only_sun = cal(world, client_id=world["sun"].id)["months"]["3"]
    assert (only_sun["submitted"], only_sun["approved"], only_sun["sent_reports"]) == (1, 1, 1)
    only_prs = cal(world, society_id=prs.id)["months"]["3"]
    assert only_prs["sent_reports"] == 1 and only_prs["approved"] == 2


def test_ready_to_send_is_approved_and_not_emailed_yet(world, db, make):
    editor, rev = world["editor"], world["rev"]
    for n in (1, 2):
        ep = make.episode(world["kothha"], n, "approved")
        make.audit(editor, "submit", ep, ist(YEAR, 3, 1, 10))
        make.audit(rev, "approve", ep, ist(YEAR, 3, 2, 10))
    sub(db, world["kothha"], by=rev.id, a=1, b=1, society_name="IPRS", mail_sent_at=ist(YEAR, 3, 3, 10))
    assert cal(world)["months"]["3"]["ready_to_send"] == 1


def test_month_detail_splits_weeks_clients_and_reviewers(world, db, make):
    editor, rev, rev2 = world["editor"], world["rev"], world["rev2"]
    make.delegation(world["kothha"], editor, world["wd"], client=world["sun"], episode_range="1-9")
    a = make.episode(world["kothha"], 1, "approved")
    b = make.episode(world["kothha"], 2, "rejected")
    make.audit(editor, "submit", a, ist(YEAR, 11, 2, 10))    # Monday 2 Nov
    make.audit(rev, "approve", a, ist(YEAR, 11, 3, 10))
    make.audit(editor, "submit", b, ist(YEAR, 11, 9, 10))    # next Monday
    make.audit(rev2, "reject", b, ist(YEAR, 11, 10, 10))
    m = cal(world)["months"]["11"]
    weeks = {w["label"]: w for w in m["weeks"]}
    assert weeks["2–8"]["approved"] == 1 and weeks["9–15"]["rejected"] == 1
    assert sum(w["submitted"] for w in m["weeks"]) == m["submitted"] == 2
    assert {r["name"]: r["reviewed"] for r in m["reviewers"]} == {"Ravi": 1, "Rina": 1}
    assert [c["name"] for c in m["clients"]] == ["Sun Music"] and m["clients"][0]["submitted"] == 2


def test_other_years_stay_out(world):
    make, editor = world["make"], world["editor"]
    ep = make.episode(world["kothha"], 1, "pending")
    make.audit(editor, "submit", ep, ist(YEAR + 1, 1, 5, 10))
    assert all(m["submitted"] == 0 for m in cal(world)["months"].values())


def test_calendar_is_for_reviewers_and_admins(world, make, login):
    for role in ("editor", "work_delegator", "viewer"):
        assert login(make.user(role)).get("/api/insights/reviewer-calendar").status_code == 403
    assert login(make.user("admin")).get("/api/insights/reviewer-calendar").status_code == 200


def test_old_endpoint_is_gone(world):
    assert world["login"](world["rev"]).get("/api/delegations/activity/reviewer-calendar", params={"year": YEAR}).status_code in (404, 405, 422)
