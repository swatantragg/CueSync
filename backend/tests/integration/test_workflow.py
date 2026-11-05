"""The main job of the app, through the API: editor builds a cue sheet, reviewer decides, sheets export."""
from io import BytesIO

import pytest
from openpyxl import Workbook, load_workbook

from app.models import AuditLog
from app.models.notification import Notification

CUE = {"song_title": "Tum Hi Ho", "usage_type": "bi", "duration_sec": 95, "usage_count": 2, "isrc": "INA121234567",
       "contributors": [{"name": "Composer One", "role": "Composer", "society": "IPRS", "share_percent": 50},
                        {"name": "Author One", "role": "Author", "society": "IPRS", "share_percent": 50}]}


@pytest.fixture
def team(make, login):
    admin = make.user("admin")
    editor, reviewer = make.user("editor"), make.user("reviewer")
    return dict(admin=admin, editor=editor, reviewer=reviewer, ec=login(editor), rc=login(reviewer), ac=login(admin))


def build(team, title="Kothha", kind="SERIAL"):
    project = team["ec"].post("/api/projects/", json={"title": title, "type": kind, "language": "Hindi", "total_episodes": 10})
    assert project.status_code == 200, project.text
    pid = project.json()["id"]
    ep = team["ec"].post(f"/api/episodes/project/{pid}", json={"episode_number": 1})
    assert ep.status_code == 200, ep.text
    eid = ep.json()["id"]
    cue = team["ec"].post(f"/api/cues/episode/{eid}", json=CUE)
    assert cue.status_code == 200, cue.text
    return pid, eid, cue.json()["id"]


def test_build_submit_approve(team, db):
    pid, eid, _ = build(team)
    assert team["ec"].get(f"/api/episodes/{eid}").json()["status"] == "pending"
    assert team["ec"].post(f"/api/episodes/{eid}/submit").json()["status"] == "submitted"
    assert db.query(Notification).filter_by(user_id=team["reviewer"].id, entity_id=eid).count() == 1

    assert team["rc"].post(f"/api/episodes/{eid}/approve").status_code == 409  # must open it first
    assert team["rc"].post(f"/api/episodes/{eid}/open").json()["recorded"] is True
    assert team["rc"].post(f"/api/episodes/{eid}/approve").json()["status"] == "approved"
    actions = [a.action for a in db.query(AuditLog).filter_by(entity="episode", entity_id=eid).order_by(AuditLog.id)]
    assert actions == ["create", "submit", "review_open", "approve"]
    assert db.query(Notification).filter_by(user_id=team["editor"].id, entity_id=eid).count() == 1


def test_reopening_is_needed_after_each_resubmit(team):
    _, eid, _ = build(team)
    team["ec"].post(f"/api/episodes/{eid}/submit")
    team["rc"].post(f"/api/episodes/{eid}/open")
    assert team["rc"].post(f"/api/episodes/{eid}/reject", json={"note": "Wrong ISRC"}).json()["status"] == "rejected"
    assert team["ec"].get(f"/api/episodes/{eid}").json()["rejection_note"] == "Wrong ISRC"
    assert team["ec"].post(f"/api/episodes/{eid}/submit").json()["rejection_note"] is None
    assert team["rc"].post(f"/api/episodes/{eid}/approve").status_code == 409


@pytest.mark.parametrize("path", ["reject", "suggest"])
def test_review_note_is_required(team, path):
    _, eid, _ = build(team)
    team["ec"].post(f"/api/episodes/{eid}/submit")
    team["rc"].post(f"/api/episodes/{eid}/open")
    assert team["rc"].post(f"/api/episodes/{eid}/{path}", json={"note": "   "}).status_code in (400, 422)


def test_suggest_sets_edited_status(team):
    _, eid, _ = build(team)
    team["ec"].post(f"/api/episodes/{eid}/submit")
    team["rc"].post(f"/api/episodes/{eid}/open")
    res = team["rc"].post(f"/api/episodes/{eid}/suggest", json={"note": "Add the singer"}).json()
    assert res["status"] == "edited" and res["review_note"] == "Add the singer"


def test_admin_reviews_without_opening(team):
    _, eid, _ = build(team)
    team["ec"].post(f"/api/episodes/{eid}/submit")
    assert team["ac"].post(f"/api/episodes/{eid}/approve").json()["status"] == "approved"


def test_status_cannot_be_set_through_episode_edit(team):
    """Approval only goes through the review routes."""
    _, eid, _ = build(team)
    res = team["ec"].put(f"/api/episodes/{eid}", json={"episode_number": 1, "status": "approved"})
    assert res.status_code == 200
    assert team["ec"].get(f"/api/episodes/{eid}").json()["status"] == "pending"


