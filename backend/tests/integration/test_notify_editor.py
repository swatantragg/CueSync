from email import message_from_bytes
from email.policy import default
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.models import AuditLog
from app.models.editor_notice import EditorNotice
from app.models.notification import Notification
from app.models.user_mailbox import UserMailbox
from app.services import gmail
from conftest import google_token_reply

SEND_SCOPES = "openid email profile https://www.googleapis.com/auth/gmail.send"


def fake_google(net, email, scope=SEND_SCOPES, refresh="refresh-token"):
    net.on("POST", gmail.TOKEN_URL, lambda r: google_token_reply(email, scope, refresh))
    net.on("GET", gmail.USERINFO_URL, httpx.Response(200, json={"email": email, "email_verified": True}))
    net.on("POST", gmail.SEND_URL, httpx.Response(200, json={"id": "m1", "threadId": "t1"}))


def connect(client, anon):
    url = client.post("/api/editor-notices/mailbox/connect").json()["url"]
    state = parse_qs(urlparse(url).query)["state"][0]
    return anon.get("/api/mail/oauth/callback", params={"state": state, "code": "code"}).text


@pytest.fixture
def setup(make, login):
    wd = make.user("work_delegator", email="wd@gmail.com", name="Asha Delegator")
    editor = make.user("editor", email="esha@example.test", name="Esha Editor")
    client = make.client()
    project = make.project(owner=wd)
    make.delegation(project, editor, wd, client=client, episode_range="1-5", week_target=5, status="in_progress")
    make.episode(project, 1, "rejected", rejection_note="Wrong ISRC")
    return dict(wd=wd, editor=editor, wc=login(wd), ec=login(editor))


def test_connect_stores_encrypted_send_only_token(setup, net, anon, db):
    fake_google(net, "wd@gmail.com")
    assert "cuesync-user-mailbox" in connect(setup["wc"], anon)
    mb = db.query(UserMailbox).one()
    assert mb.email == "wd@gmail.com" and "refresh-token" not in mb.refresh_token_enc
    assert gmail.decrypt_token(mb.refresh_token_enc) == "refresh-token"
    assert setup["wc"].get("/api/editor-notices/mailbox").json()["connected"] is True


def test_other_gmail_account_is_refused(setup, net, anon, db):
    fake_google(net, "someone.else@gmail.com")
    assert "Nothing was saved" in connect(setup["wc"], anon)
    assert db.query(UserMailbox).count() == 0


def test_missing_send_permission_is_refused(setup, net, anon, db):
    fake_google(net, "wd@gmail.com", scope="openid email profile")
    assert "Send email on your behalf" in connect(setup["wc"], anon)
    assert db.query(UserMailbox).count() == 0


def test_connect_state_of_an_editor_is_refused(make, login, net, anon, db):
    """A signed state can't let an editor connect a mailbox, even if one were made for them."""
    from datetime import timedelta
    editor = make.user("editor", email="e@gmail.com")
    fake_google(net, "e@gmail.com")
    state = gmail.sign_state(gmail.USER_MAIL_STATE, timedelta(minutes=5), sub=str(editor.id))
    assert "Only a Work Delegator or Admin" in anon.get("/api/mail/oauth/callback", params={"state": state, "code": "c"}).text
    assert db.query(UserMailbox).count() == 0


def test_preview_lists_reasons_and_pending_work(setup):
    d = setup["wc"].get(f"/api/editor-notices/preview/{setup['editor'].id}").json()
    assert d["editor"]["email"] == "esha@example.test" and d["mailbox"]["connected"] is False
    assert d["work"][0]["title"] == "Kothha" and d["work"][0]["rejected_eps"] == "Ep 1" and d["work"][0]["to_do_eps"] == "Ep 2–5"
    assert "Hi Esha" in d["message"] and "Asha Delegator" in d["message"]
    assert d["subject"].startswith("Pending work on CueSync: 5 episodes")


def test_send_requires_a_connected_gmail(setup):
    res = setup["wc"].post("/api/editor-notices/send", json={"editor_id": setup["editor"].id, "subject": "s", "message": "m"})
    assert res.status_code == 409


