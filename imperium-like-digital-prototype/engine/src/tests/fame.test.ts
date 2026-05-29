import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { peekFameCards, returnFameCardToTop, takeFameCard } from "../game/fame";

describe("Fame deck", () => {
  it("keeps the special bottom Fame card unavailable while ordinary Fame remains", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: ["fame_top", "fame_second"],
      specialBottomCardId: "fame_bottom",
      resolvedSpecialByPlayer: {}
    };

    expect(peekFameCards(G, 3)).toEqual(["fame_top", "fame_second"]);
    expect(takeFameCard(G, "0")).toBe("fame_top");
    expect(G.fameDeck.available).toEqual(["fame_second"]);
    expect(G.players["0"].discard).toContain("fame_top");
    expect(G.scoring).toBeUndefined();
  });

  it("returns Fame cards to the top above the special bottom card", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: ["fame_original_top"],
      specialBottomCardId: "fame_bottom",
      resolvedSpecialByPlayer: {}
    };

    returnFameCardToTop(G, "fame_returned");

    expect(G.fameDeck.available).toEqual(["fame_returned", "fame_original_top"]);
    expect(peekFameCards(G, 3)).toEqual(["fame_returned", "fame_original_top"]);
  });

  it("makes the special bottom Fame card available only after the deck above it is empty", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: [],
      specialBottomCardId: "fame_bottom",
      resolvedSpecialByPlayer: {}
    };

    expect(peekFameCards(G, 1)).toEqual(["fame_bottom"]);
    expect(takeFameCard(G, "0")).toBe("fame_bottom");
    expect(G.fameDeck).toEqual({
      available: [],
      resolvedSpecialByPlayer: { "0": true }
    });
    expect(G.players["0"].discard).toContain("fame_bottom");
    expect(G.scoring).toEqual({
      reason: "fame_deck_terminal_condition",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
  });
});
