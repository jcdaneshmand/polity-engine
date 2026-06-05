import { describe, expect, it } from "vitest";
import { createLobbyStore } from "./lobbyStore";
import { createPregameLobbyMiddleware } from "./pregameLobby";
import { createPregameLobbyStore } from "./pregameLobbyStore";

type TestContext = {
  method: string;
  path: string;
  request: { body?: unknown };
  status?: number;
  body?: unknown;
};

function context(method: string, path: string, body?: unknown): TestContext {
  return { method, path, request: { body } };
}

function setupData(playerCount = 2) {
  return {
    options: {
      playerCount,
      mode: "multiplayer",
      commonsSetId: "classics",
      enabledExpansions: [],
      enabledVariants: []
    },
    playerNationIds: {}
  };
}

describe("pregame lobby middleware", () => {
  it("creates and lists lobbies without creating boardgame matches", async () => {
    const store = createPregameLobbyStore({ now: () => "2026-06-05T10:00:00.000Z", createID: () => "id", createCredential: () => "cred" });
    const calls: unknown[] = [];
    const middleware = createPregameLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async (input) => {
          calls.push(input);
          return { matchID: "match-1" };
        },
        joinMatch: async () => ({ playerCredentials: "player-token" })
      }
    });

    const create = context("POST", "/polity/lobby/rooms", {
      roomName: "Pregame",
      playerCount: 2,
      setupData: setupData(),
      privateDataFingerprint: "placeholder",
      hostName: "Host"
    });
    await middleware(create, async () => undefined);
    expect(create.status).toBe(201);
    expect(create.body).toEqual(expect.objectContaining({ lobbyID: "id", seatID: "0", lobbyCredentials: "cred" }));
    expect(calls).toEqual([]);

    const list = context("GET", "/polity/lobby/rooms");
    await middleware(list, async () => undefined);
    expect(list.body).toEqual({ lobbies: [expect.objectContaining({ lobbyID: "id", roomName: "Pregame", availableSeats: ["1"] })] });
  });

  it("joins locked lobbies only after password and private-data checks", async () => {
    let next = 0;
    const store = createPregameLobbyStore({
      now: () => "2026-06-05T10:00:00.000Z",
      createID: () => `id-${next += 1}`,
      createCredential: () => `cred-${next += 1}`,
      hashPassword: (value) => `hash:${value}`
    });
    const middleware = createPregameLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async () => ({ playerCredentials: "player-token" })
      }
    });

    const create = context("POST", "/polity/lobby/rooms", {
      roomName: "Locked",
      playerCount: 2,
      setupData: setupData(),
      privateDataFingerprint: "private:a",
      password: "pw",
      hostName: "Host"
    });
    await middleware(create, async () => undefined);
    const lobbyID = (create.body as { lobbyID: string }).lobbyID;

    const wrong = context("POST", `/polity/lobby/rooms/${lobbyID}/join`, { displayName: "Guest", password: "bad", privateDataFingerprint: "private:a" });
    await middleware(wrong, async () => undefined);
    expect(wrong.status).toBe(403);
    expect(wrong.body).toEqual({ error: "wrong_password" });

    const mismatch = context("POST", `/polity/lobby/rooms/${lobbyID}/join`, { displayName: "Guest", password: "pw", privateDataFingerprint: "private:b" });
    await middleware(mismatch, async () => undefined);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body).toEqual({ error: "private_data_mismatch" });

    const success = context("POST", `/polity/lobby/rooms/${lobbyID}/join`, { displayName: "Guest", password: "pw", privateDataFingerprint: "private:a" });
    await middleware(success, async () => undefined);
    expect(success.body).toEqual(expect.objectContaining({ seatID: "1", lobbyCredentials: expect.any(String), lobby: expect.objectContaining({ viewer: { seatID: "1", isHost: false } }) }));
  });

  it("lets host update setup, players select nations, ready, and start the game", async () => {
    let next = 0;
    const store = createPregameLobbyStore({
      now: () => "2026-06-05T10:00:00.000Z",
      createID: () => `id-${next += 1}`,
      createCredential: () => `cred-${next += 1}`
    });
    const matchStore = createLobbyStore({ now: () => "2026-06-05T10:00:00.000Z" });
    const createdMatches: unknown[] = [];
    const joinedMatches: unknown[] = [];
    const middleware = createPregameLobbyMiddleware({
      store,
      matchStore,
      boardgameApi: {
        createMatch: async (input) => {
          createdMatches.push(input);
          return { matchID: "match-1" };
        },
        joinMatch: async (input) => {
          joinedMatches.push(input);
          return { playerCredentials: `token-${input.playerID}` };
        }
      }
    });

    const create = context("POST", "/polity/lobby/rooms", { playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" });
    await middleware(create, async () => undefined);
    const host = create.body as { lobbyID: string; lobbyCredentials: string };
    const join = context("POST", `/polity/lobby/rooms/${host.lobbyID}/join`, { displayName: "Guest", privateDataFingerprint: "placeholder" });
    await middleware(join, async () => undefined);
    const guest = join.body as { lobbyCredentials: string };

    const update = context("POST", `/polity/lobby/rooms/${host.lobbyID}/update-setup`, { lobbyCredentials: host.lobbyCredentials, roomName: "Updated", playerCount: 2, setupData: setupData() });
    await middleware(update, async () => undefined);
    expect(update.body).toEqual(expect.objectContaining({ ok: true, lobby: expect.objectContaining({ roomName: "Updated" }) }));

    await middleware(context("POST", `/polity/lobby/rooms/${host.lobbyID}/select-nation`, { lobbyCredentials: host.lobbyCredentials, nationID: "test_nation_sun_coast" }), async () => undefined);
    await middleware(context("POST", `/polity/lobby/rooms/${host.lobbyID}/select-nation`, { lobbyCredentials: guest.lobbyCredentials, nationID: "test_nation_sun_coast" }), async () => undefined);
    await middleware(context("POST", `/polity/lobby/rooms/${host.lobbyID}/ready`, { lobbyCredentials: host.lobbyCredentials, ready: true }), async () => undefined);
    const guestReady = context("POST", `/polity/lobby/rooms/${host.lobbyID}/ready`, { lobbyCredentials: guest.lobbyCredentials, ready: true });
    await middleware(guestReady, async () => undefined);
    expect((guestReady.body as { lobby: { status: string } }).lobby.status).toBe("locked");

    const start = context("POST", `/polity/lobby/rooms/${host.lobbyID}/start`, { lobbyCredentials: host.lobbyCredentials });
    await middleware(start, async () => undefined);
    expect(start.body).toEqual(expect.objectContaining({ matchID: "match-1", playerCredentials: "token-0" }));
    expect(createdMatches).toEqual([expect.objectContaining({
      numPlayers: 2,
      setupData: expect.objectContaining({ playerNationIds: { "0": "test_nation_sun_coast", "1": "test_nation_sun_coast" } })
    })]);
    expect(joinedMatches).toEqual([
      { matchID: "match-1", playerID: "0", playerName: "Host" },
      { matchID: "match-1", playerID: "1", playerName: "Guest" }
    ]);
    expect(matchStore.listMatches()).toEqual([
      expect.objectContaining({
        matchID: "match-1",
        roomName: "Updated",
        status: "in_progress",
        spectatingAllowed: true,
        availableSeats: [],
        occupiedSeats: [
          { playerID: "0", playerName: "Host", isConnected: true },
          { playerID: "1", playerName: "Guest", isConnected: true }
        ]
      })
    ]);
  });

  it("rejects pregame spectation", async () => {
    const store = createPregameLobbyStore({ now: () => "2026-06-05T10:00:00.000Z", createID: () => "id", createCredential: () => "cred" });
    const middleware = createPregameLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async () => ({ playerCredentials: "player-token" })
      }
    });
    const create = context("POST", "/polity/lobby/rooms", { playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder" });
    await middleware(create, async () => undefined);

    const spectate = context("POST", "/polity/lobby/rooms/id/spectate", {});
    await middleware(spectate, async () => undefined);
    expect(spectate.status).toBe(409);
    expect(spectate.body).toEqual({ error: "spectation_unavailable" });
  });

  it("serves lounge and lobby chat over HTTP", async () => {
    const store = createPregameLobbyStore({ now: () => "2026-06-05T10:00:00.000Z", createID: () => "id", createCredential: () => "cred" });
    const middleware = createPregameLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async () => ({ playerCredentials: "player-token" })
      }
    });
    const create = context("POST", "/polity/lobby/rooms", { playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" });
    await middleware(create, async () => undefined);

    const loungeSend = context("POST", "/polity/lobby/chat", { author: "Jonah", text: "Looking for a table." });
    await middleware(loungeSend, async () => undefined);
    expect(loungeSend.body).toEqual({ message: expect.objectContaining({ author: "Jonah", text: "Looking for a table." }) });

    const loungeList = context("GET", "/polity/lobby/chat");
    await middleware(loungeList, async () => undefined);
    expect(loungeList.body).toEqual({ messages: [expect.objectContaining({ author: "Jonah" })] });

    const lobbySend = context("POST", "/polity/lobby/rooms/id/chat/send", { lobbyCredentials: "cred", text: "Seat one checking in." });
    await middleware(lobbySend, async () => undefined);
    expect(lobbySend.body).toEqual({ message: expect.objectContaining({ author: "Host", text: "Seat one checking in." }) });

    const lobbyList = context("POST", "/polity/lobby/rooms/id/chat", { lobbyCredentials: "cred" });
    await middleware(lobbyList, async () => undefined);
    expect(lobbyList.body).toEqual({ messages: [expect.objectContaining({ author: "Host" })] });
  });

  it("records lobby heartbeats", async () => {
    const store = createPregameLobbyStore({ now: () => "2026-06-05T10:00:00.000Z", createID: () => "id", createCredential: () => "cred" });
    const middleware = createPregameLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async () => ({ playerCredentials: "player-token" })
      }
    });
    await middleware(context("POST", "/polity/lobby/rooms", { playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" }), async () => undefined);

    const heartbeat = context("POST", "/polity/lobby/rooms/id/heartbeat", { lobbyCredentials: "cred" });
    await middleware(heartbeat, async () => undefined);
    expect(heartbeat.body).toEqual({ ok: true });
  });

  it("lets admin clear pregame lobbies and listed matches", async () => {
    const store = createPregameLobbyStore({ now: () => "2026-06-05T10:00:00.000Z", createID: () => "id", createCredential: () => "cred" });
    const matchStore = createLobbyStore({ now: () => "2026-06-05T10:00:00.000Z" });
    const middleware = createPregameLobbyMiddleware({
      store,
      matchStore,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async () => ({ playerCredentials: "player-token" })
      }
    });
    await middleware(context("POST", "/polity/lobby/rooms", { playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" }), async () => undefined);
    matchStore.createMatchMetadata({ matchID: "match-1", roomName: "Started", playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder" });

    const clear = context("POST", "/polity/lobby/admin/clear", {});
    await middleware(clear, async () => undefined);

    expect(clear.body).toEqual({ ok: true, lobbiesCleared: 1, matchesCleared: 1 });
    expect(store.listLobbies()).toEqual([]);
    expect(matchStore.listMatches()).toEqual([]);
  });
});
