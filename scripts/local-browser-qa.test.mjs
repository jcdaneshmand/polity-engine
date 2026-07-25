import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlayerExpectationReport,
  buildBrowserQAConfig,
  evaluateLocalPlaytestStatusExpectations,
  evaluateMultiplayerObserverExpectations,
  evaluatePlayerExpectations,
  evaluatePrivateDataSetupExpectations,
  evaluateRightRailLayoutExpectations,
  evaluateSetupRecoveryExpectations,
  extractDiagnosticPlayer,
  localQASetupData,
  redactBrowserQAResult,
  summarizePlayerExpectationSnapshot,
  workedTurnTraceEntry
} from "./local-browser-qa.mjs";

const diagnosticsPrivacy = {
  privacyClassification: "public-safe",
  redactionMarker: "[private]"
};

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
    privateUploadPreviewChecked: true,
    privateUploadPreview: { fatal: "blocked", applyable: "confirmed" },
    localBoardChecked: true,
    automatedLocalGameplayChecked: true,
    automatedLocalGameplayModes: { practice: { steps: 12 }, solo: { steps: 10 } },
    workedTurnChecked: true,
    workedTurn: { steps: 7 },
    automatedMultiplayerSelfPlayChecked: true,
    automatedMultiplayerSelfPlay: { steps: 8 },
    viewportQaChecked: true,
    viewportQa: ["desktop", "steam-deck", "narrow-tablet", "iphone-portrait", "iphone-landscape"],
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
    privateUploadPreviewChecked: true,
    privateUploadPreview: { fatal: "blocked", applyable: "confirmed" },
    localBoardChecked: true,
    automatedLocalGameplayChecked: true,
    automatedLocalGameplayModes: { practice: { steps: 12 }, solo: { steps: 10 } },
    workedTurnChecked: true,
    workedTurn: { steps: 7 },
    automatedMultiplayerSelfPlayChecked: true,
    automatedMultiplayerSelfPlay: { steps: 8 },
    viewportQaChecked: true,
    viewportQa: ["desktop", "steam-deck", "narrow-tablet", "iphone-portrait", "iphone-landscape"],
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
    bugReportEmailVisible: true,
    bugReportEmailMailto: true,
    currentTaskTitle: "Pending Cleanup Resource",
    enabledActionCount: 0,
    blockedActionCount: 1,
    zoneKindCount: 3,
    ...diagnosticsPrivacy,
    bodyText: "PENDING CLEANUP RESOURCE\nwaiting for player 1"
  }), []);
});

test("evaluateMultiplayerObserverExpectations reports missing diagnostics privacy metadata", () => {
  const issues = evaluateMultiplayerObserverExpectations({
    activePlayerVisible: true,
    viewerPlayerVisible: true,
    diagnosticsVisible: true,
    currentTaskTitle: "Waiting",
    enabledActionCount: 0,
    blockedActionCount: 1,
    zoneKindCount: 3,
    disabledActionWithoutReasonCount: 0,
    bodyText: "waiting for player 1"
  });

  assert.match(issues.join("\n"), /public-safe privacy metadata/);
  assert.match(issues.join("\n"), /private redaction marker/);
});

test("evaluateMultiplayerObserverExpectations reports missing email bug-report helper", () => {
  const issues = evaluateMultiplayerObserverExpectations({
    activePlayerVisible: true,
    viewerPlayerVisible: true,
    diagnosticsVisible: true,
    currentTaskPanelVisible: true,
    gameLogVisible: true,
    playerAidVisible: true,
    bugReportButtonVisible: true,
    bugReportEmailVisible: false,
    bugReportEmailMailto: false,
    currentTaskTitle: "Waiting",
    enabledActionCount: 0,
    blockedActionCount: 1,
    zoneKindCount: 3,
    disabledActionWithoutReasonCount: 0,
    ...diagnosticsPrivacy,
    bodyText: "waiting for player 1"
  });

  assert.match(issues.join("\n"), /email bug-report helper is not visible/);
  assert.match(issues.join("\n"), /email bug-report helper is not a mailto link/);
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
    ...diagnosticsPrivacy,
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
  assert.match(issues.join("\n"), /public-safe privacy metadata/);
  assert.match(issues.join("\n"), /private redaction marker/);
  assert.match(issues.join("\n"), /disabled action/);
  assert.match(issues.join("\n"), /no pending choice/);
  assert.match(issues.join("\n"), /waiting for another player/);
  assert.match(issues.join("\n"), /no enabled choice/);
  assert.match(issues.join("\n"), /End Turn is still enabled/);
  assert.match(issues.join("\n"), /no market card/);
});

