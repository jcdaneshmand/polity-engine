import { describe, expect, it } from "vitest";
import { redactGameStateForPlayer } from "../game/playerView";
import { createInitialState } from "../game/initialState";

describe("playerView redaction", () => {
  it("hides opponent private card identities while preserving public state and counts", () => {
    const G = createInitialState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] } });
    G.players["0"].hand = ["p0_hand_secret"];
    G.players["0"].deck = ["p0_deck_secret"];
    G.players["0"].nationDeck = ["p0_nation_secret"];
    G.players["0"].discard = ["p0_public_discard"];
    G.players["0"].sideAreas = { private_track: ["p0_side_secret"], public_track: ["p0_side_public"] };
    G.players["1"].hand = ["p1_hand_secret"];
    G.players["1"].deck = ["p1_deck_secret"];
    G.players["1"].nationDeck = ["p1_nation_secret"];
    G.players["1"].discard = ["p1_public_discard"];
    G.players["1"].sideAreas = { private_track: ["p1_side_secret"], public_track: ["p1_side_public"] };
    G.activeNationRulesets = {
      "0": { setupOverrides: [{ op: "create_side_area", areaId: "private_track", displayName: "Private", public: false }, { op: "create_side_area", areaId: "public_track", displayName: "Public", public: true }], zoneOverrides: [] } as any,
      "1": { setupOverrides: [{ op: "create_side_area", areaId: "private_track", displayName: "Private", public: false }, { op: "create_side_area", areaId: "public_track", displayName: "Public", public: true }], zoneOverrides: [] } as any
    };
    G.lookedCards = { playerId: "1", source: "deck", cardIds: ["p1_looked_secret"] };
    G.pendingDiscardChoice = { playerId: "1", sourceCardId: "discard_source", cardIds: ["p1_hand_secret"], count: 1, resumeEffects: [] };
    G.pendingPlayedCardResolution = { playerId: "1", cardId: "p1_hand_secret", freePlay: false, rollbackSnapshot: G };
    G.globalSpecialZones = {
      public_archive: { id: "public_archive", displayName: "Public", cardIds: ["global_public"], visibility: "public", scoresAsOwned: false },
      hidden_archive: { id: "hidden_archive", displayName: "Hidden", cardIds: ["global_hidden"], visibility: "private", scoresAsOwned: false }
    };

    const view = redactGameStateForPlayer(G, "0");
    const serialized = JSON.stringify(view);

    expect(view.players["0"].hand).toEqual(["p0_hand_secret"]);
    expect(view.players["1"].hand).toEqual([]);
    expect(view.players["1"].deck).toEqual([]);
    expect(view.players["1"].nationDeck).toEqual([]);
    expect(view.players["1"].discard).toEqual(["p1_public_discard"]);
    expect(view.players["1"].sideAreas?.private_track).toEqual([]);
    expect(view.players["1"].sideAreas?.public_track).toEqual(["p1_side_public"]);
    expect(view.lookedCards?.cardIds).toEqual([]);
    expect(view.pendingDiscardChoice).toBeUndefined();
    expect(view.pendingPlayedCardResolution).toBeUndefined();
    expect(view.globalSpecialZones?.public_archive.cardIds).toEqual(["global_public"]);
    expect(view.globalSpecialZones?.hidden_archive.cardIds).toEqual([]);
    expect(serialized).not.toContain("p1_hand_secret");
    expect(serialized).not.toContain("p1_deck_secret");
    expect(serialized).not.toContain("p1_nation_secret");
    expect(serialized).not.toContain("p1_side_secret");
    expect(serialized).not.toContain("p1_looked_secret");
    expect(serialized).not.toContain("global_hidden");
  });
});
