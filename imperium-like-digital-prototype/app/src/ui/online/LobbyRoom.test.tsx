import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LobbyRoomDetails } from "../../onlineSession";
import type { NewGameSessionConfig } from "../setup/NewGameSetup";
import LobbyRoom from "./LobbyRoom";

const config: NewGameSessionConfig = {
  options: {
    playerCount: 2,
    mode: "multiplayer",
    enabledExpansions: [],
    enabledVariants: [],
    commonsSetId: "classics"
  },
  playerNationIds: { "0": "test_nation_sun_coast", "1": "test_nation_sun_coast" }
};

const lobby: LobbyRoomDetails = {
  kind: "lobby",
  lobbyID: "lobby-1",
  roomName: "Friday Table",
  createdAt: "2026-06-05T10:00:00.000Z",
  updatedAt: "2026-06-05T10:00:00.000Z",
  status: "waiting",
  playerCount: 2,
  occupiedSeats: [
    { seatID: "0", displayName: "Host", connected: true, ready: false, selectedNationID: "test_nation_sun_coast" },
    { seatID: "1", displayName: "Guest", connected: true, ready: true, selectedNationID: "test_nation_sun_coast" }
  ],
  availableSeats: [],
  isLocked: false,
  privateDataLabel: "placeholder",
  setupSummary: { commonsSetId: "classics", enabledExpansions: [], enabledVariants: [], nationLabels: [] },
  setupData: config,
  seats: [
    { seatID: "0", displayName: "Host", connected: true, ready: false, selectedNationID: "test_nation_sun_coast", isSelf: true, isHost: true },
    { seatID: "1", displayName: "Guest", connected: true, ready: true, selectedNationID: "test_nation_sun_coast", isSelf: false, isHost: false }
  ],
  viewer: { seatID: "0", isHost: true }
};

describe("LobbyRoom", () => {
  it("renders lobby seats, nation controls, and ready actions", () => {
    const html = renderToStaticMarkup(
      <LobbyRoom
        lobby={lobby}
        setupConfig={config}
        statusMessage=""
        onBack={() => undefined}
        onRefresh={() => undefined}
        onEditSetup={() => undefined}
        onSelectNation={() => undefined}
        onReady={() => undefined}
        onStart={() => undefined}
      />
    );

    expect(html).toContain("Friday Table");
    expect(html).toContain("Host controls");
    expect(html).toContain("Host");
    expect(html).toContain("Guest");
    expect(html).toContain("Nation");
    expect(html).toContain("Ready");
    expect(html).toContain("Edit Setup");
    expect(html).not.toContain("Update Setup");
    expect(html).not.toContain("Spectate");
  });

  it("shows start only to the host when the lobby is locked", () => {
    const html = renderToStaticMarkup(
      <LobbyRoom
        lobby={{ ...lobby, status: "locked", seats: lobby.seats.map((seat) => ({ ...seat, ready: true })) }}
        setupConfig={config}
        statusMessage=""
        onBack={() => undefined}
        onRefresh={() => undefined}
        onEditSetup={() => undefined}
        onSelectNation={() => undefined}
        onReady={() => undefined}
        onStart={() => undefined}
      />
    );

    expect(html).toContain("Start Game");
    expect(html).toContain("Unlock Setup");
  });

  it("hides host setup controls from non-host players", () => {
    const html = renderToStaticMarkup(
      <LobbyRoom
        lobby={{ ...lobby, viewer: { seatID: "1", isHost: false }, seats: lobby.seats.map((seat) => ({ ...seat, isSelf: seat.seatID === "1", isHost: seat.seatID === "0" })) }}
        setupConfig={config}
        statusMessage=""
        onBack={() => undefined}
        onRefresh={() => undefined}
        onEditSetup={() => undefined}
        onSelectNation={() => undefined}
        onReady={() => undefined}
        onStart={() => undefined}
      />
    );

    expect(html).not.toContain("Host controls");
    expect(html).not.toContain("Start Game");
  });
});
