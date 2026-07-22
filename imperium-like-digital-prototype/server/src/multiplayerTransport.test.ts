import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "boardgame.io/client";
import { SocketIO as ClientSocketIO } from "boardgame.io/multiplayer";
import { afterEach, describe, expect, it } from "vitest";
import { PrototypeGame } from "../../engine/src/game/game";
import type { GameState, ResourceName } from "../../engine/src/game/state";
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

function expectConsistentMultiplayerState(state: BoardgameState) {
  const { G } = state;
  const engineCurrentPlayer = G.players[state.ctx.currentPlayer]
    ? state.ctx.currentPlayer
    : G.playOrder?.[Number(state.ctx.currentPlayer)] ?? state.ctx.currentPlayer;
  expect(G.players[engineCurrentPlayer], `missing current player ${state.ctx.currentPlayer}`).toBeDefined();
  expect(G.market.every((cardId) => Boolean(G.cardDb[cardId])), "market contains unknown card").toBe(true);
  for (const [playerId, player] of Object.entries(G.players)) {
    for (const resource of ["materials", "knowledge", "influence", "unrest", "goods"] satisfies ResourceName[]) {
      expect(player.resources[resource], `${playerId} has negative ${resource}`).toBeGreaterThanOrEqual(0);
    }
    expect(player.actionsRemaining, `${playerId} has negative actions`).toBeGreaterThanOrEqual(0);
    expect(player.actionTokensAvailable, `${playerId} has negative action tokens`).toBeGreaterThanOrEqual(0);
    expect(player.exhaustTokensAvailable, `${playerId} has negative exhaust tokens`).toBeGreaterThanOrEqual(0);
  }
}

type AutomatedMove = {
  playerID: string;
  name: string;
  run: (client: BoardgameClient) => void;
};

