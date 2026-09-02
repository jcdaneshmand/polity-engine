import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requireFromWorkspace = createRequire(new URL("../imperium-like-digital-prototype/package.json", import.meta.url));
const { chromium } = requireFromWorkspace("playwright");

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export function buildBrowserQAConfig(env = process.env) {
  const port = Number(env.POLITY_BROWSER_QA_PORT ?? "8786");
  if (!Number.isInteger(port) || port <= 0) throw new Error("POLITY_BROWSER_QA_PORT must be a positive integer.");
  const baseURL = (env.POLITY_BROWSER_QA_BASE_URL ?? `http://127.0.0.1:${port}`).replace(/\/+$/, "");
  return {
    port,
    baseURL,
    storagePath: env.POLITY_BROWSER_QA_STORAGE_PATH ?? resolve("tmp", "local-browser-qa", `storage-${Date.now()}`),
    headless: env.POLITY_BROWSER_QA_HEADLESS !== "false"
  };
}

export function localQASetupData() {
  return {
    options: {
      playerCount: 2,
      mode: "multiplayer",
      commonsSetId: "classics",
      enabledExpansions: [],
      enabledVariants: []
    },
    playerNationIds: {
      "0": "test_nation_sun_coast",
      "1": "test_nation_sun_coast"
    }
  };
}

export function redactBrowserQAResult(result) {
  const redacted = {
    ok: result.ok,
    lobbyID: result.lobbyID,
    matchID: result.matchID,
    setupStatusChecked: result.setupStatusChecked,
    privateUploadPreviewChecked: result.privateUploadPreviewChecked,
    privateUploadPreview: result.privateUploadPreview,
    localBoardChecked: result.localBoardChecked,
    automatedLocalGameplayChecked: result.automatedLocalGameplayChecked,
    automatedLocalGameplayModes: result.automatedLocalGameplayModes,
    automatedMultiplayerSelfPlayChecked: result.automatedMultiplayerSelfPlayChecked,
    automatedMultiplayerSelfPlay: result.automatedMultiplayerSelfPlay,
    workedTurnChecked: result.workedTurnChecked,
    workedTurn: result.workedTurn,
    viewportQaChecked: result.viewportQaChecked,
    viewportQa: result.viewportQa,
    saveResumeChecked: result.saveResumeChecked,
    invalidSaveChecked: result.invalidSaveChecked,
    noPrivateDebugMarkers: result.noPrivateDebugMarkers
  };
  if (result.customCommonsSetupChecked !== undefined) redacted.customCommonsSetupChecked = result.customCommonsSetupChecked;
  if (result.customCommonsSetup !== undefined) redacted.customCommonsSetup = result.customCommonsSetup;
  return redacted;
}

export function evaluatePlayerExpectations(snapshot) {
  const issues = [];
  const pending = snapshot.pendingTitle;
  const enabledChoiceCount = Number(snapshot.enabledChoiceCount ?? 0);
  const validTargetCount = Number(snapshot.validTargetCount ?? 0);
  const enabledReadyActionCount = Number(snapshot.enabledReadyActionCount ?? 0);
  const endTurnEnabled = Boolean(snapshot.endTurnEnabled);
  const disabledActionWithoutReasonCount = Number(snapshot.disabledActionWithoutReasonCount ?? 0);
  const activePlayerVisible = snapshot.activePlayerVisible !== false;
  const viewerPlayerVisible = snapshot.viewerPlayerVisible !== false;
  const diagnosticsVisible = snapshot.diagnosticsVisible !== false;
  const currentTaskPanelVisible = snapshot.currentTaskPanelVisible !== false;
  const gameLogVisible = snapshot.gameLogVisible !== false;
  const playerAidVisible = snapshot.playerAidVisible !== false;
  const bugReportButtonVisible = snapshot.bugReportButtonVisible !== false;
  const bugReportEmailVisible = snapshot.bugReportEmailVisible !== false;
  const bugReportEmailMailto = snapshot.bugReportEmailMailto !== false;
  const currentTaskTitle = String(snapshot.currentTaskTitle ?? "");
  const enabledActionCount = Number(snapshot.enabledActionCount ?? 0);
  const blockedActionCount = Number(snapshot.blockedActionCount ?? 0);
  const zoneKindCount = Number(snapshot.zoneKindCount ?? 0);
  const zoneKinds = String(snapshot.zoneKinds ?? "");
  const privacyClassification = String(snapshot.privacyClassification ?? "");
  const redactionMarker = String(snapshot.redactionMarker ?? "");
  const bodyText = String(snapshot.bodyText ?? "");
  const mode = snapshot.mode;

  if (bodyText.includes("InvalidMove(")) issues.push("The visible log contains InvalidMove.");
  if (!activePlayerVisible) issues.push("The active player status is not visible.");
  if (!viewerPlayerVisible) issues.push("The viewer player status is not visible.");
  if (!diagnosticsVisible) issues.push("Playtest diagnostics are not visible.");
  if (!currentTaskPanelVisible) issues.push("The current-task panel is not visible.");
  if (!gameLogVisible) issues.push("The game log is not visible.");
  if (!playerAidVisible) issues.push("The player aid is not visible.");
  if (!bugReportButtonVisible) issues.push("The bug-report summary button is not visible.");
  if (!bugReportEmailVisible) issues.push("The email bug-report helper is not visible.");
  if (!bugReportEmailMailto) issues.push("The email bug-report helper is not a mailto link.");
  if (!currentTaskTitle) issues.push("Playtest diagnostics do not expose current-task metadata.");
  if (enabledActionCount + blockedActionCount === 0) issues.push("Playtest diagnostics do not expose rule action metadata.");
  if (zoneKindCount === 0 || !zoneKinds.includes("public-shared") || !zoneKinds.includes("market-shared") || !zoneKinds.includes("own-private")) {
    issues.push("Playtest diagnostics do not expose board zone hierarchy metadata.");
  }
  if (privacyClassification !== "public-safe") issues.push("Playtest diagnostics do not expose public-safe privacy metadata.");
  if (redactionMarker !== "[private]") issues.push("Playtest diagnostics do not expose the private redaction marker.");
  if (disabledActionWithoutReasonCount > 0) issues.push(`${disabledActionWithoutReasonCount} disabled action button(s) have no visible or tooltip reason.`);
  if (pending && bodyText.includes("No pending choice")) issues.push(`${pending} is visible while the UI also says there is no pending choice.`);
  if (pending && /waiting for player/i.test(bodyText)) issues.push(`${pending} is waiting for another player in the active player's local view.`);
  if (pending && enabledChoiceCount + validTargetCount === 0) issues.push(`${pending} has no enabled choice button or valid clickable target.`);
  if (pending && endTurnEnabled) issues.push(`${pending} is visible, but End Turn is still enabled.`);
  if (!pending && enabledReadyActionCount === 0 && !endTurnEnabled) issues.push("No pending choice is visible, but the player has no enabled action or End Turn.");
  if (pending === "PENDING CLEANUP RESOURCE" && validTargetCount === 0) issues.push("Cleanup resource is pending, but no market card is marked as a valid target.");
  if (pending === "PENDING CLEANUP RESOURCE" && !bodyText.includes("Place cleanup resource")) issues.push("Cleanup resource is pending, but no place-resource action is visible.");
  if (pending === "PENDING CLEANUP DISCARD" && !bodyText.includes("Keep Hand")) issues.push("Cleanup discard is pending, but Keep Hand is not visible.");
  if (mode === "solo" && /ACTIVE PLAYER\s+Player 0/i.test(bodyText)) issues.push("Solo local view is showing Player 0 as the active engine player.");
  if (mode === "solo" && /VIEWER PLAYER\s+Player 0/i.test(bodyText)) issues.push("Solo local view is showing Player 0 as the viewer engine player.");

  return issues;
}

