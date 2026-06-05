import { describe, expect, it } from "vitest";
import { createLobbyStore } from "./lobbyStore";
import { createPolityLobbyMiddleware } from "./polityLobby";

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

describe("polity lobby middleware", () => {
  it("creates and lists lobby matches", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    const middleware = createPolityLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async () => ({ playerCredentials: "unused" })
      }
    });

    const createCtx = context("POST", "/polity/lobby/matches", {
      roomName: "Friday Table",
      numPlayers: 2,
      setupData: { options: { commonsSetId: "classics", enabledExpansions: [], enabledVariants: [] } },
      privateDataFingerprint: "placeholder"
    });
    await middleware(createCtx, async () => undefined);

    expect(createCtx.status).toBe(201);
    expect(createCtx.body).toEqual(expect.objectContaining({ matchID: "match-1", roomName: "Friday Table" }));

    const listCtx = context("GET", "/polity/lobby/matches");
    await middleware(listCtx, async () => undefined);

    expect(listCtx.body).toEqual({ matches: [expect.objectContaining({ matchID: "match-1", roomName: "Friday Table" })] });
  });

  it("gates locked joins by password and private data fingerprint", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z", hashPassword: (value) => `hash:${value}` });
    const joined: unknown[] = [];
    const middleware = createPolityLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async (input) => {
          joined.push(input);
          return { playerCredentials: "seat-token" };
        }
      }
    });

    await middleware(context("POST", "/polity/lobby/matches", {
      roomName: "Locked",
      numPlayers: 2,
      setupData: {},
      privateDataFingerprint: "fp-a",
      password: "pw"
    }), async () => undefined);

    const wrongPassword = context("POST", "/polity/lobby/matches/match-1/join", {
      playerID: "1",
      playerName: "Joiner",
      password: "bad",
      privateDataFingerprint: "fp-a"
    });
    await middleware(wrongPassword, async () => undefined);
    expect(wrongPassword.status).toBe(403);
    expect(wrongPassword.body).toEqual({ error: "wrong_password" });

    const mismatch = context("POST", "/polity/lobby/matches/match-1/join", {
      playerID: "1",
      playerName: "Joiner",
      password: "pw",
      privateDataFingerprint: "fp-b"
    });
    await middleware(mismatch, async () => undefined);
    expect(mismatch.status).toBe(409);
    expect(mismatch.body).toEqual({ error: "private_data_mismatch" });

    const success = context("POST", "/polity/lobby/matches/match-1/join", {
      playerID: "1",
      playerName: "Joiner",
      password: "pw",
      privateDataFingerprint: "fp-a"
    });
    await middleware(success, async () => undefined);
    expect(success.body).toEqual({ playerCredentials: "seat-token", playerID: "1", match: expect.objectContaining({ occupiedSeats: [expect.objectContaining({ playerID: "1" })] }) });
    expect(joined).toEqual([{ matchID: "match-1", playerID: "1", playerName: "Joiner" }]);
  });

  it("assigns the first open seat for join-by-code and rejects occupied seats", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    const joined: unknown[] = [];
    const middleware = createPolityLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async (input) => {
          joined.push(input);
          return { playerCredentials: `token-${input.playerID}` };
        }
      }
    });

    await middleware(context("POST", "/polity/lobby/matches", {
      roomName: "Open",
      numPlayers: 2,
      setupData: {},
      privateDataFingerprint: "placeholder"
    }), async () => undefined);

    const firstJoin = context("POST", "/polity/lobby/matches/match-1/join", {
      playerName: "First",
      privateDataFingerprint: "placeholder"
    });
    await middleware(firstJoin, async () => undefined);
    expect(firstJoin.body).toEqual({ playerCredentials: "token-0", playerID: "0", match: expect.objectContaining({ availableSeats: ["1"] }) });

    const occupied = context("POST", "/polity/lobby/matches/match-1/join", {
      playerID: "0",
      playerName: "Duplicate",
      privateDataFingerprint: "placeholder"
    });
    await middleware(occupied, async () => undefined);
    expect(occupied.status).toBe(409);
    expect(occupied.body).toEqual({ error: "seat_unavailable" });
    expect(joined).toEqual([{ matchID: "match-1", playerID: "0", playerName: "First" }]);
  });

  it("rejects a second player seat for the same client in one match", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    const joined: unknown[] = [];
    const middleware = createPolityLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async (input) => {
          joined.push(input);
          return { playerCredentials: `token-${input.playerID}` };
        }
      }
    });

    await middleware(context("POST", "/polity/lobby/matches", {
      roomName: "Open",
      numPlayers: 2,
      setupData: {},
      privateDataFingerprint: "placeholder"
    }), async () => undefined);

    await middleware(context("POST", "/polity/lobby/matches/match-1/join", {
      playerName: "First",
      privateDataFingerprint: "placeholder",
      clientID: "client-a"
    }), async () => undefined);

    const duplicate = context("POST", "/polity/lobby/matches/match-1/join", {
      playerName: "Same Browser",
      privateDataFingerprint: "placeholder",
      clientID: "client-a"
    });
    await middleware(duplicate, async () => undefined);

    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: "duplicate_client" });
    expect(joined).toEqual([{ matchID: "match-1", playerID: "0", playerName: "First" }]);
  });

  it("lets the host close and remove a listed match", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    const middleware = createPolityLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async (input) => ({ playerCredentials: `token-${input.playerID}` })
      }
    });

    await middleware(context("POST", "/polity/lobby/matches", {
      roomName: "Open",
      numPlayers: 2,
      setupData: {},
      privateDataFingerprint: "placeholder"
    }), async () => undefined);
    await middleware(context("POST", "/polity/lobby/matches/match-1/join", { playerID: "0", playerName: "Host", privateDataFingerprint: "placeholder" }), async () => undefined);

    const close = context("POST", "/polity/lobby/matches/match-1/close", { playerID: "0" });
    await middleware(close, async () => undefined);
    expect(close.body).toEqual({ ok: true });

    const list = context("GET", "/polity/lobby/matches");
    await middleware(list, async () => undefined);
    expect(list.body).toEqual({ matches: [] });
  });

  it("records player heartbeats for listed matches", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    const middleware = createPolityLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async (input) => ({ playerCredentials: `token-${input.playerID}` })
      }
    });

    await middleware(context("POST", "/polity/lobby/matches", {
      roomName: "Open",
      numPlayers: 2,
      setupData: {},
      privateDataFingerprint: "placeholder"
    }), async () => undefined);
    await middleware(context("POST", "/polity/lobby/matches/match-1/join", { playerID: "0", playerName: "Host", privateDataFingerprint: "placeholder", clientID: "client-a" }), async () => undefined);

    const heartbeat = context("POST", "/polity/lobby/matches/match-1/heartbeat", { playerID: "0", clientID: "client-a" });
    await middleware(heartbeat, async () => undefined);
    expect(heartbeat.body).toEqual({ ok: true });
  });

  it("clears occupied seats when players leave and removes empty matches", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    const middleware = createPolityLobbyMiddleware({
      store,
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async (input) => ({ playerCredentials: `token-${input.playerID}` })
      }
    });

    await middleware(context("POST", "/polity/lobby/matches", {
      roomName: "Open",
      numPlayers: 2,
      setupData: {},
      privateDataFingerprint: "placeholder"
    }), async () => undefined);
    await middleware(context("POST", "/polity/lobby/matches/match-1/join", { playerID: "0", playerName: "Host", privateDataFingerprint: "placeholder" }), async () => undefined);
    await middleware(context("POST", "/polity/lobby/matches/match-1/join", { playerID: "1", playerName: "Guest", privateDataFingerprint: "placeholder" }), async () => undefined);

    const firstLeave = context("POST", "/polity/lobby/matches/match-1/leave", { playerID: "0" });
    await middleware(firstLeave, async () => undefined);
    expect(firstLeave.body).toEqual({ ok: true, match: expect.objectContaining({ occupiedSeats: [expect.objectContaining({ playerID: "1" })] }) });

    const secondLeave = context("POST", "/polity/lobby/matches/match-1/leave", { playerID: "1" });
    await middleware(secondLeave, async () => undefined);
    expect(secondLeave.body).toEqual({ ok: true });

    const list = context("GET", "/polity/lobby/matches");
    await middleware(list, async () => undefined);
    expect(list.body).toEqual({ matches: [] });
  });

  it("authorizes spectators without issuing player seats", async () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z", hashPassword: (value) => `hash:${value}` });
    const middleware = createPolityLobbyMiddleware({
      store,
      createSpectatorCredentials: () => "spectator-token",
      boardgameApi: {
        createMatch: async () => ({ matchID: "match-1" }),
        joinMatch: async () => ({ playerCredentials: "unused" })
      }
    });

    await middleware(context("POST", "/polity/lobby/matches", {
      roomName: "Watch",
      numPlayers: 2,
      setupData: {},
      privateDataFingerprint: "fp-a",
      password: "pw"
    }), async () => undefined);

    const spectate = context("POST", "/polity/lobby/matches/match-1/spectate", {
      password: "pw",
      privateDataFingerprint: "fp-a"
    });
    await middleware(spectate, async () => undefined);

    expect(spectate.body).toEqual({ spectatorCredentials: "spectator-token", match: expect.objectContaining({ matchID: "match-1", occupiedSeats: [] }) });
  });
});
