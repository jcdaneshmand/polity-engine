import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AccountPublicView } from "../../accountSession";
import type { ListedLobby, ListedMatch, OnlineSessionRecord } from "../../onlineSession";
import type { NewGameSessionConfig } from "../setup/NewGameSetup";
import OnlineGames, { findSavedLobbySession, findSavedMatchSession, isChatSubmitKey } from "./OnlineGames";

const config: NewGameSessionConfig = {
  options: {
    playerCount: 2,
    mode: "multiplayer",
    enabledExpansions: [],
    enabledVariants: [],
    commonsSetId: "classics"
  },
  playerNationIds: { "1": "Sun Coast", "2": "River League" }
};

const baseMatch: ListedMatch = {
  matchID: "match-open",
  roomName: "Open Table",
  createdAt: "2026-06-05T01:00:00.000Z",
  updatedAt: "2026-06-05T01:00:00.000Z",
  status: "setup",
  playerCount: 2,
  occupiedSeats: [{ playerID: "0", playerName: "Host", isConnected: true }],
  availableSeats: ["1"],
  isLocked: false,
  spectatingAllowed: true,
  privateDataLabel: "placeholder",
  setupSummary: {
    commonsSetId: "classics",
    enabledExpansions: [],
    enabledVariants: [],
    nationLabels: ["Sun Coast", "River League"]
  }
};

const baseLobby: ListedLobby = {
  kind: "lobby",
  lobbyID: "lobby-open",
  roomName: "Pregame Table",
  createdAt: "2026-06-05T01:00:00.000Z",
  updatedAt: "2026-06-05T01:00:00.000Z",
  status: "waiting",
  playerCount: 2,
  occupiedSeats: [{ seatID: "0", displayName: "Host", connected: true, ready: false }],
  availableSeats: ["1"],
  isLocked: false,
  privateDataLabel: "placeholder",
  setupSummary: {
    commonsSetId: "classics",
    enabledExpansions: [],
    enabledVariants: [],
    nationLabels: []
  }
};

const chatMessages = [
  { id: "chat-1", author: "Jonah", text: "Anyone free?", createdAt: "2026-06-05T10:00:00.000Z" }
];

const account: AccountPublicView = {
  id: "account-1",
  email: "jonah@example.com",
  username: "Jonah",
  role: "admin",
  createdAt: "2026-06-05T12:00:00.000Z",
  updatedAt: "2026-06-05T12:00:00.000Z",
  stats: {
    solo: {
      standard: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 },
      campaign: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0, campaignsStarted: 0, campaignsCompleted: 0 },
      practice: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 }
    },
    online: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 },
    byNation: {}
  }
};