export function evaluateSetupRecoveryExpectations(snapshot) {
  const issues = [];
  const saveState = String(snapshot.saveState ?? "");
  const saveSource = String(snapshot.saveSource ?? "");
  const saveMode = String(snapshot.saveMode ?? "");
  const saveRound = String(snapshot.saveRound ?? "");
  const importVisible = snapshot.importVisible !== false;
  const resumeVisible = snapshot.resumeVisible === true;
  const exportVisible = snapshot.exportVisible === true;
  const discardVisible = snapshot.discardVisible === true;
  const corruptReasonVisible = snapshot.corruptReasonVisible === true;

  if (!snapshot.statusVisible) issues.push("Saved-game recovery status metadata is not visible.");
  if (!["none", "valid", "corrupt"].includes(saveState)) issues.push(`Saved-game recovery exposes an unexpected save state: ${saveState || "missing"}.`);
  if (!importVisible) issues.push("Saved-game recovery does not expose Import Saved Game.");

  if (saveState === "none") {
    if (saveSource !== "none" || saveMode !== "none" || saveRound !== "none") {
      issues.push("Empty saved-game recovery metadata must use none source/mode/round values.");
    }
  } else if (saveState === "valid") {
    if (!resumeVisible) issues.push("Valid saved-game recovery does not expose Resume Saved Game.");
    if (!exportVisible) issues.push("Valid saved-game recovery does not expose Export Saved Game.");
    if (!discardVisible) issues.push("Valid saved-game recovery does not expose Discard Saved Game.");
    if (!saveSource || saveSource === "unknown") issues.push("Valid saved-game recovery does not expose a concrete save source.");
    if (!saveMode || saveMode === "unknown") issues.push("Valid saved-game recovery does not expose a concrete save mode.");
    if (!saveRound || saveRound === "unknown") issues.push("Valid saved-game recovery does not expose a concrete save round.");
  } else if (saveState === "corrupt") {
    if (!discardVisible) issues.push("Corrupt saved-game recovery does not expose Discard Saved Game.");
    if (!corruptReasonVisible) issues.push("Corrupt saved-game recovery does not show a public-safe failure reason.");
    if (saveSource !== "unknown" || saveMode !== "unknown" || saveRound !== "unknown") {
      issues.push("Corrupt saved-game recovery metadata must use unknown source/mode/round values.");
    }
  }

  return issues;
}

export function evaluateLocalPlaytestStatusExpectations(snapshot) {
  const issues = [];
  const dataMode = String(snapshot.dataMode ?? "");
  const hosting = String(snapshot.hosting ?? "");
  const nextGate = String(snapshot.nextGate ?? "");
  const nextCommand = String(snapshot.nextCommand ?? "");
  const nextGateText = String(snapshot.nextGateText ?? "");

  if (!snapshot.statusVisible) issues.push("Local playtest status is not visible.");
  if (!["placeholder", "private"].includes(dataMode)) issues.push(`Local playtest status exposes an unexpected data mode: ${dataMode || "missing"}.`);
  if (!["active", "deferred"].includes(hosting)) issues.push(`Local playtest status exposes an unexpected hosting state: ${hosting || "missing"}.`);
  if (!["private-data-entry", "private-gate"].includes(nextGate)) issues.push(`Local playtest status exposes an unexpected next gate: ${nextGate || "missing"}.`);
  if (dataMode === "placeholder" && nextGate !== "private-data-entry") issues.push("Placeholder setup should point players at private data entry.");
  if (dataMode === "private" && nextGate !== "private-gate") issues.push("Private-data setup should point players at private:gate.");
  if (!nextCommand.includes("private:status")) issues.push("Local playtest status should point players at private:status before stricter private checks.");
  if (dataMode === "private" && !nextCommand.includes("private:gate")) issues.push("Private-data setup should include private:gate as the strict local proof command.");
  if (!nextGateText.trim()) issues.push("Local playtest status does not explain the next gate.");
  if (!nextGateText.includes("private:status")) issues.push("Local playtest status text does not explain the private:status progress check.");

  return issues;
}

export function evaluatePrivateDataSetupExpectations(snapshot) {
  const issues = [];
  const state = String(snapshot.state ?? "");
  const loaded = String(snapshot.loaded ?? "");
  const confirmed = String(snapshot.confirmed ?? "");
  const previewStatus = String(snapshot.previewStatus ?? "");
  const nextCommand = String(snapshot.nextCommand ?? "");
  const readinessIds = Array.isArray(snapshot.readinessIds) ? snapshot.readinessIds.map(String) : [];
  const readinessStatuses = Array.isArray(snapshot.readinessStatuses) ? snapshot.readinessStatuses.map(String) : [];

  if (!snapshot.visible) issues.push("Private-data setup diagnostics are not visible.");
  if (!["empty", "preview-fatal", "preview-pending", "confirmed"].includes(state)) issues.push(`Private-data setup exposes an unexpected state: ${state || "missing"}.`);
  if (!["true", "false"].includes(loaded)) issues.push(`Private-data setup exposes an unexpected loaded flag: ${loaded || "missing"}.`);
  if (!["true", "false"].includes(confirmed)) issues.push(`Private-data setup exposes an unexpected confirmed flag: ${confirmed || "missing"}.`);
  if (!["none", "empty", "fatal", "warning", "ready"].includes(previewStatus)) issues.push(`Private-data setup exposes an unexpected preview status: ${previewStatus || "missing"}.`);
  if (!nextCommand.includes("private:status")) issues.push("Private-data setup should expose private:status as the next public-safe workspace check.");
  if (readinessStatuses.some((status) => !["ready", "warning", "blocked"].includes(status))) {
    issues.push("Private-data setup exposes an unexpected readiness status.");
  }

  if (state === "empty") {
    if (loaded !== "false") issues.push("Empty private-data setup should not report loaded data.");
    if (confirmed !== "false") issues.push("Empty private-data setup should not report confirmed data.");
    if (previewStatus !== "none") issues.push("Empty private-data setup should not report a preview status.");
    if (readinessIds.length > 0) issues.push("Empty private-data setup should not show dry-run readiness checks.");
  } else if (state === "confirmed") {
    if (loaded !== "true") issues.push("Confirmed private-data setup should report loaded data.");
    if (confirmed !== "true") issues.push("Confirmed private-data setup should report confirmed data.");
    if (!nextCommand.includes("private:gate")) issues.push("Confirmed private-data setup should expose private:gate as the strict local proof command.");
  } else {
    if (loaded !== "true") issues.push("Preview private-data setup should report loaded data.");
    if (confirmed !== "false") issues.push("Preview private-data setup should not report confirmed data.");
    if (!readinessIds.includes("references")) issues.push("Private-data dry-run preview is missing the card-reference readiness check.");
  }

  return issues;
}

