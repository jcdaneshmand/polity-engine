import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerExpectationReport,
  buildBrowserQAConfig,
  evaluateMultiplayerObserverExpectations,
  evaluatePlayerExpectations,
  extractDiagnosticPlayer,
  localQASetupData,
  redactBrowserQAResult,
  summarizePlayerExpectationSnapshot,
  workedTurnTraceEntry
} from "./local-browser-qa.mjs";

test("buildBrowserQAConfig uses local defaults", () => {
  const config = buildBrowserQAConfig({});
  assert.equal(config.baseURL, "http://127.0.0.1:8786");
  assert.match(config.storagePath, /local-browser-qa/);
  assert.equal(config.headless, true);
});

test("buildBrowserQAConfig normalizes explicit hosted base URLs", () => {
  const config = buildBrowserQAConfig({ POLITY_BROWSER_QA_BASE_URL: "https://polity-engine.example.com/" });
  assert.equal(config.baseURL, "https://polity-engine.example.com");
});

test("localQASetupData uses public-safe placeholder setup", () => {
  const setup = localQASetupData();
  assert.equal(setup.options.mode, "multiplayer");
  assert.equal(setup.options.playerCount, 2);
  assert.equal(setup.options.commonsSetId, "classics");
  assert.equal(setup.playerNationIds["0"], "test_nation_sun_coast");
});

test("redactBrowserQAResult does not include credentials", () => {
  const redacted = redactBrowserQAResult({
    ok: true,
    lobbyID: "lobby-1",
    matchID: "match-1",
    setupStatusChecked: true,
    localBoardChecked: true,
    automatedLocalGameplayChecked: true,
    automatedLocalGameplayModes: { practice: { steps: 12 }, solo: { steps: 10 } },
    workedTurnChecked: true,
    workedTurn: { steps: 7 },
    automatedMultiplayerSelfPlayChecked: true,
    automatedMultiplayerSelfPlay: { steps: 8 },
    viewportQaChecked: true,
    viewportQa: ["desktop", "steam-deck", "narrow-tablet"],
    saveResumeChecked: true,
    invalidSaveChecked: true,
    noPrivateDebugMarkers: true,
    hostCredentials: "secret-host",
    guestCredentials: "secret-guest"
  });
  assert.deepEqual(redacted, {
    ok: true,
    lobbyID: "lobby-1",
    matchID: "match-1",
    setupStatusChecked: true,
    localBoardChecked: true,
    automatedLocalGameplayChecked: true,
    automatedLocalGameplayModes: { practice: { steps: 12 }, solo: { steps: 10 } },
    workedTurnChecked: true,
    workedTurn: { steps: 7 },
    automatedMultiplayerSelfPlayChecked: true,
    automatedMultiplayerSelfPlay: { steps: 8 },
    viewportQaChecked: true,
    viewportQa: ["desktop", "steam-deck", "narrow-tablet"],
    saveResumeChecked: true,
    invalidSaveChecked: true,
    noPrivateDebugMarkers: true
  });
});

test("extractDiagnosticPlayer reads board diagnostics labels", () => {
  const bodyText = "ACTIVE PLAYER\nPlayer 1\nVIEWER PLAYER\nPlayer 0\n";
  assert.equal(extractDiagnosticPlayer(bodyText, "ACTIVE PLAYER"), "1");
  assert.equal(extractDiagnosticPlayer(bodyText, "VIEWER PLAYER"), "0");
  assert.equal(extractDiagnosticPlayer(bodyText, "MISSING PLAYER"), undefined);
});

test("evaluateMultiplayerObserverExpectations allows inactive waiting views", () => {
  assert.deepEqual(evaluateMultiplayerObserverExpectations({
    pendingTitle: "PENDING CLEANUP RESOURCE",
    enabledChoiceCount: 0,
    validTargetCount: 0,
    enabledReadyActionCount: 0,
    disabledActionWithoutReasonCount: 0,
    endTurnEnabled: false,
    activePlayerVisible: true,
    viewerPlayerVisible: true,
    diagnosticsVisible: true,
    currentTaskTitle: "Pending Cleanup Resource",
    enabledActionCount: 0,
    blockedActionCount: 1,
    zoneKindCount: 3,
    bodyText: "PENDING CLEANUP RESOURCE\nwaiting for player 1"
  }), []);
});

test("evaluatePlayerExpectations accepts a resolvable pending choice", () => {
  assert.deepEqual(evaluatePlayerExpectations({
    pendingTitle: "PENDING CLEANUP RESOURCE",
    enabledChoiceCount: 1,
    validTargetCount: 1,
    enabledReadyActionCount: 0,
    disabledActionWithoutReasonCount: 0,
    endTurnEnabled: false,
    activePlayerVisible: true,
    viewerPlayerVisible: true,
    diagnosticsVisible: true,
    currentTaskTitle: "Pending Cleanup Resource",
    enabledActionCount: 1,
    blockedActionCount: 1,
    zoneKindCount: 3,
    zoneKinds: "public-shared market-shared own-private",
    bodyText: "PENDING CLEANUP RESOURCE\nPlace cleanup resource on Market1"
  }), []);
});

