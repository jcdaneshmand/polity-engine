import { describe, expect, it } from "vitest";
import { runEffects } from "../cards/effectRunner";
import { createInitialState } from "../game/initialState";

describe("effectRunner", () => {
  it("draws from deck", () => {
    const G = createInitialState();
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "draw", count: 1 }]);
    expect(G.players["0"].hand.length).toBe(1);
  });

  it("reshuffles discard when deck empty", () => {
    const G = createInitialState();
    G.players["0"].deck = [];
    G.players["0"].discard = ["test_action_foundry_shift"];
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "draw", count: 1 }]);
    expect(G.players["0"].hand.length).toBe(1);
    expect(["test_action_foundry_shift", "test_action_lineage_record"]).toContain(G.players["0"].hand[0]);
  });

  it("gain resource", () => {
    const G = createInitialState();
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("acquire_card moves attached market unrest to discard", () => {
    const G = createInitialState();
    G.market = ["market_a"];
    G.marketSlots = [{ index: 0, cardId: "market_a", attachedUnrestCardIds: ["unrest_a"], resourceMarkers: {} }];
    G.players["0"].discard = [];
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "acquire_card", count: 1 }]);
    expect(G.players["0"].discard).toEqual(["market_a", "unrest_a"]);
    expect(G.market).toEqual([]);
    expect(G.marketSlots).toEqual([]);
  });
});
