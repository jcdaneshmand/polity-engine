import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, rm } from "node:fs/promises";
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
    saveResumeChecked: result.saveResumeChecked,
    invalidSaveChecked: result.invalidSaveChecked,
    noPrivateDebugMarkers: result.noPrivateDebugMarkers
  };
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
  if (hosting !== "deferred") throw new Error(`Expected public hosting to be marked deferred, received ${hosting ?? "missing"}.`);
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

export async function runBrowserQA(config = buildBrowserQAConfig()) {
  await mkdir(config.storagePath, { recursive: true });
  const shouldRunLocalServer = shouldStartServer(config);
  if (shouldRunLocalServer) buildAppForBrowserQA();
  const running = shouldRunLocalServer ? startServer(config) : undefined;
  let browser;
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

    return redactBrowserQAResult({
      ok: true,
      lobbyID: lobby.lobbyID,
      matchID: started.matchID,
      setupStatusChecked: true,
      localBoardChecked: true,
      saveResumeChecked: true,
      invalidSaveChecked: true,
      noPrivateDebugMarkers: true
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const tail = logTail(running);
    throw new Error(tail ? `${message}\n\nServer log tail:\n${tail}` : message);
  } finally {
    await browser?.close();
    await stopServer(running);
    if (!process.env.POLITY_BROWSER_QA_KEEP_STORAGE) {
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