function rectsOverlap(first, second) {
  if (!first || !second) return false;
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

export function evaluateRightRailLayoutExpectations(snapshot) {
  const issues = [];
  const logRect = snapshot.gameLogRect;
  const aidRect = snapshot.playerAidRect;
  if (!logRect || logRect.width <= 0 || logRect.height <= 0) issues.push("Game log geometry is not visible.");
  if (!aidRect || aidRect.width <= 0 || aidRect.height <= 0) issues.push("Player aid geometry is not visible.");
  if (!logRect || !aidRect) return issues;
  if (snapshot.gameLogDomIndex >= 0 && snapshot.playerAidDomIndex >= 0 && snapshot.gameLogDomIndex > snapshot.playerAidDomIndex) {
    issues.push("Game log appears after the player aid in right-rail DOM order.");
  }
  if (aidRect.top < logRect.top - 1) issues.push("Player aid is positioned above the game log.");
  if (rectsOverlap(logRect, aidRect)) issues.push("Player aid overlaps the game log.");
  return issues;
}

function slugifyLabel(label) {
  return String(label ?? "player-expectation")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "player-expectation";
}

export function summarizePlayerExpectationSnapshot(snapshot) {
  return {
    mode: snapshot.mode,
    pendingTitle: snapshot.pendingTitle,
    enabledChoiceCount: Number(snapshot.enabledChoiceCount ?? 0),
    enabledReadyActionCount: Number(snapshot.enabledReadyActionCount ?? 0),
    disabledActionWithoutReasonCount: Number(snapshot.disabledActionWithoutReasonCount ?? 0),
    validTargetCount: Number(snapshot.validTargetCount ?? 0),
    endTurnEnabled: Boolean(snapshot.endTurnEnabled),
    activePlayerVisible: snapshot.activePlayerVisible !== false,
    viewerPlayerVisible: snapshot.viewerPlayerVisible !== false,
    diagnosticsVisible: snapshot.diagnosticsVisible !== false,
    currentTaskPanelVisible: snapshot.currentTaskPanelVisible !== false,
    gameLogVisible: snapshot.gameLogVisible !== false,
    playerAidVisible: snapshot.playerAidVisible !== false,
    bugReportButtonVisible: snapshot.bugReportButtonVisible !== false,
    bugReportEmailVisible: snapshot.bugReportEmailVisible !== false,
    bugReportEmailMailto: snapshot.bugReportEmailMailto !== false,
    currentTaskTitle: snapshot.currentTaskTitle,
    enabledActionCount: Number(snapshot.enabledActionCount ?? 0),
    blockedActionCount: Number(snapshot.blockedActionCount ?? 0),
    zoneKindCount: Number(snapshot.zoneKindCount ?? 0),
    zoneKinds: snapshot.zoneKinds,
    privacyClassification: snapshot.privacyClassification,
    redactionMarker: snapshot.redactionMarker,
    visibleTextPolicy: "omitted-public-safe",
    bodyTextLength: String(snapshot.bodyText ?? "").length
  };
}

export function buildPlayerExpectationReport({ label, mode, issues, trace, snapshot, screenshotPath }) {
  return {
    kind: "player-expectation-failure",
    label,
    mode,
    generatedAt: new Date().toISOString(),
    issues,
    trace,
    screenshotPath,
    snapshot: summarizePlayerExpectationSnapshot(snapshot)
  };
}

export function extractDiagnosticPlayer(bodyText, label) {
  const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(bodyText ?? "").match(new RegExp(`${escapedLabel}\\s+Player\\s+(\\d+)`, "i"));
  return match?.[1];
}

export function evaluateMultiplayerObserverExpectations(snapshot) {
  const issues = [];
  const bodyText = String(snapshot.bodyText ?? "");
  if (bodyText.includes("InvalidMove(")) issues.push("The visible log contains InvalidMove.");
  if (snapshot.activePlayerVisible === false) issues.push("The active player status is not visible.");
  if (snapshot.viewerPlayerVisible === false) issues.push("The viewer player status is not visible.");
  if (snapshot.diagnosticsVisible === false) issues.push("Playtest diagnostics are not visible.");
  if (snapshot.currentTaskPanelVisible === false) issues.push("The current-task panel is not visible.");
  if (snapshot.gameLogVisible === false) issues.push("The game log is not visible.");
  if (snapshot.playerAidVisible === false) issues.push("The player aid is not visible.");
  if (snapshot.bugReportButtonVisible === false) issues.push("The bug-report summary button is not visible.");
  if (snapshot.bugReportEmailVisible === false) issues.push("The email bug-report helper is not visible.");
  if (snapshot.bugReportEmailMailto === false) issues.push("The email bug-report helper is not a mailto link.");
  if (!snapshot.currentTaskTitle) issues.push("Playtest diagnostics do not expose current-task metadata.");
  if (Number(snapshot.enabledActionCount ?? 0) + Number(snapshot.blockedActionCount ?? 0) === 0) issues.push("Playtest diagnostics do not expose rule action metadata.");
  if (Number(snapshot.zoneKindCount ?? 0) === 0) issues.push("Playtest diagnostics do not expose board zone hierarchy metadata.");
  if (snapshot.privacyClassification !== "public-safe") issues.push("Playtest diagnostics do not expose public-safe privacy metadata.");
  if (snapshot.redactionMarker !== "[private]") issues.push("Playtest diagnostics do not expose the private redaction marker.");
  if (Number(snapshot.disabledActionWithoutReasonCount ?? 0) > 0) issues.push(`${snapshot.disabledActionWithoutReasonCount} disabled action button(s) have no visible or tooltip reason.`);
  return issues;
}

async function waitForHTTP(url, timeoutMs = 30_000) {
  const startedAt = Date.now();
  let lastError = "unreachable";
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      lastError = `${response.status} ${response.statusText}`;
      if (response.ok) return response;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolveSleep) => setTimeout(resolveSleep, 250));
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function postJSON(baseURL, path, body) {
  const response = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
  return await response.json();
}

function serverCommand() {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", `${npmCommand()} run server:dev`] }
    : { command: npmCommand(), args: ["run", "server:dev"] };
}

function buildAppForBrowserQA() {
  const command = process.platform === "win32" ? "cmd.exe" : npmCommand();
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", npmCommand(), "run", "build", "-w", "app"]
    : ["run", "build", "-w", "app"];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: { ...process.env, VITE_SHOW_PRIVATE_CARD_DEBUG: "false" },
    stdio: "pipe",
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`App build failed before browser QA.\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim());
  }
}

function buildServerEnv(config) {
  const childEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (process.platform === "win32" && key !== "Path" && key.toLowerCase() === "path") continue;
    childEnv[key] = value;
  }
  return {
    ...childEnv,
    POLITY_SERVER_PORT: String(config.port),
    POLITY_STORAGE_PATH: config.storagePath,
    VITE_SHOW_PRIVATE_CARD_DEBUG: "false"
  };
}

function startServer(config) {
  const command = serverCommand();
  const child = spawn(command.command, command.args, {
    cwd: process.cwd(),
    env: buildServerEnv(config),
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => logs.push(chunk));
  child.stderr.on("data", (chunk) => logs.push(chunk));
  return { child, logs, port: config.port };
}

function listenerPidForPort(port) {
  if (process.platform !== "win32") return undefined;
  const result = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  if (result.status !== 0) return undefined;
  const listenLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.includes(`:${port}`) && line.includes("LISTENING"));
  const pid = listenLine?.trim().split(/\s+/).at(-1);
  return pid && /^\d+$/.test(pid) ? pid : undefined;
}

function stopWindowsPid(pid) {
  spawnSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    `Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`
  ], { stdio: "ignore" });
}

async function stopServer(running) {
  if (!running?.child || running.child.killed) return;
  const waitForExit = new Promise((resolveWait) => {
    const timeout = setTimeout(resolveWait, 5_000);
    running.child.once("exit", () => {
      clearTimeout(timeout);
      resolveWait();
    });
    running.child.once("close", () => {
      clearTimeout(timeout);
      resolveWait();
    });
  });
  if (process.platform === "win32") {
    running.child.kill();
    const listenerPid = listenerPidForPort(running.port);
    if (listenerPid) stopWindowsPid(listenerPid);
    await waitForExit;
    running.child.stdout.destroy();
    running.child.stderr.destroy();
    return;
  }
  running.child.kill("SIGTERM");
  await waitForExit;
}

function shouldStartServer(config) {
  return config.baseURL === `http://127.0.0.1:${config.port}` || config.baseURL === `http://localhost:${config.port}`;
}

function logTail(running) {
  return running?.logs?.join("").split(/\r?\n/).slice(-40).join("\n") ?? "";
}

async function assertNoPrivateDebugMarkers(page) {
  const bodyText = await page.locator("body").innerText();
  for (const marker of ["rawEffectTextPrivate", "privateName"]) {
    if (bodyText.includes(marker)) throw new Error(`Private debug marker is visible: ${marker}`);
  }
}

async function setupRecoverySnapshot(page) {
  const status = page.locator('[data-qa="saved-local-game-status"]');
  const statusVisible = await status.isVisible().catch(() => false);
  const bodyText = await page.locator("body").innerText();
  return {
    statusVisible,
    saveState: await status.getAttribute("data-save-state").catch(() => undefined),
    saveSource: await status.getAttribute("data-save-source").catch(() => undefined),
    saveMode: await status.getAttribute("data-save-mode").catch(() => undefined),
    saveRound: await status.getAttribute("data-save-round").catch(() => undefined),
    importVisible: await page.getByText("Import Saved Game").isVisible().catch(() => false),
    resumeVisible: await page.getByRole("button", { name: "Resume Saved Game" }).isVisible().catch(() => false),
    exportVisible: await page.getByRole("button", { name: "Export Saved Game" }).isVisible().catch(() => false),
    discardVisible: await page.getByRole("button", { name: "Discard Saved Game" }).isVisible().catch(() => false),
    corruptReasonVisible: /Saved local game could not be loaded\.\s+\S/.test(bodyText)
  };
}

async function assertSetupRecoveryExpectations(page, label) {
  const snapshot = await setupRecoverySnapshot(page);
  const issues = evaluateSetupRecoveryExpectations(snapshot);
  if (issues.length > 0) throw new Error(`Setup recovery expectation failed at ${label}.\n- ${issues.join("\n- ")}`);
  return snapshot;
}