test("evaluatePlayerExpectations reports missing email bug-report helper", () => {
  const issues = evaluatePlayerExpectations({
    pendingTitle: undefined,
    enabledChoiceCount: 0,
    validTargetCount: 0,
    enabledReadyActionCount: 1,
    disabledActionWithoutReasonCount: 0,
    endTurnEnabled: true,
    activePlayerVisible: true,
    viewerPlayerVisible: true,
    diagnosticsVisible: true,
    currentTaskPanelVisible: true,
    gameLogVisible: true,
    playerAidVisible: true,
    bugReportButtonVisible: true,
    bugReportEmailVisible: false,
    bugReportEmailMailto: false,
    currentTaskTitle: "Ready",
    enabledActionCount: 1,
    blockedActionCount: 1,
    zoneKindCount: 3,
    zoneKinds: "public-shared market-shared own-private",
    ...diagnosticsPrivacy,
    bodyText: "ACTIVE PLAYER\nPlayer 1\nVIEWER PLAYER\nPlayer 1"
  });

  assert.match(issues.join("\n"), /email bug-report helper is not visible/);
  assert.match(issues.join("\n"), /email bug-report helper is not a mailto link/);
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
    ...diagnosticsPrivacy,
    bodyText: "ACTIVE PLAYER\nPlayer 0\nVIEWER PLAYER\nPlayer 0"
  });

  assert.match(issues.join("\n"), /active engine player/);
  assert.match(issues.join("\n"), /viewer engine player/);
});

test("evaluateSetupRecoveryExpectations accepts empty valid and corrupt recovery states", () => {
  assert.deepEqual(evaluateSetupRecoveryExpectations({
    statusVisible: true,
    saveState: "none",
    saveSource: "none",
    saveMode: "none",
    saveRound: "none",
    importVisible: true
  }), []);

  assert.deepEqual(evaluateSetupRecoveryExpectations({
    statusVisible: true,
    saveState: "valid",
    saveSource: "placeholder",
    saveMode: "practice",
    saveRound: "1",
    importVisible: true,
    resumeVisible: true,
    exportVisible: true,
    discardVisible: true
  }), []);

  assert.deepEqual(evaluateSetupRecoveryExpectations({
    statusVisible: true,
    saveState: "corrupt",
    saveSource: "unknown",
    saveMode: "unknown",
    saveRound: "unknown",
    importVisible: true,
    discardVisible: true,
    corruptReasonVisible: true
  }), []);
});

test("evaluateSetupRecoveryExpectations reports missing recovery affordances", () => {
  const issues = evaluateSetupRecoveryExpectations({
    statusVisible: false,
    saveState: "valid",
    saveSource: "unknown",
    saveMode: "unknown",
    saveRound: "unknown",
    importVisible: false,
    resumeVisible: false,
    exportVisible: false,
    discardVisible: false
  });

  assert.match(issues.join("\n"), /metadata is not visible/);
  assert.match(issues.join("\n"), /Import Saved Game/);
  assert.match(issues.join("\n"), /Resume Saved Game/);
  assert.match(issues.join("\n"), /Export Saved Game/);
  assert.match(issues.join("\n"), /Discard Saved Game/);
  assert.match(issues.join("\n"), /concrete save source/);
  assert.match(issues.join("\n"), /concrete save mode/);
  assert.match(issues.join("\n"), /concrete save round/);
});

test("evaluateLocalPlaytestStatusExpectations routes players to the right next gate", () => {
  assert.deepEqual(evaluateLocalPlaytestStatusExpectations({
    statusVisible: true,
    dataMode: "placeholder",
    hosting: "active",
    nextGate: "private-data-entry",
    nextCommand: "private:status",
    nextGateText: "Run npm run private:status while entering CSVs; import private data when ready."
  }), []);

  assert.deepEqual(evaluateLocalPlaytestStatusExpectations({
    statusVisible: true,
    dataMode: "private",
    hosting: "deferred",
    nextGate: "private-gate",
    nextCommand: "private:status private:gate",
    nextGateText: "Run npm run private:status, then npm run private:gate locally."
  }), []);
});

test("evaluateLocalPlaytestStatusExpectations reports missing next-gate guidance", () => {
  const issues = evaluateLocalPlaytestStatusExpectations({
    statusVisible: false,
    dataMode: "placeholder",
    hosting: "unknown",
    nextGate: "",
    nextGateText: ""
  });

  assert.match(issues.join("\n"), /not visible/);
  assert.match(issues.join("\n"), /unexpected hosting state/);
  assert.match(issues.join("\n"), /unexpected next gate/);
  assert.match(issues.join("\n"), /private data entry/);
  assert.match(issues.join("\n"), /private:status/);
  assert.match(issues.join("\n"), /does not explain/);
});

test("evaluatePrivateDataSetupExpectations accepts coherent setup states", () => {
  assert.deepEqual(evaluatePrivateDataSetupExpectations({
    visible: true,
    state: "empty",
    loaded: "false",
    confirmed: "false",
    previewStatus: "none",
    nextCommand: "private:status"
  }), []);

  assert.deepEqual(evaluatePrivateDataSetupExpectations({
    visible: true,
    state: "preview-fatal",
    loaded: "true",
    confirmed: "false",
    previewStatus: "fatal",
    nextCommand: "private:status",
    readinessIds: ["fatal-free", "cards", "nations", "references"],
    readinessStatuses: ["blocked", "ready", "blocked", "warning"]
  }), []);

  assert.deepEqual(evaluatePrivateDataSetupExpectations({
    visible: true,
    state: "confirmed",
    loaded: "true",
    confirmed: "true",
    previewStatus: "ready",
    nextCommand: "private:status private:gate",
    readinessIds: ["fatal-free", "cards", "nations", "references"],
    readinessStatuses: ["ready", "ready", "ready", "ready"]
  }), []);
});

