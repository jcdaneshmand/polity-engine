import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "boardgame.io/client";
import { SocketIO as ClientSocketIO } from "boardgame.io/multiplayer";
import { afterEach, describe, expect, it } from "vitest";
import { PrototypeGame } from "../../engine/src/game/game";
import type { GameState } from "../../engine/src/game/state";
import { getBoardgameServerPackage } from "./boardgameServer";
import { createBoardgameStorage, waitForBoardgameStorageIdle, type BoardgameStorage } from "./boardgameStorage";

type BoardgameClient = ReturnType<typeof Client>;
type BoardgameState = NonNullable<ReturnType<BoardgameClient["getState"]>> & { G: GameState };
type BoardgameServerPackage = ReturnType<typeof getBoardgameServerPackage>;
type BoardgameServer = ReturnType<BoardgameServerPackage["Server"]>;
type BoardgameServerRunResult = Awaited<ReturnType<BoardgameServer["run"]>>;

type RunningBoardgameServer = {
  server: BoardgameServer;
  servers: BoardgameServerRunResult;
  serverURL: string;
  db?: BoardgameStorage;
};

const setupData = {
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

const clients: BoardgameClient[] = [];

afterEach(() => {
  stopAllClients();
});

function stopAllClients() {
  while (clients.length > 0) {
    stopClient(clients[clients.length - 1]);
  }
}

function stopClient(client: BoardgameClient) {
  const index = clients.indexOf(client);
  if (index >= 0) clients.splice(index, 1);
  try {
    client.stop();
  } catch (error) {
    if (!(error instanceof TypeError && error.message.includes("close"))) {
      throw error;
    }
  }
}

async function waitFor<T>(read: () => T | undefined | false, label: string, timeoutMs = 5000): Promise<T> {
  const startedAt = Date.now();
  let lastValue: T | undefined | false;
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = read();
    if (lastValue) return lastValue;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}; last value: ${JSON.stringify(lastValue)}`);
}

async function waitForState<T>(
  read: () => { done: true; value: T } | { done: false; diagnostic: unknown },
  label: string,
  timeoutMs = 5000
): Promise<T> {
  const startedAt = Date.now();
  let lastDiagnostic: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    const result = read();
    if (result.done) return result.value;
    lastDiagnostic = result.diagnostic;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}; last state: ${JSON.stringify(lastDiagnostic)}`);
}

async function createMatch(serverURL: string) {
  const response = await fetch(`${serverURL}/games/polity-engine/create`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ numPlayers: 2, setupData })
  });
  expect(response.status).toBe(200);
  return await response.json() as { matchID: string };
}

async function joinMatch(serverURL: string, matchID: string, playerID: string, playerName: string) {
  const response = await fetch(`${serverURL}/games/polity-engine/${matchID}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ playerID, playerName })
  });
  expect(response.status).toBe(200);
  return await response.json() as { playerCredentials: string };
}

function startClient(serverURL: string, matchID: string, playerID: string, credentials: string) {
  const client = Client({
    game: PrototypeGame,
    multiplayer: ClientSocketIO({ server: serverURL }),
    matchID,
    playerID,
    credentials,
    debug: false
  });
  clients.push(client);
  client.start();
  return client;
}

function startSpectatorClient(serverURL: string, matchID: string, credentials: string) {
  const client = Client({
    game: PrototypeGame,
    multiplayer: ClientSocketIO({ server: serverURL }),
    matchID,
    credentials,
    debug: false
  });
  clients.push(client);
  client.start();
  return client;
}

async function runBoardgameServer(options: { storageDir?: string } = {}): Promise<RunningBoardgameServer> {
  const { Server, SocketIO } = getBoardgameServerPackage();
  const db = createBoardgameStorage(options.storageDir);
  const server = Server({
    games: [PrototypeGame],
    origins: ["http://127.0.0.1"],
    apiOrigins: ["http://127.0.0.1"],
    transport: new SocketIO(),
    ...(db ? { db } : {})
  });
  const servers = await server.run(0);
  const address = servers.appServer.address();
  if (address === null || typeof address === "string") {
    server.kill(servers);
    throw new Error(`Unexpected server address: ${JSON.stringify(address)}`);
  }
  return {
    server,
    servers,
    serverURL: `http://127.0.0.1:${address.port}`,
    db
  };
}