function chooseAutomatedMove(state: BoardgameState): AutomatedMove {
  const { G } = state;
  const playerID = state.ctx.currentPlayer;
  if (G.pendingChoice) return { playerID, name: "resolveChoice", run: (client) => client.moves.resolveChoice(0) };
  if (G.pendingDrawChoice) return { playerID, name: "resolveDrawChoice", run: (client) => client.moves.resolveDrawChoice(G.pendingDrawChoice!.cardIds[0]) };
  if (G.pendingFindChoice) return { playerID, name: "resolveFindChoice", run: (client) => client.moves.resolveFindChoice(G.pendingFindChoice!.cardIds[0]) };
  if (G.pendingAcquireChoice) return { playerID, name: "resolveAcquireChoice", run: (client) => client.moves.resolveAcquireChoice(G.pendingAcquireChoice!.cardIds[0]) };
  if (G.pendingMarketCardChoice) return { playerID, name: "resolveMarketCardChoice", run: (client) => client.moves.resolveMarketCardChoice(G.pendingMarketCardChoice!.cardIds[0]) };
  if (G.pendingBreakThroughChoice) return { playerID, name: "resolveBreakThroughChoice", run: (client) => client.moves.resolveBreakThroughChoice(G.pendingBreakThroughChoice!.cardIds[0]) };
  if (G.pendingExileChoice?.optional) return { playerID, name: "skipExileChoice", run: (client) => client.moves.skipExileChoice() };
  if (G.pendingExileChoice) return { playerID, name: "resolveExileChoice", run: (client) => client.moves.resolveExileChoice(G.pendingExileChoice!.cardIds[0]) };
  if (G.pendingGarrisonChoice) {
    return {
      playerID,
      name: "resolveGarrisonChoice",
      run: (client) => client.moves.resolveGarrisonChoice(G.pendingGarrisonChoice!.hostCardIds[0], G.pendingGarrisonChoice!.cardIds[0])
    };
  }
  if (G.pendingRegionChoice) return { playerID, name: "resolveRegionChoice", run: (client) => client.moves.resolveRegionChoice(G.pendingRegionChoice!.cardIds[0]) };
  if (G.pendingDevelopmentChoice?.allowSkip) return { playerID, name: "skipDevelopmentChoice", run: (client) => client.moves.skipDevelopmentChoice() };
  if (G.pendingDevelopmentChoice) return { playerID, name: "resolveDevelopmentChoice", run: (client) => client.moves.resolveDevelopmentChoice(G.pendingDevelopmentChoice!.cardIds[0]) };
  if (G.pendingShortGameDevelopmentExileChoice) {
    return {
      playerID,
      name: "resolveShortGameDevelopmentExileChoice",
      run: (client) => client.moves.resolveShortGameDevelopmentExileChoice(G.pendingShortGameDevelopmentExileChoice!.cardIds[0])
    };
  }
  if (G.pendingTradeChoice) return { playerID, name: "resolveTradeChoice", run: (client) => client.moves.resolveTradeChoice(G.pendingTradeChoice!.routeCardIds[0]) };
  if (G.pendingDiscardChoice) return { playerID, name: "resolveDiscardChoice", run: (client) => client.moves.resolveDiscardChoice(G.pendingDiscardChoice!.cardIds.slice(0, G.pendingDiscardChoice!.count)) };
  if (G.pendingReturnUnrestChoice) return { playerID, name: "resolveReturnUnrestChoice", run: (client) => client.moves.resolveReturnUnrestChoice(G.pendingReturnUnrestChoice!.cardIds[0]) };
  if (G.pendingReturnFameChoice) return { playerID, name: "resolveReturnFameChoice", run: (client) => client.moves.resolveReturnFameChoice(G.pendingReturnFameChoice!.cardIds[0]) };
  if (G.pendingPlaceOnDeckChoice) return { playerID, name: "resolvePlaceOnDeckChoice", run: (client) => client.moves.resolvePlaceOnDeckChoice(G.pendingPlaceOnDeckChoice!.cardIds[0]) };
  if (G.pendingReturnExhaustTokenChoice) return { playerID, name: "resolveReturnExhaustTokenChoice", run: (client) => client.moves.resolveReturnExhaustTokenChoice(G.pendingReturnExhaustTokenChoice!.cardIds[0]) };
  if (G.pendingFreePlayChoice) return { playerID, name: "resolveFreePlayChoice", run: (client) => client.moves.resolveFreePlayChoice(G.pendingFreePlayChoice!.cardIds[0]) };
  if (G.pendingGiveCardChoice) {
    return {
      playerID,
      name: "resolveGiveCardChoice",
      run: (client) => client.moves.resolveGiveCardChoice(G.pendingGiveCardChoice!.cardIds[0], G.pendingGiveCardChoice!.recipientPlayerIds[0])
    };
  }
  if (G.pendingSwapChoice) {
    return {
      playerID,
      name: "resolveSwapChoice",
      run: (client) => client.moves.resolveSwapChoice(G.pendingSwapChoice!.choices[0].cardId, G.pendingSwapChoice!.choices[0].marketCardId)
    };
  }
  if (G.pendingLookOrderChoice) return { playerID, name: "resolveLookOrderChoice", run: (client) => client.moves.resolveLookOrderChoice(G.pendingLookOrderChoice!.cardIds) };
  if (G.pendingLookTakeChoice) return { playerID, name: "resolveLookTakeChoice", run: (client) => client.moves.resolveLookTakeChoice(G.pendingLookTakeChoice!.cardIds[0]) };
  if (G.pendingUnrestAllocationChoice) {
    return {
      playerID,
      name: "resolveUnrestAllocationChoice",
      run: (client) => client.moves.resolveUnrestAllocationChoice(
        G.pendingUnrestAllocationChoice!.recipientPlayerIds.slice(0, G.pendingUnrestAllocationChoice!.countPerPlayer)
      )
    };
  }
  if (G.pendingReactiveExhaustChoice) return { playerID, name: "skipReactiveExhaustChoice", run: (client) => client.moves.skipReactiveExhaustChoice() };
  if (G.pendingMarketResourcePlacementChoice) {
    return {
      playerID,
      name: "resolveMarketResourcePlacement",
      run: (client) => client.moves.resolveMarketResourcePlacement(
        G.pendingMarketResourcePlacementChoice!.cardIds.slice(0, G.pendingMarketResourcePlacementChoice!.amount)
      )
    };
  }
  if (G.pendingSolsticeOrderChoice) return { playerID, name: "resolveSolsticeOrderChoice", run: (client) => client.moves.resolveSolsticeOrderChoice(G.pendingSolsticeOrderChoice!.cardIds) };
  if (G.pendingCleanupMarketResourceChoice) {
    return {
      playerID,
      name: "resolveCleanupMarketResource",
      run: (client) => client.moves.resolveCleanupMarketResource(G.pendingCleanupMarketResourceChoice!.cardIds[0])
    };
  }
  if (G.pendingCleanupDiscardChoice) return { playerID, name: "resolveCleanupDiscard", run: (client) => client.moves.resolveCleanupDiscard([]) };

  return { playerID, name: "endTurn", run: (client) => client.moves.endTurn() };
}