test("evaluatePrivateDataSetupExpectations reports incoherent setup metadata", () => {
  const issues = evaluatePrivateDataSetupExpectations({
    visible: false,
    state: "empty",
    loaded: "true",
    confirmed: "true",
    previewStatus: "ready",
    nextCommand: ""
  });

  assert.match(issues.join("\n"), /not visible/);
  assert.match(issues.join("\n"), /should not report loaded data/);
  assert.match(issues.join("\n"), /should not report confirmed data/);
  assert.match(issues.join("\n"), /should not report a preview status/);
  assert.match(issues.join("\n"), /private:status/);
});

test("evaluatePrivateDataSetupExpectations requires reference readiness for previews", () => {
  const issues = evaluatePrivateDataSetupExpectations({
    visible: true,
    state: "preview-pending",
    loaded: "true",
    confirmed: "false",
    previewStatus: "warning",
    nextCommand: "private:status",
    readinessIds: ["fatal-free", "cards", "nations"],
    readinessStatuses: ["warning", "ready", "ready"]
  });

  assert.match(issues.join("\n"), /card-reference readiness check/);
});

test("evaluatePrivateDataSetupExpectations reports unexpected readiness statuses", () => {
  const issues = evaluatePrivateDataSetupExpectations({
    visible: true,
    state: "preview-pending",
    loaded: "true",
    confirmed: "false",
    previewStatus: "warning",
    nextCommand: "private:status",
    readinessIds: ["fatal-free", "references"],
    readinessStatuses: ["maybe", "ready"]
  });

  assert.match(issues.join("\n"), /unexpected readiness status/);
});

test("evaluateRightRailLayoutExpectations accepts visible non-overlapping log before aid", () => {
  assert.deepEqual(evaluateRightRailLayoutExpectations({
    gameLogDomIndex: 2,
    playerAidDomIndex: 3,
    gameLogRect: { top: 300, right: 600, bottom: 420, left: 300, width: 300, height: 120 },
    playerAidRect: { top: 428, right: 600, bottom: 620, left: 300, width: 300, height: 192 }
  }), []);
});

test("evaluateRightRailLayoutExpectations reports hidden reordered or overlapping aid/log panels", () => {
  const issues = evaluateRightRailLayoutExpectations({
    gameLogDomIndex: 4,
    playerAidDomIndex: 3,
    gameLogRect: { top: 360, right: 600, bottom: 460, left: 300, width: 300, height: 100 },
    playerAidRect: { top: 340, right: 600, bottom: 430, left: 300, width: 300, height: 90 }
  });

  assert.match(issues.join("\n"), /after the player aid/);
  assert.match(issues.join("\n"), /above the game log/);
  assert.match(issues.join("\n"), /overlaps the game log/);
});

test("summarizePlayerExpectationSnapshot omits raw visible page text", () => {
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
    ...diagnosticsPrivacy,
    bodyText: "Actual Private Card Name".repeat(20)
  });

  assert.equal(summary.mode, "practice");
  assert.equal(summary.pendingTitle, "PENDING CLEANUP RESOURCE");
  assert.equal(summary.validTargetCount, 3);
  assert.equal(summary.zoneKindCount, 4);
  assert.equal(summary.zoneKinds, "public-shared market-shared own-private pending-choice");
  assert.equal(summary.privacyClassification, "public-safe");
  assert.equal(summary.redactionMarker, "[private]");
  assert.equal(summary.bugReportEmailVisible, true);
  assert.equal(summary.bugReportEmailMailto, true);
  assert.equal(summary.visibleTextPolicy, "omitted-public-safe");
  assert.equal(summary.bodyTextLength, "Actual Private Card Name".repeat(20).length);
  assert.equal(JSON.stringify(summary).includes("Actual Private Card Name"), false);
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
      ...diagnosticsPrivacy,
      bodyText: "Private visible board state"
    }
  });

  assert.equal(report.kind, "player-expectation-failure");
  assert.equal(report.label, "before step 2");
  assert.equal(report.mode, "solo");
  assert.deepEqual(report.issues, ["No enabled choice."]);
  assert.deepEqual(report.trace, ["action", "PENDING CLEANUP RESOURCE:resolved"]);
  assert.equal(report.screenshotPath, "C:\\tmp\\qa.png");
  assert.equal(report.snapshot.visibleTextPolicy, "omitted-public-safe");
  assert.equal(JSON.stringify(report).includes("Private visible board state"), false);
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
