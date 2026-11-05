"""Send to Society: from the client's Gmail, recorded only when Gmail accepts it, then replies and bounces."""
from datetime import datetime, timedelta, timezone
from email import message_from_bytes
from email.policy import default

import httpx
import pytest

from app.models.client import ClientMailbox
from app.models.society_submission import SocietySubmission
from app.services import gmail, mail_sync
from app.core.database import engine
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.fixture
def setup(make, login, db, net):
    admin = make.user("admin")
    rev = make.user("reviewer")
    client = make.client("Sun Music", email="sun@gmail.com")
    db.add(ClientMailbox(client_id=client.id, email="sun@gmail.com", refresh_token_enc=gmail.encrypt_token("r"), status="connected"))
    db.commit()
    society = make.society("IPRS", to="cue@iprs.org", subject_template="{serial} {episodes}", body_template="From {client}")
    project = make.project("Kothha", owner=admin)
    for n in (1, 2):
        make.cue(make.episode(project, n, "approved"), title=f"Song {n}")
    net.on("POST", gmail.TOKEN_URL, httpx.Response(200, json={"access_token": "client-token"}))
    net.on("POST", gmail.SEND_URL, lambda r: httpx.Response(200, json={"id": "m1", "threadId": "t1"}))
    return dict(rev=rev, rc=login(rev), client=client, society=society, project=project, make=make)


def payload(s, **kw):
    return {"project_id": s["project"].id, "episode_from": 1, "episode_to": 2, "client_id": s["client"].id, "society_id": s["society"].id,
            "to": ["cue@iprs.org"], "subject": "Cue sheets", "body": "Attached", "attachments": ["iprs"], **kw}


def test_preview_is_ready_and_filled_from_the_template(setup):
    res = setup["rc"].post("/api/society-submissions/mail/preview", json=payload(setup)).json()
    assert res["ready"] is True and res["problems"] == []
    assert "Kothha" in res["subject"] and res["from"]["email"] == "sun@gmail.com"


def test_send_records_the_email_only_after_gmail_accepts(setup, net, db):
    res = setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup))
    assert res.status_code == 200, res.text
    raw = net.sent_to(gmail.SEND_URL)[-1]
    assert raw.headers["authorization"] == "Bearer client-token"
    msg = message_from_bytes(raw.content, policy=default)
    assert "sun@gmail.com" in msg["From"] and msg["To"] == "cue@iprs.org"
    assert [a.get_filename() for a in msg.iter_attachments()] == ["Kothha_IPRS_EP1-2.xlsx"]
    row = db.query(SocietySubmission).one()
    assert (row.sent_via, row.mail_status, row.gmail_thread_id, row.submitted_by) == ("gmail", "sent", "t1", setup["rev"].id)


def test_gmail_failure_records_nothing(setup, net, db):
    net.on("POST", gmail.SEND_URL, httpx.Response(500, json={"error": {"message": "boom"}}))
    res = setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup))
    assert res.status_code >= 400
    assert db.query(SocietySubmission).count() == 0


def test_unapproved_episode_blocks_the_send(setup, net, db):
    setup["make"].episode(setup["project"], 3, "submitted")
    res = setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup, episode_to=3))
    assert res.status_code == 400 and "Not approved yet: Ep 3" in res.json()["detail"]
    assert net.sent_to(gmail.SEND_URL) == []


def test_missing_episode_blocks_the_send(setup):
    res = setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup, episode_to=9))
    assert res.status_code == 400 and "No cue sheet yet" in res.json()["detail"]


def test_disconnected_mailbox_blocks_the_send(setup, db):
    db.query(ClientMailbox).update({"status": "reconnect_needed"})
    db.commit()
    assert "reconnecting" in setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup)).json()["detail"]


def test_same_range_again_needs_an_explicit_resend(setup, net):
    assert setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup)).status_code == 200
    again = setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup))
    assert again.status_code in (400, 409)
    assert len(net.sent_to(gmail.SEND_URL)) == 1
    assert setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup, resend=True)).status_code == 200


