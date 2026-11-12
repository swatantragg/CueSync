"""Projects → Conversion: one of IPRS / PRS / ASCAP in, all three out, saved for later download and email."""
import io
import zipfile
from email import message_from_bytes
from email.policy import default
from types import SimpleNamespace

import httpx
import pytest

from app.models.client import ClientMailbox
from app.models.conversion import Conversion
from app.models.project import Project, ProjectType
from app.models.society_submission import SocietySubmission
from app.services import gmail
from app.services.conversion_parser import parse_cue_workbook
from app.services.exporters import build_export
from app.services.exporters.iprs import build_iprs_bulk

BASE = "/api/conversions"


def _contrib(name, role, share, society="IPRS", ipi=None):
    return SimpleNamespace(name=name, role=role, society=society, share_percent=share, ipi_number=ipi, cae_number=None)


def _episode(number, title="Kothha"):
    cues = [
        SimpleNamespace(id=1, order_index=1, song_title="Kothha Background Instrumental", usage_type=SimpleNamespace(value="bi"),
                        duration_sec=550, usage_count=1, isrc=None, song_code="30715504", work_number=None, ascap_work_id=None,
                        validation_link=None, singer=None,
                        contributors=[_contrib("Sabuj Mukherjee", "Composer", 25, ipi="1280461760"),
                                      _contrib("Ashish Kumar Das", "Composer", 25, ipi="1173883723"),
                                      _contrib("Star India Private Limited", "Publisher", 50, society="NS")]),
        SimpleNamespace(id=2, order_index=2, song_title="Tum Hi Aana", usage_type=SimpleNamespace(value="bv"),
                        duration_sec=21, usage_count=2, isrc="INS172221737", song_code="24785724", work_number="W1",
                        ascap_work_id="907007270", validation_link=None, singer="Jubin",
                        contributors=[_contrib("Payal Dev", "Composer", 25, ipi="111"), _contrib("Kunaal Vermaa", "Author", 25, ipi="222"),
                                      _contrib("Super Cassettes", "Publisher", 50, ipi="333")]),
    ]
    return SimpleNamespace(
        id=number, episode_number=number, title=None, air_date="2024-02-03", total_duration_sec=1358, musical_duration_sec=571,
        cue_serial_title=title, cue_channel="Star Jalsha", cue_serial_type="SOAPS", cue_language="Bengali", cue_director="Suman Das",
        cue_genre="Drama", cue_production_company="Bangla Talkies", cue_country="India", cue_actors="A, B", cue_producer="P",
        cue_production_year=2023, cue_bg_music_composer="Sabuj-Aashish", cue_submitted_by="Sabuj-Aashish", cues=cues)


def _project(kind=ProjectType.SERIAL, title="Kothha"):
    return SimpleNamespace(title=title, type=kind, channel_name=None, language=None, director=None, genre=None,
                           production_company=None, actors=None, production_year=None, producer=None, bg_music_composer=None,
                           submitted_by=None, country=None, total_episodes=None)


def sheet(society="iprs", episodes=(51, 52), title="Kothha", kind=ProjectType.SERIAL) -> bytes:
    """A finished cue sheet as CueSync's own exporters write it."""
    proj = _project(kind, title)
    if society == "iprs":
        return build_iprs_bulk(proj, [_episode(n, title) for n in episodes])
    from app.services.bulk_exports import society_bulk
    return society_bulk(society, proj, [_episode(n, title) for n in episodes], None)


