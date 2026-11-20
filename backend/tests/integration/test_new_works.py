"""New Work List: BGM received → fingerprinting → cue sheet work, the reminders, and the fingerprinting service's emails."""
import base64
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import engine
from app.models import AuditLog, Project
from app.models.client import ClientMailbox
from app.models.new_work import FingerprintMail, NewWork, SystemMailbox
from app.models.notification import Notification
from app.models.work_delegation import WorkDelegation
from app.services import fingerprint_mail, gmail, new_works, weekly_reports
from conftest import google_token_reply

NOW = datetime.now(timezone.utc)
BOX = settings.FINGERPRINT_MAILBOX
SENDER = f"{settings.FINGERPRINT_SENDER_NAME} <{settings.FINGERPRINT_SENDER}>"


@pytest.fixture
def s(make, login):
    admin = make.user("admin", name="Ada Admin")
    wd = make.user("work_delegator", name="Asha Delegator")
    editor, other = make.user("editor", name="Esha Editor"), make.user("editor", name="Omar Editor")
    return dict(admin=admin, wd=wd, editor=editor, other=other, client=make.client("Sun Music"),
                ac=login(admin), wc=login(wd), ec=login(editor), oc=login(other), make=make, login=login)


def add(s, title="Movie ABC", kind="movie", **kw):
    res = s["wc"].post("/api/new-works/", json={"title": title, "work_type": kind, "client_id": s["client"].id, **kw})
    assert res.status_code == 200, res.text
    return res.json()["work"]


def do(client, wid, path, **body):
    res = client.post(f"/api/new-works/{wid}/{path}", json=body)
    assert res.status_code == 200, res.text
    return res.json()["work"]


def to_cue_step(s, title="Movie ABC", kind="movie"):
    """A work with BGM received and fingerprinting completed by hand."""
    w = add(s, title, kind)
    do(s["wc"], w["id"], "bgm", received=True)
    do(s["wc"], w["id"], "fingerprint/assign", assigned_to=s["editor"].id)
    return do(s["wc"], w["id"], "fingerprint/complete", source_note="Report downloaded from the Vericast portal")


def age(db, wid, **days):
    """Move a work's dates back, e.g. created_at=6 → added six days ago."""
    db.query(NewWork).filter(NewWork.id == wid).update({k: NOW - timedelta(days=v, minutes=5) for k, v in days.items()})
    db.commit()


def call(base_client, fn, *args):
    async def run():
        async with AsyncSession(engine, expire_on_commit=False) as db:
            async with db.begin():
                return await fn(db, *args)
    return base_client.portal.call(run)


def actions(db, wid):
    return [a.action for a in db.query(AuditLog).filter(AuditLog.entity == "new_work", AuditLog.entity_id == wid).order_by(AuditLog.id)]


def notes(db, user, kind=None):
    q = db.query(Notification).filter(Notification.user_id == user.id)
    return q.filter(Notification.entity_type == kind).all() if kind else q.all()


# ── the three steps and their locks ─────────────────────────────────────────
def test_a_new_work_starts_awaiting_bgm_with_the_next_two_steps_locked(s):
    w = add(s, remarks="Name received on WhatsApp")
    assert (w["stage"], w["stage_label"], w["bgm"]["received"]) == ("awaiting_bgm", "Awaiting BGM", False)
    assert w["locked"] == {"fingerprint": True, "cue": True}
    assert (w["fingerprint"]["status"], w["cue"]["status"], w["created_by_name"]) == ("not_assigned", "not_assigned", "Asha Delegator")
    wid = w["id"]
    assert s["wc"].post(f"/api/new-works/{wid}/fingerprint/assign", json={"assigned_to": s["editor"].id}).status_code == 409
    assert s["wc"].post(f"/api/new-works/{wid}/fingerprint/complete", json={"source_note": "from the portal"}).status_code == 409
    assert s["wc"].post(f"/api/new-works/{wid}/skip", json={"step": "fingerprint", "reason": "not needed"}).status_code == 409
    assert s["wc"].post(f"/api/new-works/{wid}/cue/allot", json={"assigned_to": s["editor"].id}).status_code == 409


def test_the_same_title_cannot_be_open_twice(s):
    add(s, "Movie ABC")
    cid = s["client"].id
    res = s["wc"].post("/api/new-works/", json={"title": "movie-abc ", "work_type": "movie", "client_id": cid})
    assert res.status_code == 409 and "already in the New Work List" in res.json()["detail"]
    assert s["wc"].post("/api/new-works/", json={"title": "Movie ABC", "work_type": "tv_show", "client_id": cid}).status_code == 200
    assert s["wc"].post("/api/new-works/", json={"title": " -- ", "work_type": "movie", "client_id": cid}).status_code == 400


def test_ticking_bgm_records_the_date_and_opens_fingerprinting(s, db):
    w = add(s)
    w = do(s["wc"], w["id"], "bgm", received=True)
    assert w["bgm"]["received"] and w["bgm"]["by_name"] == "Asha Delegator" and w["stage"] == "fp_not_assigned"
    assert abs((datetime.fromisoformat(w["bgm"]["at"]) - datetime.now(timezone.utc)).total_seconds()) < 60
    assert w["locked"] == {"fingerprint": False, "cue": True}
    # Unticked again while nobody has it; not once fingerprinting is assigned.
    assert do(s["wc"], w["id"], "bgm", received=False)["stage"] == "awaiting_bgm"
    do(s["wc"], w["id"], "bgm", received=True)
    do(s["wc"], w["id"], "fingerprint/assign", assigned_to=s["editor"].id)
    assert s["wc"].post(f"/api/new-works/{w['id']}/bgm", json={"received": False}).status_code == 409
    assert actions(db, w["id"]) == ["new_work_add", "new_work_bgm", "new_work_reopen", "new_work_bgm", "new_work_fp_assign"]


def test_a_step_is_skipped_only_with_a_reason_and_the_reason_is_kept(s, db):
    w = add(s)
    for bad in ("", "  ", "no"):
        assert s["wc"].post(f"/api/new-works/{w['id']}/skip", json={"step": "bgm", "reason": bad}).status_code == 400
    w = do(s["wc"], w["id"], "skip", step="bgm", reason="Client will not send the BGM")
    assert (w["bgm"]["state"], w["bgm"]["skip_reason"], w["stage"]) == ("skipped", "Client will not send the BGM", "fp_not_assigned")
    w = do(s["wc"], w["id"], "skip", step="fingerprint", reason="Songs are already known")
    assert (w["fingerprint"]["status"], w["stage"], w["locked"]["cue"]) == ("skipped", "cue_pending", False)
    w = do(s["wc"], w["id"], "skip", step="cue", reason="Order was cancelled")
    assert (w["stage"], w["stage_label"], w["reminder"]) == ("closed", "Closed without a cue sheet", None)
    details = [a.details for a in db.query(AuditLog).filter(AuditLog.action == "new_work_skip").order_by(AuditLog.id)]
    assert details == ["BGM received: Client will not send the BGM", "Fingerprinting: Songs are already known", "Cue sheet work: Order was cancelled"]


def test_a_skipped_step_reopens_until_the_next_one_has_started(s):
    w = add(s)
    do(s["wc"], w["id"], "skip", step="bgm", reason="Client will not send the BGM")
    do(s["wc"], w["id"], "skip", step="fingerprint", reason="Songs are already known")
    assert s["wc"].post(f"/api/new-works/{w['id']}/reopen", json={"step": "bgm"}).status_code == 409
    assert do(s["wc"], w["id"], "reopen", step="fingerprint")["stage"] == "fp_not_assigned"
    assert do(s["wc"], w["id"], "reopen", step="bgm")["stage"] == "awaiting_bgm"


