import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { evaluateNationHookCondition } from "../nations/nationHookCore";

describe("nation hook conditions", () => {
  it("treats missing expansion and variant option lists as disabled", () => {
    const G = createInitialState({ usePrivateData: false });
    G.options = { playerCount: 2, mode: "multiplayer" } as any;

    expect(evaluateNationHookCondition(G, "0", {
      op: "expansion_enabled",
      expansion: "trade_routes"
    } as any)).toBe(false);
    expect(evaluateNationHookCondition(G, "0", {
      op: "variant_enabled",
      variant: "short_game"
    } as any)).toBe(false);
  });

  it("treats missing payload-card tags as no tag match", () => {
    const G = createInitialState({ usePrivateData: false });
    G.cardDb.payload_without_tags = {
      id: "payload_without_tags",
      displayName: "Payload Without Tags",
      type: "action",
      cardType: "action",
      cost: 0,
      effects: []
    } as any;

    expect(evaluateNationHookCondition(G, "0", {
      op: "payload_card_has_tag",
      payloadKey: "cardId",
      tag: "aggressive"
    } as any, { cardId: "payload_without_tags" })).toBe(false);
  });
});
