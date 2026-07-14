import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { loadOnlineDirectory, setupConfigForStartedOnlineSession, shouldHeartbeatLobbySession, startedSessionRecordForLobby } from "./App";
import { LOCAL_GAME_SAVE_STORAGE_KEY, serializeLocalGame } from "./localGameSave";
import type { LobbyRoomDetails, OnlineLobbySessionRecord, OnlineStartedSessionRecord } from "./onlineSession";

const setupConfig = {
  options: {
    playerCount: 2 as const,
    mode: "multiplayer" as const,
    enabledExpansions: ["trade_routes"],
    enabledVariants: ["quick_setup"],
    commonsSetId: "horizons"
  },
  playerNationIds: {
    "1": "test_nation_sun_coast",
    "2": "test_nation_river_league"
  }
};

describe("App shell", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubBrowserStorage(entries: Record<string, string | null>) {
    vi.stubGlobal("window", {
      location: { href: "http://localhost/" },
      history: { replaceState: () => undefined },
      localStorage: {
        getItem: (key: string) => entries[key] ?? null,
        setItem: (key: string, value: string) => { entries[key] = value; },
        removeItem: (key: string) => { delete entries[key]; }
      },
      crypto: { randomUUID: () => "test-client-id" },
      setInterval: () => 1,
      clearInterval: () => undefined
    });
  }

  it("renders a stable default theme hook on the home shell", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-theme="default"');
    expect(html).toContain("Online Games");
  });

  it("shows a resume action for a valid saved local game", () => {
    stubBrowserStorage({
      [LOCAL_GAME_SAVE_STORAGE_KEY]: serializeLocalGame({
        privateDataFingerprint: "fictional-fixture-fingerprint",
        now: new Date("2026-07-14T05:00:00.000Z"),
        state: {
          G: { options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] } },
          ctx: { currentPlayer: "1", numPlayers: 2 }
        }
      })
    });

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Resume Saved Game");
    expect(html).toContain("Export Saved Game");
    expect(html).toContain("Import Saved Game");
    expect(html).toContain("Saved local game");
  });

  it("shows a discard action for a corrupt saved local game", () => {
    stubBrowserStorage({ [LOCAL_GAME_SAVE_STORAGE_KEY]: "{not json" });

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Saved local game could not be loaded");
    expect(html).toContain("Discard Saved Game");
  });

  it("loads listed games even when chat is not available from the server", async () => {
    const lobbies = [{ lobbyID: "lobby-1" }];
    const matches = [{ matchID: "match-1" }];

    await expect(loadOnlineDirectory({
      listLobbies: async () => lobbies as any,
      listMatches: async () => matches as any,
      listChat: async () => {
        throw new Error("Online lobby is not available from this app server.");
      }
    })).resolves.toEqual({
      lobbies,
      matches,
      chatMessages: [],
      chatUnavailable: true
    });
  });

  it("uses saved setup context when rejoining a started online session", () => {
    const saved: OnlineStartedSessionRecord = {
      kind: "player",
      matchID: "match-1",
      playerID: "1",
      credentials: "seat-token",
      serverURL: "http://localhost:8000",
      numPlayers: 2,
      savedAt: "2026-06-14T01:00:00.000Z",
      setupData: setupConfig
    };

    expect(setupConfigForStartedOnlineSession(saved)).toEqual(setupConfig);
  });

  it("converts a started lobby refresh into a started online session record", () => {
    const lobbySession: OnlineLobbySessionRecord = {
      kind: "lobby",
      lobbyID: "lobby-1",
      seatID: "1",
      lobbyCredentials: "lobby-token",
      serverURL: "http://localhost:8000",
      savedAt: "2026-06-14T01:00:00.000Z"
    };
    const lobby = {
      lobbyID: "lobby-1",
      playerCount: 2,
      setupData: setupConfig,
      viewer: { seatID: "1", isHost: false },
      startedMatchID: "match-1",
      playerCredentials: "seat-token"
    } as LobbyRoomDetails;

    expect(startedSessionRecordForLobby(lobbySession, lobby, "2026-06-14T02:00:00.000Z")).toEqual({
      kind: "player",
      matchID: "match-1",
      playerID: "1",
      credentials: "seat-token",
      serverURL: "http://localhost:8000",
      numPlayers: 2,
      setupData: setupConfig,
      savedAt: "2026-06-14T02:00:00.000Z"
    });
  });

  it("keeps lobby heartbeats active while the host edits lobby setup", () => {
    expect(shouldHeartbeatLobbySession("lobby")).toBe(true);
    expect(shouldHeartbeatLobbySession("lobby-setup")).toBe(true);
    expect(shouldHeartbeatLobbySession("online")).toBe(false);
  });
});
