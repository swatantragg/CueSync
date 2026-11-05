import assert from "node:assert/strict";
import { test } from "node:test";
import { APP_VERSION, CHANGELOG, whatsNewFor } from "../src/constants/version.js";

const titles = (role, seen) => whatsNewFor(role, seen).map((c) => c.title);

test("every changelog entry says which release and who it is for", () => {
  for (const c of CHANGELOG) {
    assert.match(c.version, /^\d+\.\d+\.\d+$/, c.title);
    assert.ok(Array.isArray(c.roles), c.title);
    assert.ok(c.title && c.body, "needs a title and body");
  }
});

test("the newest changelog version is the app version", () => {
  assert.ok(CHANGELOG.some((c) => c.version === APP_VERSION));
});

test("nobody sees a popup once they have seen this version", () => {
  for (const role of ["admin", "work_delegator", "reviewer", "editor", "viewer"]) {
    assert.deepEqual(whatsNewFor(role, APP_VERSION), []);
  }
});

test("each role sees only its own changes", () => {
  const prev = "4.1.1";
  assert.ok(titles("editor", prev).includes("Your Dashboard"));
  assert.ok(!titles("editor", prev).includes("Notify an editor by email"));
  assert.ok(titles("work_delegator", prev).includes("Notify an editor by email"));
  assert.ok(!titles("work_delegator", prev).includes("Your Dashboard"));
  assert.ok(titles("reviewer", prev).includes("Activity calendar on your Dashboard"));
  assert.ok(!titles("reviewer", prev).includes("Your Dashboard"));
});

test("admin sees everything in the release", () => {
  assert.equal(whatsNewFor("admin", "4.1.1").length, CHANGELOG.filter((c) => c.version === "4.1.2").length);
});

test("a change for one role leaves other roles without a popup", () => {
  CHANGELOG.unshift({ version: "9.9.9", roles: ["editor"], title: "Only editors", body: "x" });
  try {
    assert.deepEqual(titles("editor", APP_VERSION), ["Only editors"]);
    assert.deepEqual(whatsNewFor("reviewer", APP_VERSION), []);
    assert.deepEqual(titles("admin", APP_VERSION), ["Only editors"]);
  } finally { CHANGELOG.shift(); }
});

test("first sign-in shows this release only, skipped releases catch up", () => {
  assert.ok(whatsNewFor("reviewer", null).every((c) => c.version === APP_VERSION));
  assert.ok(titles("reviewer", "4.0.2").includes("Pending review on the Reviewer Dashboard"));
});

test("versions compare as numbers, not text", () => {
  CHANGELOG.unshift({ version: "4.1.10", roles: [], title: "Ten", body: "x" });
  try { assert.ok(titles("admin", "4.1.9").includes("Ten")); } finally { CHANGELOG.shift(); }
});