# ── fingerprinting ──────────────────────────────────────────────────────────
def test_fingerprinting_is_assigned_from_a_list_of_editors_and_the_editor_is_told(s, db):
    w = add(s)
    do(s["wc"], w["id"], "bgm", received=True)
    assert s["wc"].post(f"/api/new-works/{w['id']}/fingerprint/assign", json={"assigned_to": s["wd"].id}).status_code == 400
    w = do(s["wc"], w["id"], "fingerprint/assign", assigned_to=s["editor"].id)
    fp = w["fingerprint"]
    assert (fp["status"], fp["assigned_to_name"], fp["assigned_by_name"], w["stage"]) == ("assigned", "Esha Editor", "Asha Delegator", "fp_assigned")
    assert fp["assigned_at"] and [n.title for n in notes(db, s["editor"], "new_work")] == ["Fingerprinting assigned: Movie ABC"]
    mine = s["ec"].get("/api/new-works/mine").json()["works"]
    assert [m["title"] for m in mine] == ["Movie ABC"] and s["oc"].get("/api/new-works/mine").json()["works"] == []
    # Taking it back clears the assignment.
    assert do(s["wc"], w["id"], "fingerprint/assign", assigned_to=None)["fingerprint"]["status"] == "not_assigned"
    assert s["ec"].get("/api/new-works/mine").json()["works"] == []


def test_without_the_email_completion_needs_where_the_fingerprinting_came_from(s, db):
    w = add(s)
    do(s["wc"], w["id"], "bgm", received=True)
    wid = w["id"]
    assert s["wc"].post(f"/api/new-works/{wid}/fingerprint/complete", json={"source_note": "from the portal"}).status_code == 409  # nobody assigned
    do(s["wc"], wid, "fingerprint/assign", assigned_to=s["editor"].id)
    assert do(s["ec"], wid, "fingerprint/status", status="in_progress")["stage"] == "fp_in_progress"
    res = s["ec"].post(f"/api/new-works/{wid}/fingerprint/complete", json={})
    assert res.status_code == 400 and "where the fingerprinting came from" in res.json()["detail"]
    w = do(s["ec"], wid, "fingerprint/complete", source_note="Report downloaded from the Vericast portal")
    fp = w["fingerprint"]
    assert (fp["status"], fp["source"], fp["source_note"], fp["done_by_name"]) == ("completed", "manual", "Report downloaded from the Vericast portal", "Esha Editor")
    assert fp["done_at"] and w["stage"] == "cue_pending" and w["locked"]["cue"] is False
    log = db.query(AuditLog).filter(AuditLog.action == "new_work_fp_done").one()
    assert log.user_id == s["editor"].id and "Manual entry" in log.details and "Vericast portal" in log.details
    assert "Fingerprinting completed: Movie ABC" in [n.title for n in notes(db, s["wd"])]


def test_only_the_assigned_editor_or_a_delegator_may_work_on_it(s):
    w = add(s)
    do(s["wc"], w["id"], "bgm", received=True)
    do(s["wc"], w["id"], "fingerprint/assign", assigned_to=s["editor"].id)
    wid = w["id"]
    assert s["oc"].post(f"/api/new-works/{wid}/fingerprint/status", json={"status": "in_progress"}).status_code == 403
    assert s["oc"].post(f"/api/new-works/{wid}/fingerprint/complete", json={"source_note": "from the portal"}).status_code == 403
    assert s["oc"].get(f"/api/new-works/{wid}").status_code == 403 and s["ec"].get(f"/api/new-works/{wid}").status_code == 200
    for path, body in (("bgm", {"received": False}), ("skip", {"step": "fingerprint", "reason": "not needed"}),
                       ("fingerprint/assign", {"assigned_to": s["other"].id}), ("cue/allot", {"assigned_to": s["editor"].id})):
        assert s["ec"].post(f"/api/new-works/{wid}/{path}", json=body).status_code == 403, path
    assert s["ec"].get("/api/new-works/").status_code == 403 and s["ec"].get("/api/new-works/activity").status_code == 403


# ── the fingerprinting service's emails ─────────────────────────────────────
def message(mid, subject, body="", sender=SENDER, at=None, files=()):
    data = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    parts = [{"mimeType": "text/plain", "body": {"data": data}}] + [{"mimeType": "audio/wav", "filename": f, "body": {}} for f in files]
    return {"id": mid, "threadId": f"t-{mid}", "internalDate": str(int((at or datetime.now(timezone.utc)).timestamp() * 1000)),
            "snippet": body[:80], "payload": {"mimeType": "multipart/mixed", "parts": parts,
                                              "headers": [{"name": "From", "value": sender}, {"name": "Subject", "value": subject}]}}


def inbox(net, db, *messages, connect=True):
    if connect and not db.query(SystemMailbox).count():
        db.add(SystemMailbox(purpose="fingerprint", email=BOX, refresh_token_enc=gmail.encrypt_token("r"), status="connected"))
        db.commit()
    by_id = {m["id"]: m for m in messages}
    net.on("POST", gmail.TOKEN_URL, httpx.Response(200, json={"access_token": "box-token"}))
    net.on("GET", f"{gmail.API_URL}/messages", lambda r: httpx.Response(200, json={"messages": [{"id": i} for i in by_id]}))
    for mid, m in by_id.items():
        net.on("GET", f"{gmail.API_URL}/messages/{mid}", httpx.Response(200, json=m))


def waiting_on_fingerprint(s, title="Movie ABC"):
    w = add(s, title)
    do(s["wc"], w["id"], "bgm", received=True)
    return do(s["wc"], w["id"], "fingerprint/assign", assigned_to=s["editor"].id)


def test_the_service_email_naming_the_title_unlocks_completion(s, net, db, base_client):
    w = waiting_on_fingerprint(s)
    inbox(net, db, message("m1", "Your report is ready", "Fingerprint results for Movie_ABC are attached."))
    assert call(base_client, fingerprint_mail.sync) == {"connected": True, "found": 1, "linked": 1, "error": None}
    query = parse_qs(urlparse(str(net.sent_to(f"{gmail.API_URL}/messages?")[0].url)).query)["q"][0]
    assert query.startswith(f"from:{settings.FINGERPRINT_SENDER} after:")
    w = s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]
    mail = w["fingerprint"]["mail"]
    assert mail["subject"] == "Your report is ready" and mail["auto"] is True and mail["linked_by_name"] is None
    log = db.query(AuditLog).filter(AuditLog.action == "new_work_fp_mail").one()
    assert log.user_id is None and BOX in log.details and "Matched to this work by its title" in log.details
    for person in (s["wd"], s["admin"], s["editor"]):
        assert f"{settings.FINGERPRINT_SENDER_NAME} email received: Movie ABC" in [n.title for n in notes(db, person)]
    # Now the box can be ticked with no note, by the editor it is assigned to.
    w = do(s["ec"], w["id"], "fingerprint/complete")
    assert (w["fingerprint"]["status"], w["fingerprint"]["source"], w["fingerprint"]["source_note"]) == ("completed", "bmat_mail", None)
    assert "email received" in db.query(AuditLog).filter(AuditLog.action == "new_work_fp_done").one().details
    # A second run reads nothing twice and notifies nobody again.
    before = db.query(Notification).count()
    assert call(base_client, fingerprint_mail.sync)["found"] == 0 and db.query(Notification).count() == before


