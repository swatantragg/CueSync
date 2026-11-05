import pytest

from app.models.notification import Notification


def allot(c, project, editor, **kw):
    return c.post("/api/delegations/", json={"serial_name": project.title, "project_id": project.id, "assigned_to": editor.id, **kw})


@pytest.fixture
def setup(make, login):
    wd, editor, other = make.user("work_delegator"), make.user("editor"), make.user("editor")
    project = make.project(owner=wd)
    client = make.client()
    return dict(wd=wd, editor=editor, other=other, project=project, client=client, wc=login(wd), ec=login(editor), oc=login(other))


def test_wd_allots_and_editor_is_notified(setup, db):
    res = allot(setup["wc"], setup["project"], setup["editor"], client_id=setup["client"].id, episode_range="1-10", week_target=5)
    assert res.status_code == 200, res.text
    assert res.json()["client"] == "Sun Music"
    assert db.query(Notification).filter_by(user_id=setup["editor"].id, entity_type="delegation").count() == 1


def test_client_must_be_in_the_list(setup):
    assert allot(setup["wc"], setup["project"], setup["editor"], client="Typo Client").status_code == 400


def test_editor_sees_only_their_own(setup):
    d = allot(setup["wc"], setup["project"], setup["editor"]).json()
    assert [x["id"] for x in setup["ec"].get("/api/delegations/").json()] == [d["id"]]
    assert setup["oc"].get("/api/delegations/").json() == []
    assert setup["ec"].get(f"/api/delegations/{d['id']}").status_code == 200
    assert setup["oc"].get(f"/api/delegations/{d['id']}").status_code == 403


def test_editor_can_only_change_status_on_their_own(setup):
    d = allot(setup["wc"], setup["project"], setup["editor"], week_target=5).json()
    assert setup["oc"].put(f"/api/delegations/{d['id']}", json={"status": "completed"}).status_code == 403
    res = setup["ec"].put(f"/api/delegations/{d['id']}", json={"status": "in_progress", "week_target": 1, "assigned_to": setup["other"].id})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "in_progress" and body["week_target"] == 5 and body["assigned_to"] == setup["editor"].id


def test_progress_comes_from_approved_episodes_not_from_what_editors_type(setup, make):
    d = allot(setup["wc"], setup["project"], setup["editor"], episode_range="1-3").json()
    make.episode(setup["project"], 1, "approved")
    make.episode(setup["project"], 2, "pending")
    setup["ec"].put(f"/api/delegations/{d['id']}", json={"completed": 99})
    assert setup["ec"].get(f"/api/delegations/{d['id']}").json()["completed"] == 1


def test_deleting_serial_removes_its_delegations_and_their_notifications(setup, make, login, db):
    d = allot(setup["wc"], setup["project"], setup["editor"]).json()
    admin = login(make.user("admin"))
    assert admin.delete(f"/api/projects/{setup['project'].id}").status_code == 200
    assert setup["wc"].get("/api/delegations/").json() == []
    assert db.query(Notification).filter_by(entity_type="delegation", entity_id=d["id"]).count() == 0


# ── Clients ─────────────────────────────────────────────────────────────────
def test_reviewer_adds_client_and_spelling_variants_are_one_client(make, login):
    c = login(make.user("reviewer"))
    assert c.post("/api/clients/", json={"name": "Client-1"}).status_code == 200
    assert c.post("/api/clients/", json={"name": "client 1"}).status_code == 409
    assert c.post("/api/clients/", json={"name": "---"}).status_code == 400


def test_client_email_must_be_valid(make, login):
    assert login(make.user("reviewer")).post("/api/clients/", json={"name": "X", "email": "nope"}).status_code == 422


def test_used_client_cannot_be_deleted(setup, make, login):
    allot(setup["wc"], setup["project"], setup["editor"], client_id=setup["client"].id)
    assert login(make.user("admin")).delete(f"/api/clients/{setup['client'].id}").status_code == 409


def test_rename_reaches_delegations(setup, make, login):
    d = allot(setup["wc"], setup["project"], setup["editor"], client_id=setup["client"].id).json()
    assert login(make.user("reviewer")).put(f"/api/clients/{setup['client'].id}", json={"name": "Sun Records"}).status_code == 200
    assert setup["wc"].get(f"/api/delegations/{d['id']}").json()["client"] == "Sun Records"


def test_connecting_a_client_mailbox_needs_its_address(make, login):
    client = make.client()
    res = login(make.user("reviewer")).post(f"/api/clients/{client.id}/mailbox/connect")
    assert res.status_code == 400 and "Gmail address" in res.json()["detail"]


# ── Societies ───────────────────────────────────────────────────────────────
def test_society_needs_valid_address_and_no_duplicates(make, login):
    c = login(make.user("reviewer"))
    assert c.post("/api/societies/", json={"name": "IPRS", "to_emails": ["cue@iprs.org"]}).status_code == 200
    assert c.post("/api/societies/", json={"name": "iprs", "to_emails": ["a@iprs.org"]}).status_code == 409
    assert c.post("/api/societies/", json={"name": "PRS", "to_emails": ["not-an-email"]}).status_code == 400


def test_only_admin_deletes_societies(make, login):
    s = make.society()
    assert login(make.user("reviewer")).delete(f"/api/societies/{s.id}").status_code == 403
    assert login(make.user("admin")).delete(f"/api/societies/{s.id}").status_code == 200