async function waitForStateAdvance(client: BoardgameClient, previousStateID: number, label: string) {
  return await waitForState<BoardgameState>(() => {
    const state = client.getState() as BoardgameState | null;
    if (state === null) return { done: false, diagnostic: null };
    return state._stateID > previousStateID || state.G.gameover
      ? { done: true, value: state as BoardgameState }
      : { done: false, diagnostic: { stateID: state._stateID, label } };
  }, label);
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

async function waitForPersistedConnectionStatus(
  running: RunningBoardgameServer,
  matchID: string,
  expected: Record<string, boolean>,
  label: string,
  timeoutMs = 5000
) {
  if (!running.db) {
    throw new Error("Persistent connection polling requires FlatFile storage");
  }
  const startedAt = Date.now();
  let lastDiagnostic: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const persisted = await running.db.fetch(matchID, { metadata: true });
      const players = (persisted.metadata as any)?.players ?? {};
      const actual = Object.fromEntries(
        Object.keys(expected).map((playerID) => [playerID, Boolean(players[playerID]?.isConnected)])
      );
      if (Object.entries(expected).every(([playerID, connected]) => actual[playerID] === connected)) {
        return persisted;
      }
      lastDiagnostic = actual;
    } catch (error) {
      lastDiagnostic = error instanceof Error ? error.message : error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}; last persisted connections: ${JSON.stringify(lastDiagnostic)}`);
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

      const hostStateAfterMove = await waitForState<BoardgameState>(() => {
        const state = hostClient.getState();
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
                guest: guestClient.getState() && {
                  connected: guestClient.getState()?.isConnected,
                  active: guestClient.getState()?.isActive,
                  currentPlayer: guestClient.getState()?.ctx.currentPlayer,
                  stateID: guestClient.getState()?._stateID,
                  pendingCleanupMarketResourceChoice: guestClient.getState()?.G.pendingCleanupMarketResourceChoice
                }
              }
            };
      }, "host to receive own end-turn cleanup choice");
      expect(hostStateAfterMove.G.pendingCleanupMarketResourceChoice).toEqual({
        playerId: "1",
        resource: "knowledge",
        amount: 1,
        cardIds: expect.arrayContaining(["test_action_archive_survey"])
      });
      expect(guestClient.getState()?.G.pendingCleanupMarketResourceChoice).toBeUndefined();
      await waitForState<BoardgameState>(() => {
        const state = spectatorClient.getState();
        if (state === null) {
          return { done: false, diagnostic: null };
        }
        return state._stateID >= hostStateAfterMove._stateID
          ? { done: true, value: state as BoardgameState }
          : { done: false, diagnostic: { stateID: state._stateID, targetStateID: hostStateAfterMove._stateID } };
      }, "spectator to receive redacted host move");
      expect(spectatorClient.getState()?.G.pendingCleanupMarketResourceChoice).toBeUndefined();

      stopClient(hostClient);
      const rejoinedHostClient = startClient(serverURL, matchID, "0", host.playerCredentials);
      const rejoinedState = await waitForState<BoardgameState>(() => {
        const state = rejoinedHostClient.getState();
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
      }, "rejoined host to receive current match state");
      expect(rejoinedState.G.pendingCleanupMarketResourceChoice).toEqual(hostStateAfterMove.G.pendingCleanupMarketResourceChoice);
    } finally {
      stopAllClients();
      await stopBoardgameServer(running);
    }
  }, 10000);

  it("persists match state across server restart and reconnects with saved credentials", async () => {
    const storageDir = await mkdtemp(join(tmpdir(), "polity-boardgame-restart-"));
    let running: RunningBoardgameServer | undefined = await runBoardgameServer({ storageDir });
    let matchID: string | undefined;
    try {
      ({ matchID } = await createMatch(running.serverURL));
      const host = await joinMatch(running.serverURL, matchID, "0", "Host");
      const guest = await joinMatch(running.serverURL, matchID, "1", "Guest");
      const hostClient = startClient(running.serverURL, matchID, "0", host.playerCredentials);
      const guestClient = startClient(running.serverURL, matchID, "1", guest.playerCredentials);

      await waitFor(() => hostClient.getState()?.isConnected && guestClient.getState()?.isConnected, "both clients to connect before restart");
      await waitFor(() => guestClient.getState()?.ctx.currentPlayer === "0", "guest to receive initial state before restart");

      hostClient.moves.endTurn();

      const hostStateAfterMove = await waitForState<BoardgameState>(() => {
        const state = hostClient.getState();
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
      }, "host to receive own move before restart");
      expect(guestClient.getState()?.G.pendingCleanupMarketResourceChoice).toBeUndefined();
      await waitForPersistedMatch(running, matchID, "FlatFile storage to persist host move before restart", "1");

      stopClient(hostClient);
      stopClient(guestClient);
      await waitForPersistedConnectionStatus(running, matchID, { "0": false }, "FlatFile storage to persist host disconnect before restart");
      await waitForPersistedMatch(running, matchID, "FlatFile storage to settle after client disconnects", "1");
      await stopBoardgameServer(running);
      running = undefined;

      running = await runBoardgameServer({ storageDir });
      const rejoinedHostClient = startClient(running.serverURL, matchID, "0", host.playerCredentials);
      const rejoinedState = await waitForState<BoardgameState>(() => {
        const state = rejoinedHostClient.getState();
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
      }, "host to receive persisted match state after restart");

      expect(rejoinedState.G.pendingCleanupMarketResourceChoice).toEqual(hostStateAfterMove.G.pendingCleanupMarketResourceChoice);
      expect(rejoinedState._stateID).toBeGreaterThanOrEqual(hostStateAfterMove._stateID);
    } finally {
      stopAllClients();
      if (running && matchID) {
        await waitForPersistedConnectionStatus(running, matchID, { "0": false }, "FlatFile storage to persist final rejoined client disconnect", 1000).catch(() => undefined);
      }
      await stopBoardgameServer(running);
      await removeTempDir(storageDir);
    }
  }, 15000);

  it("automates multiplayer moves and resolves end-turn market resource placement", async () => {
    const running = await runBoardgameServer();
    try {
      const { serverURL } = running;
      const { matchID } = await createMatch(serverURL);
      const host = await joinMatch(serverURL, matchID, "0", "Host");
      const guest = await joinMatch(serverURL, matchID, "1", "Guest");
      const clientsByPlayer: Record<string, BoardgameClient> = {
        "0": startClient(serverURL, matchID, "0", host.playerCredentials),
        "1": startClient(serverURL, matchID, "1", guest.playerCredentials)
      };

      await waitFor(() => clientsByPlayer["0"].getState()?.isConnected && clientsByPlayer["1"].getState()?.isConnected, "both automated clients to connect");
      const initialState = await waitForState<BoardgameState>(() => {
        const state = clientsByPlayer["0"].getState();
        return state?.ctx.currentPlayer === "0"
          ? { done: true, value: state as BoardgameState }
          : { done: false, diagnostic: state && { currentPlayer: state.ctx.currentPlayer, stateID: state._stateID } };
      }, "automated match initial state");
      expectConsistentMultiplayerState(initialState);

      clientsByPlayer["0"].moves.endTurn();
      const pendingCleanup = await waitForState<BoardgameState>(() => {
        const state = clientsByPlayer["0"].getState() as BoardgameState | null;
        if (state === null) return { done: false, diagnostic: null };
        const pending = state.G.pendingCleanupMarketResourceChoice;
        return pending?.playerId === "1"
          ? { done: true, value: state as BoardgameState }
          : { done: false, diagnostic: { stateID: state._stateID, currentPlayer: state.ctx.currentPlayer, pending } };
      }, "host market resource placement after host end turn");
      const guestSnapshotAfterHostCleanup = clientsByPlayer["1"].getState() as BoardgameState | null;
      expect(guestSnapshotAfterHostCleanup?.G.pendingCleanupMarketResourceChoice).toBeUndefined();
      expect(pendingCleanup.G.pendingCleanupMarketResourceChoice).toMatchObject({
        playerId: "1",
        resource: "knowledge",
        amount: 1,
        cardIds: expect.arrayContaining(["test_action_archive_survey"])
      });

      const placementCardId = pendingCleanup.G.pendingCleanupMarketResourceChoice!.cardIds[0];
      const cleanupClientID = String(pendingCleanup.ctx.currentPlayer);
      const cleanupClient = clientsByPlayer[cleanupClientID];
      expect(cleanupClient, `no client for cleanup player ${cleanupClientID}`).toBeDefined();
      cleanupClient.moves.resolveCleanupMarketResource(placementCardId);
      const afterOneClickPlacement = await waitForStateAdvance(
        cleanupClient,
        pendingCleanup._stateID,
        "one-click market resource placement to resolve"
      );
      expect(afterOneClickPlacement.G.pendingCleanupMarketResourceChoice).toBeUndefined();
      expect(afterOneClickPlacement.G.marketResources?.[placementCardId]?.knowledge).toBe(1);
      expectConsistentMultiplayerState(afterOneClickPlacement);

      const moveTrace: string[] = ["endTurn", `resolveCleanupMarketResource:${placementCardId}`];
      let state = afterOneClickPlacement;
      for (let step = 0; step < 24 && !state.G.gameover; step += 1) {
        const move = chooseAutomatedMove(state);
        const client = clientsByPlayer[move.playerID];
        expect(client, `no client for automated move player ${move.playerID}`).toBeDefined();
        const previousStateID = state._stateID;
        move.run(client);
        state = await waitForStateAdvance(client, previousStateID, `automated move ${step + 1}: ${move.name}`);
        moveTrace.push(move.name);
        expectConsistentMultiplayerState(state);
      }

      expect(moveTrace.length).toBeGreaterThanOrEqual(12);
      expect(moveTrace).toContain(`resolveCleanupMarketResource:${placementCardId}`);
      expect(
        state.G.log.filter((entry) => entry.message.startsWith("InvalidMove(")),
        `trace=${moveTrace.join(" -> ")}`
      ).toEqual([]);
    } finally {
      stopAllClients();
      await stopBoardgameServer(running);
    }
  }, 20000);
});
