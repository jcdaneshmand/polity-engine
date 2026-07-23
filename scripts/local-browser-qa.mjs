import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
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
  return {
    ok: result.ok,
    lobbyID: result.lobbyID,
    matchID: result.matchID,
    setupStatusChecked: result.setupStatusChecked,
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
  const currentTaskTitle = String(snapshot.currentTaskTitle ?? "");
  const enabledActionCount = Number(snapshot.enabledActionCount ?? 0);
  const blockedActionCount = Number(snapshot.blockedActionCount ?? 0);
  const zoneKindCount = Number(snapshot.zoneKindCount ?? 0);
  const zoneKinds = String(snapshot.zoneKinds ?? "");
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
  if (!currentTaskTitle) issues.push("Playtest diagnostics do not expose current-task metadata.");
  if (enabledActionCount + blockedActionCount === 0) issues.push("Playtest diagnostics do not expose rule action metadata.");
  if (zoneKindCount === 0 || !zoneKinds.includes("public-shared") || !zoneKinds.includes("market-shared") || !zoneKinds.includes("own-private")) {
    issues.push("Playtest diagnostics do not expose board zone hierarchy metadata.");
  }
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

function compactText(text, length = 3000) {
  const normalized = String(text ?? "").replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return normalized.length > length ? `${normalized.slice(0, length)}...` : normalized;
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
    currentTaskTitle: snapshot.currentTaskTitle,
    enabledActionCount: Number(snapshot.enabledActionCount ?? 0),
    blockedActionCount: Number(snapshot.blockedActionCount ?? 0),
    zoneKindCount: Number(snapshot.zoneKindCount ?? 0),
    zoneKinds: snapshot.zoneKinds,
    bodyExcerpt: compactText(snapshot.bodyText)
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
  if (!snapshot.currentTaskTitle) issues.push("Playtest diagnostics do not expose current-task metadata.");
  if (Number(snapshot.enabledActionCount ?? 0) + Number(snapshot.blockedActionCount ?? 0) === 0) issues.push("Playtest diagnostics do not expose rule action metadata.");
  if (Number(snapshot.zoneKindCount ?? 0) === 0) issues.push("Playtest diagnostics do not expose board zone hierarchy metadata.");
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

async function assertLocalSetupAndBoard(baseURL, browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(baseURL);
  await page.getByText("Polity Engine").first().waitFor();
  const status = page.locator('[data-qa="local-playtest-status"]');
  await status.waitFor();
  const dataMode = await status.getAttribute("data-data-mode");
  const hosting = await status.getAttribute("data-hosting");
  if (dataMode !== "placeholder") throw new Error(`Expected placeholder setup data mode, received ${dataMode ?? "missing"}.`);
  if (hosting !== "active") throw new Error(`Expected public hosting to be marked active, received ${hosting ?? "missing"}.`);
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
  await page.getByRole("button", { name: "Export Saved Game" }).waitFor();
  await page.getByText("Import Saved Game").waitFor();
  await page.getByRole("button", { name: "Resume Saved Game" }).click();
  await page.locator(".board-layout").waitFor();

  await page.evaluate(() => {
    localStorage.setItem("polity-engine.localGame.v1", "{not json");
  });
  await page.reload();
  await page.getByText("Saved local game could not be loaded").waitFor();
  await context.close();
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
  const activePlayer = extractDiagnosticPlayer(bodyText, "ACTIVE PLAYER");
  const viewerPlayer = extractDiagnosticPlayer(bodyText, "VIEWER PLAYER");
  const diagnostics = page.locator('[data-qa="playtest-diagnostics"]');
  const currentTaskTitle = await diagnostics.getAttribute("data-current-task-title").catch(() => undefined);
  const enabledActionCount = Number(await diagnostics.getAttribute("data-enabled-action-count").catch(() => "0") ?? 0);
  const blockedActionCount = Number(await diagnostics.getAttribute("data-blocked-action-count").catch(() => "0") ?? 0);
  const zoneKindCount = Number(await diagnostics.getAttribute("data-zone-kind-count").catch(() => "0") ?? 0);
  const zoneKinds = await diagnostics.getAttribute("data-zone-kinds").catch(() => "");
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
    activePlayer,
    viewerPlayer,
    currentTaskTitle,
    enabledActionCount,
    blockedActionCount,
    zoneKindCount,
    zoneKinds,
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

    const layoutIssues = await page.evaluate(() => {
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
      if (!document.body.textContent?.includes("Copy Bug Report Summary")) issues.push("Bug report summary helper is missing.");
      return issues;
    });

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
    await assertLocalSetupAndBoard(config.baseURL, browser);
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