async function privateDataSetupSnapshot(page) {
  const setup = page.locator('[data-qa="private-data-setup"]');
  const readinessItems = page.locator('[data-qa="private-data-readiness-item"]');
  return {
    visible: await setup.isVisible().catch(() => false),
    state: await setup.getAttribute("data-private-data-state").catch(() => undefined),
    loaded: await setup.getAttribute("data-private-data-loaded").catch(() => undefined),
    confirmed: await setup.getAttribute("data-private-data-confirmed").catch(() => undefined),
    previewStatus: await setup.getAttribute("data-private-data-preview-status").catch(() => undefined),
    nextCommand: await setup.getAttribute("data-private-data-next-command").catch(() => undefined),
    readinessIds: await readinessItems.evaluateAll((items) => items.map((item) => item.getAttribute("data-readiness-id") ?? "")).catch(() => []),
    readinessStatuses: await readinessItems.evaluateAll((items) => items.map((item) => item.getAttribute("data-readiness-status") ?? "")).catch(() => [])
  };
}

async function assertPrivateDataSetupExpectations(page, label) {
  const snapshot = await privateDataSetupSnapshot(page);
  const issues = evaluatePrivateDataSetupExpectations(snapshot);
  if (issues.length > 0) throw new Error(`Private-data setup expectation failed at ${label}.\n- ${issues.join("\n- ")}`);
  return snapshot;
}

