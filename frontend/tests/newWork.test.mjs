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
    "awaiting_bgm", "fp_not_assigned", "fp_assigned", "fp_in_progress", "cue_pending", "cue_assigned", "cue_in_progress", "completed", "closed",
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