def test_an_email_is_matched_by_file_name_and_only_to_the_work_it_names(s, net, db, base_client):
    abc, other = waiting_on_fingerprint(s, "Movie ABC"), waiting_on_fingerprint(s, "Rang De")
    inbox(net, db, message("m1", "Processing finished", "See attachment.", files=["MovieABC_bgm.wav"]))
    assert call(base_client, fingerprint_mail.sync)["linked"] == 1
    assert s["wc"].get(f"/api/new-works/{abc['id']}").json()["work"]["fingerprint"]["mail"]["attachments"] == "MovieABC_bgm.wav"
    assert s["wc"].get(f"/api/new-works/{other['id']}").json()["work"]["fingerprint"]["mail"] is None


def test_emails_from_anyone_else_or_from_before_the_work_was_added_unlock_nothing(s, net, db, base_client):
    w = waiting_on_fingerprint(s)
    inbox(net, db,
          message("old", "Movie ABC report", at=NOW - timedelta(days=3)),
          message("fake", "Movie ABC report", sender=f"{settings.FINGERPRINT_SENDER_NAME} <someone@example.test>"))
    assert call(base_client, fingerprint_mail.sync) == {"connected": True, "found": 1, "linked": 0, "error": None}
    assert [m.gmail_message_id for m in db.query(FingerprintMail)] == ["old"]
    assert s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]["fingerprint"]["mail"] is None
    assert s["wc"].post(f"/api/new-works/{w['id']}/fingerprint/complete", json={}).status_code == 400


def test_an_email_that_names_no_work_can_be_linked_by_hand_and_unlinked(s, net, db, base_client):
    w = waiting_on_fingerprint(s)
    inbox(net, db, message("m1", "Your weekly digest", "Nothing specific."))
    assert call(base_client, fingerprint_mail.sync)["linked"] == 0
    waiting = s["wc"].get("/api/new-works/mail").json()["unlinked"]
    assert [m["subject"] for m in waiting] == ["Your weekly digest"]
    assert s["ec"].post(f"/api/new-works/{w['id']}/fingerprint/mail", json={"mail_id": waiting[0]["id"]}).status_code == 403
    w = do(s["wc"], w["id"], "fingerprint/mail", mail_id=waiting[0]["id"])
    assert w["fingerprint"]["mail"]["linked_by_name"] == "Asha Delegator" and w["fingerprint"]["mail"]["auto"] is False
    assert s["wc"].get("/api/new-works/mail").json()["unlinked"] == []
    assert do(s["wc"], w["id"], "fingerprint/mail", mail_id=None)["fingerprint"]["mail"] is None
    assert [a.details.split(" ")[0] for a in db.query(AuditLog).filter(AuditLog.action == "new_work_fp_mail_link").order_by(AuditLog.id)] == ["Linked", "Unlinked"]
    assert s["wc"].post(f"/api/new-works/{w['id']}/fingerprint/mail", json={"mail_id": 999}).status_code == 404


def test_an_email_that_arrived_early_is_matched_once_the_bgm_is_in(s, net, db, base_client):
    w = add(s)
    inbox(net, db, message("m1", "Movie ABC: fingerprint ready"))
    assert call(base_client, fingerprint_mail.sync) == {"connected": True, "found": 1, "linked": 0, "error": None}
    do(s["wc"], w["id"], "bgm", received=True)
    assert s["wc"].post("/api/new-works/mail/sync").json()["result"]["linked"] == 1
    assert s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]["fingerprint"]["mail"]["subject"] == "Movie ABC: fingerprint ready"


def test_a_revoked_mailbox_is_flagged_once_and_admins_are_told(s, net, db, base_client):
    inbox(net, db)
    net.on("POST", gmail.TOKEN_URL, httpx.Response(400, json={"error": "invalid_grant", "error_description": "Token has been expired or revoked."}))
    assert call(base_client, fingerprint_mail.sync)["connected"] is False
    assert call(base_client, fingerprint_mail.sync)["connected"] is False
    db.expire_all()
    assert db.query(SystemMailbox).one().status == "reconnect_needed"
    assert len(notes(db, s["admin"], "system_mailbox")) == 1 and notes(db, s["wd"], "system_mailbox") == []
    assert s["wc"].get("/api/new-works/mail").json()["connected"] is False


def connect(client, anon):
    url = client.post("/api/new-works/mail/connect").json()["url"]
    query = parse_qs(urlparse(url).query)
    assert query["scope"] == [gmail.READ_SCOPE] and query["login_hint"] == [BOX]
    return anon.get("/api/mail/oauth/callback", params={"state": query["state"][0], "code": "code"}).text


def test_an_admin_connects_the_mailbox_read_only(s, net, anon, db):
    assert s["wc"].post("/api/new-works/mail/connect").status_code == 403
    net.on("POST", gmail.TOKEN_URL, lambda r: google_token_reply(BOX, gmail.READ_SCOPE, "refresh-token"))
    net.on("GET", gmail.PROFILE_URL, httpx.Response(200, json={"emailAddress": BOX}))
    assert "cuesync-fingerprint-mailbox" in connect(s["ac"], anon)
    mb = db.query(SystemMailbox).one()
    assert (mb.email, mb.status, mb.connected_by) == (BOX, "connected", s["admin"].id) and "refresh-token" not in mb.refresh_token_enc
    status = s["wc"].get("/api/new-works/mail").json()
    assert status["connected"] and status["connected_by_name"] == "Ada Admin" and status["sender"] == settings.FINGERPRINT_SENDER


def test_another_mailbox_is_refused_and_nothing_is_saved(s, net, anon, db):
    net.on("POST", gmail.TOKEN_URL, lambda r: google_token_reply("someone@gmail.com", gmail.READ_SCOPE, "refresh-token"))
    net.on("GET", gmail.PROFILE_URL, httpx.Response(200, json={"emailAddress": "someone@gmail.com"}))
    page = connect(s["ac"], anon)
    assert "You signed in as someone@gmail.com" in page and db.query(SystemMailbox).count() == 0
    assert net.sent_to(gmail.REVOKE_URL) == []


def test_disconnecting_never_revokes_an_account_another_connection_uses(s, net, db):
    inbox(net, db)
    db.add(ClientMailbox(client_id=s["client"].id, email=BOX, refresh_token_enc=gmail.encrypt_token("c"), status="connected"))
    db.commit()
    net.on("POST", gmail.REVOKE_URL, httpx.Response(200, json={}))
    assert s["wc"].delete("/api/new-works/mail").status_code == 403
    # The client's connection on the same address goes first: the fingerprinting mailbox must survive it.
    rc = s["login"](s["make"].user("reviewer"))
    assert rc.delete(f"/api/clients/{s['client'].id}/mailbox").status_code == 200 and net.sent_to(gmail.REVOKE_URL) == []
    assert s["ac"].delete("/api/new-works/mail").json()["connected"] is False
    assert len(net.sent_to(gmail.REVOKE_URL)) == 1 and db.query(SystemMailbox).count() == 0


