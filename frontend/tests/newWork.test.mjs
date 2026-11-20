import assert from "node:assert/strict";
import { test } from "node:test";
import { GROUPS, STAGES, assignees, daysLabel, filterWorks, matchesStatus } from "../src/utils/newWork.js";
import { ACTION_LABEL } from "../src/utils/format.js";

// Shaped like a row from GET /api/new-works/.
const work = (id, over = {}) => ({
  id, title: `Work ${id}`, work_type: "movie", remarks: null, stage: "awaiting_bgm", days_open: 0, reminder: null,
  bgm: { state: "awaiting" }, fingerprint: { status: "not_assigned", assigned_to: null, assigned_to_name: null },
  cue: { status: "not_assigned", assigned_to: null, assigned_to_name: null, client: null }, ...over,
});

const rows = [
  work(1, { title: "Movie ABC", days_open: 31, reminder: { due: true } }),
  work(2, { work_type: "tv_show", stage: "fp_in_progress", bgm: { state: "received" }, days_open: 16, reminder: { due: false },
    fingerprint: { status: "in_progress", assigned_to: 7, assigned_to_name: "Esha" } }),
  work(3, { stage: "completed", days_open: null, bgm: { state: "received" },
    fingerprint: { status: "completed", assigned_to: 7, assigned_to_name: "Esha" },
    cue: { status: "completed", assigned_to: 9, assigned_to_name: "Omar", client: "Sun Music" } }),
  work(4, { stage: "cue_pending", bgm: { state: "skipped" }, days_open: 6, reminder: { due: true }, fingerprint: { status: "skipped" } }),
];
const ids = (list) => list.map((w) => w.id);

test("every status the server sends has a label, in workflow order", () => {
  assert.deepEqual(STAGES.map(([k]) => k), [
    "awaiting_bgm", "awaiting_video", "fp_not_assigned", "fp_assigned", "fp_in_progress", "cue_pending", "cue_assigned", "cue_in_progress", "completed", "closed",
  ]);
  for (const [key] of GROUPS) assert.ok(key.startsWith("g:"), key);
});

test("filters by work type, status, group, person and pending time", () => {
  assert.deepEqual(ids(filterWorks(rows, { type: "tv_show" })), [2]);
  assert.deepEqual(ids(filterWorks(rows, { status: "completed" })), [3]);
  assert.deepEqual(ids(filterWorks(rows, { status: "g:bgm_received" })), [2, 3]);
  assert.deepEqual(ids(filterWorks(rows, { status: "g:fp_completed" })), [3]);
  assert.deepEqual(ids(filterWorks(rows, { status: "g:reminders" })), [1, 4]);
  assert.deepEqual(ids(filterWorks(rows, { status: "g:pending" })), [1, 2, 4]);
  assert.deepEqual(ids(filterWorks(rows, { person: "7" })), [2, 3]);
  assert.deepEqual(ids(filterWorks(rows, { person: 9 })), [3]);
  assert.deepEqual(ids(filterWorks(rows, { pending: "15" })), [1, 2]);
  assert.deepEqual(ids(filterWorks(rows, { pending: "30" })), [1]);
  assert.deepEqual(ids(filterWorks(rows, { q: "sun music" })), [3]);
  assert.deepEqual(ids(filterWorks(rows, { q: "abc", pending: "30", type: "movie" })), [1]);
  assert.equal(filterWorks(rows).length, 4);
  assert.ok(matchesStatus(rows[0], ""));
});

test("the person filter lists everyone assigned, once, by name", () => {
  assert.deepEqual(assignees(rows), [{ id: 7, name: "Esha" }, { id: 9, name: "Omar" }]);
});

test("day counts read naturally", () => {
  assert.equal(daysLabel(null), "");
  assert.equal(daysLabel(0), "today");
  assert.equal(daysLabel(1), "1 day");
  assert.equal(daysLabel(15), "15 days");
});

test("every New Work audit action has a timeline label", () => {
  for (const a of ["new_work_add", "new_work_edit", "new_work_remove", "new_work_bgm", "new_work_skip", "new_work_reopen",
    "new_work_fp_assign", "new_work_fp_status", "new_work_fp_mail", "new_work_fp_mail_link", "new_work_fp_done",
    "new_work_cue_assign", "new_work_cue_status", "new_work_cue_removed", "new_work_reminder",
    "fp_mailbox_connect", "fp_mailbox_disconnect", "fp_mailbox_lost"]) assert.ok(ACTION_LABEL[a], a);
});