@pytest.mark.parametrize("field,value", [("to", ["not-an-email"]), ("to", ["a@iprs.org\r\nBcc: x@evil.test"]), ("cc", ["bad"]), ("attachments", ["../../etc/passwd"])])
def test_bad_recipients_and_attachments_are_refused(setup, net, field, value):
    res = setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup, **{field: value}))
    assert res.status_code in (400, 422)
    assert net.sent_to(gmail.SEND_URL) == []


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="BUG: a line break in the subject can't add recipients (Python refuses it), but it answers 500 instead of 400")
def test_line_break_in_subject_is_a_clean_error(setup, net):
    res = setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup, subject="Hi\r\nBcc: x@evil.test"))
    assert res.status_code in (200, 400, 422)


def thread(*messages):
    return httpx.Response(200, json={"messages": list(messages)})


def gmail_msg(mid, sender, when, subject="Re: Cue sheets", **extra):
    headers = [{"name": "From", "value": sender}, {"name": "Subject", "value": subject}, *extra.pop("headers", [])]
    return {"id": mid, "internalDate": str(int(when.timestamp() * 1000)), "snippet": "Received, thanks", "payload": {"headers": headers, **extra}}


def _sync(base_client):
    async def go():
        async with AsyncSession(engine, expire_on_commit=False) as s:
            result = await mail_sync.sync_all(s)
            await s.commit()
            return result
    return base_client.portal.call(go)


@pytest.fixture
def sent(setup, net, base_client, db):
    assert setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup)).status_code == 200
    net.on("GET", f"{gmail.API_URL}/messages", httpx.Response(200, json={"messages": []}))
    return db.query(SocietySubmission).one()


def test_society_reply_is_picked_up(sent, net, base_client, db):
    net.on("GET", f"{gmail.API_URL}/threads/t1", thread(gmail_msg("m2", "IPRS Desk <desk@iprs.org>", datetime.now(timezone.utc) + timedelta(minutes=5))))
    _sync(base_client)
    db.expire_all()
    row = db.query(SocietySubmission).one()
    assert row.mail_status == "replied" and row.reply_snippet == "Received, thanks"


def test_colleague_on_another_domain_is_not_a_society_reply(sent, net, base_client, db):
    net.on("GET", f"{gmail.API_URL}/threads/t1", thread(gmail_msg("m2", "friend@other.org", datetime.now(timezone.utc) + timedelta(minutes=5))))
    _sync(base_client)
    db.expire_all()
    assert db.query(SocietySubmission).one().mail_status == "sent"


def test_bounce_marks_the_email_failed(sent, net, base_client, db):
    net.on("GET", f"{gmail.API_URL}/threads/t1", thread(gmail_msg("m2", "mailer-daemon@googlemail.com", datetime.now(timezone.utc) + timedelta(minutes=5), subject="Delivery Status Notification (Failure)")))
    _sync(base_client)
    db.expire_all()
    assert db.query(SocietySubmission).one().mail_status == "bounced"


def test_resend_after_a_bounce_is_allowed_and_closes_the_old_one(sent, setup, net, base_client, db):
    net.on("GET", f"{gmail.API_URL}/threads/t1", thread(gmail_msg("m2", "mailer-daemon@googlemail.com", datetime.now(timezone.utc) + timedelta(minutes=5))))
    _sync(base_client)
    res = setup["rc"].post("/api/society-submissions/mail/send", json=payload(setup))
    assert res.status_code == 200, res.text
    db.expire_all()
    assert sorted(r.mail_status for r in db.query(SocietySubmission).all()) == ["resent", "sent"]


def test_revoked_mailbox_is_flagged_during_sync(sent, net, base_client, db):
    net.on("POST", gmail.TOKEN_URL, httpx.Response(400, json={"error": "invalid_grant"}))
    _sync(base_client)
    db.expire_all()
    assert db.query(ClientMailbox).one().status == "reconnect_needed"


def test_temporary_google_outage_does_not_flag_the_mailbox(sent, net, base_client, db):
    net.on("POST", gmail.TOKEN_URL, httpx.Response(503, json={"error": "backendError"}))
    _sync(base_client)
    db.expire_all()
    assert db.query(ClientMailbox).one().status == "connected"
