import test from "node:test";
import assert from "node:assert/strict";
import { buildProductionPlaytestRehearsal, formatRehearsalSummary, REQUIRED_CHECKS } from "./production-playtest-rehearsal.mjs";

test("production playtest rehearsal covers the expected operations gates", () => {
  const ids = REQUIRED_CHECKS.map((check) => check.id);
  assert.deepEqual(ids, [
    "pre-invite-local-proof",
    "render-build-proof",
    "commit-pinned-hosted-smoke",
    "hosted-browser-qa",
    "admin-cleanup",
    "support-intake",
    "storage-recovery",
    "private-boundary"
  ]);
});

test("production playtest rehearsal is public-safe and ready from current docs", () => {
  const report = buildProductionPlaytestRehearsal();
  assert.equal(report.ok, true);
  assert.equal(report.privacyClassification, "public-safe");
  assert.equal(report.rehearsal, "production-playtest");
  assert.ok(report.recommendedCommands.includes("npm.cmd run verify:pre-private"));
  assert.ok(report.recommendedCommands.includes("npm.cmd run render:verify"));
  assert.ok(report.recommendedCommands.includes("npm.cmd run smoke:hosted"));
  assert.ok(report.recommendedCommands.includes("npm.cmd run qa:hosted-browser"));
  assert.equal(report.checks.every((check) => check.status === "ready"), true);
});

test("production playtest rehearsal summary names manual operations work", () => {
  const summary = formatRehearsalSummary(buildProductionPlaytestRehearsal());
  assert.match(summary, /Production Playtest Rehearsal: ready/);
  assert.match(summary, /admin close\/end/);
  assert.match(summary, /stuck-room recovery/);
  assert.match(summary, /public-safe/);
});