def test_cue_round_trip_keeps_contributors(team):
    _, eid, cid = build(team)
    got = team["ec"].get(f"/api/cues/{cid}").json()
    assert {c["name"] for c in got["contributors"]} == {"Composer One", "Author One"}
    edited = {**CUE, "song_title": "Edited", "contributors": CUE["contributors"][:1]}
    assert team["ec"].put(f"/api/cues/{cid}", json=edited).json()["song_title"] == "Edited"
    assert [c["name"] for c in team["ec"].get(f"/api/cues/{cid}").json()["contributors"]] == ["Composer One"]
    assert team["ec"].delete(f"/api/cues/{cid}").status_code == 200
    assert team["ec"].get(f"/api/cues/{cid}").status_code == 404


def test_cue_share_above_100_is_refused(team):
    _, eid, _ = build(team)
    bad = {**CUE, "contributors": [{"name": "X", "role": "Composer", "share_percent": 150}]}
    assert team["ec"].post(f"/api/cues/episode/{eid}", json=bad).status_code == 422


def test_validation_reports_missing_ids(team):
    _, eid, _ = build(team)
    res = team["ec"].get(f"/api/validation/episode/{eid}").json()
    assert res["cue_count"] == 1 and any(i["type"] == "missing_prs" for i in res["issues"])


@pytest.mark.parametrize("society", ["iprs", "prs", "ascap"])
def test_exports_are_real_workbooks_with_the_song(team, society):
    _, eid, _ = build(team)
    res = team["rc"].get(f"/api/exports/episode/{eid}", params={"society": society})
    assert res.status_code == 200, res.text
    assert "attachment" in res.headers["content-disposition"]
    wb = load_workbook(BytesIO(res.content))
    text = " ".join(str(c.value) for ws in wb.worksheets for row in ws.iter_rows() for c in row if c.value is not None)
    assert "Tum Hi Ho" in text


def test_unknown_society_export_is_refused(team):
    _, eid, _ = build(team)
    assert team["rc"].get(f"/api/exports/episode/{eid}", params={"society": "../../etc"}).status_code == 422


def test_bulk_export_has_a_sheet_per_episode(team):
    pid, _, _ = build(team)
    ep2 = team["ec"].post(f"/api/episodes/project/{pid}", json={"episode_number": 2}).json()["id"]
    team["ec"].post(f"/api/cues/episode/{ep2}", json=CUE)
    res = team["rc"].get(f"/api/exports/bulk/project/{pid}", params={"society": "iprs", "from_ep": 1, "to_ep": 2})
    assert res.status_code == 200, res.text
    assert len(load_workbook(BytesIO(res.content)).worksheets) == 2


def test_missing_rows_are_404(team):
    c = team["ec"]
    assert c.get("/api/episodes/999999").status_code == 404
    assert c.get("/api/cues/999999").status_code == 404
    assert c.get("/api/projects/999999").status_code == 404
    assert c.post("/api/episodes/999999/submit").status_code == 404
    assert team["rc"].get("/api/exports/episode/999999", params={"society": "iprs"}).status_code == 404


def test_delete_project_is_admin_only_and_takes_its_episodes(team):
    pid, eid, _ = build(team)
    assert team["ec"].delete(f"/api/projects/{pid}").status_code == 403
    assert team["ac"].delete(f"/api/projects/{pid}").status_code == 200
    assert team["ec"].get(f"/api/episodes/{eid}").status_code == 404


def _xlsx(rows) -> bytes:
    wb = Workbook()
    for r in rows:
        wb.active.append(r)
    out = BytesIO()
    wb.save(out)
    return out.getvalue()


XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@pytest.mark.parametrize("name,ctype,data", [
    ("evil.exe", "application/octet-stream", b"MZ"),
    ("sheet.html", "text/html", b"<script>alert(1)</script>"),
])
def test_upload_refuses_non_excel(team, name, ctype, data):
    pid, _, _ = build(team)
    res = team["ec"].post(f"/api/uploads/rough/project/{pid}/preview", files={"file": (name, data, ctype)})
    assert res.status_code == 400, res.text


def test_upload_survives_a_corrupt_excel_file(team):
    pid, _, _ = build(team)
    res = team["ec"].post(f"/api/uploads/rough/project/{pid}/preview", files={"file": ("sheet.xlsx", b"not really excel", XLSX)})
    assert res.status_code < 500, res.text


def test_work_file_upload_refuses_a_random_workbook(team):
    pid, _, _ = build(team)
    res = team["ec"].post(f"/api/work-files/project/{pid}/preview", files={"files": ("x.xlsx", _xlsx([["hello"]]), XLSX)})
    assert res.status_code < 500, res.text
    assert "ok" not in res.text.lower() or res.json()


def test_work_file_upload_survives_corrupt_file(team):
    pid, _, _ = build(team)
    res = team["ec"].post(f"/api/work-files/project/{pid}/preview", files={"files": ("x.xlsx", b"junk", XLSX)})
    assert res.status_code < 500, res.text