# ── cue sheet work ──────────────────────────────────────────────────────────
def test_allotting_creates_the_title_and_the_delegation_and_the_work_follows_it(s, db):
    w = to_cue_step(s, "Rang De", "tv_show")
    w = do(s["wc"], w["id"], "cue/allot", assigned_to=s["other"].id, client_id=s["client"].id, channel="Star", episode_range="1-10", week_target=5)
    cue = w["cue"]
    assert (cue["status"], cue["assigned_to_name"], cue["assigned_by_name"], cue["client"], cue["episode_range"]) == ("assigned", "Omar Editor", "Asha Delegator", "Sun Music", "1-10")
    assert w["stage"] == "cue_assigned" and w["reminder"] is None and cue["assigned_at"]
    dl, project = db.query(WorkDelegation).one(), db.query(Project).one()
    assert (dl.id, dl.serial_name, dl.work_type, dl.project_id, project.type.value) == (cue["delegation_id"], "Rang De", "TV Cue Sheet", project.id, "SERIAL")
    assert "New work assigned: Rang De" in [n.title for n in notes(db, s["other"])]
    assert s["wc"].post(f"/api/new-works/{w['id']}/cue/allot", json={"assigned_to": s["editor"].id}).status_code == 409  # already allotted
    # The editor moves the delegation along on their own page; the work shows it.
    assert s["oc"].put(f"/api/delegations/{dl.id}", json={"status": "in_progress"}).status_code == 200
    assert s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]["stage"] == "cue_in_progress"
    w = do(s["wc"], w["id"], "cue/status", status="completed")
    assert (w["stage"], w["cue"]["status"]) == ("completed", "completed") and w["cue"]["done_at"]
    db.expire_all()
    assert db.query(WorkDelegation).one().status == "completed"
    assert actions(db, w["id"])[-3:] == ["new_work_cue_assign", "new_work_cue_status", "new_work_cue_status"]


def test_deleting_the_allotment_puts_the_work_back_to_allocation_pending(s, db):
    w = do(s["wc"], to_cue_step(s)["id"], "cue/allot", assigned_to=s["editor"].id)
    assert s["wc"].delete(f"/api/delegations/{w['cue']['delegation_id']}").status_code == 200
    w = s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]
    assert (w["stage"], w["cue"]["assigned_to_name"], w["cue"]["delegation_id"]) == ("cue_pending", None, None)
    assert actions(db, w["id"])[-1] == "new_work_cue_removed"
    # A work that was already completed stays completed.
    done = do(s["wc"], to_cue_step(s, "Movie XYZ")["id"], "cue/allot", assigned_to=s["editor"].id)
    do(s["wc"], done["id"], "cue/status", status="completed")
    assert s["ac"].delete(f"/api/projects/{done['cue']['project_id']}").status_code == 200
    assert s["wc"].get(f"/api/new-works/{done['id']}").json()["work"]["stage"] == "completed"


def test_a_new_serial_or_movie_cannot_skip_the_new_work_list(s, make, db):
    res = s["wc"].post("/api/delegations/", json={"serial_name": "Brand New Show", "assigned_to": s["editor"].id})
    assert res.status_code == 409 and "Add it under New Work" in res.json()["detail"] and db.query(Project).count() == 0
    # More work on a title that exists, and work that is not a cue sheet, go straight through as before.
    make.project("Kothha", owner=s["wd"])
    assert s["wc"].post("/api/delegations/", json={"serial_name": "kothha", "assigned_to": s["editor"].id, "episode_range": "31-60"}).status_code == 200
    assert s["wc"].post("/api/delegations/", json={"serial_name": "Summer Album", "work_type": "Album", "assigned_to": s["editor"].id}).status_code == 200


# ── reminders ───────────────────────────────────────────────────────────────
def reminders(db, user):
    return [n.body for n in db.query(Notification).filter(Notification.user_id == user.id, Notification.entity_type == "new_work_reminder").order_by(Notification.id)]


def test_bgm_is_chased_every_five_days_and_only_once_each_time(s, db, base_client):
    w = add(s)
    assert call(base_client, new_works.send_reminders) == 0   # added today
    age(db, w["id"], created_at=5)
    assert call(base_client, new_works.send_reminders) == 1 and call(base_client, new_works.send_reminders) == 0
    assert reminders(db, s["wd"]) == ["Movie ABC was added 5 days ago, but the BGM has not yet been received. Please follow up."]
    assert reminders(db, s["admin"]) == reminders(db, s["wd"]) and reminders(db, s["editor"]) == []
    age(db, w["id"], created_at=9)
    assert call(base_client, new_works.send_reminders) == 0   # the next one is due on day 10
    age(db, w["id"], created_at=10)
    assert call(base_client, new_works.send_reminders) == 1
    assert reminders(db, s["wd"])[-1].startswith("Movie ABC was added 10 days ago, but the BGM")
    log = db.query(AuditLog).filter(AuditLog.action == "new_work_reminder").all()
    assert len(log) == 2 and all(a.user_id is None for a in log)
    db.expire_all()
    assert db.query(NewWork).one().updated_at > NOW - timedelta(minutes=1)   # sending a reminder is not an edit


def test_reminders_follow_the_step_and_stop_when_it_is_done(s, db, base_client):
    w = add(s)
    age(db, w["id"], created_at=12)
    call(base_client, new_works.send_reminders)
    do(s["wc"], w["id"], "bgm", received=True)
    assert all(n.is_read for n in notes(db, s["wd"], "new_work_reminder"))   # nothing left to act on
    assert call(base_client, new_works.send_reminders) == 0                  # fingerprinting only opened today
    do(s["wc"], w["id"], "fingerprint/assign", assigned_to=s["editor"].id)
    age(db, w["id"], bgm_at=10)
    assert call(base_client, new_works.send_reminders) == 1
    text = "BGM for Movie ABC was received 10 days ago, but fingerprinting is still pending. Assigned to Esha Editor."
    assert reminders(db, s["wd"])[-1] == text and reminders(db, s["editor"]) == [text]
    do(s["wc"], w["id"], "fingerprint/complete", source_note="Report downloaded from the Vericast portal")
    age(db, w["id"], fp_done_at=5)
    assert call(base_client, new_works.send_reminders) == 1
    assert reminders(db, s["wd"])[-1] == "Fingerprinting for Movie ABC was completed 5 days ago, but cue sheet work has not yet been allocated."
    do(s["wc"], w["id"], "cue/allot", assigned_to=s["editor"].id)
    age(db, w["id"], created_at=60, fp_done_at=40)
    assert call(base_client, new_works.send_reminders) == 0   # allotted: nothing more to chase
    assert s["wc"].get("/api/new-works/summary").json()["summary"]["reminders"] == 0


def test_long_pending_work_is_flagged_at_15_and_30_days(s, db, base_client):
    w = add(s)
    do(s["wc"], w["id"], "bgm", received=True)
    age(db, w["id"], created_at=16, bgm_at=2)   # the step itself is fresh; the work is not
    assert call(base_client, new_works.send_reminders) == 1 and call(base_client, new_works.send_reminders) == 0
    n = notes(db, s["wd"], "new_work_reminder")[-1]
    assert n.title == "Pending 15+ days: Movie ABC"
    assert n.body.startswith("Movie ABC was added 16 days ago, but cue sheet work has still not been assigned. BGM for Movie ABC was received 2 days ago")
    age(db, w["id"], created_at=30, bgm_at=3)
    assert call(base_client, new_works.send_reminders) == 1
    assert notes(db, s["wd"], "new_work_reminder")[-1].title == "Pending 30+ days: Movie ABC"
    summary = s["wc"].get("/api/new-works/summary").json()
    assert (summary["summary"]["pending_15"], summary["summary"]["pending_30"]) == (1, 1)
    # At the cue sheet step the 15/30-day message names it once.
    cue = to_cue_step(s, "Rang De")
    age(db, cue["id"], created_at=16, fp_done_at=4)
    call(base_client, new_works.send_reminders)
    assert notes(db, s["wd"], "new_work_reminder")[-1].body == (
        "Rang De was added 16 days ago, but cue sheet work has still not been assigned. Fingerprinting was completed 4 days ago.")
    assert summary["reminders"][0]["level"] == 30 and "added 30 days ago" in summary["reminders"][0]["message"]