def test_send_goes_through_gmail_and_reaches_the_dashboard(setup, net, anon, db):
    fake_google(net, "wd@gmail.com")
    connect(setup["wc"], anon)
    res = setup["wc"].post("/api/editor-notices/send", json={"editor_id": setup["editor"].id, "subject": "Line\r\nBcc: evil@x.test", "message": "Please finish."})
    assert res.status_code == 200, res.text
    raw = net.sent_to(gmail.SEND_URL)[-1]
    assert raw.headers["authorization"] == "Bearer access:wd@gmail.com"
    msg = message_from_bytes(raw.content, policy=default)
    assert "wd@gmail.com" in msg["From"] and "esha@example.test" in msg["To"] and msg["Bcc"] is None
    assert "Kothha" in msg.get_body(preferencelist=("plain",)).get_content()
    n = db.query(EditorNotice).one()
    assert n.gmail_message_id == "m1" and n.sent_by_name == "Asha Delegator"
    assert db.query(Notification).filter_by(user_id=setup["editor"].id, entity_type="editor_notice").count() == 1
    assert db.query(AuditLog).filter_by(action="editor_notice").count() == 1
    dash = setup["ec"].get("/api/insights/editor-dashboard").json()
    assert dash["notices"][0]["message"] == "Please finish." and dash["notices"][0]["work"][0]["title"] == "Kothha"


def test_gmail_failure_records_nothing(setup, net, anon, db):
    fake_google(net, "wd@gmail.com")
    connect(setup["wc"], anon)
    net.on("POST", gmail.SEND_URL, httpx.Response(500, json={"error": {"message": "boom"}}))
    res = setup["wc"].post("/api/editor-notices/send", json={"editor_id": setup["editor"].id, "subject": "s", "message": "m"})
    assert res.status_code == 502
    assert db.query(EditorNotice).count() == 0 and db.query(Notification).filter_by(entity_type="editor_notice").count() == 0


def test_revoked_gmail_asks_to_reconnect(setup, net, anon, db):
    fake_google(net, "wd@gmail.com")
    connect(setup["wc"], anon)
    net.on("POST", gmail.TOKEN_URL, httpx.Response(400, json={"error": "invalid_grant", "error_description": "revoked"}))
    res = setup["wc"].post("/api/editor-notices/send", json={"editor_id": setup["editor"].id, "subject": "s", "message": "m"})
    assert res.status_code == 409 and "Connect it again" in res.json()["detail"]
    assert db.query(UserMailbox).one().status == "reconnect_needed"


def test_cannot_notify_a_non_editor_or_inactive_editor(setup, make):
    rev = make.user("reviewer")
    off = make.user("editor", is_active=False)
    assert setup["wc"].get(f"/api/editor-notices/preview/{rev.id}").status_code == 404
    assert setup["wc"].get(f"/api/editor-notices/preview/{off.id}").status_code == 400


def test_only_the_editor_can_mark_their_email_read(setup, net, anon, make, login):
    fake_google(net, "wd@gmail.com")
    connect(setup["wc"], anon)
    nid = setup["wc"].post("/api/editor-notices/send", json={"editor_id": setup["editor"].id, "subject": "s", "message": "m"}).json()["id"]
    assert login(make.user("editor")).post(f"/api/editor-notices/{nid}/read").status_code == 404
    assert setup["ec"].post(f"/api/editor-notices/{nid}/read").json()["read_at"]


def test_disconnect_keeps_client_connection_on_same_account(setup, net, anon, db, make):
    from app.models.client import ClientMailbox
    fake_google(net, "wd@gmail.com")
    net.on("POST", gmail.REVOKE_URL, httpx.Response(200, json={}))
    connect(setup["wc"], anon)
    client = make.client("Other Client")
    db.add(ClientMailbox(client_id=client.id, email="wd@gmail.com", refresh_token_enc=gmail.encrypt_token("x")))
    db.commit()
    assert setup["wc"].delete("/api/editor-notices/mailbox").status_code == 200
    assert net.sent_to(gmail.REVOKE_URL) == []
    assert db.query(UserMailbox).count() == 0