async function assertFatalPrivateUploadPreview(page) {
  const uploadDir = await mkdtemp(join(tmpdir(), "polity-private-upload-"));
  try {
    const uploadPath = join(uploadDir, "imperium_cards_private.csv");
    await writeFile(uploadPath, [
      "card_id,public_placeholder_name,suit,card_type,starting_location,vp_mode,implemented,tested",
      "bad-card,Bad Card,not_a_suit,action,draw_deck,none,true,false"
    ].join("\n"), "utf8");

    await page.getByLabel("Upload JSON or CSV files").setInputFiles(uploadPath);
    const preview = page.locator('[data-qa="private-data-dry-run"]');
    await preview.waitFor();
    const setupSnapshot = await assertPrivateDataSetupExpectations(page, "fatal private upload preview");
    if (setupSnapshot.state !== "preview-fatal") throw new Error(`Expected fatal private-data preview state, received ${setupSnapshot.state ?? "missing"}.`);
    if (setupSnapshot.previewStatus !== "fatal") throw new Error(`Expected fatal private-data preview status, received ${setupSnapshot.previewStatus ?? "missing"}.`);
    const applyButton = page.getByRole("button", { name: "Use This Private Data" });
    if (await applyButton.isEnabled()) throw new Error("Fatal private-data preview should disable Use This Private Data.");
    const status = page.locator('[data-qa="local-playtest-status"]');
    const dataMode = await status.getAttribute("data-data-mode");
    if (dataMode !== "placeholder") throw new Error(`Fatal unconfirmed private upload changed setup data mode to ${dataMode ?? "missing"}.`);
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
}

async function assertApplyablePrivateUploadPreview(page) {
  const uploadDir = await mkdtemp(join(tmpdir(), "polity-private-upload-ready-"));
  try {
    const cardsPath = join(uploadDir, "imperium_cards_private.csv");
    const nationsPath = join(uploadDir, "imperium_nations_private.csv");
    await writeFile(cardsPath, [
      "card_id,public_placeholder_name,suit,card_type,starting_location,vp_mode,implemented,tested,ownership,commons_set_id,commons_group",
      "qa-card-1,QA Card 1,civilized,action,draw_deck,none,true,true,commons,custom,base",
      "qa-card-2,QA Card 2,region,action,draw_deck,none,true,true,commons,custom,trade_friendly"
    ].join("\n"), "utf8");
    await writeFile(nationsPath, [
      "nation_id,public_placeholder_name,complexity,power_card_ids,state_card_ids,starting_deck_card_ids,nation_deck_card_ids,development_card_ids,special_setup_json,passive_rules_json,action_tokens_base,exhaust_tokens_base,implemented,tested",
      "qa-nation-1,QA Nation 1,1,qa-card-1,qa-card-2,qa-card-1|qa-card-2,qa-card-1,qa-card-2,[],[],3,5,true,true"
    ].join("\n"), "utf8");

    await page.getByLabel("Upload JSON or CSV files").setInputFiles([cardsPath, nationsPath]);
    const preview = page.locator('[data-qa="private-data-dry-run"]');
    await preview.waitFor();
    const previewStatus = await preview.getAttribute("data-preview-status");
    if (previewStatus === "fatal") throw new Error("Applyable private-data preview unexpectedly reported fatal issues.");
    const pendingSnapshot = await assertPrivateDataSetupExpectations(page, "applyable private upload preview");
    if (pendingSnapshot.state !== "preview-pending") throw new Error(`Expected pending private-data preview state, received ${pendingSnapshot.state ?? "missing"}.`);
    if (!["warning", "ready"].includes(String(pendingSnapshot.previewStatus))) throw new Error(`Expected warning or ready private-data preview status, received ${pendingSnapshot.previewStatus ?? "missing"}.`);

    const applyButton = page.getByRole("button", { name: "Use This Private Data" });
    if (!(await applyButton.isEnabled())) throw new Error("Applyable private-data preview should enable Use This Private Data.");
    await applyButton.click();
    const confirmedSnapshot = await assertPrivateDataSetupExpectations(page, "confirmed private upload preview");
    if (confirmedSnapshot.state !== "confirmed") throw new Error(`Expected confirmed private-data setup state, received ${confirmedSnapshot.state ?? "missing"}.`);
    await page.getByLabel("Commons set").selectOption("custom");
    const customCommons = page.locator('[data-qa="custom-commons-setup"]');
    await customCommons.waitFor();
    const customCommonsCount = await customCommons.getAttribute("data-custom-commons-count");
    const customCommonsAvailable = await customCommons.getAttribute("data-custom-commons-available");
    if (customCommonsAvailable !== "2") throw new Error(`Expected 2 custom Commons cards after fictional private upload, received ${customCommonsAvailable ?? "missing"}.`);
    if (customCommonsCount !== "0") throw new Error(`Expected custom Commons selection to start empty, received ${customCommonsCount ?? "missing"}.`);
    await page.getByRole("button", { name: "Select All" }).click();
    const selectedCount = await customCommons.getAttribute("data-custom-commons-count");
    if (selectedCount !== "2") throw new Error(`Expected Select All to choose 2 custom Commons cards, received ${selectedCount ?? "missing"}.`);
    const status = page.locator('[data-qa="local-playtest-status"]');
    const statusSnapshot = {
      statusVisible: await status.isVisible().catch(() => false),
      dataMode: await status.getAttribute("data-data-mode").catch(() => undefined),
      hosting: await status.getAttribute("data-hosting").catch(() => undefined),
      nextGate: await status.getAttribute("data-next-gate").catch(() => undefined),
      nextCommand: await status.getAttribute("data-next-command").catch(() => undefined),
      nextGateText: await page.locator('[data-qa="local-playtest-next-gate"]').innerText().catch(() => "")
    };
    const issues = evaluateLocalPlaytestStatusExpectations(statusSnapshot);
    if (issues.length > 0) throw new Error(`Private upload status expectation failed.\n- ${issues.join("\n- ")}`);
    if (statusSnapshot.dataMode !== "private") throw new Error(`Confirmed private upload should switch setup data mode to private, received ${statusSnapshot.dataMode ?? "missing"}.`);
    if (statusSnapshot.nextGate !== "private-gate") throw new Error(`Confirmed private upload should point at private:gate, received ${statusSnapshot.nextGate ?? "missing"}.`);
  } finally {
    await rm(uploadDir, { recursive: true, force: true });
  }
}

async function assertLocalSetupAndBoard(baseURL, browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.getByText("Polity Engine").first().waitFor();
  const status = page.locator('[data-qa="local-playtest-status"]');
  await status.waitFor();
  const statusSnapshot = {
    statusVisible: await status.isVisible().catch(() => false),
    dataMode: await status.getAttribute("data-data-mode").catch(() => undefined),
    hosting: await status.getAttribute("data-hosting").catch(() => undefined),
    nextGate: await status.getAttribute("data-next-gate").catch(() => undefined),
    nextCommand: await status.getAttribute("data-next-command").catch(() => undefined),
    nextGateText: await page.locator('[data-qa="local-playtest-next-gate"]').innerText().catch(() => "")
  };
  const statusIssues = evaluateLocalPlaytestStatusExpectations(statusSnapshot);
  if (statusIssues.length > 0) throw new Error(`Local playtest status expectation failed.\n- ${statusIssues.join("\n- ")}`);
  const privateDataSetupSnapshot = await assertPrivateDataSetupExpectations(page, "initial setup");
  if (privateDataSetupSnapshot.state !== "empty") throw new Error(`Expected empty private-data setup state, received ${privateDataSetupSnapshot.state ?? "missing"}.`);
  const dataMode = await status.getAttribute("data-data-mode");
  const hosting = await status.getAttribute("data-hosting");
  if (dataMode !== "placeholder") throw new Error(`Expected placeholder setup data mode, received ${dataMode ?? "missing"}.`);
  if (hosting !== "active") throw new Error(`Expected public hosting to be marked active, received ${hosting ?? "missing"}.`);
  await assertSetupRecoveryExpectations(page, "initial setup");
  await assertFatalPrivateUploadPreview(page);
  await page.reload();
  await page.getByText("Polity Engine").first().waitFor();
  await assertPrivateDataSetupExpectations(page, "reloaded after fatal private upload preview");
  await assertApplyablePrivateUploadPreview(page);
  await page.reload();
  await page.getByText("Polity Engine").first().waitFor();
  await assertNoPrivateDebugMarkers(page);

  await page.getByRole("button", { name: "Start Game" }).click();
  await page.locator(".board-layout").waitFor();
  await page.locator('[data-qa="playtest-diagnostics"]').waitFor();
  await page.getByText("Active Player").waitFor();
  await page.getByText("Export Playtest Diagnostics").waitFor();
  await assertNoPrivateDebugMarkers(page);

  await page.waitForFunction(() => Boolean(localStorage.getItem("polity-engine.localGame.v1")));
  await page.getByRole("button", { name: "New Game" }).click();
  await page.getByText("Autosave").waitFor();
  await assertSetupRecoveryExpectations(page, "valid autosave");
  await page.getByRole("button", { name: "Export Saved Game" }).waitFor();
  await page.getByText("Import Saved Game").waitFor();
  await page.getByRole("button", { name: "Resume Saved Game" }).click();
  await page.locator(".board-layout").waitFor();

  await page.evaluate(() => {
    localStorage.setItem("polity-engine.localGame.v1", "{not json");
  });
  await page.reload();
  await page.getByText("Saved local game could not be loaded").waitFor();
  await assertSetupRecoveryExpectations(page, "corrupt autosave");
  await context.close();
  return {
    privateUploadPreview: {
      fatal: "blocked",
      applyable: "confirmed"
    },
    customCommonsSetup: {
      available: 2,
      selectedAfterSelectAll: 2
    }
  };
}

async function visiblePendingTitle(page) {
  const bodyText = await page.locator("body").innerText();
  const match = bodyText.match(/PENDING [A-Z][A-Z ]*/);
  return match?.[0];
}

async function playerExpectationSnapshot(page, mode) {
  const bodyText = await page.locator("body").innerText();
  const pendingTitle = bodyText.match(/PENDING [A-Z][A-Z ]*/)?.[0];
  const enabledChoiceCount = await page.locator("button.action-button--choice").evaluateAll((buttons) => buttons.filter((button) => !button.disabled).length);
  const enabledReadyActionCount = await page.locator("button.action-button--ready").evaluateAll((buttons) => buttons.filter((button) => !button.disabled).length);
  const disabledActionWithoutReasonCount = await page.locator("button.action-button:disabled").evaluateAll((buttons) => buttons.filter((button) => !button.title && !button.textContent?.match(/\n.+/)).length);
  const validTargetCount = await page.locator(".is-valid-target").count();
  const endTurnEnabled = await page.getByRole("button", { name: /End Turn/i }).first().isEnabled().catch(() => false);
  const activePlayerVisible = bodyText.includes("ACTIVE PLAYER");
  const viewerPlayerVisible = bodyText.includes("VIEWER PLAYER");
  const diagnosticsVisible = await page.locator('[data-qa="playtest-diagnostics"]').isVisible().catch(() => false);
  const currentTaskPanelVisible = await page.locator('[data-qa="current-task-panel"]').isVisible().catch(() => false);
  const gameLogVisible = await page.locator('[data-qa="game-log"]').isVisible().catch(() => false);
  const playerAidVisible = await page.locator('[data-qa="player-aid"]').isVisible().catch(() => false);
  const bugReportButtonVisible = await page.getByRole("button", { name: /Copy Bug Report Summary/i }).isVisible().catch(() => false);
  const bugReportEmail = page.locator('[data-qa="email-bug-report"]');
  const bugReportEmailVisible = await bugReportEmail.isVisible().catch(() => false);
  const bugReportEmailHref = await bugReportEmail.getAttribute("href").catch(() => "");
  const bugReportEmailMailto = typeof bugReportEmailHref === "string" && bugReportEmailHref.startsWith("mailto:");
  const activePlayer = extractDiagnosticPlayer(bodyText, "ACTIVE PLAYER");
  const viewerPlayer = extractDiagnosticPlayer(bodyText, "VIEWER PLAYER");
  const diagnostics = page.locator('[data-qa="playtest-diagnostics"]');
  const currentTaskTitle = await diagnostics.getAttribute("data-current-task-title").catch(() => undefined);
  const enabledActionCount = Number(await diagnostics.getAttribute("data-enabled-action-count").catch(() => "0") ?? 0);
  const blockedActionCount = Number(await diagnostics.getAttribute("data-blocked-action-count").catch(() => "0") ?? 0);
  const zoneKindCount = Number(await diagnostics.getAttribute("data-zone-kind-count").catch(() => "0") ?? 0);
  const zoneKinds = await diagnostics.getAttribute("data-zone-kinds").catch(() => "");
  const privacyClassification = await diagnostics.getAttribute("data-privacy-classification").catch(() => "");
  const redactionMarker = await diagnostics.getAttribute("data-redaction-marker").catch(() => "");
  return {
    pendingTitle,
    enabledChoiceCount,
    enabledReadyActionCount,
    disabledActionWithoutReasonCount,
    validTargetCount,
    endTurnEnabled,
    activePlayerVisible,
    viewerPlayerVisible,
    diagnosticsVisible,
    currentTaskPanelVisible,
    gameLogVisible,
    playerAidVisible,
    bugReportButtonVisible,
    bugReportEmailVisible,
    bugReportEmailMailto,
    activePlayer,
    viewerPlayer,
    currentTaskTitle,
    enabledActionCount,
    blockedActionCount,
    zoneKindCount,
    zoneKinds,
    privacyClassification,
    redactionMarker,
    mode,
    bodyText
  };
}

export function workedTurnTraceEntry(kind, detail = {}) {
  return {
    kind,
    ...detail
  };
}

async function writePlayerExpectationArtifact(page, args) {
  if (!args.artifactRoot) return {};
  const reportDir = resolve(args.artifactRoot, "player-expectation-reports");
  await mkdir(reportDir, { recursive: true });
  const fileBase = `${Date.now()}-${slugifyLabel(`${args.mode}-${args.label}`)}`;
  const screenshotPath = resolve(reportDir, `${fileBase}.png`);
  const reportPath = resolve(reportDir, `${fileBase}.json`);
  let savedScreenshotPath;

  try {
    await page.screenshot({ path: screenshotPath, fullPage: true });
    savedScreenshotPath = screenshotPath;
  } catch {
    savedScreenshotPath = undefined;
  }

  const report = buildPlayerExpectationReport({
    label: args.label,
    mode: args.mode,
    issues: args.issues,
    trace: args.trace,
    snapshot: args.snapshot,
    screenshotPath: savedScreenshotPath
  });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { reportPath, screenshotPath: savedScreenshotPath };
}

function formatPlayerExpectationError({ label, mode, issues, trace, snapshot, reportPath, screenshotPath }) {
  const artifactLines = [
    reportPath ? `Report: ${reportPath}` : undefined,
    screenshotPath ? `Screenshot: ${screenshotPath}` : undefined
  ].filter(Boolean);
  return [
    `Player expectation agent found ${issues.length} issue(s) at ${label} (${mode}).`,
    `- ${issues.join("\n- ")}`,
    `Trace: ${trace.join(" -> ") || "(empty)"}`,
    ...artifactLines,
    "",
    compactText(snapshot.bodyText)
  ].join("\n");
}

async function throwPlayerExpectationFailure(page, args) {
  const artifact = await writePlayerExpectationArtifact(page, args);
  throw new Error(formatPlayerExpectationError({ ...args, ...artifact }));
}

async function assertPlayerExpectations(page, trace, label, mode, artifactRoot) {
  const snapshot = await playerExpectationSnapshot(page, mode);
  const issues = evaluatePlayerExpectations(snapshot);
  if (issues.length > 0) {
    await throwPlayerExpectationFailure(page, { artifactRoot, label, mode, issues, trace, snapshot });
  }
  return snapshot;
}

async function clickFirstEnabled(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false) && await item.isEnabled().catch(() => false)) {
      await item.click();
      return true;
    }
  }
  return false;
}