def upload(c, path, project, data, name="sheet.xlsx", **form):
    return c.post(f"{BASE}{path}", data={"project_id": project.id, **form},
                  files={"file": (name, data, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})


@pytest.fixture
def setup(make, login, db, net):
    admin = make.user("admin")
    rev = make.user("reviewer")
    client = make.client("Sun Music", email="sun@gmail.com")
    db.add(ClientMailbox(client_id=client.id, email="sun@gmail.com", refresh_token_enc=gmail.encrypt_token("r"), status="connected"))
    db.commit()
    society = make.society("PRS", to="cue@prs.org", attachments="prs,workfile", subject_template="{serial} {episodes}", body_template="From {client}")
    project = make.project("Kothha", owner=admin)
    net.on("POST", gmail.TOKEN_URL, httpx.Response(200, json={"access_token": "client-token"}))
    net.on("POST", gmail.SEND_URL, lambda r: httpx.Response(200, json={"id": "m1", "threadId": "t1"}))
    return dict(rev=rev, rc=login(rev), client=client, society=society, project=project, make=make, admin=admin)


def saved(s, society="iprs", episodes=(51, 52)):
    res = upload(s["rc"], "/", s["project"], sheet(society, episodes), client_id=s["client"].id)
    assert res.status_code == 200, res.text
    return res.json()


# ── Parsing ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("society", ["iprs", "prs", "ascap"])
def test_each_format_is_recognised_and_read(society):
    got = parse_cue_workbook(sheet(society), "x.xlsx")
    assert got["format"] == society
    assert [e["episode_number"] for e in got["episodes"]] == [51, 52]
    ep = got["episodes"][0]
    assert ep["meta"]["title"] == "Kothha" and ep["air_date"] == "2024-02-03" and ep["total_duration_sec"] == 1358
    cues = {c["song_title"]: c for c in ep["cues"]}
    assert set(cues) == {"Kothha Background Instrumental", "Tum Hi Aana"}
    bi = cues["Kothha Background Instrumental"]
    assert bi["usage"] == "bi" and bi["duration_sec"] == 550
    assert [(p["name"], p["role"]) for p in bi["contributors"]] == [
        ("Sabuj Mukherjee", "Composer"), ("Ashish Kumar Das", "Composer"), ("Star India Private Limited", "Publisher")]
    # shares come back on the IPRS scale whatever the source wrote (ASCAP doubles them)
    assert [p["share_percent"] for p in bi["contributors"]] == [25, 25, 50]
    assert bi["contributors"][2]["society"] == "NS"


def test_iprs_keeps_everything_it_carries():
    cue = parse_cue_workbook(sheet("iprs"), "x.xlsx")["episodes"][0]["cues"][1]
    assert (cue["usage"], cue["usage_count"], cue["song_code"], cue["isrc"], cue["singer"]) == ("bv", 2, "24785724", "INS172221737", "Jubin")
    assert [p["ipi_number"] for p in cue["contributors"]] == ["111", "222", "333"]
    assert [p["role"] for p in cue["contributors"]] == ["Composer", "Author", "Publisher"]


def test_a_file_that_is_no_cue_sheet_is_refused(setup):
    from openpyxl import Workbook
    wb = Workbook(); wb.active["A1"] = "hello"; buf = io.BytesIO(); wb.save(buf)
    res = upload(setup["rc"], "/preview", setup["project"], buf.getvalue())
    assert res.status_code == 400 and "No IPRS, PRS or ASCAP" in res.json()["detail"]
    res = upload(setup["rc"], "/preview", setup["project"], b"not excel", name="notes.txt")
    assert res.status_code == 400


# ── Preview and save ──────────────────────────────────────────────────────────

def test_preview_reports_the_file_and_writes_nothing(setup, db):
    setup["make"].episode(setup["project"], 52, "approved")
    res = upload(setup["rc"], "/preview", setup["project"], sheet("prs"))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["format"] == "prs" and body["title_mismatch"] is False and body["notes"]
    assert [(e["episode_number"], e["cues"], e["already_converted"], e["cue_sheet_status"]) for e in body["episodes"]] == [
        (51, 2, False, None), (52, 2, False, "approved")]
    assert db.query(Conversion).count() == 0


def test_save_then_download_every_format(setup, db):
    out = saved(setup, "ascap")
    assert out["saved"] == [51, 52] and out["replaced"] == []
    rows = db.query(Conversion).order_by(Conversion.episode_number).all()
    assert [(r.episode_number, r.source_format, r.client, r.cue_count, r.converted_by) for r in rows] == [
        (51, "ascap", "Sun Music", 2, setup["rev"].id), (52, "ascap", "Sun Music", 2, setup["rev"].id)]
    for society in ("iprs", "prs", "ascap"):
        res = setup["rc"].get(f"{BASE}/project/{setup['project'].id}/download?society={society}&from_ep=51&to_ep=52")
        assert res.status_code == 200, res.text
        assert f"Kothha_{society.upper()}_EP51-52.xlsx" in res.headers["content-disposition"]
        back = parse_cue_workbook(res.content, "x.xlsx")
        assert back["format"] == society and [e["episode_number"] for e in back["episodes"]] == [51, 52]
    res = setup["rc"].get(f"{BASE}/project/{setup['project'].id}/download?society=all&from_ep=1&to_ep=100")
    assert res.headers["x-episodes"] == "2"
    assert sorted(zipfile.ZipFile(io.BytesIO(res.content)).namelist()) == [
        "Kothha_ASCAP_EP1-100.xlsx", "Kothha_IPRS_EP1-100.xlsx", "Kothha_PRS_EP1-100.xlsx"]


def test_only_the_picked_episodes_are_saved_and_a_second_upload_replaces(setup, db):
    res = upload(setup["rc"], "/", setup["project"], sheet("iprs", (51, 52, 53)), client_id=setup["client"].id, episode_numbers="[51, 53]")
    assert res.json()["saved"] == [51, 53]
    again = upload(setup["rc"], "/", setup["project"], sheet("prs", (53, 54)), client_id=setup["client"].id).json()
    assert again["saved"] == [53, 54] and again["replaced"] == [53]
    assert {r.episode_number: r.source_format for r in db.query(Conversion)} == {51: "iprs", 53: "prs", 54: "prs"}
    listing = setup["rc"].get(f"{BASE}/").json()
    assert [(g["project_title"], g["episodes"], g["episode_count"], sorted(g["formats"])) for g in listing] == [
        ("Kothha", "51, 53–54", 3, ["IPRS", "PRS"])]


def test_a_client_from_the_list_is_required(setup, db):
    res = upload(setup["rc"], "/", setup["project"], sheet(), client_id=9999)
    assert res.status_code == 400 and db.query(Conversion).count() == 0
    assert upload(setup["rc"], "/", setup["project"], sheet()).status_code == 422


def test_a_file_for_another_title_needs_confirming(setup, db):
    data = sheet("iprs", title="Anupamaa")
    assert upload(setup["rc"], "/preview", setup["project"], data).json()["title_mismatch"] is True
    res = upload(setup["rc"], "/", setup["project"], data, client_id=setup["client"].id)
    assert res.status_code == 409 and db.query(Conversion).count() == 0
    res = upload(setup["rc"], "/", setup["project"], data, client_id=setup["client"].id, title_confirmed="true")
    assert res.status_code == 200 and db.query(Conversion).count() == 2


def test_a_movie_is_one_cue_sheet(setup, db):
    movie = setup["make"].project("Sugna", kind="movie", owner=setup["admin"])
    data = sheet("iprs", (1,), title="Sugna", kind=ProjectType.MOVIE)
    res = upload(setup["rc"], "/", movie, data, client_id=setup["client"].id)
    assert res.status_code == 200, res.text
    assert [r.episode_number for r in db.query(Conversion)] == [1]
    res = setup["rc"].get(f"{BASE}/project/{movie.id}/download?society=ascap")
    assert res.status_code == 200 and parse_cue_workbook(res.content, "x.xlsx")["format"] == "ascap"


def test_reviewer_adds_the_serial_once(setup, db):
    first = setup["rc"].post(f"{BASE}/projects", json={"title": "  Molkki ", "type": "serial"}).json()
    assert first["existing"] is False and first["title"] == "Molkki"
    same = setup["rc"].post(f"{BASE}/projects", json={"title": "MOLKKI", "type": "serial"}).json()
    assert same["existing"] is True and same["id"] == first["id"]
    movie = setup["rc"].post(f"{BASE}/projects", json={"title": "Molkki", "type": "movie"}).json()
    assert movie["existing"] is False and movie["id"] != first["id"]
    assert db.query(Project).filter(Project.title == "Molkki").count() == 2


def test_converted_titles_show_in_the_reviewer_serial_list(setup):
    assert setup["rc"].get("/api/activity/reviewer-serials").json() == []
    saved(setup)
    rows = setup["rc"].get("/api/activity/reviewer-serials").json()
    assert [(r["project_title"], r["converted_count"], r["approved_count"]) for r in rows] == [("Kothha", 2, 0)]


def test_delete_removes_one_converted_sheet(setup, db):
    saved(setup)
    row = db.query(Conversion).filter_by(episode_number=51).one()
    assert setup["rc"].delete(f"{BASE}/{row.id}").status_code == 200
    assert [r.episode_number for r in db.query(Conversion)] == [52]


@pytest.mark.parametrize("role", ["editor", "work_delegator", "viewer"])
def test_only_admins_and_reviewers_convert(setup, make, login, role):
    c = login(make.user(role))
    assert c.get(f"{BASE}/").status_code == 403
    assert upload(c, "/preview", setup["project"], sheet()).status_code == 403
    assert c.post(f"{BASE}/projects", json={"title": "X", "type": "serial"}).status_code == 403


# ── Send to Society ───────────────────────────────────────────────────────────

def mail(s, **kw):
    return {"project_id": s["project"].id, "episode_from": 51, "episode_to": 52, "client_id": s["client"].id,
            "society_id": s["society"].id, "converted": True, "to": ["cue@prs.org"], "subject": "Cue sheets",
            "body": "Attached", "attachments": ["iprs", "prs", "ascap"], **kw}


def test_converted_sheets_are_emailed_and_recorded_like_a_submission(setup, net, db):
    saved(setup)
    pre = setup["rc"].post("/api/society-submissions/mail/preview", json=mail(setup)).json()
    assert pre["ready"] is True and pre["converted"] is True
    assert {a["key"]: (a["available"], a["selected"]) for a in pre["attachments"]}["workfile"] == (False, False)
    res = setup["rc"].post("/api/society-submissions/mail/send", json=mail(setup))
    assert res.status_code == 200, res.text
    msg = message_from_bytes(net.sent_to(gmail.SEND_URL)[-1].content, policy=default)
    files = {a.get_filename(): a.get_payload(decode=True) for a in msg.iter_attachments()}
    assert sorted(files) == ["Kothha_ASCAP_EP51-52.xlsx", "Kothha_IPRS_EP51-52.xlsx", "Kothha_PRS_EP51-52.xlsx"]
    assert parse_cue_workbook(files["Kothha_PRS_EP51-52.xlsx"], "x.xlsx")["format"] == "prs"
    row = db.query(SocietySubmission).one()
    assert (row.sent_via, row.mail_status, row.from_conversion, row.episode_from, row.episode_to) == ("gmail", "sent", True, 51, 52)
    eps = setup["rc"].get(f"{BASE}/project/{setup['project'].id}?society_id={setup['society'].id}").json()["episodes"]
    assert [(e["episode_number"], e["sent"]) for e in eps] == [(51, True), (52, True)]


def test_an_episode_never_converted_blocks_the_email(setup, net, db):
    saved(setup)
    pre = setup["rc"].post("/api/society-submissions/mail/preview", json=mail(setup, episode_to=53)).json()
    assert pre["ready"] is False and "Ep 53" in pre["problems"][0]
    assert setup["rc"].post("/api/society-submissions/mail/send", json=mail(setup, episode_to=53)).status_code == 400
    assert db.query(SocietySubmission).count() == 0 and not net.sent_to(gmail.SEND_URL)


def test_converted_sheets_do_not_stand_in_for_approved_episodes(setup, db):
    """The normal Send to Society still needs approved episodes: a conversion is not an approval."""
    saved(setup)
    pre = setup["rc"].post("/api/society-submissions/mail/preview", json=mail(setup, converted=False)).json()
    assert pre["ready"] is False and "No cue sheet yet" in pre["problems"][0]


def test_work_file_cannot_be_attached_to_a_converted_email(setup, db):
    saved(setup)
    res = setup["rc"].post("/api/society-submissions/mail/send", json=mail(setup, attachments=["prs", "workfile"]))
    assert res.status_code == 400 and db.query(SocietySubmission).count() == 0