async function stopBoardgameServer(running: RunningBoardgameServer | undefined) {
  if (!running) return;
  running.server.kill(running.servers);
  await waitForBoardgameStorageIdle(running.db);
}

async function waitForPersistedMatch(
  running: RunningBoardgameServer,
  matchID: string,
  label: string,
  expectedPendingPlayerId?: string,
  timeoutMs = 5000
) {
  if (!running.db) {
    throw new Error("Persistent match polling requires FlatFile storage");
  }
  const startedAt = Date.now();
  let lastDiagnostic: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const persisted = await running.db.fetch(matchID, {
        state: true,
        metadata: true,
        log: true,
        initialState: true
      });
      const state = persisted.state as BoardgameState | undefined;
      const pending = state?.G.pendingCleanupMarketResourceChoice;
      if (!expectedPendingPlayerId || pending?.playerId === expectedPendingPlayerId) {
        return persisted;
      }
      lastDiagnostic = {
        stateID: state?._stateID,
        pendingCleanupMarketResourceChoice: pending
      };
    } catch (error) {
      lastDiagnostic = error instanceof Error ? error.message : error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}; last persisted value: ${JSON.stringify(lastDiagnostic)}`);
}

async function removeTempDir(dir: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

describe("multiplayer Socket.IO transport", () => {
  it("synchronizes an authorized move and reconnects with saved credentials", async () => {
    const running = await runBoardgameServer();
    try {
      const { serverURL } = running;
      const { matchID } = await createMatch(serverURL);
      const host = await joinMatch(serverURL, matchID, "0", "Host");
      const guest = await joinMatch(serverURL, matchID, "1", "Guest");
      const hostClient = startClient(serverURL, matchID, "0", host.playerCredentials);
      const guestClient = startClient(serverURL, matchID, "1", guest.playerCredentials);
      const spectatorClient = startSpectatorClient(serverURL, matchID, "spectator-token");

      await waitFor(() => hostClient.getState()?.isConnected && guestClient.getState()?.isConnected, "both clients to connect");
      await waitFor(() => guestClient.getState()?.ctx.currentPlayer === "0", "guest to receive initial state");
      const spectatorInitialState = await waitForState<BoardgameState>(() => {
        const state = spectatorClient.getState();
        return state?.isConnected
          ? { done: true, value: state as BoardgameState }
          : { done: false, diagnostic: state };
      }, "spectator to receive initial state");
      expect(Object.values(spectatorInitialState.G.players).map((player) => player.hand)).toEqual([[], []]);
      expect(Object.values(spectatorInitialState.G.players).map((player) => player.history)).toEqual([[], []]);
      expect(hostClient.matchData).toBeDefined();
      expect(hostClient.credentials).toBe(host.playerCredentials);

      hostClient.moves.endTurn();

      const guestStateAfterMove = await waitForState<BoardgameState>(() => {
        const state = guestClient.getState();
        if (state === null) {
          return { done: false, diagnostic: null };
        }
        const pending = state.G.pendingCleanupMarketResourceChoice;
        return pending?.playerId === "1"
          ? { done: true, value: state }
          : {
              done: false,
              diagnostic: {
                host: hostClient.getState() && {
                  connected: hostClient.getState()?.isConnected,
                  active: hostClient.getState()?.isActive,
                  currentPlayer: hostClient.getState()?.ctx.currentPlayer,
                  stateID: hostClient.getState()?._stateID,
                  pendingCleanupMarketResourceChoice: hostClient.getState()?.G.pendingCleanupMarketResourceChoice
                },
                guest: state && {
                  connected: state.isConnected,
                  active: state.isActive,
                  currentPlayer: state.ctx.currentPlayer,
                  stateID: state._stateID,
                  pendingCleanupMarketResourceChoice: state.G.pendingCleanupMarketResourceChoice
                }
              }
            };
      }, "guest to receive host end-turn move");
      expect(guestStateAfterMove.G.pendingCleanupMarketResourceChoice).toEqual({
        playerId: "1",
        resource: "knowledge",
        amount: 1,
        cardIds: expect.arrayContaining(["test_action_archive_survey"])
      });
      await waitForState<BoardgameState>(() => {
        const state = spectatorClient.getState();
        if (state === null) {
          return { done: false, diagnostic: null };
        }
        return state._stateID >= guestStateAfterMove._stateID
          ? { done: true, value: state as BoardgameState }
          : { done: false, diagnostic: { stateID: state._stateID, targetStateID: guestStateAfterMove._stateID } };
      }, "spectator to receive redacted host move");
      expect(spectatorClient.getState()?.G.pendingCleanupMarketResourceChoice).toBeUndefined();

      stopClient(guestClient);
      const rejoinedGuestClient = startClient(serverURL, matchID, "1", guest.playerCredentials);
      const rejoinedState = await waitForState<BoardgameState>(() => {
        const state = rejoinedGuestClient.getState();
        if (state === null) {
          return { done: false, diagnostic: null };
        }
        const pending = state.G.pendingCleanupMarketResourceChoice;
        return state.isConnected && pending?.playerId === "1"
          ? { done: true, value: state }
          : {
              done: false,
              diagnostic: {
                connected: state.isConnected,
                currentPlayer: state.ctx.currentPlayer,
                stateID: state._stateID,
                pendingCleanupMarketResourceChoice: state.G.pendingCleanupMarketResourceChoice
              }
            };
      }, "rejoined guest to receive current match state");
      expect(rejoinedState.G.pendingCleanupMarketResourceChoice).toEqual(guestStateAfterMove.G.pendingCleanupMarketResourceChoice);
    } finally {
      stopAllClients();
      await stopBoardgameServer(running);
    }
  }, 10000);

  it("persists match state across server restart and reconnects with saved credentials", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "polity-boardgame-restart-"));
    let running: RunningBoardgameServer | undefined = await runBoardgameServer({ storageDir });
    try {
      const { matchID } = await createMatch(running.serverURL);
      const host = await joinMatch(running.serverURL, matchID, "0", "Host");
      const guest = await joinMatch(running.serverURL, matchID, "1", "Guest");
      const hostClient = startClient(running.serverURL, matchID, "0", host.playerCredentials);
      const guestClient = startClient(running.serverURL, matchID, "1", guest.playerCredentials);

      await waitFor(() => hostClient.getState()?.isConnected && guestClient.getState()?.isConnected, "both clients to connect before restart");
      await waitFor(() => guestClient.getState()?.ctx.currentPlayer === "0", "guest to receive initial state before restart");

      hostClient.moves.endTurn();

      const guestStateAfterMove = await waitForState<BoardgameState>(() => {
        const state = guestClient.getState();
        if (state === null) {
          return { done: false, diagnostic: null };
        }
        const pending = state.G.pendingCleanupMarketResourceChoice;
        return pending?.playerId === "1"
          ? { done: true, value: state }
          : {
              done: false,
              diagnostic: {
                connected: state.isConnected,
                currentPlayer: state.ctx.currentPlayer,
                stateID: state._stateID,
                pendingCleanupMarketResourceChoice: state.G.pendingCleanupMarketResourceChoice
              }
            };
      }, "guest to receive host move before restart");
      await waitForPersistedMatch(running, matchID, "FlatFile storage to persist host move before restart", "1");

      stopClient(hostClient);
      stopClient(guestClient);
      await waitForPersistedMatch(running, matchID, "FlatFile storage to settle after client disconnects", "1");
      await stopBoardgameServer(running);
      running = undefined;

      running = await runBoardgameServer({ storageDir });
      const rejoinedGuestClient = startClient(running.serverURL, matchID, "1", guest.playerCredentials);
      const rejoinedState = await waitForState<BoardgameState>(() => {
        const state = rejoinedGuestClient.getState();
        if (state === null) {
          return { done: false, diagnostic: null };
        }
        const pending = state.G.pendingCleanupMarketResourceChoice;
        return state.isConnected && pending?.playerId === "1"
          ? { done: true, value: state }
          : {
              done: false,
              diagnostic: {
                connected: state.isConnected,
                currentPlayer: state.ctx.currentPlayer,
                stateID: state._stateID,
                pendingCleanupMarketResourceChoice: state.G.pendingCleanupMarketResourceChoice
              }
            };
      }, "guest to receive persisted match state after restart");

      expect(rejoinedState.G.pendingCleanupMarketResourceChoice).toEqual(guestStateAfterMove.G.pendingCleanupMarketResourceChoice);
      expect(rejoinedState._stateID).toBeGreaterThanOrEqual(guestStateAfterMove._stateID);
    } finally {
      stopAllClients();
      await stopBoardgameServer(running);
      await removeTempDir(storageDir);
    }
  }, 15000);
});
