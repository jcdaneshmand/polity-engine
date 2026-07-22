import { describe, expect, it } from "vitest";
import { PrototypeGame } from "../game/game";
import { redactGameStateForPlayer } from "../game/playerView";
import { createInitialState } from "../game/initialState";

describe("playerView redaction", () => {
  it("maps zero-based boardgame seats to one-based game player ids before redaction", () => {
    const G = createInitialState({ options: { playerCount: 1, mode: "practice", enabledExpansions: [], enabledVariants: [] } });
    G.playOrder = ["1"];
    (G as any).seatOrder = ["0"];
    G.players["1"].hand = ["p1_hand_secret"];
    G.pendingCleanupMarketResourceChoice = { playerId: "1", resource: "knowledge", amount: 1, cardIds: ["m1"] };

    const view = PrototypeGame.playerView!({ G, playerID: "0" } as any);

    expect(view.players["1"].hand).toEqual(["p1_hand_secret"]);
    expect(view.pendingCleanupMarketResourceChoice).toEqual(G.pendingCleanupMarketResourceChoice);
    expect(view.players["0"]).toBeUndefined();
  });

  it("maps the second boardgame seat to the second one-based game player id", () => {
    const G = createInitialState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] } });
    G.playOrder = ["1", "2"];
    G.seatOrder = ["0", "1"];
    G.players["1"].hand = ["p1_hand_secret"];
    G.players["2"].hand = ["p2_hand_secret"];
    G.pendingCleanupMarketResourceChoice = { playerId: "2", resource: "knowledge", amount: 1, cardIds: ["m1"] };

    const view = PrototypeGame.playerView!({ G, playerID: "1" } as any);

    expect(view.players["1"].hand).toEqual([]);
    expect(view.players["2"].hand).toEqual(["p2_hand_secret"]);
    expect(view.pendingCleanupMarketResourceChoice).toEqual(G.pendingCleanupMarketResourceChoice);
  });

  it("hides one-player local pending choices when no player seat is supplied", () => {
    const G = createInitialState({ options: { playerCount: 1, mode: "practice", enabledExpansions: [], enabledVariants: [] } });
    G.playOrder = ["1"];
    G.seatOrder = ["0"];
    G.pendingCleanupMarketResourceChoice = { playerId: "1", resource: "knowledge", amount: 1, cardIds: ["m1"] };

    const spectatorView = PrototypeGame.playerView!({ G, playerID: undefined } as any);
    const playerView = PrototypeGame.playerView!({ G, playerID: "0" } as any);

    expect(spectatorView.pendingCleanupMarketResourceChoice).toBeUndefined();
    expect(playerView.pendingCleanupMarketResourceChoice).toEqual(G.pendingCleanupMarketResourceChoice);
  });

  it("hides opponent private card identities while preserving public state and counts", () => {
    const G = createInitialState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] } });
    G.players["1"].hand = ["p1_hand_secret"];
    G.players["1"].deck = ["p1_deck_secret"];
    G.players["1"].nationDeck = ["p1_nation_secret"];
    G.players["1"].discard = ["p1_public_discard"];
    G.players["1"].sideAreas = { private_track: ["p1_side_secret"], public_track: ["p1_side_public"] };
    G.players["2"].hand = ["p2_hand_secret"];
    G.players["2"].deck = ["p2_deck_secret"];
    G.players["2"].nationDeck = ["p2_nation_secret"];
    G.players["2"].discard = ["p2_public_discard"];
    G.players["2"].sideAreas = { private_track: ["p2_side_secret"], public_track: ["p2_side_public"] };
    G.activeNationRulesets = {
      "1": { setupOverrides: [{ op: "create_side_area", areaId: "private_track", displayName: "Private", public: false }, { op: "create_side_area", areaId: "public_track", displayName: "Public", public: true }], zoneOverrides: [] } as any,
      "2": { setupOverrides: [{ op: "create_side_area", areaId: "private_track", displayName: "Private", public: false }, { op: "create_side_area", areaId: "public_track", displayName: "Public", public: true }], zoneOverrides: [] } as any
    };
    G.lookedCards = { playerId: "2", source: "deck", cardIds: ["p2_looked_secret"] };
    G.pendingDiscardChoice = { playerId: "2", sourceCardId: "discard_source", cardIds: ["p2_hand_secret"], count: 1, resumeEffects: [] };
    G.pendingPlayedCardResolution = { playerId: "2", cardId: "p2_hand_secret", freePlay: false, rollbackSnapshot: G };
    G.globalSpecialZones = {
      public_archive: { id: "public_archive", displayName: "Public", cardIds: ["global_public"], visibility: "public", scoresAsOwned: false },
      hidden_archive: { id: "hidden_archive", displayName: "Hidden", cardIds: ["global_hidden"], visibility: "private", scoresAsOwned: false }
    };

    const view = redactGameStateForPlayer(G, "1");
    const serialized = JSON.stringify(view);

    expect(view.players["1"].hand).toEqual(["p1_hand_secret"]);
    expect(view.players["2"].hand).toEqual([]);
    expect(view.players["2"].deck).toEqual([]);
    expect(view.players["2"].nationDeck).toEqual([]);
    expect(view.players["2"].discard).toEqual(["p2_public_discard"]);
    expect(view.players["2"].sideAreas?.private_track).toEqual([]);
    expect(view.players["2"].sideAreas?.public_track).toEqual(["p2_side_public"]);
    expect(view.lookedCards?.cardIds).toEqual([]);
    expect(view.pendingDiscardChoice).toBeUndefined();
    expect(view.pendingPlayedCardResolution).toBeUndefined();
    expect(view.globalSpecialZones?.public_archive.cardIds).toEqual(["global_public"]);
    expect(view.globalSpecialZones?.hidden_archive.cardIds).toEqual([]);
    expect(serialized).not.toContain("p2_hand_secret");
    expect(serialized).not.toContain("p2_deck_secret");
    expect(serialized).not.toContain("p2_nation_secret");
    expect(serialized).not.toContain("p2_side_secret");
    expect(serialized).not.toContain("p2_looked_secret");
    expect(serialized).not.toContain("global_hidden");
  });

  it("hides every player's private card identities from spectator views", () => {
    const G = createInitialState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] } });
    G.players["1"].hand = ["p1_hand_secret"];
    G.players["1"].deck = ["p1_deck_secret"];
    G.players["2"].hand = ["p2_hand_secret"];
    G.players["2"].deck = ["p2_deck_secret"];
    G.pendingDiscardChoice = { playerId: "1", sourceCardId: "discard_source", cardIds: ["p1_hand_secret"], count: 1, resumeEffects: [] };

    const view = redactGameStateForPlayer(G, undefined);
    const serialized = JSON.stringify(view);

    expect(view.players["1"].hand).toEqual([]);
    expect(view.players["2"].hand).toEqual([]);
    expect(view.pendingDiscardChoice).toBeUndefined();
    expect(serialized).not.toContain("p1_hand_secret");
    expect(serialized).not.toContain("p1_deck_secret");
    expect(serialized).not.toContain("p2_hand_secret");
    expect(serialized).not.toContain("p2_deck_secret");
  });

  it.each([
    {
      key: "pendingFreePlayChoice",
      value: { playerId: "1", sourceCardId: "free_play_source", cardIds: ["p1_hand_secret"] }
    },
    {
      key: "pendingLookTakeChoice",
      value: { playerId: "1", source: "deck", destination: "hand", cardIds: ["p1_hand_secret"] }
    },
    {
      key: "pendingMarketResourcePlacementChoice",
      value: { playerId: "1", sourceCardId: "market_resource_source", resource: "knowledge", amount: 1, cardIds: ["market_card"] }
    }
  ] as const)("hides $key from spectator and non-owner views", ({ key, value }) => {
    const G = createInitialState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] } });
    (G as any)[key] = value;

    const ownerView = redactGameStateForPlayer(G, "1") as any;
    const opponentView = redactGameStateForPlayer(G, "2") as any;
    const spectatorView = redactGameStateForPlayer(G, undefined) as any;

    expect(ownerView[key]).toEqual(value);
    expect(opponentView[key]).toBeUndefined();
    expect(spectatorView[key]).toBeUndefined();
  });
});
