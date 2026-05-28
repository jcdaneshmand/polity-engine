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