# ── dashboard numbers, list and log ─────────────────────────────────────────
def test_the_dashboard_numbers_count_every_stage(s, db):
    add(s, "Awaiting One")
    add(s, "Awaiting Two", "tv_show")
    do(s["wc"], add(s, "Unassigned")["id"], "bgm", received=True)
    waiting_on_fingerprint(s, "Assigned")
    do(s["ec"], waiting_on_fingerprint(s, "Working")["id"], "fingerprint/status", status="in_progress")
    to_cue_step(s, "To Allot")
    do(s["wc"], to_cue_step(s, "Allotted")["id"], "cue/allot", assigned_to=s["editor"].id)
    started = do(s["wc"], to_cue_step(s, "Started")["id"], "cue/allot", assigned_to=s["editor"].id)
    do(s["wc"], started["id"], "cue/status", status="in_progress")
    done = do(s["wc"], to_cue_step(s, "Done")["id"], "cue/allot", assigned_to=s["editor"].id)
    do(s["wc"], done["id"], "cue/status", status="completed")
    old = add(s, "Old One")
    age(db, old["id"], created_at=31)
    data = s["ac"].get("/api/new-works/").json()
    got = data["summary"]
    want = dict(total=10, movies=9, tv_shows=1, awaiting_bgm=3, bgm_received=7, fp_not_assigned=1, fp_assigned=1, fp_in_progress=1,
                fp_completed=4, cue_pending=1, cue_assigned=1, cue_in_progress=1, completed=1, closed=0, pending=7, pending_15=1, pending_30=1, reminders=1)
    assert {k: got[k] for k in want} == want
    assert s["wc"].get("/api/new-works/summary").json()["summary"] == got
    row = next(w for w in data["works"] if w["title"] == "Old One")
    assert (row["days_in_stage"], row["days_open"], row["reminder"]["due"], row["reminder"]["level"]) == (31, 31, True, 30)
    assert next(w for w in data["works"] if w["title"] == "Done")["days_open"] is None


def test_everything_done_by_hand_or_by_cuesync_is_in_the_log_for_admin_and_delegator(s, db, base_client):
    w = to_cue_step(s)
    age(db, w["id"], fp_done_at=5)
    call(base_client, new_works.send_reminders)
    for client in (s["ac"], s["wc"]):
        log = client.get("/api/new-works/activity").json()
        assert [r["action"] for r in log] == ["new_work_reminder", "new_work_fp_done", "new_work_fp_assign", "new_work_bgm", "new_work_add"]
        assert (log[0]["automated"], log[0]["user_name"], log[0]["work_title"]) == (True, "CueSync (automatic)", "Movie ABC")
        assert (log[1]["automated"], log[1]["user_name"]) == (False, "Asha Delegator")
    detail = s["wc"].get(f"/api/new-works/{w['id']}").json()
    assert len(detail["history"]) == 5 and detail["work"]["title"] == "Movie ABC"
    for client in (s["ec"], s["login"](s["make"].user("reviewer")), s["login"](s["make"].user("viewer"))):
        assert client.get("/api/new-works/activity").status_code == 403 and client.get("/api/new-works/summary").status_code == 403


def test_details_are_edited_and_only_an_admin_removes_an_entry(s, db):
    w = add(s, "Movei ABC")
    res = s["wc"].put(f"/api/new-works/{w['id']}", json={"title": "Movie ABC", "remarks": "Spelling fixed"}).json()["work"]
    assert (res["title"], res["remarks"], res["work_type"]) == ("Movie ABC", "Spelling fixed", "movie")
    assert "renamed Movei ABC → Movie ABC" in db.query(AuditLog).filter(AuditLog.action == "new_work_edit").one().details
    assert s["wc"].delete(f"/api/new-works/{w['id']}").status_code == 403
    assert s["ac"].delete(f"/api/new-works/{w['id']}").status_code == 200
    assert s["ac"].get("/api/new-works/").json()["works"] == [] and s["ac"].get(f"/api/new-works/{w['id']}").status_code == 404
    assert actions(db, w["id"])[-1] == "new_work_remove"   # the log outlives the entry


def test_editor_activity_for_a_delegator_is_not_cluttered_by_new_work_steps(s):
    w = waiting_on_fingerprint(s)
    do(s["ec"], w["id"], "fingerprint/status", status="in_progress")
    assert s["wc"].get(f"/api/delegations/activity/editor/{s['editor'].id}").json()["by_serial"] == []


# ── weekly reports and Notify Editor ────────────────────────────────────────
async def _ctx(db):
    return await weekly_reports.Ctx().load(db, datetime.now(timezone.utc))


def test_weekly_reports_carry_the_new_work_numbers_and_follow_ups(s, db, base_client):
    old = add(s, "Old One")
    age(db, old["id"], created_at=20)
    waiting_on_fingerprint(s, "Movie ABC")
    ctx = call(base_client, _ctx)
    for report in (weekly_reports.wd_report(ctx, s["wd"]), weekly_reports.admin_report(ctx, s["admin"])):
        for text in ("NEW WORK TRACKING", "Total new works added: 2", "Awaiting BGM: 1", "Fingerprinting in progress: 0 (1 more assigned, not started)",
                     "Cue sheet allocation pending: 0", "Completed works: 0", "Pending over 15 days: 1", "Pending over 30 days: 0",
                     "NEW WORKS TO FOLLOW UP", "Movie / TV show: Old One | Type: Movie | Status: Awaiting BGM | At this step: 20 days | Since added: 20 days"):
            assert text in report.text, text
        assert "New work tracking" in report.html and "Old One" in report.html
    editor = weekly_reports.editor_report(ctx, s["editor"])
    assert "FINGERPRINTING ASSIGNED TO YOU" in editor.text and "Movie / TV show: Movie ABC" in editor.text
    assert "No work is allotted to you" not in editor.text
    assert "FINGERPRINTING ASSIGNED TO YOU" not in weekly_reports.editor_report(ctx, s["other"]).text
    assert "NEW WORK TRACKING" not in weekly_reports.reviewer_report(ctx, s["make"].user("reviewer")).text


def test_reports_say_nothing_about_new_work_when_there_is_none(s, base_client):
    ctx = call(base_client, _ctx)
    assert "NEW WORK" not in weekly_reports.wd_report(ctx, s["wd"]).text and "NEW WORK" not in weekly_reports.admin_report(ctx, s["admin"]).text


def test_notify_editor_draft_names_open_fingerprinting(s):
    waiting_on_fingerprint(s)
    draft = s["wc"].get(f"/api/editor-notices/preview/{s['editor'].id}").json()["message"]
    assert "Fingerprinting assigned to you is still open:" in draft and "- Movie ABC (Movie): assigned today, not started yet" in draft
    assert "Fingerprinting" not in s["wc"].get(f"/api/editor-notices/preview/{s['other'].id}").json()["message"]


# ── client, release date and video link (4.3.1) ─────────────────────────────
def today():
    return new_works.local_today(datetime.now(timezone.utc))


def releases(db, *users):
    return [[n.title for n in notes(db, u, "new_work_release")] for u in users]


def release_run(base_client, days_ahead=0):
    """Run the release updates as if it were `days_ahead` days from now."""
    return call(base_client, new_works.send_release_updates, NOW + timedelta(days=days_ahead))


