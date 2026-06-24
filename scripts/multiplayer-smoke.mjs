import { spawn, spawnSync } from "node:child_process";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";

const projectRoot = resolve(process.cwd());
const smokeRoot = join(projectRoot, "tmp", "multiplayer-smoke");
const port = Number(process.env.POLITY_SMOKE_PORT ?? "8780");
const serverURL = `http://127.0.0.1:${port}`;
const storageDir = join(smokeRoot, `storage-${Date.now()}`);

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function serverCommand() {
  return process.platform === "win32"
    ? { command: "cmd.exe", args: ["/d", "/s", "/c", `${npmCommand()} run server:dev`] }
    : { command: npmCommand(), args: ["run", "server:dev"] };
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
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
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

async function postJSON(path, body) {
  const response = await fetch(`${serverURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function getJSON(path) {
  const response = await fetch(`${serverURL}${path}`);
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}

async function assertStorageLayout() {
  const rootEntries = await readdir(storageDir, { withFileTypes: true });
  if (!rootEntries.some((entry) => entry.isDirectory() && entry.name === "boardgame")) {
    throw new Error("Expected boardgame.io FlatFile data to live in a storage/boardgame subdirectory.");
  }
  const boardgameEntries = await readdir(join(storageDir, "boardgame"), { withFileTypes: true });
  const appJsonInBoardgameStorage = boardgameEntries.filter((entry) => entry.name.endsWith(".json")).map((entry) => entry.name);
  if (appJsonInBoardgameStorage.length > 0) {
    throw new Error(`App JSON files leaked into boardgame storage: ${appJsonInBoardgameStorage.join(", ")}`);
  }
}

function setupData() {
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

function startServer() {
  const server = serverCommand();
  const child = spawn(server.command, server.args, {
    cwd: projectRoot,
    env: {
      ...process.env,
      POLITY_SERVER_PORT: String(port),
      POLITY_STORAGE_PATH: storageDir
    },
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
  if (!running) return;
  const { child } = running;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    child.stdout.destroy();
    child.stderr.destroy();
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolveExit) => {
    const timeout = setTimeout(resolveExit, 2_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveExit();
    });
  });
}

function logTail(logs) {
  return logs.join("").split(/\r?\n/).slice(-40).join("\n");
}

async function waitForServerReady() {
  await waitForHTTP(`${serverURL}/polity/accounts/health`);
  await waitForHTTP(`${serverURL}/polity/lobby/rooms`);
}

async function main() {
  await mkdir(storageDir, { recursive: true });
  let running;
  const allLogs = [];
  try {
    running = startServer();
    allLogs.push(running.logs);
    await waitForServerReady();

    const appResponse = await waitForHTTP(serverURL);
    const appHtml = await appResponse.text();
    if (!appHtml.includes('<div id="root">')) {
      throw new Error("Static app shell did not include the React root.");
    }

    const created = await postJSON("/polity/lobby/matches", {
      roomName: "Smoke Table",
      numPlayers: 2,
      setupData: setupData(),
      privateDataFingerprint: "placeholder"
    });
    const matchID = created.matchID;
    if (!matchID) throw new Error("Match creation did not return a matchID.");

    const host = await postJSON(`/polity/lobby/matches/${encodeURIComponent(matchID)}/join`, {
      playerID: "0",
      playerName: "Smoke Host",
      privateDataFingerprint: "placeholder",
      clientID: "smoke-host"
    });
    const guest = await postJSON(`/polity/lobby/matches/${encodeURIComponent(matchID)}/join`, {
      playerID: "1",
      playerName: "Smoke Guest",
      privateDataFingerprint: "placeholder",
      clientID: "smoke-guest"
    });

    await postJSON(`/polity/lobby/matches/${encodeURIComponent(matchID)}/heartbeat`, {
      playerID: "0",
      playerCredentials: host.playerCredentials,
      clientID: "smoke-host"
    });

    const listed = await getJSON("/polity/lobby/matches");
    const match = listed.matches.find((candidate) => candidate.matchID === matchID);
    if (!match) throw new Error(`Created match ${matchID} was not listed.`);
    if (match.occupiedSeats.length !== 2) {
      throw new Error(`Expected 2 occupied seats; saw ${match.occupiedSeats.length}.`);
    }
    if (!guest.playerCredentials) throw new Error("Guest join did not return credentials.");

    await stopServer(running);
    running = undefined;

    running = startServer();
    allLogs.push(running.logs);
    await waitForServerReady();

    const listedAfterRestart = await getJSON("/polity/lobby/matches");
    const restartedMatch = listedAfterRestart.matches.find((candidate) => candidate.matchID === matchID);
    if (!restartedMatch) throw new Error(`Created match ${matchID} was not listed after restart.`);
    if (restartedMatch.occupiedSeats.length !== 2) {
      throw new Error(`Expected 2 occupied seats after restart; saw ${restartedMatch.occupiedSeats.length}.`);
    }
    await postJSON(`/polity/lobby/matches/${encodeURIComponent(matchID)}/heartbeat`, {
      playerID: "1",
      playerCredentials: guest.playerCredentials,
      clientID: "smoke-guest"
    });
    await assertStorageLayout();

    const lobby = await postJSON("/polity/lobby/rooms", {
      roomName: "Smoke Pregame Table",
      playerCount: 2,
      setupData: setupData(),
      privateDataFingerprint: "placeholder",
      hostName: "Smoke Lobby Host",
      clientID: "smoke-lobby-host"
    });
    const lobbyID = lobby.lobbyID;
    if (!lobbyID || !lobby.lobbyCredentials) {
      throw new Error("Pregame lobby creation did not return lobby credentials.");
    }
    const joinedLobby = await postJSON(`/polity/lobby/rooms/${encodeURIComponent(lobbyID)}/join`, {
      displayName: "Smoke Lobby Guest",
      privateDataFingerprint: "placeholder",
      clientID: "smoke-lobby-guest"
    });
    if (!joinedLobby.lobbyCredentials) {
      throw new Error("Pregame lobby join did not return guest credentials.");
    }
    await postJSON(`/polity/lobby/rooms/${encodeURIComponent(lobbyID)}/select-nation`, {
      lobbyCredentials: lobby.lobbyCredentials,
      nationID: "test_nation_sun_coast"
    });
    await postJSON(`/polity/lobby/rooms/${encodeURIComponent(lobbyID)}/select-nation`, {
      lobbyCredentials: joinedLobby.lobbyCredentials,
      nationID: "test_nation_sun_coast"
    });
    await postJSON(`/polity/lobby/rooms/${encodeURIComponent(lobbyID)}/ready`, {
      lobbyCredentials: lobby.lobbyCredentials,
      ready: true
    });
    await postJSON(`/polity/lobby/rooms/${encodeURIComponent(lobbyID)}/ready`, {
      lobbyCredentials: joinedLobby.lobbyCredentials,
      ready: true
    });
    const startedLobby = await postJSON(`/polity/lobby/rooms/${encodeURIComponent(lobbyID)}/start`, {
      lobbyCredentials: lobby.lobbyCredentials
    });
    const startedMatchID = startedLobby.matchID;
    if (!startedMatchID || !startedLobby.playerCredentials) {
      throw new Error("Pregame start did not return host match credentials.");
    }
    const rejoinedStartedLobby = await postJSON(`/polity/lobby/rooms/${encodeURIComponent(lobbyID)}`, {
      lobbyCredentials: joinedLobby.lobbyCredentials
    });
    if (rejoinedStartedLobby.lobby?.startedMatchID !== startedMatchID || !rejoinedStartedLobby.lobby?.playerCredentials) {
      throw new Error("Started lobby rejoin did not return guest match credentials.");
    }
    const startedListing = await getJSON("/polity/lobby/matches");
    const startedMatch = startedListing.matches.find((candidate) => candidate.matchID === startedMatchID);
    if (!startedMatch) throw new Error(`Started lobby match ${startedMatchID} was not listed.`);
    if (startedMatch.occupiedSeats.length !== 2 || startedMatch.availableSeats.length !== 0) {
      throw new Error(`Started lobby match should reserve both seats; saw occupied=${startedMatch.occupiedSeats.length}, available=${startedMatch.availableSeats.join(",")}.`);
    }
    await sleep(16_500);
    const staleListing = await getJSON("/polity/lobby/matches");
    const staleStartedMatch = staleListing.matches.find((candidate) => candidate.matchID === startedMatchID);
    if (!staleStartedMatch) throw new Error(`Started lobby match ${startedMatchID} disappeared after stale cleanup.`);
    if (staleStartedMatch.occupiedSeats.length !== 2 || staleStartedMatch.availableSeats.length !== 0) {
      throw new Error(`Stale in-progress match should keep both seats reserved; saw occupied=${staleStartedMatch.occupiedSeats.length}, available=${staleStartedMatch.availableSeats.join(",")}.`);
    }

    console.log(JSON.stringify({
      ok: true,
      serverURL,
      matchID,
      startedMatchID,
      occupiedSeats: match.occupiedSeats.length,
      staleStartedOccupiedSeats: staleStartedMatch.occupiedSeats.length,
      restartedMatchListed: true,
      restartedCredentialHeartbeat: true,
      storageDir
    }, null, 2));
  } catch (error) {
    const tail = allLogs.map((logs) => logTail(logs)).join("\n--- restart ---\n");
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n\nServer log tail:\n${tail}`);
  } finally {
    await stopServer(running);
    await rm(storageDir, { recursive: true, force: true });
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
);
