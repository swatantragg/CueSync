from datetime import timedelta

import httpx
import pytest
from jose import jwt

from app.core.config import settings
from app.core.security import create_access_token, create_refresh_token
from app.services import gmail
from app.services.login_tracker import _MAX_ATTEMPTS
from conftest import PASSWORD


def _login(c, email, pw=PASSWORD):
    return c.post("/api/auth/login", data={"username": email, "password": pw})


def test_login_then_me_with_cookie(anon, make):
    u = make.user("editor")
    res = _login(anon, u.email)
    assert res.status_code == 200 and res.json()["user"]["email"] == u.email
    assert anon.get("/api/auth/me").json()["id"] == u.id


def test_login_email_is_case_insensitive(anon, make):
    u = make.user("editor", email="case@example.test")
    assert _login(anon, "CASE@Example.Test").status_code == 200


def test_cookies_are_httponly_and_lax(anon, make):
    res = _login(anon, make.user("editor").email)
    cookies = res.headers.get_list("set-cookie")
    assert len(cookies) == 2
    for c in cookies:
        assert "httponly" in c.lower() and "samesite=lax" in c.lower()


def test_cookies_are_secure_in_production(anon, make, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    for c in _login(anon, make.user("editor").email).headers.get_list("set-cookie"):
        assert "secure" in c.lower()


@pytest.mark.parametrize("email,pw", [("nobody@example.test", PASSWORD), ("known@example.test", "Wrong@123")])
def test_wrong_credentials_give_the_same_answer(anon, make, email, pw):
    make.user("editor", email="known@example.test")
    res = _login(anon, email, pw)
    assert res.status_code == 401 and res.json()["detail"] == "Invalid credentials"


def test_inactive_user_cannot_login(anon, make):
    assert _login(anon, make.user("editor", is_active=False).email).status_code == 401


def test_account_locks_after_too_many_failures(anon, make):
    u = make.user("editor")
    for _ in range(_MAX_ATTEMPTS):
        assert _login(anon, u.email, "Wrong@123").status_code == 401
    assert _login(anon, u.email).status_code == 429


def test_success_clears_failed_attempts(anon, make):
    u = make.user("editor")
    for _ in range(_MAX_ATTEMPTS - 1):
        _login(anon, u.email, "Wrong@123")
    assert _login(anon, u.email).status_code == 200
    assert _login(anon, u.email, "Wrong@123").status_code == 401
    assert _login(anon, u.email).status_code == 200


def test_me_without_token_is_401(anon):
    assert anon.get("/api/auth/me").status_code == 401


@pytest.mark.parametrize("token", ["garbage", "a.b.c"])
def test_garbage_token_is_401(anon, token):
    assert anon.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_refresh_token_cannot_be_used_as_access_token(anon, make):
    t = create_refresh_token(str(make.user("admin").id))
    assert anon.get("/api/auth/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_oauth_state_cannot_be_used_as_access_token(anon, make):
    t = gmail.sign_state(gmail.LOGIN_TICKET, timedelta(minutes=2), sub=str(make.user("admin").id))
    assert anon.get("/api/auth/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_token_of_deleted_or_inactive_user_stops_working(anon, make, db):
    u = make.user("admin")
    t = create_access_token(str(u.id), "admin")
    assert anon.get("/api/auth/me", headers={"Authorization": f"Bearer {t}"}).status_code == 200
    u.is_active = False
    db.commit()
    assert anon.get("/api/auth/me", headers={"Authorization": f"Bearer {t}"}).status_code == 401


def test_role_in_token_is_not_trusted(anon, make):
    """Privileges come from the database, not from the token's role claim."""
    u = make.user("editor")
    t = create_access_token(str(u.id), "admin")
    assert anon.get("/api/users/", headers={"Authorization": f"Bearer {t}"}).status_code == 403


def test_logout_revokes_the_token(anon, make, login):
    c = login(make.user("editor"))
    token = c.cookies.get("access_token")
    assert c.post("/api/auth/logout").status_code == 200
    assert anon.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_refresh_gives_a_new_session(make, base_client):
    from conftest import new_client
    u = make.user("editor")
    c = new_client(base_client)
    res = c.post("/api/auth/refresh", cookies={"refresh_token": create_refresh_token(str(u.id))})
    assert res.status_code == 200 and res.json()["access_token"]


def test_access_token_cannot_refresh(make, base_client):
    from conftest import new_client
    u = make.user("editor")
    res = new_client(base_client).post("/api/auth/refresh", cookies={"refresh_token": create_access_token(str(u.id), "editor")})
    assert res.status_code == 401


def test_change_password_flow(make, login, anon):
    u = make.user("editor")
    c = login(u)
    bad = c.post("/api/auth/change-password", json={"current_password": "Wrong@1", "new_password": "Newer@123", "confirm_password": "Newer@123"})
    assert bad.status_code == 400
    weak = c.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "weak", "confirm_password": "weak"})
    assert weak.status_code == 422
    same = c.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": PASSWORD, "confirm_password": PASSWORD})
    assert same.status_code == 400
    ok = c.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "Newer@123", "confirm_password": "Newer@123"})
    assert ok.status_code == 200
    assert _login(anon, u.email).status_code == 401
    assert _login(anon, u.email, "Newer@123").status_code == 200


def test_must_change_password_blocks_everything_else(make, login):
    u = make.user("admin", must_change_password=True)
    c = login(u)
    assert c.get("/api/users/").status_code == 403
    assert c.get("/api/auth/me").status_code == 200
    c.post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "Newer@123", "confirm_password": "Newer@123"})
    assert c.get("/api/users/").status_code == 200


def test_seen_version_is_saved_per_user(make, login):
    u = make.user("editor")
    c = login(u)
    assert c.post("/api/auth/seen-version", json={"version": "4.1.2"}).json()["last_seen_version"] == "4.1.2"
    assert c.post("/api/auth/seen-version", json={"version": "x" * 50}).status_code == 422


def test_login_and_logout_are_audited(make, login, db):
    from app.models import AuditLog
    c = login(make.user("editor"))
    c.post("/api/auth/logout")
    assert {r.action for r in db.query(AuditLog).all()} >= {"login", "logout"}