async function assertAutomatedLocalGameplay(baseURL, browser, args = {}) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const mode = args.mode ?? "practice";
  const maxSteps = args.steps ?? 36;
  const artifactRoot = args.artifactRoot;
  const trace = [];

  await page.goto(baseURL);
  await page.getByText("Polity Engine").first().waitFor();
  await page.getByText(mode === "solo" ? "Solo" : "Practice", { exact: true }).click();
  await page.getByRole("button", { name: "Start Game" }).click();
  await page.locator(".board-layout").waitFor();
  await assertPlayerExpectations(page, trace, "start", mode, artifactRoot);

  for (let step = 0; step < maxSteps; step += 1) {
    const beforeSnapshot = await assertPlayerExpectations(page, trace, `before step ${step}`, mode, artifactRoot);
    const pending = beforeSnapshot.pendingTitle;
    const beforeText = await page.locator("body").innerText();
    const clicked = pending
      ? await clickFirstEnabled(page.locator("button.action-button--choice"))
        || await clickFirstEnabled(page.locator(".is-valid-target"))
      : await clickFirstEnabled(page.locator("button.action-button--ready"))
        || await clickFirstEnabled(page.getByRole("button", { name: /End Turn/i }));

    if (!clicked) {
      const snapshot = await playerExpectationSnapshot(page, mode);
      await throwPlayerExpectationFailure(page, {
        artifactRoot,
        label: `stuck at step ${step}`,
        mode,
        issues: [`Automated gameplay could not find an enabled ${pending ? "choice or valid target" : "action or End Turn"}${pending ? ` during ${pending}` : ""}.`],
        trace,
        snapshot
      });
    }

    await page.waitForTimeout(250);
    await assertPlayerExpectations(page, trace, `after step ${step}`, mode, artifactRoot);
    const afterText = await page.locator("body").innerText();
    const afterPending = await visiblePendingTitle(page);
    trace.push(pending ? `${pending}:${afterPending ?? "resolved"}` : "action");

    if (pending && beforeText === afterText) {
      const snapshot = await playerExpectationSnapshot(page, mode);
      await throwPlayerExpectationFailure(page, {
        artifactRoot,
        label: `unchanged after step ${step}`,
        mode,
        issues: [`Automated gameplay clicked during ${pending}, but the board text did not change.`],
        trace,
        snapshot
      });
    }
    if (afterText.includes("InvalidMove(")) {
      const snapshot = await playerExpectationSnapshot(page, mode);
      await throwPlayerExpectationFailure(page, {
        artifactRoot,
        label: `invalid move after step ${step}`,
        mode,
        issues: ["Automated gameplay produced InvalidMove."],
        trace,
        snapshot
      });
    }
    if (afterText.includes("Turn handoff: End turn complete") && trace.some((entry) => entry.includes("PENDING CLEANUP RESOURCE"))) break;
  }

  if (mode === "practice" && !trace.some((entry) => entry.includes("PENDING CLEANUP RESOURCE"))) {
    const snapshot = await playerExpectationSnapshot(page, mode);
    await throwPlayerExpectationFailure(page, {
      artifactRoot,
      label: "missing cleanup resource coverage",
      mode,
      issues: ["Automated practice gameplay did not reach cleanup market resource placement."],
      trace,
      snapshot
    });
  }
  if (mode === "solo" && !trace.some((entry) => entry !== "action")) {
    const snapshot = await playerExpectationSnapshot(page, mode);
    await throwPlayerExpectationFailure(page, {
      artifactRoot,
      label: "missing pending choice coverage",
      mode,
      issues: ["Automated solo gameplay did not encounter or resolve any pending choices."],
      trace,
      snapshot
    });
  }

  await context.close();
  return trace;
}

async function assertWorkedTurnScenario(baseURL, browser, artifactRoot) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const mode = "worked-turn";
  const trace = [];

  await page.goto(baseURL);
  await page.getByText("Polity Engine").first().waitFor();
  await page.getByText("Practice", { exact: true }).click();
  await page.getByRole("button", { name: "Start Game" }).click();
  await page.locator(".board-layout").waitFor();
  let snapshot = await assertPlayerExpectations(page, trace, "worked turn start", mode, artifactRoot);
  trace.push(workedTurnTraceEntry("start", {
    currentTaskTitle: snapshot.currentTaskTitle,
    enabledActionCount: snapshot.enabledActionCount,
    blockedActionCount: snapshot.blockedActionCount,
    zoneKinds: snapshot.zoneKinds
  }));

  const marketCard = page.locator('button.card-tile[data-zone-kind="market-shared"]').first();
  if (!await marketCard.isVisible().catch(() => false)) {
    await throwPlayerExpectationFailure(page, {
      artifactRoot,
      label: "worked turn missing market card",
      mode,
      issues: ["The worked-turn scenario could not find a selectable market card."],
      trace,
      snapshot
    });
  }
  await marketCard.click();
  await page.waitForTimeout(150);
  snapshot = await assertPlayerExpectations(page, trace, "worked turn after market selection", mode, artifactRoot);
  trace.push(workedTurnTraceEntry("select-market-card", {
    enabledActionCount: snapshot.enabledActionCount,
    blockedActionCount: snapshot.blockedActionCount
  }));
  if (Number(snapshot.enabledActionCount ?? 0) === 0 || Number(snapshot.blockedActionCount ?? 0) === 0) {
    await throwPlayerExpectationFailure(page, {
      artifactRoot,
      label: "worked turn missing action contrast",
      mode,
      issues: ["Selecting a market card did not expose both legal actions and blocked explanations."],
      trace,
      snapshot
    });
  }

  let reachedCleanup = false;
  let resolvedCleanup = false;
  for (let step = 0; step < 24; step += 1) {
    snapshot = await assertPlayerExpectations(page, trace, `worked turn before step ${step}`, mode, artifactRoot);
    const pending = snapshot.pendingTitle;
    const clicked = pending
      ? await clickFirstEnabled(page.locator("button.action-button--choice"))
        || await clickFirstEnabled(page.locator(".is-valid-target"))
      : await clickFirstEnabled(page.locator("button.action-button--ready"))
        || await clickFirstEnabled(page.getByRole("button", { name: /End Turn/i }));

    if (!clicked) {
      await throwPlayerExpectationFailure(page, {
        artifactRoot,
        label: `worked turn stuck at step ${step}`,
        mode,
        issues: [`The worked-turn scenario could not click an enabled ${pending ? "choice or valid target" : "action or End Turn"}.`],
        trace,
        snapshot
      });
    }

    await page.waitForTimeout(250);
    const afterSnapshot = await assertPlayerExpectations(page, trace, `worked turn after step ${step}`, mode, artifactRoot);
    trace.push(workedTurnTraceEntry("step", {
      step,
      pendingBefore: pending,
      pendingAfter: afterSnapshot.pendingTitle,
      currentTaskTitle: afterSnapshot.currentTaskTitle
    }));

    if (pending === "PENDING CLEANUP RESOURCE") reachedCleanup = true;
    if (reachedCleanup && !afterSnapshot.pendingTitle) {
      resolvedCleanup = true;
      break;
    }
  }

  if (!resolvedCleanup) {
    snapshot = await playerExpectationSnapshot(page, mode);
    await throwPlayerExpectationFailure(page, {
      artifactRoot,
      label: "worked turn missing cleanup resolution",
      mode,
      issues: ["The worked-turn scenario did not resolve cleanup market resource placement."],
      trace,
      snapshot
    });
  }

  const endTurnButton = page.getByRole("button", { name: /End Turn/i }).first();
  if (await endTurnButton.isEnabled().catch(() => false)) {
    await endTurnButton.click();
    await page.waitForTimeout(250);
    snapshot = await assertPlayerExpectations(page, trace, "worked turn after one-click end turn", mode, artifactRoot);
    trace.push(workedTurnTraceEntry("end-turn", { currentTaskTitle: snapshot.currentTaskTitle }));
  } else {
    trace.push(workedTurnTraceEntry("end-turn-already-resolved"));
  }

  await page.reload();
  if (await page.getByRole("button", { name: "Resume Saved Game" }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: "Resume Saved Game" }).click();
  }
  await page.locator(".board-layout").waitFor();
  snapshot = await assertPlayerExpectations(page, trace, "worked turn after resume", mode, artifactRoot);
  trace.push(workedTurnTraceEntry("resume", { currentTaskTitle: snapshot.currentTaskTitle }));

  await context.close();
  return trace;
}

