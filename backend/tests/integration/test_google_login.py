from urllib.parse import parse_qs, unquote, urlparse

import httpx
import pytest

from app.core.config import settings
from app.models import AuditLog
from app.services import gmail
from conftest import google_token_reply, new_client


def fake_google(net, email, verified=True):
    net.on("POST", gmail.TOKEN_URL, lambda r: google_token_reply(email))
    net.on("GET", gmail.USERINFO_URL, httpx.Response(200, json={"email": email, "email_verified": verified}))


def start(c, origin="https://app.example.test"):
    res = c.get("/api/auth/google/start", params={"origin": origin}, follow_redirects=False)
    assert res.status_code == 302
    return parse_qs(urlparse(res.headers["location"]).query)["state"][0]


def callback(c, state, code="code"):
    res = c.get("/api/mail/oauth/callback", params={"state": state, "code": code}, follow_redirects=False)
    assert res.status_code == 302
    url = res.headers["location"]
    return url, parse_qs(urlparse(url).fragment)


def test_full_login_with_google(anon, make, net, db):
    u = make.user("work_delegator", email="wd@example.test")
    fake_google(net, "wd@example.test")
    url, frag = callback(anon, start(anon))
    assert url.startswith("https://app.example.test/#google_ticket=")
    res = anon.post("/api/auth/google/exchange", json={"ticket": frag["google_ticket"][0]})
    assert res.status_code == 200 and res.json()["user"]["id"] == u.id
    assert anon.get("/api/auth/me").json()["email"] == u.email
    assert db.query(AuditLog).filter_by(action="login").one().details.startswith("Signed in with Google")


def test_ticket_only_works_once(anon, make, net):
    make.user("editor", email="e@example.test")
    fake_google(net, "e@example.test")
    _, frag = callback(anon, start(anon))
    t = frag["google_ticket"][0]
    assert anon.post("/api/auth/google/exchange", json={"ticket": t}).status_code == 200
    assert anon.post("/api/auth/google/exchange", json={"ticket": t}).status_code == 401


def test_callback_from_another_browser_is_refused(anon, base_client, make, net):
    """Login CSRF: a state started by an attacker's browser can't sign the victim in."""
    make.user("editor", email="e@example.test")
    fake_google(net, "e@example.test")
    state = start(anon)
    _, frag = callback(new_client(base_client), state)
    assert "google_error" in frag and "google_ticket" not in frag


def test_unknown_email_never_creates_an_account(anon, make, net, db):
    from app.models import User
    make.user("admin")
    fake_google(net, "stranger@example.test")
    _, frag = callback(anon, start(anon))
    assert "no CueSync account" in unquote(frag["google_error"][0])
    assert db.query(User).filter_by(email="stranger@example.test").count() == 0


def test_inactive_account_refused(anon, make, net):
    make.user("editor", email="off@example.test", is_active=False)
    fake_google(net, "off@example.test")
    _, frag = callback(anon, start(anon))
    assert "deactivated" in frag["google_error"][0]


def test_unverified_google_email_refused(anon, make, net):
    make.user("admin", email="boss@example.test")
    fake_google(net, "boss@example.test", verified=False)
    _, frag = callback(anon, start(anon))
    assert "did not confirm" in frag["google_error"][0]


def test_gmail_dots_match_but_other_domains_do_not(anon, make, net):
    make.user("editor", email="j.doe@gmail.com")
    fake_google(net, "jdoe@gmail.com")
    _, frag = callback(anon, start(anon))
    assert "google_ticket" in frag


def test_same_local_part_on_another_domain_is_not_the_same_person(anon, make, net):
    make.user("admin", email="boss@company.test")
    fake_google(net, "boss@gmail.com")
    _, frag = callback(anon, start(anon))
    assert "google_error" in frag


def test_ambiguous_gmail_match_is_refused(anon, make, net):
    make.user("editor", email="j.doe@gmail.com")
    make.user("admin", email="jd.oe@gmail.com")
    fake_google(net, "jdoe@gmail.com")
    _, frag = callback(anon, start(anon))
    assert "google_error" in frag


def test_unlisted_origin_falls_back_to_frontend_url(anon, make, net):
    make.user("editor", email="e@example.test")
    fake_google(net, "e@example.test")
    url, _ = callback(anon, start(anon, origin="https://evil.example"))
    assert url.startswith(settings.FRONTEND_URL)


def test_cancelled_on_google_page(anon):
    state = start(anon)
    res = anon.get("/api/mail/oauth/callback", params={"state": state, "error": "access_denied"}, follow_redirects=False)
    assert "cancelled" in unquote(res.headers["location"])


def test_forged_state_shows_an_error_page(anon):
    res = anon.get("/api/mail/oauth/callback", params={"state": "forged", "code": "x"}, follow_redirects=False)
    assert res.status_code == 200 and "expired or is not valid" in res.text


def test_google_outage_is_a_readable_error(anon, make):
    # No fake routes: the blocked network behaves like Google being down.
    make.user("editor", email="e@example.test")
    _, frag = callback(anon, start(anon))
    assert "could not be reached" in unquote(frag["google_error"][0])


def test_not_configured_hides_the_button(anon, monkeypatch):
    monkeypatch.setattr(settings, "GOOGLE_CLIENT_ID", None)
    assert anon.get("/api/auth/google/config").json() == {"enabled": False}
    res = anon.get("/api/auth/google/start", follow_redirects=False)
    assert "google_error" in res.headers["location"]