def test_a_new_work_needs_an_active_client(s, db):
    post = lambda **kw: s["wc"].post("/api/new-works/", json={"title": "Movie ABC", "work_type": "movie", **kw})
    assert post().status_code == 400 and "client" in post().json()["detail"]
    assert post(client_id=999999).status_code == 400
    gone = s["make"].client("Old Label", is_active=False)
    assert post(client_id=gone.id).status_code == 400
    w = add(s)
    assert (w["client_id"], w["client_name"], w["release"], w["video_link"]) == (s["client"].id, "Sun Music", None, None)
    assert "client Sun Music" in db.query(AuditLog).filter(AuditLog.action == "new_work_add").one().details


def test_release_date_and_video_link_are_kept_and_shown(s, db):
    on = today() + timedelta(days=10)
    w = add(s, release_date=on.isoformat(), video_link="  youtu.be/abc123 ")
    assert (w["release_date"], w["video_link"]) == (on.isoformat(), "https://youtu.be/abc123")
    r = w["release"]
    assert (r["days"], r["upcoming"], r["label"], r["updates_sent"], r["next_update"]) == (-10, True, "Releases in 10 days", 0, on.isoformat())
    assert f"release {on:%d %b %Y}" in db.query(AuditLog).filter(AuditLog.action == "new_work_add").one().details
    for bad in ("javascript:alert(1)", "not a link", "https://localhost", "ftp://files.example.com/x"):
        res = s["wc"].post("/api/new-works/", json={"title": f"Other {bad}", "work_type": "movie", "client_id": s["client"].id, "video_link": bad})
        assert res.status_code == 400, bad
    assert add(s, "Plain", video_link="https://www.netflix.com/title/1")["video_link"] == "https://www.netflix.com/title/1"


def test_release_updates_come_on_the_day_and_seven_days_after(s, db, base_client):
    w = add(s, release_date=(today() + timedelta(days=3)).isoformat(), video_link="https://youtu.be/x1")
    assert release_run(base_client) == 0 and release_run(base_client, 2) == 0
    assert release_run(base_client, 3) == 1
    assert release_run(base_client, 3) == 0   # once, however often the loop runs
    admin, wd = releases(db, s["admin"], s["wd"])
    assert admin == wd == ["Released today: Movie ABC"]
    assert releases(db, s["editor"]) == [[]]
    body = notes(db, s["wd"], "new_work_release")[0].body
    assert "is released today" in body and "Sun Music" in body and "Current status: Awaiting BGM" in body and "https://youtu.be/x1" in body
    assert release_run(base_client, 9) == 0 and release_run(base_client, 10) == 1 and release_run(base_client, 20) == 0
    assert releases(db, s["wd"]) == [["Released today: Movie ABC", "Released 7 days ago: Movie ABC"]]
    assert actions(db, w["id"]).count("new_work_release") == 2
    got = s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]
    assert got["release"]["updates_sent"] == 2 and got["release"]["next_update"] is None
    # A reminder sweep marks reminders read when a step moves; release updates are not reminders and stay.
    do(s["wc"], w["id"], "bgm", received=True)
    assert all(not n.is_read for n in notes(db, s["wd"], "new_work_release"))


def test_only_dates_still_ahead_get_an_update(s, db, base_client):
    add(s, "Today", release_date=today().isoformat())                                   # not ahead: no release-day update
    add(s, "Last Week", release_date=(today() - timedelta(days=2)).isoformat())         # only the 7-days-after one is ahead
    add(s, "Long Ago", release_date=(today() - timedelta(days=30)).isoformat())         # nothing
    assert release_run(base_client) == 0
    assert release_run(base_client, 5) == 1 and release_run(base_client, 7) == 1 and release_run(base_client, 40) == 0
    assert sorted(releases(db, s["wd"])[0]) == ["Released 7 days ago: Last Week", "Released 7 days ago: Today"]


def test_a_new_release_date_brings_its_own_updates_and_finished_work_gets_none(s, db, base_client):
    w = add(s, release_date=(today() + timedelta(days=1)).isoformat())
    assert release_run(base_client, 1) == 1
    later = today() + timedelta(days=5)
    res = s["wc"].put(f"/api/new-works/{w['id']}", json={"release_date": later.isoformat()}).json()["work"]
    assert res["release"]["updates_sent"] == 0 and res["release"]["next_update"] == later.isoformat()
    assert "release date" in db.query(AuditLog).filter(AuditLog.action == "new_work_edit").one().details
    assert release_run(base_client, 5) == 1
    assert releases(db, s["wd"])[0] == ["Released today: Movie ABC", "Released today: Movie ABC"]
    cleared = s["wc"].put(f"/api/new-works/{w['id']}", json={"release_date": None}).json()["work"]
    assert (cleared["release_date"], cleared["release"]) == (None, None)
    # Closed without a cue sheet: its release day passes quietly, and never fires later.
    closed = add(s, "Closed One", release_date=(today() + timedelta(days=2)).isoformat())
    do(s["wc"], closed["id"], "skip", step="bgm", reason="Client will not send the BGM")
    do(s["wc"], closed["id"], "skip", step="fingerprint", reason="Not needed for this one")
    do(s["wc"], closed["id"], "skip", step="cue", reason="Order was cancelled")
    assert release_run(base_client, 2) == 0 and release_run(base_client, 9) == 0
    assert "new_work_release" not in actions(db, closed["id"])


def test_the_client_is_changed_not_cleared_and_carries_into_the_allotment(s, db):
    zee = s["make"].client("Zee Music")
    w = to_cue_step(s)
    assert s["wc"].put(f"/api/new-works/{w['id']}", json={"client_id": None}).status_code == 400
    res = s["wc"].put(f"/api/new-works/{w['id']}", json={"client_id": zee.id, "video_link": "https://youtu.be/v"}).json()["work"]
    assert (res["client_name"], res["video_link"]) == ("Zee Music", "https://youtu.be/v")
    details = db.query(AuditLog).filter(AuditLog.action == "new_work_edit").one().details
    assert "client Sun Music → Zee Music" in details and "video link added" in details
    w = do(s["wc"], w["id"], "cue/allot", assigned_to=s["editor"].id)   # no client sent: the work's own
    assert w["cue"]["client"] == "Zee Music"
    assert db.query(WorkDelegation).one().client_id == zee.id
    assert s["wc"].put(f"/api/new-works/{w['id']}", json={"client_id": s["client"].id}).status_code == 409
    assert s["wc"].put(f"/api/new-works/{w['id']}", json={"video_link": ""}).json()["work"]["video_link"] is None


def test_a_client_named_by_a_new_work_cannot_be_deleted(s):
    add(s)
    res = s["ac"].delete(f"/api/clients/{s['client'].id}")
    assert res.status_code == 409 and "1 new work" in res.json()["detail"]


def test_works_added_before_clients_were_required_still_load_and_edit(s, db):
    db.add(NewWork(title="Legacy", title_key="legacy", work_type="movie"))
    db.commit()
    row = next(w for w in s["wc"].get("/api/new-works/").json()["works"] if w["title"] == "Legacy")
    assert (row["client_id"], row["client_name"], row["release"]) == (None, None, None)
    res = s["wc"].put(f"/api/new-works/{row['id']}", json={"remarks": "Old entry"})
    assert res.status_code == 200 and res.json()["work"]["remarks"] == "Old entry"
    assert s["wc"].put(f"/api/new-works/{row['id']}", json={"client_id": s["client"].id}).json()["work"]["client_name"] == "Sun Music"


# ── movies in theatres wait for their video (4.3.2) ─────────────────────────
def theatrical(s, title="Movie ABC", **kw):
    return add(s, title, release_type="theatrical", **kw)


def video_run(base_client, days_ahead=0):
    return call(base_client, new_works.send_video_checks, NOW + timedelta(days=days_ahead))


def videos(db, user):
    return [n.title for n in notes(db, user, "new_work_video")]


