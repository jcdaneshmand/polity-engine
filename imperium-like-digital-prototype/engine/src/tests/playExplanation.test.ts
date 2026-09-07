import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { explainResourcePayment, payResourceCosts } from "../game/payments";
import { calculatePlayerScoreBreakdown, finalizeNormalScoring, triggerScoring } from "../game/scoring";

function card(id: string, vp: unknown): any {
  return { id, displayName: id, type: "action", cardType: "action", suit: "none", cost: 0, vp, tags: [], effects: [] };
}

describe("public play explanations", () => {
  it("derives fixed, substitute, and unavailable payment previews from the payment resolver", () => {
    const G = createInitialState();
    G.players["1"].resources = { materials: 2, influence: 0, knowledge: 0, goods: 0, unrest: 0 };
    expect(explainResourcePayment(G, "1", 2)).toMatchObject({ payable: true, kind: "fixed", payment: { materials: 2 }, summary: "Cost: 2 materials" });

    G.players["1"].resources = { materials: 1, influence: 0, knowledge: 0, goods: 1, unrest: 0 };
    expect(explainResourcePayment(G, "1", 3)).toMatchObject({ payable: true, kind: "alternative", payment: { materials: 1, goods: 1 } });

    G.players["1"].resources.goods = 0;
    expect(explainResourcePayment(G, "1", 3)).toMatchObject({ payable: false, kind: "unavailable", summary: "Cannot pay 3 materials" });
  });

  it("does not mutate state while previewing and rejects a stale payment at commit", () => {
    const G = createInitialState();
    G.players["1"].resources = { materials: 1, influence: 0, knowledge: 0, goods: 1, unrest: 0 };
    const before = JSON.stringify(G);
    const preview = explainResourcePayment(G, "1", 3);
    expect(JSON.stringify(G)).toBe(before);
    expect(preview.payable).toBe(true);

    G.players["1"].resources.goods = 0;
    expect(payResourceCosts(G, "1", { materials: 3 }, preview.payment)).toBe(false);
    expect(G.players["1"].resources.materials).toBe(1);
  });

  it("records successful payment as a structured public resource delta", () => {
    const G = createInitialState();
    G.players["1"].resources = { materials: 1, influence: 0, knowledge: 0, goods: 1, unrest: 0 };
    expect(payResourceCosts(G, "1", { materials: 3 })).toBe(true);
    expect(G.log.at(-1)?.event).toEqual({
      type: "resource_change",
      reason: "payment",
      changes: [
        { playerId: "1", resource: "materials", amount: -1 },
        { playerId: "1", resource: "goods", amount: -1 }
      ]
    });
  });

  it("builds an additive, non-mutating normal score breakdown and stores it only at game end", () => {
    const G = createInitialState();
    G.cardDb = { ...G.cardDb, positive: card("positive", 4), penalty: card("penalty", { mode: "negative", value: 1 }), garrison: card("garrison", 2) };
    G.players["1"].playArea = ["positive", "penalty"];
    G.players["1"].resources.knowledge = 3;
    G.cardStates = { positive: { garrisonedCardIds: ["garrison"] } };

    const before = JSON.stringify(G);
    const breakdown = calculatePlayerScoreBreakdown(G, "1");
    expect(breakdown.contributions.map(({ id, score }) => ({ id, score }))).toEqual([
      { id: "cards", score: 3 },
      { id: "garrison", score: 2 },
      { id: "progress", score: 3 }
    ]);
    expect(breakdown.total).toBe(8);
    expect(JSON.stringify(G)).toBe(before);
    expect(G.finalScoreBreakdowns).toBeUndefined();

    G.options = { playerCount: 2, mode: "practice", enabledExpansions: [], enabledVariants: [] };
    triggerScoring(G, "test");
    finalizeNormalScoring(G);
    expect(G.finalScoreBreakdowns?.["1"].total).toBe(G.gameover?.scores?.["1"]);
    expect(G.log.at(-1)?.event).toMatchObject({ type: "terminal", scoring: "normal" });
  });
});
