import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ListedMatch, OnlineSessionRecord } from "../../onlineSession";
import type { NewGameSessionConfig } from "../setup/NewGameSetup";
import OnlineGames from "./OnlineGames";

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

describe("OnlineGames", () => {
  it("renders the action-first hub sections", () => {
    const html = renderToStaticMarkup(
      <OnlineGames
        setupConfig={config}
        privateDataFingerprint="placeholder"
        savedSessions={[]}
        matches={[baseMatch]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
      />
    );

    expect(html).toContain("Online Games");
    expect(html).toContain("Resume Games");
    expect(html).toContain("Host Game");
    expect(html).toContain("Join By Code");
    expect(html).toContain("Browse Games");
    expect(html).toContain("Open Table");
    expect(html).toContain("Join Seat");
    expect(html).toContain("Spectate");
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
        matches={[locked]}
        statusMessage=""
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
        onJoin={() => undefined}
        onSpectate={() => undefined}
        onRejoin={() => undefined}
        onForgetSession={() => undefined}
      />
    );

    expect(html).toContain("Locked Table");
    expect(html).toContain("Locked");
    expect(html).toContain("Private data required");
    expect(html).toContain("Different private data loaded");
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
        matches={[baseMatch]}
        statusMessage="Ready"
        onBackToSetup={() => undefined}
        onRefresh={() => undefined}
        onHost={() => undefined}
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
});
