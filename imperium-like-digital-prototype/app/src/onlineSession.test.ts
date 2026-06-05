import { describe, expect, it } from "vitest";
import { buildJoinURL, computePrivateDataFingerprint, createOnlineMatch, createPolityOnlineMatch, joinOnlineMatch, joinPolityOnlineMatch, listOnlineMatches, ONLINE_SESSION_STORAGE_KEY, parseJoinURL, parseOnlineSessionRecord, resolveMultiplayerServerURL, serializeOnlineSessionRecord, sortListedMatches, spectateOnlineMatch } from "./onlineSession";

describe("online session utilities", () => {
  it("round-trips a saved online session record", () => {
    const record = {
      matchID: "match-123",
      playerID: "0",
      credentials: "secret-token",
      serverURL: "http://localhost:8000",
      numPlayers: 2,
      savedAt: "2026-06-05T01:00:00.000Z"
    };

    expect(parseOnlineSessionRecord(serializeOnlineSessionRecord(record))).toEqual(record);
    expect(ONLINE_SESSION_STORAGE_KEY).toBe("polity-engine.onlineSession.v1");
  });

  it("rejects malformed saved session records", () => {
    expect(parseOnlineSessionRecord("{")).toBeUndefined();
    expect(parseOnlineSessionRecord(JSON.stringify({ matchID: "match-123" }))).toBeUndefined();
  });

  it("builds and parses shareable join URLs", () => {
    const url = buildJoinURL("https://polity.example/play", "match-123", "http://localhost:8000");

    expect(url).toBe("https://polity.example/play?matchID=match-123&serverURL=http%3A%2F%2Flocalhost%3A8000");
    expect(parseJoinURL(url)).toEqual({ matchID: "match-123", serverURL: "http://localhost:8000" });
    expect(parseJoinURL("https://polity.example/play")).toEqual({});
  });

  it("resolves the multiplayer server URL from config or app origin", () => {
    expect(resolveMultiplayerServerURL({ configuredURL: "https://api.polity.example", windowOrigin: "https://app.polity.example" })).toBe("https://api.polity.example");
    expect(resolveMultiplayerServerURL({ configuredURL: "", windowOrigin: "https://app.polity.example" })).toBe("https://app.polity.example");
    expect(resolveMultiplayerServerURL({})).toBe("http://localhost:8000");
  });

  it("creates and joins matches through the boardgame.io lobby API", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return {
        ok: true,
        json: async () => url.endsWith("/create")
          ? { matchID: "match-123" }
          : { playerCredentials: "joined-token" }
      } as Response;
    };

    await expect(createOnlineMatch({ serverURL: "http://localhost:8000", numPlayers: 2, setupData: { mode: "multiplayer" }, fetcher })).resolves.toEqual({ matchID: "match-123" });
    await expect(joinOnlineMatch({ serverURL: "http://localhost:8000", matchID: "match-123", playerID: "0", playerName: "Jonah", fetcher })).resolves.toEqual({ playerCredentials: "joined-token" });

    expect(calls).toEqual([
      {
        url: "http://localhost:8000/games/polity-engine/create",
        body: { numPlayers: 2, setupData: { mode: "multiplayer" } }
      },
      {
        url: "http://localhost:8000/games/polity-engine/match-123/join",
        body: { playerID: "0", playerName: "Jonah" }
      }
    ]);
  });

  it("computes stable private data fingerprints from canonical values", () => {
    expect(computePrivateDataFingerprint(undefined)).toBe("placeholder");
    expect(computePrivateDataFingerprint({ cards: [{ id: "a", cost: 1 }], nations: [{ id: "n" }] }))
      .toBe(computePrivateDataFingerprint({ nations: [{ id: "n" }], cards: [{ cost: 1, id: "a" }] }));
    expect(computePrivateDataFingerprint({ cards: [{ id: "a" }] })).not.toBe(computePrivateDataFingerprint({ cards: [{ id: "b" }] }));
  });

  it("uses Polity lobby APIs for listing, creating, joining, and spectating", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return {
        ok: true,
        json: async () => {
          if (url.endsWith("/matches") && init?.method !== "POST") return { matches: [{ matchID: "m1", roomName: "Open", status: "setup", playerCount: 2, occupiedSeats: [], availableSeats: ["0", "1"], isLocked: false, spectatingAllowed: true, privateDataLabel: "placeholder", createdAt: "a", updatedAt: "b", setupSummary: { commonsSetId: "classics", enabledExpansions: [], enabledVariants: [], nationLabels: [] } }] };
          if (url.endsWith("/join")) return { playerCredentials: "player-token" };
          if (url.endsWith("/spectate")) return { spectatorCredentials: "watch-token" };
          return { matchID: "m1" };
        }
      } as Response;
    };

    await expect(listOnlineMatches({ serverURL: "http://localhost:8000", fetcher })).resolves.toHaveLength(1);
    await expect(createPolityOnlineMatch({ serverURL: "http://localhost:8000", roomName: "Open", numPlayers: 2, setupData: { ok: true }, privateDataFingerprint: "placeholder", password: "pw", fetcher })).resolves.toEqual({ matchID: "m1" });
    await expect(joinPolityOnlineMatch({ serverURL: "http://localhost:8000", matchID: "m1", playerID: "0", playerName: "A", privateDataFingerprint: "placeholder", password: "pw", fetcher })).resolves.toEqual({ playerCredentials: "player-token" });
    await expect(spectateOnlineMatch({ serverURL: "http://localhost:8000", matchID: "m1", privateDataFingerprint: "placeholder", password: "pw", fetcher })).resolves.toEqual({ spectatorCredentials: "watch-token" });

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:8000/polity/lobby/matches",
      "http://localhost:8000/polity/lobby/matches",
      "http://localhost:8000/polity/lobby/matches/m1/join",
      "http://localhost:8000/polity/lobby/matches/m1/spectate"
    ]);
    expect(calls[1].body).toEqual({ roomName: "Open", numPlayers: 2, setupData: { ok: true }, privateDataFingerprint: "placeholder", password: "pw" });
  });

  it("sorts listed matches by joinability before spectation and full games", () => {
    const base = {
      createdAt: "2026-06-05T01:00:00.000Z",
      updatedAt: "2026-06-05T01:00:00.000Z",
      playerCount: 2,
      occupiedSeats: [],
      isLocked: false,
      spectatingAllowed: true,
      privateDataLabel: "placeholder" as const,
      setupSummary: { commonsSetId: "classics", enabledExpansions: [], enabledVariants: [], nationLabels: [] }
    };

    expect(sortListedMatches([
      { ...base, matchID: "full", roomName: "Full", status: "setup", availableSeats: [] },
      { ...base, matchID: "watch", roomName: "Watch", status: "in_progress", availableSeats: ["1"] },
      { ...base, matchID: "open", roomName: "Open", status: "setup", availableSeats: ["0"] }
    ]).map((match) => match.matchID)).toEqual(["open", "watch", "full"]);
  });
});
