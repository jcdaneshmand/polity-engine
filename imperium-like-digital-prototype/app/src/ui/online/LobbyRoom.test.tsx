import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { LobbyRoomDetails } from "../../onlineSession";
import type { NewGameSessionConfig } from "../setup/NewGameSetup";
import LobbyRoom, { readyWithSelectedNation } from "./LobbyRoom";

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

const chatMessages = [
  { id: "chat-1", author: "Guest", text: "I can take seat two.", createdAt: "2026-06-05T10:00:00.000Z" }
];

describe("LobbyRoom", () => {
  it("renders the current setup summary in the lobby", () => {
    const html = renderToStaticMarkup(
      <LobbyRoom
        lobby={{
          ...lobby,
          playerCount: 3,
          setupSummary: {
            commonsSetId: "horizons",
            enabledExpansions: ["trade_routes"],
            enabledVariants: ["quick_setup"],
            nationLabels: ["Sun Coast", "River League", "Highland Pact"]
          }
        }}
        setupConfig={{ ...config, options: { ...config.options, playerCount: 3, commonsSetId: "horizons", enabledExpansions: ["trade_routes"], enabledVariants: ["quick_setup"] } }}
        statusMessage=""
        onBack={() => undefined}
        onRefresh={() => undefined}
        onLeave={() => undefined}
        onEditSetup={() => undefined}
        onSelectNation={() => undefined}
        onReady={() => undefined}
        onStart={() => undefined}
      />
    );

    expect(html).toContain("Current setup");
    expect(html).toContain("3 players");
    expect(html).toContain("Commons: horizons");
    expect(html).toContain("Expansions: trade_routes");
    expect(html).toContain("Variants: quick_setup");
    expect(html).toContain("Nations: Sun Coast, River League, Highland Pact");
  });

  it("renders lobby seats, nation controls, and ready actions", () => {
    const html = renderToStaticMarkup(
      <LobbyRoom
        lobby={lobby}
        setupConfig={config}
        chatMessages={chatMessages}
        statusMessage=""
        onBack={() => undefined}
        onRefresh={() => undefined}
        onLeave={() => undefined}
        onEditSetup={() => undefined}
        onSelectNation={() => undefined}
        onReady={() => undefined}
        onStart={() => undefined}
        onSendChat={() => undefined}
      />
    );

    expect(html).toContain("Friday Table");
    expect(html).toContain("Room code");
    expect(html).toContain("lobby-1");
    expect(html).toContain("Leave Lobby");
    expect(html).toContain("Host controls");
    expect(html).toContain("Host");
    expect(html).toContain("Guest");
    expect(html).toContain("Nation");
    expect(html).toContain("Ready");
    expect(html).toContain("Edit Setup");
    expect(html).toContain("Lobby Chat");
    expect(html).toContain("I can take seat two.");
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
        onLeave={() => undefined}
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
        onLeave={() => undefined}
        onEditSetup={() => undefined}
        onSelectNation={() => undefined}
        onReady={() => undefined}
        onStart={() => undefined}
      />
    );

    expect(html).not.toContain("Host controls");
    expect(html).not.toContain("Start Game");
  });

  it("selects the displayed fallback nation before readying a seat", async () => {
    const calls: string[] = [];

    await readyWithSelectedNation({
      currentSelectedNationID: undefined,
      displayedNationID: "test_nation_sun_coast",
      nextReady: true,
      onSelectNation: async (nationID) => {
        calls.push(`select:${nationID}`);
      },
      onReady: async (ready) => {
        calls.push(`ready:${ready}`);
      }
    });

    expect(calls).toEqual(["select:test_nation_sun_coast", "ready:true"]);
  });
});
