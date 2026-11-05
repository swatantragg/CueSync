"""Who may call what. Reads the roles off the routes themselves, so a new endpoint is covered automatically."""
import pytest
from fastapi.routing import APIRoute

from app.core.deps import get_current_user
from app.main import app
from app.models import UserRole
from conftest import PASSWORD

PUBLIC = {
    ("POST", "/api/auth/login"), ("GET", "/api/auth/google/config"), ("GET", "/api/auth/google/start"),
    ("POST", "/api/auth/google/exchange"), ("POST", "/api/auth/refresh"), ("POST", "/api/auth/logout"),
    ("GET", "/api/mail/oauth/callback"), ("GET", "/"), ("GET", "/health"),
}


def required_roles(route: APIRoute) -> tuple[set[str] | None, bool, bool]:
    """(roles the route requires, or None; needs a login at all; super admin only)"""
    roles, login, superadmin = None, False, False

    def walk(dep):
        nonlocal roles, login, superadmin
        call = dep.call
        if call is get_current_user:
            login = True
        if getattr(call, "__name__", "") == "require_super_admin":
            superadmin = True
        if getattr(call, "__name__", "") == "_checker":
            for cell in call.__closure__:
                if isinstance(cell.cell_contents, tuple):
                    roles = {r.value for r in cell.cell_contents}
        for sub in dep.dependencies:
            walk(sub)
    walk(route.dependant)
    return roles, login, superadmin


ROUTES = []
for r in app.routes:
    if isinstance(r, APIRoute):
        for m in r.methods - {"HEAD", "OPTIONS"}:
            ROUTES.append((m, r.path, *required_roles(r)))


def url(path: str) -> str:
    return path.replace("{", "").replace("}", "").replace("user_id", "1").replace("project_id", "1").replace("episode_id", "1") \
        .replace("episode_number", "1").replace("target_1", "1").replace("editor_id", "1").replace("notice_id", "1").replace("sub_id", "1") \
        .replace("eid", "1").replace("cid", "1").replace("pid", "1").replace("did", "1").replace("nid", "1").replace("sid", "1")


def test_route_inventory_is_not_empty():
    assert len(ROUTES) > 100


@pytest.mark.parametrize("method,path", [(m, p) for m, p, *_ in ROUTES if (m, p) not in PUBLIC])
def test_every_route_needs_a_login(anon, method, path):
    assert anon.request(method, url(path)).status_code == 401


def test_no_route_is_public_by_accident():
    public = {(m, p) for m, p, roles, login, sup in ROUTES if roles is None and not login and not sup}
    assert public == PUBLIC


GUARDED = [(m, p, role) for m, p, roles, _, _ in ROUTES if roles for role in ("admin", "work_delegator", "reviewer", "editor", "viewer") if role not in roles]


@pytest.mark.parametrize("method,path,role", GUARDED)
def test_role_guarded_route_refuses_other_roles(make, login, method, path, role):
    assert login(make.user(role)).request(method, url(path)).status_code == 403


@pytest.mark.parametrize("role", ["admin", "work_delegator", "reviewer", "editor", "viewer"])
@pytest.mark.parametrize("method,path", [(m, p) for m, p, _, _, sup in ROUTES if sup])
def test_super_admin_routes_refuse_everyone_else(make, login, method, path, role):
    assert login(make.user(role)).request(method, url(path)).status_code == 403


def test_plain_admin_is_not_super_admin(make, login):
    target = make.user("editor")
    assert login(make.user("admin")).put(f"/api/users/{target.id}", json={"password": "Hacked@123"}).status_code == 403


