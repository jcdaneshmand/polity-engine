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
  return {
    port,
    baseURL: env.POLITY_BROWSER_QA_BASE_URL ?? `http://127.0.0.1:${port}`,
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
    matchID: result.matchID
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
  return { child, logs };
}

async function stopServer(running) {
  if (!running?.child || running.child.killed) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(running.child.pid), "/t", "/f"], { stdio: "ignore" });
    running.child.stdout.destroy();
    running.child.stderr.destroy();
    return;
  }
  running.child.kill("SIGTERM");
}

function shouldStartServer(config) {
  return config.baseURL === `http://127.0.0.1:${config.port}` || config.baseURL === `http://localhost:${config.port}`;
}

function logTail(running) {
  return running?.logs?.join("").split(/\r?\n/).slice(-40).join("\n") ?? "";
}

export async function runBrowserQA(config = buildBrowserQAConfig()) {
  await mkdir(config.storagePath, { recursive: true });
  const running = shouldStartServer(config) ? startServer(config) : undefined;
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

    return redactBrowserQAResult({ ok: true, lobbyID: lobby.lobbyID, matchID: started.matchID });
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
