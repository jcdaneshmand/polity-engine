import { describe, expect, it } from "vitest";
import { buildCommonsDecks } from "../setup/commonsDeckConstruction";
import { card, options } from "./commonsTestFixtures";

describe("commons deck construction", () => {
  it("lowered_aggression delays attack/aggressive cards until after market setup", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "safe_1", setupBannerSuit: "region" }),
        card({ id: "safe_2", setupBannerSuit: "region" }),
        card({ id: "safe_3", setupBannerSuit: "region" }),
        card({ id: "safe_4", setupBannerSuit: "region" }),
        card({ id: "safe_5", setupBannerSuit: "region" }),
        card({ id: "aggressive_1", cardType: "attack", tags: ["aggressive"] })
      ],
      options: options({ enabledVariants: ["lowered_aggression"] })
    });
    expect(result.delayedCards).toEqual(["aggressive_1"]);
    expect(result.initialMarket.map((slot) => slot.cardId)).not.toContain("aggressive_1");
    expect(result.mainDeck).toContain("aggressive_1");
  });

  it("quick_setup uses combined deck path", () => {
    const result = buildCommonsDecks({ cards: [card({ id: "combined_a", setupBannerSuit: "region" })], options: options({ enabledVariants: ["quick_setup"] }) });
    expect(result.constructionPath).toBe("quick");
    expect(result.regionDeck).toEqual([]);
  });

  it("quick_setup removes initial market cards from the remaining main deck", () => {
    const result = buildCommonsDecks({
      cards: Array.from({ length: 6 }, (_, i) => card({ id: `quick_${i}` })),
      options: options({ enabledVariants: ["quick_setup"] })
    });
    const initialMarketCards = new Set(result.initialMarket.map((slot) => slot.cardId).filter(Boolean));
    expect(initialMarketCards.size).toBe(5);
    expect(result.mainDeck).toEqual(["quick_5"]);
  });

  it("does not treat non-market starting locations as market eligible by default", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "boxed_card", startingLocation: "box" }),
        card({ id: "draw_deck_card", startingLocation: "draw_deck" }),
        card({ id: "market_card", startingLocation: "market" }),
        card({ id: "explicit_market_card", startingLocation: "box", marketEligible: true })
      ],
      options: options({ enabledVariants: ["quick_setup"] })
    });
    const visibleOrDeckCards = [
      ...result.initialMarket.map((slot) => slot.cardId).filter(Boolean),
      ...result.mainDeck
    ];
    expect(visibleOrDeckCards).toContain("market_card");
    expect(visibleOrDeckCards).toContain("explicit_market_card");
    expect(visibleOrDeckCards).not.toContain("boxed_card");
    expect(visibleOrDeckCards).not.toContain("draw_deck_card");
  });

  it("default setup uses suit-separated path", () => {
    const result = buildCommonsDecks({ cards: [card({ id: "region_a", setupBannerSuit: "region" }), card({ id: "civilized_a", setupBannerSuit: "civilized" })], options: options() });
    expect(result.constructionPath).toBe("suit_separated");
  });

  it("initial market has 5 slots", () => {
    const result = buildCommonsDecks({
      cards: Array.from({ length: 6 }, (_, i) => card({ id: `market_${i}`, setupBannerSuit: "region" })),
      options: options()
    });
    expect(result.initialMarket).toHaveLength(5);
  });

  it("Unrest is attached under eligible market cards", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "unrest_a", cardType: "unrest", suit: "unrest", unrestPileEligible: true }),
        card({ id: "market_a", setupBannerSuit: "region" })
      ],
      options: options()
    });
    expect(result.initialMarket[0].cardId).toBe("market_a");
    expect(result.initialMarket[0].attachedUnrestCardIds).toEqual(["unrest_a"]);
  });
});