# Written out on purpose: widening any of these should fail a test, not slip through.
SENSITIVE = {
    ("GET", "/api/users/"): {"admin"},
    ("POST", "/api/users/"): {"admin"},
    ("DELETE", "/api/users/{user_id}"): {"admin"},
    ("PUT", "/api/users/{user_id}/role"): {"admin"},
    ("GET", "/api/activity/logins"): {"admin"},
    ("POST", "/api/library/cleanup"): {"admin"},
    ("DELETE", "/api/projects/{pid}"): {"admin"},
    ("GET", "/api/reports/preview"): {"admin"},
    ("POST", "/api/reports/test"): {"admin"},
    ("GET", "/api/insights/dashboard"): {"admin"},
    ("POST", "/api/episodes/{eid}/approve"): {"admin", "reviewer"},
    ("POST", "/api/episodes/{eid}/reject"): {"admin", "reviewer"},
    ("POST", "/api/society-submissions/mail/send"): {"admin", "reviewer"},
    ("POST", "/api/clients/{cid}/mailbox/connect"): {"admin", "reviewer"},
    ("GET", "/api/insights/reviewer-calendar"): {"admin", "reviewer"},
    ("POST", "/api/editor-notices/send"): {"admin", "work_delegator"},
    ("GET", "/api/editor-notices/preview/{editor_id}"): {"admin", "work_delegator"},
    ("POST", "/api/delegations/"): {"admin", "work_delegator"},
    ("GET", "/api/insights/editor-dashboard"): {"editor"},
}


@pytest.mark.parametrize("key,want", SENSITIVE.items())
def test_sensitive_routes_keep_their_roles(key, want):
    found = [roles for m, p, roles, _, _ in ROUTES if (m, p) == key]
    assert found == [want]


# ── Users ───────────────────────────────────────────────────────────────────
def test_only_admin_lists_users_and_password_hashes_never_leak(make, login):
    res = login(make.user("admin")).get("/api/users/")
    assert res.status_code == 200 and "hashed_password" not in res.text


def test_me_never_returns_the_hash(make, login):
    assert "hashed_password" not in login(make.user("editor")).get("/api/auth/me").text


def test_admin_creates_user_who_must_change_password(make, login, anon):
    c = login(make.user("admin"))
    res = c.post("/api/users/", json={"email": "New@Example.test", "full_name": "N", "password": "Abc@1234", "role": "editor"})
    assert res.status_code == 200 and res.json()["must_change_password"] is True and res.json()["email"] == "new@example.test"
    assert c.post("/api/users/", json={"email": "new@example.test", "full_name": "N", "password": "Abc@1234"}).status_code == 400
    assert c.post("/api/users/", json={"email": "w@example.test", "full_name": "N", "password": "weak"}).status_code == 422


def test_super_admin_is_hidden_and_protected(make, login):
    boss = make.user("admin", email="owner@example.test", is_super_admin=True)
    admin = make.user("admin")
    c = login(admin)
    row = next(u for u in c.get("/api/users/").json() if u["id"] == boss.id)
    assert row["is_super_admin"] is False and row["is_protected"] is True
    assert c.put(f"/api/users/{boss.id}/role", json={"role": "editor"}).status_code == 403
    assert c.put(f"/api/users/{boss.id}/active", json={"is_active": False}).status_code == 403
    assert c.delete(f"/api/users/{boss.id}").status_code == 403


def test_admin_cannot_delete_themselves(make, login):
    admin = make.user("admin")
    assert login(admin).delete(f"/api/users/{admin.id}").status_code == 400


def test_role_change_applies_immediately_without_new_login(make, login, db):
    u = make.user("admin")
    c = login(u)
    assert c.get("/api/users/").status_code == 200
    u.role = UserRole.EDITOR
    db.commit()
    assert c.get("/api/users/").status_code == 403


def test_notifications_are_private(make, login, db):
    from app.models.notification import Notification
    a, b = make.user("editor"), make.user("editor")
    n = Notification(user_id=a.id, title="secret")
    db.add(n); db.commit()
    other = login(b)
    assert other.get("/api/notifications/").json() == []
    other.post(f"/api/notifications/{n.id}/read")
    db.refresh(n)
    assert n.is_read is False


def test_admin_only_activity_is_hidden_from_others(make, login):
    admin, editor = make.user("admin"), make.user("editor")
    project = make.project(owner=admin)
    ep = make.episode(project)
    from datetime import datetime, timezone
    make.audit(admin, "review_open", ep, datetime.now(timezone.utc))
    make.audit(editor, "update", ep, datetime.now(timezone.utc))
    seen = {r["action"] for r in login(editor).get(f"/api/activity/episode/{ep.id}").json()}
    assert seen == {"update"}
