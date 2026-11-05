import asyncio
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from app.core.config import settings
from app.core.database import engine
from app.models.report_send import ReportSend
from app.services import brevo, weekly_reports as w


def relay(enabled=True):
    return httpx.Response(200, json={"relay": {"enabled": enabled}, "plan": []})


@pytest.fixture
def staff(make):
    wd = make.user("work_delegator", name="Asha D")
    editor = make.user("editor", name="Esha E")
    project = make.project(owner=wd)
    make.delegation(project, editor, wd, episode_range="1-3", week_target=3, created_at=datetime.now(timezone.utc) - timedelta(days=20))
    return dict(wd=wd, editor=editor, admin=make.user("admin", name="Ada A"), reviewer=make.user("reviewer", name="Ravi R"),
                free_editor=make.user("editor", name="Free E"), free_wd=make.user("work_delegator", name="Free W"),
                off=make.user("editor", name="Off E", is_active=False), viewer=make.user("viewer", name="View V"))


@pytest.fixture
def brevo_ok(net):
    net.on("GET", brevo.ACCOUNT_URL, relay(True))
    net.on("POST", brevo.SEND_URL, lambda r: httpx.Response(201, json={"messageId": "<id>"}))
    return net


def run(base_client, *a):
    return base_client.portal.call(w.send_week, engine, *a)


def recipients(net):
    import json
    return sorted(json.loads(r.content)["to"][0]["email"] for r in net.sent_to(brevo.SEND_URL))


NOW = datetime.now(timezone.utc)


def test_everyone_active_gets_a_report_even_with_no_work(staff, brevo_ok, base_client, db):
    res = run(base_client, "T-1", NOW)
    active = sorted(staff[k].email for k in ("wd", "editor", "admin", "reviewer", "free_editor", "free_wd"))
    assert recipients(brevo_ok) == active and res == {"sent": 6, "failed": 0}
    assert staff["off"].email not in recipients(brevo_ok) and staff["viewer"].email not in recipients(brevo_ok)
    assert {r.status for r in db.query(ReportSend).all()} == {"sent"}


def test_no_work_reports_say_so(staff, base_client, db):
    ctx = base_client.portal.call(_ctx)
    editor = w.editor_report(ctx, staff["free_editor"])
    assert "No work is allotted to you" in editor.text and "Well done" not in editor.text
    assert "no work allotted" in w.wd_report(ctx, staff["free_wd"]).subject


async def _ctx():
    from sqlalchemy.ext.asyncio import AsyncSession
    async with AsyncSession(engine, expire_on_commit=False) as db:
        return await w.Ctx().load(db, datetime.now(timezone.utc))


def test_each_role_gets_its_own_report(staff, brevo_ok, base_client):
    import json
    run(base_client, "T-1", NOW)
    by = {json.loads(r.content)["to"][0]["email"]: json.loads(r.content) for r in brevo_ok.sent_to(brevo.SEND_URL)}
    assert "Pending work" in by[staff["editor"].email]["htmlContent"]
    assert "Clients: received, submitted, pending" in by[staff["wd"].email]["htmlContent"]
    assert "Sent last week, by client and society" in by[staff["reviewer"].email]["htmlContent"]
    assert "Work Delegators" in by[staff["admin"].email]["htmlContent"]
    assert by[staff["admin"].email]["sender"]["email"] == settings.BREVO_SENDER_EMAIL


def test_rerun_never_emails_twice(staff, brevo_ok, base_client):
    run(base_client, "T-1", NOW)
    n = len(recipients(brevo_ok))
    run(base_client, "T-1", NOW)
    assert len(recipients(brevo_ok)) == n


def test_four_workers_at_once_email_each_person_once(staff, brevo_ok, base_client):
    async def together():
        return await asyncio.gather(*[w.send_week(engine, "T-2", NOW) for _ in range(4)])
    base_client.portal.call(together)
    got = recipients(brevo_ok)
    assert len(got) == len(set(got)) == 6


def test_failure_is_retried_later_and_gives_up_after_three(staff, net, base_client, db):
    import json
    bad = staff["reviewer"].email
    net.on("GET", brevo.ACCOUNT_URL, relay(True))
    net.on("POST", brevo.SEND_URL, lambda r: httpx.Response(400, json={"message": "nope"}) if json.loads(r.content)["to"][0]["email"] == bad else httpx.Response(201, json={"messageId": "x"}))
    assert run(base_client, "T-3", NOW)["failed"] == 1
    row = db.query(ReportSend).filter_by(email=bad).one()
    assert row.status == "failed" and "nope" in row.error and row.attempts == 1
    assert run(base_client, "T-3", NOW) == {"sent": 0, "failed": 0}  # too soon
    for i in range(1, 5):
        run(base_client, "T-3", datetime.now(timezone.utc) + timedelta(minutes=11 * i))
    db.expire_all()
    assert db.query(ReportSend).filter_by(email=bad).one().attempts == 3


