import assert from "node:assert/strict";
import { test } from "node:test";
import { PASSWORD_RULES } from "../src/utils/password.js";
import { ACTION_LABEL, fmtD, fmtDateTime, timeAgo } from "../src/utils/format.js";
import { roleKey } from "../src/utils/cueRules.js";

const passes = (pw) => PASSWORD_RULES.every((r) => r.test(pw));

test("password rules match the server's", () => {
  assert.ok(passes("Abc@12"));
  for (const bad of ["short", "alllower1!", "NoDigits!!", "NoSpecial1"]) assert.ok(!passes(bad), bad);
});

test("audit actions added for Notify Editor have labels", () => {
  for (const a of ["editor_notice", "user_mailbox_connect", "user_mailbox_disconnect", "approve", "reject", "submit"]) {
    assert.ok(ACTION_LABEL[a], a);
  }
});

test("dates tolerate empty and bad values", () => {
  assert.equal(fmtDateTime(null), "");
  assert.equal(fmtDateTime("not a date"), "not a date");
  assert.equal(timeAgo(null), "");
  assert.equal(timeAgo(new Date().toISOString()), "just now");
  assert.equal(timeAgo(new Date(Date.now() - 2 * 3600e3).toISOString()), "2h ago");
});

test("durations", () => {
  assert.equal(fmtD(""), "");
  assert.equal(fmtD("00:01:05"), "00:01:05");
});

test("contributor roles normalise like the server", () => {
  assert.equal(roleKey("composer "), "Composer");
  assert.equal(roleKey("AUTHOR"), "Author");
  assert.equal(roleKey("Publisher"), "Publisher");
});