describe("OnlineGames", () => {
  it("finds saved sessions for listed games so joins can become rejoins", () => {
    const savedLobby: OnlineSessionRecord = {
      kind: "lobby",
      lobbyID: "lobby-open",
      seatID: "0",
      lobbyCredentials: "lobby-token",
      serverURL: "http://localhost:8000",
      savedAt: "2026-06-05T01:00:00.000Z"
    };
    const savedMatch: OnlineSessionRecord = {
      kind: "player",
      matchID: "match-open",
      playerID: "0",
      credentials: "match-token",
      serverURL: "http://localhost:8000",
      numPlayers: 2,
      savedAt: "2026-06-05T01:00:00.000Z"
    };

    expect(findSavedLobbySession([savedLobby, savedMatch], "lobby-open")).toBe(savedLobby);
    expect(findSavedMatchSession([savedLobby, savedMatch], "match-open")).toBe(savedMatch);
    expect(findSavedLobbySession([savedMatch], "lobby-open")).toBeUndefined();
    expect(findSavedMatchSession([savedLobby], "match-open")).toBeUndefined();
  });

  it("treats Enter as chat submit while allowing shifted Enter to stay in the field", () => {
    expect(isChatSubmitKey({ key: "Enter", shiftKey: false })).toBe(true);
    expect(isChatSubmitKey({ key: "Enter", shiftKey: true })).toBe(false);
    expect(isChatSubmitKey({ key: "Escape", shiftKey: false })).toBe(false);
  });

  it("renders the action-first hub sections", () => {
    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        initialPlayerName="Jonah"
        privateDataFingerprint="placeholder"
        savedSessions={[]}
        account={account}
        lobbies={[]}
        matches={[baseMatch]}
        chatMessages={chatMessages}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
        onSendChat={() => undefined}
        onClearAllGames={() => undefined}
      />
    );

    expect(html).toContain("Online Games");
    expect(html).toContain("Clear All Games");
    expect(html).toContain("value=\"Jonah\"");
    expect(html).toContain("Online Chat");
    expect(html).toContain("Anyone free?");
    expect(html).toContain("Resume Games");
    expect(html).toContain("Host Game");
    expect(html).toContain("Join By Code");
    expect(html).toContain("Browse Games");
    expect(html).toContain("Open Table");
    expect(html).not.toContain("Join Seat");
    expect(html).toContain("Spectate");
  });

  it("disables chat and hides admin actions for guests", () => {
    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[]}
        lobbies={[]}
        matches={[]}
        chatMessages={chatMessages}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
        onSendChat={() => undefined}
        onClearAllGames={() => undefined}
      />
    );

    expect(html).toContain("Sign in with an account to chat.");
    expect(html).not.toContain("Clear All Games");
  });

  it("renders joinable pregame lobbies", () => {
    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[]}
        lobbies={[baseLobby]}
        matches={[]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
      />
    );

    expect(html).toContain("Pregame Table");
    expect(html).toContain("Lobby");
    expect(html).toContain("Join Lobby");
  });

  it("renders saved listed lobbies as rejoinable instead of another join", () => {
    const saved: OnlineSessionRecord = {
      kind: "lobby",
      lobbyID: "lobby-open",
      seatID: "0",
      lobbyCredentials: "token",
      serverURL: "http://localhost:8000",
      savedAt: "2026-06-05T01:00:00.000Z"
    };

    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[saved]}
        lobbies={[baseLobby]}
        matches={[]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
      />
    );

    expect(html).toContain("Rejoin Lobby");
  });

  it("renders saved listed matches as rejoinable instead of another seat join", () => {
    const saved: OnlineSessionRecord = {
      kind: "player",
      matchID: "match-open",
      playerID: "0",
      credentials: "token",
      serverURL: "http://localhost:8000",
      numPlayers: 2,
      savedAt: "2026-06-05T01:00:00.000Z"
    };

    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[saved]}
        lobbies={[]}
        matches={[baseMatch]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
      />
    );

    expect(html).toContain("Rejoin Seat");
  });

  it("shows locked games and private-data mismatch states", () => {
    const locked: ListedMatch = {
      ...baseMatch,
      matchID: "locked",
      roomName: "Locked Table",
      isLocked: true,
      privateDataLabel: "private_data_required"
    };
    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[]}
        lobbies={[]}
        matches={[locked]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
      />
    );

    expect(html).toContain("Locked Table");
    expect(html).toContain("Locked");
    expect(html).toContain("Private data required");
    expect(html).toContain("Import matching private data to enter");
  });

  it("explains that exact private data is server-verified when private data is loaded", () => {
    const locked: ListedMatch = {
      ...baseMatch,
      matchID: "locked",
      roomName: "Locked Table",
      isLocked: true,
      privateDataLabel: "private_data_required"
    };
    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="private:abc"
        savedSessions={[]}
        lobbies={[]}
        matches={[locked]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
      />
    );

    expect(html).toContain("Server will verify exact private data before entry");
  });

  it("renders saved rejoin sessions", () => {
    const saved: OnlineSessionRecord = {
      kind: "player",
      matchID: "match-open",
      playerID: "0",
      credentials: "token",
      serverURL: "http://localhost:8000",
      numPlayers: 2,
      savedAt: "2026-06-05T01:00:00.000Z"
    };

    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[saved]}
        lobbies={[]}
        matches={[baseMatch]}
        statusMessage="Ready"
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
      />
    );

    expect(html).toContain("match-open");
    expect(html).toContain("Player 1");
    expect(html).toContain("Rejoin");
    expect(html).toContain("Ready");
  });

  it("shows close only for host saved matches", () => {
    const hostSaved: OnlineSessionRecord = {
      kind: "player",
      matchID: "match-open",
      playerID: "0",
      credentials: "token",
      serverURL: "http://localhost:8000",
      numPlayers: 2,
      savedAt: "2026-06-05T01:00:00.000Z"
    };
    const guestSaved: OnlineSessionRecord = { ...hostSaved, matchID: "match-guest", playerID: "1" };

    const hostHtml = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[hostSaved]}
        lobbies={[]}
        matches={[]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
        onCloseSession={() => undefined}
      />
    );
    const guestHtml = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[guestSaved]}
        lobbies={[]}
        matches={[]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoinLobby={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
        onCloseSession={() => undefined}
      />
    );

    expect(hostHtml).toContain("Close Match");
    expect(guestHtml).not.toContain("Close Match");
  });
});