def test_retry_succeeds_and_only_touches_the_failed_person(staff, net, base_client, db):
    import json
    bad = staff["reviewer"].email
    net.on("POST", brevo.SEND_URL, lambda r: httpx.Response(500, json={"message": "down"}) if json.loads(r.content)["to"][0]["email"] == bad else httpx.Response(201, json={"messageId": "x"}))
    run(base_client, "T-4", NOW)
    before = len(net.sent_to(brevo.SEND_URL))
    net.on("POST", brevo.SEND_URL, httpx.Response(201, json={"messageId": "y"}))
    run(base_client, "T-4", datetime.now(timezone.utc) + timedelta(minutes=11))
    assert len(net.sent_to(brevo.SEND_URL)) == before + 1
    db.expire_all()
    assert db.query(ReportSend).filter_by(email=bad).one().status == "sent"


def _due(monkeypatch):
    now = datetime.now(timezone.utc).astimezone(w.ZoneInfo("Asia/Kolkata"))
    monkeypatch.setattr(settings, "REPORT_DAY", w.DAYS[now.weekday()])
    monkeypatch.setattr(settings, "REPORT_TIME", "00:00")
    monkeypatch.setattr(settings, "REPORT_TIMEZONE", "Asia/Kolkata")
    monkeypatch.setattr(settings, "REPORT_ENABLED", True)


def test_run_if_due_sends_when_on_and_due(staff, brevo_ok, base_client, monkeypatch):
    _due(monkeypatch)
    base_client.portal.call(w.run_if_due, engine)
    assert len(recipients(brevo_ok)) == 6


def test_switched_off_sends_nothing(staff, brevo_ok, base_client, monkeypatch):
    _due(monkeypatch)
    monkeypatch.setattr(settings, "REPORT_ENABLED", False)
    base_client.portal.call(w.run_if_due, engine)
    assert brevo_ok.calls == []


def test_missing_key_sends_nothing(staff, brevo_ok, base_client, monkeypatch):
    _due(monkeypatch)
    monkeypatch.setattr(settings, "BREVO_API_KEY", "")
    base_client.portal.call(w.run_if_due, engine)
    assert brevo_ok.calls == []


def test_brevo_sending_disabled_claims_nobody_so_the_run_is_not_lost(staff, net, base_client, monkeypatch, db):
    """Brevo accepts emails while sending is off and drops them. Nobody may be marked sent."""
    _due(monkeypatch)
    net.on("GET", brevo.ACCOUNT_URL, relay(False))
    net.on("POST", brevo.SEND_URL, httpx.Response(201, json={"messageId": "x"}))
    base_client.portal.call(w.run_if_due, engine)
    assert net.sent_to(brevo.SEND_URL) == [] and db.query(ReportSend).count() == 0
    net.on("GET", brevo.ACCOUNT_URL, relay(True))
    base_client.portal.call(w.run_if_due, engine)
    assert len(net.sent_to(brevo.SEND_URL)) == 6


def test_admin_test_send_goes_only_to_the_signed_in_admin(staff, brevo_ok, login):
    res = login(staff["admin"]).post("/api/reports/test", json={"role": "reviewer"})
    assert res.status_code == 200, res.text
    assert recipients(brevo_ok) == [staff["admin"].email]


def test_test_send_refuses_while_brevo_sending_is_off(staff, net, login):
    net.on("GET", brevo.ACCOUNT_URL, relay(False))
    res = login(staff["admin"]).post("/api/reports/test", json={"role": "editor"})
    assert res.status_code == 409 and "activate transactional" in res.json()["detail"]
    assert net.sent_to(brevo.SEND_URL) == []


def test_status_shows_what_brevo_says(staff, net, login):
    net.on("GET", brevo.ACCOUNT_URL, relay(False))
    net.on("GET", brevo.STATS_URL, httpx.Response(200, json={"requests": 5, "delivered": 2, "error": 3}))
    s = login(staff["admin"]).get("/api/reports/status").json()
    assert s["sending_enabled"] is False and s["delivery"]["delivered"] == 2 and s["delivery"]["errors"] == 3


def test_status_survives_brevo_blocking_the_server_ip(staff, net, login):
    net.on("GET", brevo.ACCOUNT_URL, httpx.Response(401, json={"message": "unrecognised IP address"}))
    s = login(staff["admin"]).get("/api/reports/status").json()
    assert "unrecognised IP" in s["brevo_error"] and s["sending_enabled"] is None


