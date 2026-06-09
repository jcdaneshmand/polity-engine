import { describe, expect, it } from "vitest";
import { buildJoinURL, changeAccountPassword, clearAllOnlineGames, closePolityOnlineMatch, completePasswordReset, computePrivateDataFingerprint, createLobbyRoom, createOnlineMatch, createPolityOnlineMatch, heartbeatLobbyRoom, heartbeatPolityOnlineMatch, joinLobbyRoom, joinOnlineMatch, joinPolityOnlineMatch, leaveLobbyRoom, leavePolityOnlineMatch, listAccountHistory, listLobbyChat, listLobbyRooms, listOnlineChat, listOnlineMatches, loadCurrentAccount, ONLINE_SESSION_STORAGE_KEY, parseJoinURL, parseOnlineSessionRecord, recordAccountGameResult, registerAccount, rejoinLobbyRoom, requestPasswordReset, resolveMultiplayerServerURL, selectLobbyNation, sendLobbyChat, sendOnlineChat, serializeOnlineSessionRecord, setLobbyReady, signInAccount, signOutAccount, sortListedMatches, spectateOnlineMatch, startAccountGameHistory, startLobbyGame, updateLobbySetup } from "./onlineSession";

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body
  } as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body
  } as Response;
}

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

  it("round-trips a saved pregame lobby session record", () => {
    const record = {
      kind: "lobby" as const,
      lobbyID: "lobby-123",
      seatID: "0",
      lobbyCredentials: "lobby-token",
      serverURL: "http://localhost:8000",
      savedAt: "2026-06-05T01:00:00.000Z"
    };

    expect(parseOnlineSessionRecord(serializeOnlineSessionRecord(record))).toEqual(record);
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
    expect(resolveMultiplayerServerURL({ configuredURL: "", windowOrigin: "http://localhost:5173" })).toBe("http://localhost:5173");
    expect(resolveMultiplayerServerURL({ configuredURL: "", windowOrigin: "http://127.0.0.1:5173" })).toBe("http://127.0.0.1:5173");
    expect(resolveMultiplayerServerURL({})).toBe("http://localhost:8000");
  });

  it("creates and joins matches through the boardgame.io lobby API", async () => {
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return jsonResponse(url.endsWith("/create")
        ? { matchID: "match-123" }
        : { playerCredentials: "joined-token" });
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
      if (url.endsWith("/matches") && init?.method !== "POST") return jsonResponse({ matches: [{ matchID: "m1", roomName: "Open", status: "setup", playerCount: 2, occupiedSeats: [], availableSeats: ["0", "1"], isLocked: false, spectatingAllowed: true, privateDataLabel: "placeholder", createdAt: "a", updatedAt: "b", setupSummary: { commonsSetId: "classics", enabledExpansions: [], enabledVariants: [], nationLabels: [] } }] });
      if (url.endsWith("/join")) return jsonResponse({ playerCredentials: "player-token", playerID: "0" });
      if (url.endsWith("/leave")) return jsonResponse({ ok: true });
      if (url.endsWith("/close")) return jsonResponse({ ok: true });
      if (url.endsWith("/spectate")) return jsonResponse({ spectatorCredentials: "watch-token" });
      return jsonResponse({ matchID: "m1" });
    };

    await expect(listOnlineMatches({ serverURL: "http://localhost:8000", fetcher })).resolves.toHaveLength(1);
    await expect(createPolityOnlineMatch({ serverURL: "http://localhost:8000", roomName: "Open", numPlayers: 2, setupData: { ok: true }, privateDataFingerprint: "placeholder", password: "pw", fetcher })).resolves.toEqual({ matchID: "m1" });
    await expect(joinPolityOnlineMatch({ serverURL: "http://localhost:8000", matchID: "m1", playerID: "0", playerName: "A", privateDataFingerprint: "placeholder", password: "pw", clientID: "client-a", fetcher })).resolves.toEqual({ playerCredentials: "player-token", playerID: "0" });
    await expect(leavePolityOnlineMatch({ serverURL: "http://localhost:8000", matchID: "m1", playerID: "0", playerCredentials: "seat-token", fetcher })).resolves.toEqual({ ok: true });
    await expect(closePolityOnlineMatch({ serverURL: "http://localhost:8000", matchID: "m1", playerID: "0", playerCredentials: "seat-token", fetcher })).resolves.toEqual({ ok: true });
    await expect(spectateOnlineMatch({ serverURL: "http://localhost:8000", matchID: "m1", privateDataFingerprint: "placeholder", password: "pw", fetcher })).resolves.toEqual({ spectatorCredentials: "watch-token" });

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:8000/polity/lobby/matches",
      "http://localhost:8000/polity/lobby/matches",
      "http://localhost:8000/polity/lobby/matches/m1/join",
      "http://localhost:8000/polity/lobby/matches/m1/leave",
      "http://localhost:8000/polity/lobby/matches/m1/close",
      "http://localhost:8000/polity/lobby/matches/m1/spectate"
    ]);
    expect(calls[1].body).toEqual({ roomName: "Open", numPlayers: 2, setupData: { ok: true }, privateDataFingerprint: "placeholder", password: "pw" });
    expect(calls[2].body).toEqual({ playerName: "A", privateDataFingerprint: "placeholder", playerID: "0", password: "pw", clientID: "client-a" });
  });

  it("allows join-by-code to omit a seat so the server can assign one", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse({ playerCredentials: "player-token", playerID: "1" });
    };

    await expect(joinPolityOnlineMatch({
      serverURL: "http://localhost:8000",
      matchID: "m1",
      playerName: "A",
      privateDataFingerprint: "placeholder",
      fetcher
    })).resolves.toEqual({ playerCredentials: "player-token", playerID: "1" });

    expect(calls[0].body).toEqual({ playerName: "A", privateDataFingerprint: "placeholder" });
  });

  it("uses pregame lobby APIs for room setup and start", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const lobby = {
      kind: "lobby",
      lobbyID: "lobby-1",
      roomName: "Room",
      createdAt: "a",
      updatedAt: "b",
      status: "waiting",
      playerCount: 2,
      occupiedSeats: [],
      availableSeats: ["0", "1"],
      isLocked: false,
      privateDataLabel: "placeholder",
      setupSummary: { commonsSetId: "classics", enabledExpansions: [], enabledVariants: [], nationLabels: [] },
      setupData: {},
      seats: [],
      viewer: { seatID: "0", isHost: true }
    };
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/rooms") && init?.method !== "POST") return jsonResponse({ lobbies: [lobby] });
      if (url.endsWith("/rooms")) return jsonResponse({ lobbyID: "lobby-1", seatID: "0", lobbyCredentials: "cred-host", lobby });
      if (url.endsWith("/join")) return jsonResponse({ lobbyID: "lobby-1", seatID: "1", lobbyCredentials: "cred-guest", lobby: { ...lobby, viewer: { seatID: "1", isHost: false } } });
      if (url.endsWith("/heartbeat")) return jsonResponse({ ok: true });
      if (url.endsWith("/leave")) return jsonResponse({ ok: true });
      if (url.endsWith("/start")) return jsonResponse({ matchID: "match-1", playerID: "0", playerCredentials: "player-token", lobby: { ...lobby, startedMatchID: "match-1", playerCredentials: "player-token" } });
      if (url.endsWith("/lobby-1")) return jsonResponse({ lobby });
      return jsonResponse({ ok: true, lobby });
    };

    await expect(listLobbyRooms({ serverURL: "http://localhost:8000", fetcher })).resolves.toHaveLength(1);
    await expect(createLobbyRoom({ serverURL: "http://localhost:8000", roomName: "Room", playerCount: 2, setupData: { ok: true }, privateDataFingerprint: "placeholder", hostName: "Host", clientID: "client-a", fetcher })).resolves.toEqual({ lobbyID: "lobby-1", seatID: "0", lobbyCredentials: "cred-host", lobby });
    await expect(joinLobbyRoom({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", displayName: "Guest", privateDataFingerprint: "placeholder", clientID: "client-b", fetcher })).resolves.toEqual({ lobbyID: "lobby-1", seatID: "1", lobbyCredentials: "cred-guest", lobby: { ...lobby, viewer: { seatID: "1", isHost: false } } });
    await expect(rejoinLobbyRoom({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred-host", fetcher })).resolves.toEqual({ lobby });
    await expect(heartbeatLobbyRoom({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred-host", fetcher })).resolves.toEqual({ ok: true });
    await expect(leaveLobbyRoom({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred-host", fetcher })).resolves.toEqual({ ok: true });
    await expect(updateLobbySetup({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred-host", roomName: "Room", playerCount: 2, setupData: { ok: true }, privateDataFingerprint: "placeholder", fetcher })).resolves.toEqual({ ok: true, lobby });
    await expect(selectLobbyNation({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred-host", nationID: "test_nation_sun_coast", fetcher })).resolves.toEqual({ ok: true, lobby });
    await expect(setLobbyReady({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred-host", ready: true, fetcher })).resolves.toEqual({ ok: true, lobby });
    await expect(startLobbyGame({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred-host", fetcher })).resolves.toEqual({ matchID: "match-1", playerID: "0", playerCredentials: "player-token", lobby: { ...lobby, startedMatchID: "match-1", playerCredentials: "player-token" } });

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:8000/polity/lobby/rooms",
      "http://localhost:8000/polity/lobby/rooms",
      "http://localhost:8000/polity/lobby/rooms/lobby-1/join",
      "http://localhost:8000/polity/lobby/rooms/lobby-1",
      "http://localhost:8000/polity/lobby/rooms/lobby-1/heartbeat",
      "http://localhost:8000/polity/lobby/rooms/lobby-1/leave",
      "http://localhost:8000/polity/lobby/rooms/lobby-1/update-setup",
      "http://localhost:8000/polity/lobby/rooms/lobby-1/select-nation",
      "http://localhost:8000/polity/lobby/rooms/lobby-1/ready",
      "http://localhost:8000/polity/lobby/rooms/lobby-1/start"
    ]);
    expect(calls[1].body).toEqual({ roomName: "Room", playerCount: 2, setupData: { ok: true }, privateDataFingerprint: "placeholder", hostName: "Host", clientID: "client-a" });
    expect(calls[2].body).toEqual({ displayName: "Guest", privateDataFingerprint: "placeholder", clientID: "client-b" });
    expect(calls[4].body).toEqual({ lobbyCredentials: "cred-host" });
    expect(calls[5].body).toEqual({ lobbyCredentials: "cred-host" });
  });

  it("uses the admin API to clear all online games", async () => {
    const calls: Array<{ url: string; body?: unknown; authorization?: string | null }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, authorization: init?.headers instanceof Headers ? init.headers.get("authorization") : (init?.headers as Record<string, string> | undefined)?.authorization });
      return jsonResponse({ ok: true, lobbiesCleared: 1, matchesCleared: 2 });
    };

    await expect(clearAllOnlineGames({ serverURL: "http://localhost:8000", accountToken: "token-1", fetcher }))
      .resolves.toEqual({ ok: true, lobbiesCleared: 1, matchesCleared: 2 });

    expect(calls).toEqual([
      { url: "http://localhost:8000/polity/lobby/admin/clear", body: {}, authorization: "Bearer token-1" }
    ]);
  });

  it("uses account APIs with bearer tokens", async () => {
    const calls: Array<{ url: string; body?: unknown; authorization?: string | null; method?: string }> = [];
    const account = {
      id: "account-1",
      email: "jonah@example.com",
      username: "Jonah",
      role: "admin",
      createdAt: "2026-06-05T12:00:00.000Z",
      updatedAt: "2026-06-05T12:00:00.000Z",
      stats: { solo: { standard: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 }, campaign: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0, campaignsStarted: 0, campaignsCompleted: 0 }, practice: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 } }, online: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 }, byNation: {} }
    };
    const entry = { id: "game-1", accountID: "account-1", scope: "solo", variant: "practice", status: "started", outcome: "unknown", startedAt: "a", updatedAt: "a" };
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({
        url,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        authorization: init?.headers instanceof Headers ? init.headers.get("authorization") : (init?.headers as Record<string, string> | undefined)?.authorization
      });
      if (url.endsWith("/register") || url.endsWith("/sign-in")) return jsonResponse({ account, token: "token-1" });
      if (url.endsWith("/me")) return jsonResponse({ account });
      if (url.endsWith("/history/start")) return jsonResponse({ entry });
      if (url.endsWith("/history/result")) return jsonResponse({ entry: { ...entry, status: "completed", outcome: "win" }, stats: account.stats });
      if (url.endsWith("/history")) return jsonResponse({ history: [entry], stats: account.stats });
      if (url.endsWith("/forgot-password")) return jsonResponse({ ok: true, resetLink: "http://localhost/reset-password?token=reset-1" });
      return jsonResponse({ ok: true });
    };

    await expect(registerAccount({ serverURL: "http://localhost:8000", email: "jonah@example.com", username: "Jonah", password: "secret123", fetcher })).resolves.toEqual({ account, token: "token-1" });
    await expect(signInAccount({ serverURL: "http://localhost:8000", login: "jonah", password: "secret123", fetcher })).resolves.toEqual({ account, token: "token-1" });
    await expect(loadCurrentAccount({ serverURL: "http://localhost:8000", accountToken: "token-1", fetcher })).resolves.toEqual({ account });
    await expect(listAccountHistory({ serverURL: "http://localhost:8000", accountToken: "token-1", fetcher })).resolves.toEqual({ history: [entry], stats: account.stats });
    await expect(startAccountGameHistory({ serverURL: "http://localhost:8000", accountToken: "token-1", entry: { id: "game-1", scope: "solo", variant: "practice", status: "started", outcome: "unknown" }, fetcher })).resolves.toEqual({ entry });
    await expect(recordAccountGameResult({ serverURL: "http://localhost:8000", accountToken: "token-1", result: { id: "game-1", outcome: "win" }, fetcher })).resolves.toEqual({ entry: { ...entry, status: "completed", outcome: "win" }, stats: account.stats });
    await expect(changeAccountPassword({ serverURL: "http://localhost:8000", accountToken: "token-1", currentPassword: "secret123", password: "changed123", fetcher })).resolves.toEqual({ ok: true });
    await expect(requestPasswordReset({ serverURL: "http://localhost:8000", email: "jonah@example.com", resetURLBase: "http://localhost/reset-password", fetcher })).resolves.toEqual({ ok: true, resetLink: "http://localhost/reset-password?token=reset-1" });
    await expect(completePasswordReset({ serverURL: "http://localhost:8000", token: "reset-1", password: "reset123", passwordConfirmation: "reset123", fetcher })).resolves.toEqual({ ok: true });
    await expect(signOutAccount({ serverURL: "http://localhost:8000", accountToken: "token-1", fetcher })).resolves.toEqual({ ok: true });

    expect(calls.map((call) => call.url)).toEqual([
      "http://localhost:8000/polity/accounts/register",
      "http://localhost:8000/polity/accounts/sign-in",
      "http://localhost:8000/polity/accounts/me",
      "http://localhost:8000/polity/accounts/history",
      "http://localhost:8000/polity/accounts/history/start",
      "http://localhost:8000/polity/accounts/history/result",
      "http://localhost:8000/polity/accounts/change-password",
      "http://localhost:8000/polity/accounts/forgot-password",
      "http://localhost:8000/polity/accounts/reset-password",
      "http://localhost:8000/polity/accounts/sign-out"
    ]);
    expect(calls[2].authorization).toBe("Bearer token-1");
    expect(calls[4].body).toEqual({ id: "game-1", scope: "solo", variant: "practice", status: "started", outcome: "unknown" });
    expect(calls[5].body).toEqual({ id: "game-1", outcome: "win" });
    expect(calls[6]).toEqual({
      url: "http://localhost:8000/polity/accounts/change-password",
      method: "POST",
      body: { currentPassword: "secret123", password: "changed123" },
      authorization: "Bearer token-1"
    });
    expect(calls[7].body).toEqual({ email: "jonah@example.com", resetURLBase: "http://localhost/reset-password" });
    expect(calls[8].body).toEqual({ token: "reset-1", password: "reset123", passwordConfirmation: "reset123" });
  });

  it("sends chat with account bearer tokens", async () => {
    const calls: Array<{ url: string; body?: unknown; authorization?: string | null }> = [];
    const message = { id: "chat-1", author: "Jonah", text: "Hello", createdAt: "2026-06-05T10:00:00.000Z" };
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined, authorization: init?.headers instanceof Headers ? init.headers.get("authorization") : (init?.headers as Record<string, string> | undefined)?.authorization });
      return jsonResponse({ message });
    };

    await sendOnlineChat({ serverURL: "http://localhost:8000", accountToken: "token-1", author: "Ignored", text: "Hello", fetcher });
    await sendLobbyChat({ serverURL: "http://localhost:8000", accountToken: "token-1", lobbyID: "lobby-1", lobbyCredentials: "cred", text: "Hello", fetcher });

    expect(calls).toEqual([
      { url: "http://localhost:8000/polity/lobby/chat", body: { author: "Ignored", text: "Hello" }, authorization: "Bearer token-1" },
      { url: "http://localhost:8000/polity/lobby/rooms/lobby-1/chat/send", body: { lobbyCredentials: "cred", text: "Hello" }, authorization: "Bearer token-1" }
    ]);
  });

  it("uses the listed match heartbeat API", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return jsonResponse({ ok: true });
    };

    await expect(heartbeatPolityOnlineMatch({ serverURL: "http://localhost:8000", matchID: "match-1", playerID: "0", playerCredentials: "seat-token", clientID: "client-a", fetcher })).resolves.toEqual({ ok: true });

    expect(calls).toEqual([
      { url: "http://localhost:8000/polity/lobby/matches/match-1/heartbeat", body: { playerID: "0", playerCredentials: "seat-token", clientID: "client-a" } }
    ]);
  });

  it("uses HTTP chat APIs for the online lounge and pregame lobbies", async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    const message = { id: "chat-1", author: "Jonah", text: "Hello", createdAt: "2026-06-05T10:00:00.000Z" };
    const fetcher = async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/chat/send") || init?.method === "POST" && url.endsWith("/chat")) return jsonResponse({ message, messages: [message] });
      return jsonResponse({ messages: [message] });
    };

    await expect(listOnlineChat({ serverURL: "http://localhost:8000", fetcher })).resolves.toEqual([message]);
    await expect(sendOnlineChat({ serverURL: "http://localhost:8000", author: "Jonah", text: "Hello", fetcher })).resolves.toEqual({ message, messages: [message] });
    await expect(listLobbyChat({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred", fetcher })).resolves.toEqual([message]);
    await expect(sendLobbyChat({ serverURL: "http://localhost:8000", lobbyID: "lobby-1", lobbyCredentials: "cred", text: "Hello", fetcher })).resolves.toEqual({ message, messages: [message] });

    expect(calls).toEqual([
      { url: "http://localhost:8000/polity/lobby/chat", body: undefined },
      { url: "http://localhost:8000/polity/lobby/chat", body: { author: "Jonah", text: "Hello" } },
      { url: "http://localhost:8000/polity/lobby/rooms/lobby-1/chat", body: { lobbyCredentials: "cred" } },
      { url: "http://localhost:8000/polity/lobby/rooms/lobby-1/chat/send", body: { lobbyCredentials: "cred", text: "Hello" } }
    ]);
  });

  it("reports non-JSON lobby responses without leaking HTML parse errors", async () => {
    const fetcher = async () => ({
      ok: true,
      headers: new Headers({ "content-type": "text/html" }),
      json: async () => JSON.parse("<!doctype html>")
    }) as Response;

    await expect(listOnlineMatches({ serverURL: "http://localhost:5173", fetcher }))
      .rejects.toThrow("Online lobby is not available from this app server.");
  });

  it("reports JSON lobby errors from the server instead of only the HTTP status", async () => {
    const fetcher = async () => errorResponse(404, { error: "lobby_not_found" });

    await expect(sendLobbyChat({
      serverURL: "http://localhost:8000",
      lobbyID: "missing",
      lobbyCredentials: "cred",
      text: "Hello",
      fetcher
    })).rejects.toThrow("Lobby not found.");
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
