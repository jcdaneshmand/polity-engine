import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { scorePlayer, triggerCollapse, triggerScoring } from "../game/scoring";
import { onTurnEnd } from "../game/turn";

function vpCard(id: string, vp: number): any {
  return { id, displayName: id, type: "action", cardType: "action", suit: "none", cost: 0, vp, tags: [], effects: [] };
}

describe("scoring", () => {
  it("scores owned cards in normal scoring zones, including garrisoned cards", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      hand_vp: vpCard("hand_vp", 2),
      deck_vp: vpCard("deck_vp", 3),
      discard_vp: vpCard("discard_vp", 4),
      play_vp: vpCard("play_vp", 5),
      history_vp: vpCard("history_vp", 6),
      power_vp: vpCard("power_vp", 7),
      garrison_vp: vpCard("garrison_vp", 8)
    };
    G.players["0"].hand = ["hand_vp"];
    G.players["0"].deck = ["deck_vp"];
    G.players["0"].discard = ["discard_vp"];
    G.players["0"].playArea = ["play_vp"];
    G.players["0"].history = ["history_vp"];
    G.players["0"].powerArea = ["power_vp"];
    G.players["0"].resources.influence = 2;
    G.players["0"].resources.unrest = 1;
    G.cardStates = {
      play_vp: { garrisonedCardIds: ["garrison_vp"] }
    };

    expect(scorePlayer(G, "0")).toBe(36);
  });

  it("does not score unplayed Nation deck or undeveloped Development area cards", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      nation_vp: vpCard("nation_vp", 50),
      development_vp: vpCard("development_vp", 50),
      discard_vp: vpCard("discard_vp", 4)
    };
    G.players["0"].nationDeck = ["nation_vp"];
    G.players["0"].developmentArea = ["development_vp"];
    G.players["0"].discard = ["discard_vp"];

    expect(scorePlayer(G, "0")).toBe(4);
  });

  it("honors scoring zone exclusions", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      discard_vp: vpCard("discard_vp", 4),
      history_vp: vpCard("history_vp", 6)
    };
    G.players["0"].discard = ["discard_vp"];
    G.players["0"].history = ["history_vp"];
    G.activeNationRulesets!["0"].scoringOverrides = [{ op: "exclude_zone_from_scoring", zoneId: "discard" }];

    expect(scorePlayer(G, "0")).toBe(6);
  });

  it("normal scoring waits for the current round, one final round, and final solstice", () => {
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 3),
      p1_vp: vpCard("p1_vp", 5)
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["1"].powerArea = ["p1_vp"];
    const playOrder = ["0", "1"];

    triggerScoring(G, "test_trigger", "0");

    expect(G.scoring).toEqual({ reason: "test_trigger", triggeredBy: "0", phase: "finish_current_round" });
    expect(G.gameover).toBeUndefined();

    onTurnEnd(G, { currentPlayer: "0", playOrder } as any);
    expect(G.gameover).toBeUndefined();
    expect(G.scoring?.phase).toBe("finish_current_round");

    onTurnEnd(G, { currentPlayer: "1", playOrder } as any);
    expect(G.round).toBe(2);
    expect(G.gameover).toBeUndefined();
    expect(G.scoring).toEqual({ reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 2 });

    onTurnEnd(G, { currentPlayer: "0", playOrder } as any);
    expect(G.gameover).toBeUndefined();
    expect(G.scoring?.phase).toBe("final_round");

    onTurnEnd(G, { currentPlayer: "1", playOrder } as any);
    expect(G.round).toBe(3);
    expect(G.gameover).toEqual({
      winner: "1",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 3, "1": 5 }
    });
  });

  it("collapse scoring ends immediately and uses lowest Unrest instead of VP", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 1),
      p1_vp: vpCard("p1_vp", 99),
      unrest_card: { ...vpCard("unrest_card", 0), type: "unrest", cardType: "unrest", suit: "unrest", tags: ["unrest"] }
    };
    G.players["0"].discard = ["p0_vp"];
    G.players["1"].discard = ["p1_vp", "unrest_card"];
    G.players["0"].resources.unrest = 1;
    G.players["1"].resources.unrest = 2;

    triggerCollapse(G, "unrest_pile_empty", "1");

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1, "1": 3 }
    });
    expect(G.scoring).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("CollapseFinalized(winner=0)");
  });

  it("collapse scoring shares victory when players tie for lowest Unrest", () => {
    const G = createInitialState();
    G.players["0"].resources.unrest = 1;
    G.players["1"].resources.unrest = 1;

    triggerCollapse(G, "test_collapse");

    expect(G.gameover).toEqual({
      winner: "0,1",
      reason: "collapse:test_collapse",
      scores: { "0": 1, "1": 1 }
    });
  });
});