@pytest.fixture
def owner(make):
    return make.user("admin", name="Super S", is_super_admin=True)


def test_switched_off_person_gets_no_report(staff, brevo_ok, base_client, db):
    staff["editor"].weekly_report_enabled = False
    db.commit()
    res = run(base_client, "T-1", NOW)
    assert staff["editor"].email not in recipients(brevo_ok) and res == {"sent": 5, "failed": 0}
    assert db.query(ReportSend).filter_by(user_id=staff["editor"].id).count() == 0


def test_switching_off_stops_a_pending_retry(staff, net, base_client, db):
    import json
    bad = staff["editor"].email
    net.on("GET", brevo.ACCOUNT_URL, relay(True))
    net.on("POST", brevo.SEND_URL, lambda r: httpx.Response(400, json={"message": "nope"}) if json.loads(r.content)["to"][0]["email"] == bad else httpx.Response(201, json={"messageId": "x"}))
    assert run(base_client, "T-3", NOW)["failed"] == 1
    staff["editor"].weekly_report_enabled = False
    db.commit()
    assert run(base_client, "T-3", NOW + timedelta(minutes=11)) == {"sent": 0, "failed": 0}
    assert recipients(net).count(bad) == 1


def test_super_admin_toggle_reaches_the_send(staff, owner, brevo_ok, login, base_client):
    res = login(owner).put(f"/api/reports/recipients/{staff['editor'].id}", json={"enabled": False})
    assert res.status_code == 200 and res.json()["email"] == staff["editor"].email
    run(base_client, "T-1", NOW)
    assert staff["editor"].email not in recipients(brevo_ok)


def test_switching_back_on_sends_again(staff, owner, brevo_ok, login, base_client):
    c, path = login(owner), f"/api/reports/recipients/{staff['editor'].id}"
    assert c.put(path, json={"enabled": False}).json()["enabled"] is False
    assert c.put(path, json={"enabled": True}).json()["enabled"] is True
    run(base_client, "T-1", NOW)
    assert staff["editor"].email in recipients(brevo_ok)


def test_recipient_list_is_the_people_who_can_get_a_report(staff, owner, login):
    rows = login(owner).get("/api/reports/recipients").json()
    want = {staff[k].email for k in ("wd", "editor", "admin", "reviewer", "free_editor", "free_wd")} | {owner.email}
    assert {r["email"] for r in rows} == want and all(r["enabled"] is True for r in rows)


@pytest.mark.parametrize("who", ["off", "viewer"])
def test_cannot_toggle_someone_who_gets_no_report(staff, owner, login, who):
    assert login(owner).put(f"/api/reports/recipients/{staff[who].id}", json={"enabled": False}).status_code == 404


@pytest.mark.parametrize("who", ["admin", "wd", "reviewer", "editor"])
def test_only_the_super_admin_can_see_or_change_recipients(staff, login, db, who):
    c, target = login(staff[who]), staff["free_editor"]
    assert c.get("/api/reports/recipients").status_code == 403
    assert c.put(f"/api/reports/recipients/{target.id}", json={"enabled": False}).status_code == 403
    db.refresh(target)
    assert target.weekly_report_enabled is True


def test_plain_admin_sees_no_trace_of_the_setting(staff, login):
    assert "weekly_report_enabled" not in login(staff["admin"]).get("/api/users/").text


def test_preview_works_for_each_role(staff, login):
    c = login(staff["admin"])
    for role in ("editor", "work_delegator", "reviewer", "admin"):
        res = c.get("/api/reports/preview", params={"role": role})
        assert res.status_code == 200 and "CUESYNC WEEKLY REPORT" in res.json()["html"], role
    assert c.get("/api/reports/preview", params={"role": "viewer"}).status_code == 422


def test_report_numbers_cover_last_week_only(staff, make, base_client, login):
    from app.services.insights import past_week
    now = datetime.now(timezone.utc)
    week = past_week(now)
    project = make.project("Other", owner=staff["wd"])
    ep = make.episode(project, 1, "approved")
    make.audit(staff["editor"], "submit", ep, week.start + timedelta(hours=1))
    make.audit(staff["reviewer"], "approve", ep, week.start + timedelta(hours=2))
    ep2 = make.episode(project, 2, "approved")
    make.audit(staff["editor"], "submit", ep2, week.end + timedelta(minutes=1))
    make.audit(staff["reviewer"], "approve", ep2, week.end + timedelta(minutes=2))
    ctx = base_client.portal.call(_ctx)
    assert "1 approved" in w.editor_report(ctx, staff["editor"]).subject