// ── 4.3.1: client, release date and video link ──────────────────────────────
import { RELEASE_OPTIONS, addDays, matchesRelease, releaseHint, safeLink, workClients } from "../src/utils/newWork.js";

test("client and release filters, and search by client", () => {
  const list = [
    work(1, { client_id: 3, client_name: "Sun Music", release: { days: -4 } }),
    work(2, { client_id: 5, client_name: "Zee Music", release: { days: 2 } }),
    work(3, { client_id: 3, client_name: "Sun Music", release: null }),
    work(4, { client_id: null, client_name: null, release: { days: 9 } }),
  ];
  assert.deepEqual(ids(filterWorks(list, { client: "3" })), [1, 3]);
  assert.deepEqual(ids(filterWorks(list, { q: "zee" })), [2]);
  assert.deepEqual(ids(filterWorks(list, { release: "upcoming" })), [1]);
  assert.deepEqual(ids(filterWorks(list, { release: "week" })), [2]);
  assert.deepEqual(ids(filterWorks(list, { release: "none" })), [3]);
  assert.deepEqual(RELEASE_OPTIONS.map(([k]) => k), ["upcoming", "week", "none"]);
  assert.equal(matchesRelease(list[0], ""), true);
  assert.deepEqual(workClients(list), [{ id: 3, name: "Sun Music" }, { id: 5, name: "Zee Music" }]);
});

test("video links open only as web addresses", () => {
  assert.equal(safeLink("https://youtu.be/abc"), "https://youtu.be/abc");
  assert.equal(safeLink("http://example.com/x"), "http://example.com/x");
  for (const bad of ["javascript:alert(1)", "data:text/html,hi", "youtu.be/abc", "", null]) assert.equal(safeLink(bad), null, String(bad));
});

test("release hint follows the server's rule: only dates still ahead get an update", () => {
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
  assert.equal(releaseHint(""), "");
  assert.match(releaseHint("2026-11-25", "2026-11-19"), /release day.*7 days after/);
  assert.match(releaseHint("2026-11-19", "2026-11-19"), /^Already released, so the only update comes 7 days after/);
  assert.match(releaseHint("2026-11-12", "2026-11-19"), /no release update/);
});

// ── 4.3.2: movies in theatres wait for their video ──────────────────────────
import { OTT_WINDOWS, expectedOtt, ottHint, releaseTypesFor } from "../src/utils/newWork.js";

test("a TV show is never released in theatres", () => {
  assert.deepEqual(releaseTypesFor("movie").map(([k]) => k), ["theatrical", "ott", "tv"]);
  assert.deepEqual(releaseTypesFor("tv_show").map(([k]) => k), ["ott", "tv"]);
  assert.deepEqual(OTT_WINDOWS.map(([d]) => d), [56, 28]);
});

test("expected OTT date: the announced one, else the usual gap after release", () => {
  assert.equal(expectedOtt({ release_date: "2026-11-20", ott_date: "", ott_window_days: "56" }), "2027-01-15");
  assert.equal(expectedOtt({ release_date: "2026-11-20", ott_date: "", ott_window_days: "28" }), "2026-12-18");
  assert.equal(expectedOtt({ release_date: "2026-11-20", ott_date: "2026-12-25", ott_window_days: "56" }), "2026-12-25");
  assert.equal(expectedOtt({ release_date: "", ott_date: "", ott_window_days: "56" }), "");
  assert.match(ottHint({ release_date: "2026-11-20", ott_date: "", ott_window_days: "28" }, "2026-11-20"), /Dec 18, 2026|18 Dec 2026/);
  assert.match(ottHint({ release_date: "", ott_date: "" }, "2026-11-20"), /No date known yet/);
  assert.match(ottHint({ release_date: "2026-01-01", ott_date: "" , ott_window_days: "28"}, "2026-11-20"), /has passed/);
});

test("waiting-for-video groups", () => {
  const list = [
    work(1, { stage: "awaiting_video", video: { waiting: true, overdue: false } }),
    work(2, { stage: "awaiting_bgm", video: { waiting: true, overdue: true } }),
    work(3, { video: { waiting: false } }),
    work(4, { video: null }),
  ];
  assert.deepEqual(ids(filterWorks(list, { status: "g:video" })), [1, 2]);
  assert.deepEqual(ids(filterWorks(list, { status: "g:video_overdue" })), [2]);
  assert.deepEqual(ids(filterWorks(list, { status: "awaiting_video" })), [1]);
});