test("evaluatePlayerExpectations reports player-facing stalls", () => {
  const issues = evaluatePlayerExpectations({
    pendingTitle: "PENDING CLEANUP RESOURCE",
    enabledChoiceCount: 0,
    validTargetCount: 0,
    enabledReadyActionCount: 0,
    disabledActionWithoutReasonCount: 1,
    endTurnEnabled: true,
    activePlayerVisible: false,
    viewerPlayerVisible: false,
    diagnosticsVisible: false,
    currentTaskTitle: "",
    enabledActionCount: 0,
    blockedActionCount: 0,
    zoneKindCount: 0,
    zoneKinds: "",
    bodyText: "PENDING CLEANUP RESOURCE\nNo pending choice\nwaiting for player 1"
  });

  assert.match(issues.join("\n"), /active player status/);
  assert.match(issues.join("\n"), /viewer player status/);
  assert.match(issues.join("\n"), /Playtest diagnostics/);
  assert.match(issues.join("\n"), /current-task metadata/);
  assert.match(issues.join("\n"), /rule action metadata/);
  assert.match(issues.join("\n"), /zone hierarchy metadata/);
  assert.match(issues.join("\n"), /disabled action/);
  assert.match(issues.join("\n"), /no pending choice/);
  assert.match(issues.join("\n"), /waiting for another player/);
  assert.match(issues.join("\n"), /no enabled choice/);
  assert.match(issues.join("\n"), /End Turn is still enabled/);
  assert.match(issues.join("\n"), /no market card/);
});

test("evaluatePlayerExpectations reports solo seat identity leaks", () => {
  const issues = evaluatePlayerExpectations({
    mode: "solo",
    pendingTitle: undefined,
    enabledChoiceCount: 0,
    validTargetCount: 0,
    enabledReadyActionCount: 1,
    disabledActionWithoutReasonCount: 0,
    endTurnEnabled: true,
    activePlayerVisible: true,
    viewerPlayerVisible: true,
    diagnosticsVisible: true,
    currentTaskTitle: "Ready",
    enabledActionCount: 1,
    blockedActionCount: 1,
    zoneKindCount: 3,
    zoneKinds: "public-shared market-shared own-private",
    bodyText: "ACTIVE PLAYER\nPlayer 0\nVIEWER PLAYER\nPlayer 0"
  });

  assert.match(issues.join("\n"), /active engine player/);
  assert.match(issues.join("\n"), /viewer engine player/);
});

test("summarizePlayerExpectationSnapshot keeps compact player-facing state", () => {
  const summary = summarizePlayerExpectationSnapshot({
    mode: "practice",
    pendingTitle: "PENDING CLEANUP RESOURCE",
    enabledChoiceCount: 0,
    enabledReadyActionCount: 1,
    disabledActionWithoutReasonCount: 2,
    validTargetCount: 3,
    endTurnEnabled: false,
    activePlayerVisible: true,
    viewerPlayerVisible: true,
    diagnosticsVisible: true,
    currentTaskTitle: "Pending Cleanup Resource",
    enabledActionCount: 1,
    blockedActionCount: 1,
    zoneKindCount: 4,
    zoneKinds: "public-shared market-shared own-private pending-choice",
    bodyText: "A".repeat(3200)
  });

  assert.equal(summary.mode, "practice");
  assert.equal(summary.pendingTitle, "PENDING CLEANUP RESOURCE");
  assert.equal(summary.validTargetCount, 3);
  assert.equal(summary.zoneKindCount, 4);
  assert.equal(summary.zoneKinds, "public-shared market-shared own-private pending-choice");
  assert.ok(summary.bodyExcerpt.length < 3100);
  assert.match(summary.bodyExcerpt, /\.\.\.$/);
});

test("buildPlayerExpectationReport captures issues trace and screenshot path", () => {
  const report = buildPlayerExpectationReport({
    label: "before step 2",
    mode: "solo",
    issues: ["No enabled choice."],
    trace: ["action", "PENDING CLEANUP RESOURCE:resolved"],
    screenshotPath: "C:\\tmp\\qa.png",
    snapshot: {
      mode: "solo",
      pendingTitle: undefined,
      enabledChoiceCount: 0,
      validTargetCount: 0,
      enabledReadyActionCount: 0,
      disabledActionWithoutReasonCount: 0,
      endTurnEnabled: false,
      activePlayerVisible: true,
      viewerPlayerVisible: true,
      diagnosticsVisible: true,
      currentTaskTitle: "Ready",
      enabledActionCount: 1,
      blockedActionCount: 1,
      zoneKindCount: 3,
      zoneKinds: "public-shared market-shared own-private",
      bodyText: "board state"
    }
  });

  assert.equal(report.kind, "player-expectation-failure");
  assert.equal(report.label, "before step 2");
  assert.equal(report.mode, "solo");
  assert.deepEqual(report.issues, ["No enabled choice."]);
  assert.deepEqual(report.trace, ["action", "PENDING CLEANUP RESOURCE:resolved"]);
  assert.equal(report.screenshotPath, "C:\\tmp\\qa.png");
  assert.equal(report.snapshot.bodyExcerpt, "board state");
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("workedTurnTraceEntry creates public-safe structured trace entries", () => {
  assert.deepEqual(workedTurnTraceEntry("step", {
    step: 2,
    pendingBefore: "PENDING CLEANUP RESOURCE",
    pendingAfter: undefined,
    currentTaskTitle: "Ready"
  }), {
    kind: "step",
    step: 2,
    pendingBefore: "PENDING CLEANUP RESOURCE",
    pendingAfter: undefined,
    currentTaskTitle: "Ready"
  });
});