async function assertMultiplayerObserverExpectations(page, trace, label, mode, artifactRoot) {
  const snapshot = await playerExpectationSnapshot(page, mode);
  const issues = evaluateMultiplayerObserverExpectations(snapshot);
  if (issues.length > 0) {
    await throwPlayerExpectationFailure(page, { artifactRoot, label, mode, issues, trace, snapshot });
  }
  return snapshot;
}

async function rejoinOnlineBoard(page) {
  await page.getByRole("button", { name: "Rejoin" }).first().click();
  await page.locator(".board-layout").waitFor();
  await page.locator('[data-qa="playtest-diagnostics"]').waitFor();
}

async function assertAutomatedMultiplayerSelfPlay({ hostPage, guestPage, artifactRoot, steps = 12 }) {
  const seats = [
    { name: "host", page: hostPage },
    { name: "guest", page: guestPage }
  ];
  const trace = [];
  const activeViewers = new Set();

  await Promise.all(seats.map((seat) => assertMultiplayerObserverExpectations(seat.page, trace, `${seat.name} start`, `multiplayer:${seat.name}`, artifactRoot)));

  for (let step = 0; step < steps; step += 1) {
    const snapshots = [];
    for (const seat of seats) {
      snapshots.push({ seat, snapshot: await assertMultiplayerObserverExpectations(seat.page, trace, `${seat.name} before multiplayer step ${step}`, `multiplayer:${seat.name}`, artifactRoot) });
    }

    const activeSeat = snapshots.find(({ snapshot }) => snapshot.activePlayer !== undefined && snapshot.activePlayer === snapshot.viewerPlayer);
    const pendingActorSeat = snapshots.find(({ snapshot }) =>
      snapshot.pendingTitle
      && !/waiting for player/i.test(String(snapshot.bodyText ?? ""))
      && Number(snapshot.enabledChoiceCount ?? 0) + Number(snapshot.validTargetCount ?? 0) > 0
    );
    const actorSeat = pendingActorSeat ?? activeSeat;
    if (!actorSeat) {
      await throwPlayerExpectationFailure(hostPage, {
        artifactRoot,
        label: `no acting browser at multiplayer step ${step}`,
        mode: "multiplayer",
        issues: ["Neither browser can act for the current multiplayer state."],
        trace,
        snapshot: snapshots[0]?.snapshot ?? await playerExpectationSnapshot(hostPage, "multiplayer")
      });
    }

    if (activeSeat?.snapshot.viewerPlayer) activeViewers.add(activeSeat.snapshot.viewerPlayer);
    await assertPlayerExpectations(actorSeat.seat.page, trace, `${actorSeat.seat.name} acting before multiplayer step ${step}`, `multiplayer:${actorSeat.seat.name}`, artifactRoot);
    const beforeText = await actorSeat.seat.page.locator("body").innerText();
    const pending = actorSeat.snapshot.pendingTitle;
    const clicked = pending
      ? await clickFirstEnabled(actorSeat.seat.page.locator("button.action-button--choice"))
        || await clickFirstEnabled(actorSeat.seat.page.locator(".is-valid-target"))
      : await clickFirstEnabled(actorSeat.seat.page.locator("button.action-button--ready"))
        || await clickFirstEnabled(actorSeat.seat.page.getByRole("button", { name: /End Turn/i }));

    if (!clicked) {
      const snapshot = await playerExpectationSnapshot(actorSeat.seat.page, `multiplayer:${actorSeat.seat.name}`);
      await throwPlayerExpectationFailure(actorSeat.seat.page, {
        artifactRoot,
        label: `${actorSeat.seat.name} stuck at multiplayer step ${step}`,
        mode: `multiplayer:${actorSeat.seat.name}`,
        issues: [`Automated multiplayer self-play could not find an enabled ${pending ? "choice or valid target" : "action or End Turn"}${pending ? ` during ${pending}` : ""}.`],
        trace,
        snapshot
      });
    }

    await Promise.all(seats.map((seat) => seat.page.waitForTimeout(350)));
    await assertPlayerExpectations(actorSeat.seat.page, trace, `${actorSeat.seat.name} acting after multiplayer step ${step}`, `multiplayer:${actorSeat.seat.name}`, artifactRoot);
    await Promise.all(seats.map((seat) => assertMultiplayerObserverExpectations(seat.page, trace, `${seat.name} after multiplayer step ${step}`, `multiplayer:${seat.name}`, artifactRoot)));

    const afterText = await actorSeat.seat.page.locator("body").innerText();
    const afterPending = await visiblePendingTitle(actorSeat.seat.page);
    trace.push(`${actorSeat.seat.name}:${actorSeat.snapshot.viewerPlayer}:${pending ? `${pending}:${afterPending ?? "resolved"}` : "action"}`);

    if (pending && beforeText === afterText) {
      const snapshot = await playerExpectationSnapshot(actorSeat.seat.page, `multiplayer:${actorSeat.seat.name}`);
      await throwPlayerExpectationFailure(actorSeat.seat.page, {
        artifactRoot,
        label: `${actorSeat.seat.name} unchanged after multiplayer step ${step}`,
        mode: `multiplayer:${actorSeat.seat.name}`,
        issues: [`Automated multiplayer self-play clicked during ${pending}, but the active board text did not change.`],
        trace,
        snapshot
      });
    }

    if (activeViewers.size >= 2 && trace.some((entry) => entry.includes("PENDING CLEANUP RESOURCE"))) break;
  }

  if (activeViewers.size < 2) {
    const snapshot = await playerExpectationSnapshot(hostPage, "multiplayer");
    await throwPlayerExpectationFailure(hostPage, {
      artifactRoot,
      label: "missing multiplayer handoff",
      mode: "multiplayer",
      issues: ["Automated multiplayer self-play did not see both players become the active seat."],
      trace,
      snapshot
    });
  }

  return trace;
}

