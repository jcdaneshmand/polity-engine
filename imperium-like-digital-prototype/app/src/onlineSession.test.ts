import { describe, expect, it } from "vitest";
import { createOnlineMatch, joinOnlineMatch, ONLINE_SESSION_STORAGE_KEY, buildJoinURL, parseJoinURL, parseOnlineSessionRecord, resolveMultiplayerServerURL, serializeOnlineSessionRecord } from "./onlineSession";

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
});
