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
    expect(success.body).toEqual({ playerCredentials: "seat-token", match: expect.objectContaining({ occupiedSeats: [expect.objectContaining({ playerID: "1" })] }) });
    expect(joined).toEqual([{ matchID: "match-1", playerID: "1", playerName: "Joiner" }]);
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