def test_a_movie_in_theatres_waits_for_its_video_before_fingerprinting(s, db):
    w = theatrical(s, release_date=today().isoformat(), ott_platform=" Netflix ", ott_window_days=28)
    assert (w["release_type"], w["release_type_label"], w["video"]["state"], w["video"]["waiting"]) == ("theatrical", "Theatres first", "waiting", True)
    assert (w["ott"]["platform"], w["video"]["expected_ott"], w["video"]["estimated"]) == ("Netflix", (today() + timedelta(days=28)).isoformat(), True)
    assert "waiting for the video" in db.query(AuditLog).filter(AuditLog.action == "new_work_add").one().details
    w = do(s["wc"], w["id"], "bgm", received=True)
    assert (w["stage"], w["stage_label"], w["locked"]["fingerprint"]) == ("awaiting_video", "Waiting for video", True)
    wid = w["id"]
    for path, body in (("fingerprint/assign", {"assigned_to": s["editor"].id}), ("skip", {"step": "fingerprint", "reason": "Not needed here"})):
        res = s["wc"].post(f"/api/new-works/{wid}/{path}", json=body)
        assert res.status_code == 409 and "waiting for its video" in res.json()["detail"], path
    # Saying where it came from is required; an OTT source needs its link.
    assert s["wc"].post(f"/api/new-works/{wid}/video", json={"available": True}).status_code == 400
    assert s["wc"].post(f"/api/new-works/{wid}/video", json={"available": True, "source": "ott"}).status_code == 400
    assert s["wc"].post(f"/api/new-works/{wid}/video", json={"available": True, "source": "other", "note": "hm"}).status_code == 400
    assert s["ec"].post(f"/api/new-works/{wid}/video", json={"available": True, "source": "client"}).status_code == 403
    w = do(s["wc"], wid, "video", available=True, source="ott", link="netflix.com/title/81")
    assert (w["video"]["state"], w["video"]["source_label"], w["video"]["by_name"], w["video_link"]) == (
        "available", "Streaming on OTT", "Asha Delegator", "https://netflix.com/title/81")
    assert (w["stage"], w["locked"]["fingerprint"]) == ("fp_not_assigned", False)
    assert [t for t in (n.title for n in notes(db, s["admin"], "new_work"))] == ["Video available: Movie ABC"]
    assert do(s["wc"], wid, "fingerprint/assign", assigned_to=s["editor"].id)["stage"] == "fp_assigned"
    assert "new_work_video" in actions(db, wid)


def test_the_video_can_be_taken_back_only_before_fingerprinting_starts(s, db):
    w = theatrical(s)
    do(s["wc"], w["id"], "bgm", received=True)
    w = do(s["wc"], w["id"], "video", available=True, source="client", note="Producer shared a Drive link")
    assert (w["video"]["source"], w["video"]["note"]) == ("client", "Producer shared a Drive link")
    w = do(s["wc"], w["id"], "video", available=False)
    assert (w["stage"], w["video"]["state"], w["video"]["at"]) == ("awaiting_video", "waiting", None)
    do(s["wc"], w["id"], "video", available=True, source="tv")
    do(s["wc"], w["id"], "fingerprint/assign", assigned_to=s["editor"].id)
    assert s["wc"].post(f"/api/new-works/{w['id']}/video", json={"available": False}).status_code == 409
    assert actions(db, w["id"]).count("new_work_video_undo") == 1
    # Only a theatrical release waits: an OTT one never does.
    ott = add(s, "Direct To OTT", release_type="ott", ott_date=today().isoformat(), ott_platform="Netflix")
    assert (ott["video"], ott["ott"]["date"], ott["ott"]["platform"]) == (None, None, None)
    assert s["wc"].post(f"/api/new-works/{ott['id']}/video", json={"available": True, "source": "ott", "link": "https://x.com/a"}).status_code == 409


def test_release_type_rules(s):
    post = lambda **kw: s["wc"].post("/api/new-works/", json={"title": "Some Show", "client_id": s["client"].id, **kw})
    assert post(work_type="tv_show", release_type="theatrical").status_code == 400
    assert post(work_type="movie", release_type="cinema").status_code == 422
    assert post(work_type="movie", release_type="theatrical", ott_window_days=40).status_code == 400
    assert post(work_type="tv_show", release_type="tv").status_code == 200


def test_while_waiting_for_the_video_the_step_reminders_and_long_flags_hold_off(s, db, base_client):
    w = theatrical(s)
    do(s["wc"], w["id"], "bgm", received=True)
    age(db, w["id"], created_at=40, bgm_at=40)
    row = s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]
    assert (row["reminder"], row["days_in_stage"]) == (None, 40)
    assert call(base_client, new_works.send_reminders) == 0
    summary = s["wc"].get("/api/new-works/summary").json()["summary"]
    assert (summary["awaiting_video"], summary["pending_15"], summary["pending_30"]) == (1, 0, 0)
    # The clock starts when the video comes: fingerprinting is "pending" from then, not from 40 days ago.
    do(s["wc"], w["id"], "video", available=True, source="client")
    age(db, w["id"], video_at=6)
    row = s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]
    assert (row["days_in_stage"], row["days_open"], row["reminder"]["level"], row["reminder"]["due"]) == (6, 6, 0, True)
    assert "The video of Movie ABC became available 6 days ago" in row["reminder"]["message"]
    assert call(base_client, new_works.send_reminders) == 1
    # And a BGM still awaited is chased as usual, but without the 15/30-day flags while the video is awaited.
    other = theatrical(s, "Other Movie")
    age(db, other["id"], created_at=31)
    r = s["wc"].get(f"/api/new-works/{other['id']}").json()["work"]["reminder"]
    assert (r["kind"], r["level"], r["due"]) == ("bgm", 0, True)


def test_is_it_on_ott_yet_from_the_usual_gap_then_weekly(s, db, base_client):
    w = theatrical(s, release_date=today().isoformat(), ott_window_days=28)
    assert video_run(base_client, 27) == 0
    assert video_run(base_client, 28) == 1 and video_run(base_client, 28) == 0
    assert video_run(base_client, 34) == 0 and video_run(base_client, 35) == 1
    assert videos(db, s["wd"]) == ["Check OTT: Movie ABC", "Still waiting for the video: Movie ABC"]
    assert videos(db, s["editor"]) == []
    first = notes(db, s["admin"], "new_work_video")[0].body
    assert "about 4 weeks after release" in first and "Sun Music" in first
    assert actions(db, w["id"]).count("new_work_video_check") == 2
    row = s["wc"].get(f"/api/new-works/{w['id']}").json()["work"]
    assert (row["video"]["checks_sent"], row["video"]["next_check"]) == (2, (today() + timedelta(days=42)).isoformat())
    # The video arrives: the questions stop, and those in the bell are no longer something to act on.
    do(s["wc"], w["id"], "bgm", received=True)
    do(s["wc"], w["id"], "video", available=True, source="ott", link="https://www.primevideo.com/x")
    assert video_run(base_client, 60) == 0
    assert all(n.is_read for n in notes(db, s["wd"], "new_work_video"))


def test_an_announced_ott_date_and_no_date_at_all(s, db, base_client):
    theatrical(s, "Dated", release_date=today().isoformat(), ott_date=(today() + timedelta(days=10)).isoformat(), ott_platform="Netflix")
    theatrical(s, "Undated")
    assert video_run(base_client, 6) == 0
    assert video_run(base_client, 7) == 1      # no dates: a week after it was added
    assert video_run(base_client, 10) == 1     # on the OTT date
    assert sorted(videos(db, s["wd"])) == ["Ask about the video: Undated", "Due on OTT: Dated"]
    body = next(n.body for n in notes(db, s["wd"], "new_work_video") if n.title.endswith("Dated") and "Due" in n.title)
    assert "due on Netflix today" in body