async function assertViewportQA(baseURL, browser, artifactRoot) {
  const viewports = [
    { label: "desktop", width: 1440, height: 900 },
    { label: "steam-deck", width: 1280, height: 800 },
    { label: "narrow-tablet", width: 760, height: 900 },
    { label: "iphone-portrait", width: 390, height: 844 },
    { label: "iphone-landscape", width: 844, height: 390 }
  ];
  const checked = [];

  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(baseURL);
    await page.getByText("Polity Engine").first().waitFor();
    await page.getByRole("button", { name: "Start Game" }).click();
    await page.locator(".board-layout").waitFor();
    await assertPlayerExpectations(page, [], `viewport ${viewport.label}`, "viewport", artifactRoot);

    const layoutSnapshot = await page.evaluate(() => {
      const issues = [];
      const body = document.body;
      if (body.scrollWidth > window.innerWidth + 2) issues.push(`horizontal overflow ${body.scrollWidth}/${window.innerWidth}`);
      for (const selector of [
        '[data-qa="current-task-panel"]',
        '[data-qa="game-log"]',
        ".rule-aid-panel",
        '[data-qa="playtest-diagnostics"]',
        '[data-zone-kind="public-shared"]',
        '[data-zone-kind="market-shared"]',
        '[data-zone-kind="own-private"]',
        ".action-menu"
      ]) {
        const element = document.querySelector(selector);
        const rect = element?.getBoundingClientRect();
        if (!element || !rect || rect.width <= 0 || rect.height <= 0) issues.push(`${selector} is not visible`);
      }
      const buttons = Array.from(document.querySelectorAll("button"));
      const overflowingButtons = buttons.filter((button) => button.scrollWidth > button.clientWidth + 2);
      if (overflowingButtons.length > 0) issues.push(`${overflowingButtons.length} button(s) have clipped labels`);
      const actionText = document.querySelector(".action-menu")?.textContent ?? "";
      if (!actionText.includes("Available Actions")) issues.push("Action menu is missing Available Actions.");
      if (!actionText.includes("Unavailable")) issues.push("Action menu is missing Unavailable actions.");
      const playerAid = document.querySelector('[data-qa="player-aid"]');
      if (playerAid?.getAttribute("data-expanded") !== "true") issues.push("Player aid default expanded state is missing.");
      const rightRailChildren = Array.from(document.querySelectorAll(".right > *"));
      const gameLog = document.querySelector('[data-qa="game-log"]');
      const toRect = (element) => {
        const rect = element?.getBoundingClientRect();
        return rect ? { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height } : undefined;
      };
      if (!document.body.textContent?.includes("Copy Bug Report Summary")) issues.push("Bug report summary helper is missing.");
      const emailBugReport = document.querySelector('[data-qa="email-bug-report"]');
      if (!emailBugReport) issues.push("Email bug report helper is missing.");
      if (emailBugReport && !String(emailBugReport.getAttribute("href") ?? "").startsWith("mailto:")) issues.push("Email bug report helper is not a mailto link.");
      return {
        issues,
        gameLogRect: toRect(gameLog),
        playerAidRect: toRect(playerAid),
        gameLogDomIndex: rightRailChildren.indexOf(gameLog),
        playerAidDomIndex: rightRailChildren.indexOf(playerAid)
      };
    });
    const layoutIssues = [
      ...layoutSnapshot.issues,
      ...evaluateRightRailLayoutExpectations(layoutSnapshot)
    ];

    if (layoutIssues.length > 0) {
      const snapshot = await playerExpectationSnapshot(page, "viewport");
      await throwPlayerExpectationFailure(page, {
        artifactRoot,
        label: `viewport ${viewport.label}`,
        mode: "viewport",
        issues: layoutIssues,
        trace: [],
        snapshot
      });
    }
    checked.push(viewport.label);
    await context.close();
  }

  return checked;
}

export async function runBrowserQA(config = buildBrowserQAConfig()) {
  await mkdir(config.storagePath, { recursive: true });
  const shouldRunLocalServer = shouldStartServer(config);
  if (shouldRunLocalServer) buildAppForBrowserQA();
  const running = shouldRunLocalServer ? startServer(config) : undefined;
  let browser;
  let completed = false;
  try {
    await waitForHTTP(`${config.baseURL}/polity/accounts/health`);
    await waitForHTTP(`${config.baseURL}/`);

    const lobby = await postJSON(config.baseURL, "/polity/lobby/rooms", {
      roomName: "Local Browser QA",
      playerCount: 2,
      setupData: localQASetupData(),
      privateDataFingerprint: "placeholder",
      hostName: "Browser QA Host",
      clientID: "browser-qa-host"
    });
    const joined = await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/join`, {
      displayName: "Browser QA Guest",
      privateDataFingerprint: "placeholder",
      clientID: "browser-qa-guest"
    });
    await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/select-nation`, {
      lobbyCredentials: lobby.lobbyCredentials,
      nationID: "test_nation_sun_coast"
    });
    await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/select-nation`, {
      lobbyCredentials: joined.lobbyCredentials,
      nationID: "test_nation_sun_coast"
    });
    await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/ready`, {
      lobbyCredentials: lobby.lobbyCredentials,
      ready: true
    });
    await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/ready`, {
      lobbyCredentials: joined.lobbyCredentials,
      ready: true
    });
    const started = await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}/start`, {
      lobbyCredentials: lobby.lobbyCredentials
    });

    browser = await chromium.launch({ headless: config.headless });
    const setupBoardResult = await assertLocalSetupAndBoard(config.baseURL, browser);
    const workedTurnTrace = await assertWorkedTurnScenario(config.baseURL, browser, config.storagePath);
    const practiceTrace = await assertAutomatedLocalGameplay(config.baseURL, browser, { mode: "practice", steps: 48, artifactRoot: config.storagePath });
    const soloTrace = await assertAutomatedLocalGameplay(config.baseURL, browser, { mode: "solo", steps: 48, artifactRoot: config.storagePath });
    const viewportQa = await assertViewportQA(config.baseURL, browser, config.storagePath);

    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const hostPage = await hostContext.newPage();
    const guestPage = await guestContext.newPage();

    await hostPage.goto(config.baseURL);
    await guestPage.goto(config.baseURL);
    await hostPage.getByText("Polity Engine").first().waitFor();
    await guestPage.getByText("Polity Engine").first().waitFor();

    await hostPage.evaluate(({ lobbyID, credentials, matchID }) => {
      localStorage.setItem("polity-engine.onlineSession.v1", JSON.stringify({
        kind: "player",
        matchID,
        playerID: "0",
        credentials,
        serverURL: location.origin,
        numPlayers: 2,
        savedAt: new Date().toISOString()
      }));
      localStorage.setItem("polity-engine.onlineClientID.v1", `browser-qa-host-${lobbyID}`);
    }, { lobbyID: lobby.lobbyID, credentials: started.playerCredentials, matchID: started.matchID });

    const guestStarted = await postJSON(config.baseURL, `/polity/lobby/rooms/${encodeURIComponent(lobby.lobbyID)}`, {
      lobbyCredentials: joined.lobbyCredentials
    });
    await guestPage.evaluate(({ lobbyID, credentials, matchID }) => {
      localStorage.setItem("polity-engine.onlineSession.v1", JSON.stringify({
        kind: "player",
        matchID,
        playerID: "1",
        credentials,
        serverURL: location.origin,
        numPlayers: 2,
        savedAt: new Date().toISOString()
      }));
      localStorage.setItem("polity-engine.onlineClientID.v1", `browser-qa-guest-${lobbyID}`);
    }, { lobbyID: lobby.lobbyID, credentials: guestStarted.lobby.playerCredentials, matchID: started.matchID });

    await hostPage.reload();
    await guestPage.reload();
    await hostPage.getByRole("button", { name: "Continue as Guest" }).click();
    await guestPage.getByRole("button", { name: "Continue as Guest" }).click();
    await hostPage.getByRole("heading", { name: "Online Games" }).waitFor();
    await guestPage.getByRole("heading", { name: "Online Games" }).waitFor();
    await hostPage.getByText("Rejoin").first().waitFor();
    await guestPage.getByText("Rejoin").first().waitFor();
    await rejoinOnlineBoard(hostPage);
    await rejoinOnlineBoard(guestPage);
    const multiplayerTrace = await assertAutomatedMultiplayerSelfPlay({
      hostPage,
      guestPage,
      artifactRoot: config.storagePath,
      steps: 14
    });

    const result = redactBrowserQAResult({
      ok: true,
      lobbyID: lobby.lobbyID,
      matchID: started.matchID,
      setupStatusChecked: true,
      privateUploadPreviewChecked: true,
      privateUploadPreview: setupBoardResult.privateUploadPreview,
      customCommonsSetupChecked: true,
      customCommonsSetup: setupBoardResult.customCommonsSetup,
      localBoardChecked: true,
      automatedLocalGameplayChecked: true,
      automatedLocalGameplayModes: {
        practice: { steps: practiceTrace.length },
        solo: { steps: soloTrace.length }
      },
      workedTurnChecked: true,
      workedTurn: { steps: workedTurnTrace.length },
      automatedMultiplayerSelfPlayChecked: true,
      automatedMultiplayerSelfPlay: { steps: multiplayerTrace.length },
      viewportQaChecked: true,
      viewportQa,
      saveResumeChecked: true,
      invalidSaveChecked: true,
      noPrivateDebugMarkers: true
    });
    completed = true;
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const tail = logTail(running);
    throw new Error(tail ? `${message}\n\nServer log tail:\n${tail}` : message);
  } finally {
    await browser?.close();
    await stopServer(running);
    if (completed && !process.env.POLITY_BROWSER_QA_KEEP_STORAGE) {
      await rm(config.storagePath, { recursive: true, force: true });
    }
  }
}

async function main() {
  const result = await runBrowserQA();
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
