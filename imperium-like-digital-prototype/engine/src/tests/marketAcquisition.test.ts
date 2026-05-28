import { describe, expect, it } from "vitest";
import { acquireCard } from "../game/moves";
import { createInitialState } from "../game/initialState";

describe("market acquisition", () => {
  it("acquireCard moves attached market unrest to discard and clears the slot", () => {
    const G = createInitialState();
    G.market = ["market_a"];
    G.marketSlots = [{ index: 0, cardId: "market_a", attachedUnrestCardIds: ["unrest_a"], resourceMarkers: {} }];
    G.players["0"].discard = [];

    acquireCard({ G, ctx: { currentPlayer: "0" } as any }, "market_a");

    expect(G.players["0"].discard).toEqual(["market_a", "unrest_a"]);
    expect(G.market).toEqual([]);
    expect(G.marketSlots).toEqual([]);
  });
});