def test_no_video_long_after_release_is_flagged_once(s, db, base_client):
    theatrical(s, release_date=today().isoformat(), ott_window_days=56)
    assert video_run(base_client, 56) == 1
    assert video_run(base_client, 90) == 1 and video_run(base_client, 90) == 0
    assert f"No video {settings.NEW_WORK_VIDEO_OVERDUE_DAYS}+ days after release: Movie ABC" in videos(db, s["wd"])
    # The flag stands in for the weekly questions missed until then; the next one (day 56 + 5 weeks) still comes.
    assert video_run(base_client, 91) == 1 and video_run(base_client, 97) == 0 and video_run(base_client, 98) == 1
    assert videos(db, s["wd"]).count(f"No video {settings.NEW_WORK_VIDEO_OVERDUE_DAYS}+ days after release: Movie ABC") == 1
    row = s["wc"].get("/api/new-works/").json()
    assert row["summary"]["video_overdue"] == 0   # "overdue" is judged on today, which is still day 0 here


def test_dates_already_past_when_entered_bring_only_what_is_still_ahead(s, db, base_client):
    old = theatrical(s, release_date=(today() - timedelta(days=100)).isoformat(), ott_window_days=28)
    assert (old["video"]["overdue"], old["video"]["checks_sent"]) == (True, 11)   # 100 days after day 28: checks 1..11 passed
    assert old["video"]["next_check"] == (today() + timedelta(days=5)).isoformat()   # day 28 + 7 × 11 = day 105
    assert video_run(base_client) == 0 and video_run(base_client, 4) == 0
    assert video_run(base_client, 5) == 1      # the next weekly question, not eleven late ones or a late flag
    assert videos(db, s["wd"]) == ["Still waiting for the video: Movie ABC"]
    assert s["wc"].get("/api/new-works/summary").json()["summary"]["video_overdue"] == 1


def test_editing_the_release_starts_or_ends_the_wait_and_rearms_the_checks(s, db, base_client):
    w = add(s, release_type="ott")
    assert w["video"] is None
    w = s["wc"].put(f"/api/new-works/{w['id']}", json={"release_type": "theatrical", "release_date": today().isoformat(), "ott_window_days": 28}).json()["work"]
    assert (w["video"]["waiting"], w["stage"]) == (True, "awaiting_bgm")
    assert "waiting for the video" in db.query(AuditLog).filter(AuditLog.action == "new_work_edit").one().details
    assert video_run(base_client, 28) == 1
    w = s["wc"].put(f"/api/new-works/{w['id']}", json={"ott_date": (today() + timedelta(days=40)).isoformat(), "ott_platform": "Hotstar"}).json()["work"]
    assert (w["video"]["checks_sent"], w["video"]["expected_ott"], w["video"]["estimated"]) == (0, (today() + timedelta(days=40)).isoformat(), False)
    assert video_run(base_client, 39) == 0 and video_run(base_client, 40) == 1
    w = s["wc"].put(f"/api/new-works/{w['id']}", json={"release_type": "ott"}).json()["work"]
    assert (w["video"], w["ott"]["date"], w["ott"]["platform"]) == (None, None, None)
    assert video_run(base_client, 60) == 0
    # A TV show can't be made theatrical, and a theatrical movie can't become a TV show without changing that.
    assert s["wc"].put(f"/api/new-works/{w['id']}", json={"work_type": "tv_show", "release_type": "theatrical"}).status_code == 400
    t = theatrical(s, "In Cinemas")
    assert s["wc"].put(f"/api/new-works/{t['id']}", json={"work_type": "tv_show"}).status_code == 400
    assert s["wc"].put(f"/api/new-works/{t['id']}", json={"work_type": "tv_show", "release_type": "tv"}).json()["work"]["video"] is None


def test_making_a_work_theatrical_after_fingerprinting_started_does_not_lock_it_again(s):
    w = add(s, release_type="ott")
    do(s["wc"], w["id"], "bgm", received=True)
    do(s["wc"], w["id"], "fingerprint/assign", assigned_to=s["editor"].id)
    w = s["wc"].put(f"/api/new-works/{w['id']}", json={"release_type": "theatrical"}).json()["work"]
    assert (w["release_type"], w["video"], w["stage"]) == ("theatrical", None, "fp_assigned")


def test_a_bmat_email_is_not_matched_to_a_movie_still_waiting_for_its_video(s, db, base_client):
    w = theatrical(s)
    do(s["wc"], w["id"], "bgm", received=True)
    db.add(FingerprintMail(gmail_message_id="m-video-1", mailbox_email=BOX, from_addr=SENDER, subject="Movie ABC report",
                           match_text="movie abc report", received_at=datetime.now(timezone.utc) + timedelta(minutes=1)))
    db.commit()
    assert call(base_client, fingerprint_mail.match_waiting) == 0
    do(s["wc"], w["id"], "video", available=True, source="client")
    assert call(base_client, fingerprint_mail.match_waiting) == 1


def test_the_release_day_update_says_it_waits_for_the_video(s, db, base_client):
    theatrical(s, release_date=(today() + timedelta(days=1)).isoformat(), ott_window_days=28)
    assert release_run(base_client, 1) == 1
    body = notes(db, s["wd"], "new_work_release")[0].body
    assert "It is in theatres: fingerprinting waits for the video, usually on OTT around" in body


def test_weekly_reports_list_the_movies_waiting_for_their_video(s, db, base_client):
    theatrical(s, release_date=(today() - timedelta(days=10)).isoformat(), ott_window_days=28)
    ctx = call(base_client, _ctx)
    for report in (weekly_reports.wd_report(ctx, s["wd"]), weekly_reports.admin_report(ctx, s["admin"])):
        assert "Waiting for video (in theatres): 1" in report.text
        assert "MOVIES WAITING FOR THEIR VIDEO" in report.text and "(usual gap)" in report.text and "Sun Music" in report.text


def test_a_rename_or_retype_cannot_make_a_second_open_entry_for_a_title(s):
    add(s, "Movie ABC")
    other = add(s, "Movie XYZ")
    res = s["wc"].put(f"/api/new-works/{other['id']}", json={"title": "movie-abc"})
    assert res.status_code == 409 and "already in the New Work List" in res.json()["detail"]
    show = add(s, "Movie ABC", "tv_show", release_type="tv")
    assert s["wc"].put(f"/api/new-works/{show['id']}", json={"work_type": "movie"}).status_code == 409
    assert s["wc"].put(f"/api/new-works/{other['id']}", json={"title": "Movie XYZ (2026)"}).status_code == 200


def test_dates_outside_a_real_range_are_refused_not_left_to_break_the_list(s):
    for kind in ("theatrical", "ott"):
        for bad in ("9999-12-31", "0001-01-01"):
            res = s["wc"].post("/api/new-works/", json={"title": f"Typo {kind} {bad}", "client_id": s["client"].id,
                                                         "release_type": kind, "release_date": bad})
            assert res.status_code == 400 and "between 1950 and 2100" in res.json()["detail"], (kind, bad)
    w = theatrical(s)
    assert s["wc"].put(f"/api/new-works/{w['id']}", json={"ott_date": "9999-12-31"}).status_code == 400
    assert s["wc"].put(f"/api/new-works/{w['id']}", json={"release_date": "2101-01-01"}).status_code == 400
    assert s["wc"].get("/api/new-works/").status_code == 200

