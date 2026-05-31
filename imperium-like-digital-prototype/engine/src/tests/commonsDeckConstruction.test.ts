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

  it("seeds the default market from one Region, one Uncivilized, one Civilized, then two Main cards", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "region_0", setupBannerSuit: "region" }),
        card({ id: "region_1", setupBannerSuit: "region" }),
        card({ id: "region_2", setupBannerSuit: "region" }),
        card({ id: "uncivilized_0", setupBannerSuit: "uncivilized" }),
        card({ id: "civilized_0", setupBannerSuit: "civilized" }),
        card({ id: "main_0", setupBannerSuit: "civilized", smallDeckEligible: false }),
        card({ id: "main_1", setupBannerSuit: "uncivilized", smallDeckEligible: false })
      ],
      options: options()
    });

    expect(result.initialMarket.map((slot) => slot.cardId)).toEqual([
      "region_0",
      "uncivilized_0",
      "civilized_0",
      "main_0",
      "main_1"
    ]);
    expect(result.regionDeck).toEqual(["region_1", "region_2"]);
    expect(result.uncivilizedDeck).toEqual([]);
    expect(result.civilizedDeck).toEqual([]);
    expect(result.mainDeck).toEqual([]);
  });

  it("places face-up Tributary cards on the bottom of the default small decks after market seeding", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "region_0", setupBannerSuit: "region" }),
        card({ id: "region_1", setupBannerSuit: "region" }),
        card({ id: "uncivilized_0", setupBannerSuit: "uncivilized" }),
        card({ id: "uncivilized_1", setupBannerSuit: "uncivilized" }),
        card({ id: "civilized_0", setupBannerSuit: "civilized" }),
        card({ id: "civilized_1", setupBannerSuit: "civilized" }),
        card({ id: "tributary_region_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_uncivilized_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_civilized_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_main", setupBannerSuit: "tributary" }),
        card({ id: "main_0", setupBannerSuit: "civilized", smallDeckEligible: false }),
        card({ id: "main_1", setupBannerSuit: "uncivilized", smallDeckEligible: false })
      ],
      options: options()
    });

    expect(result.regionDeck).toEqual(["region_1", "tributary_region_bottom"]);
    expect(result.uncivilizedDeck).toEqual(["uncivilized_1", "tributary_uncivilized_bottom"]);
    expect(result.civilizedDeck).toEqual(["civilized_1", "tributary_civilized_bottom"]);
    expect(result.mainDeck).toEqual([]);
    expect((result as any).smallDeckBottomCards).toEqual({
      regionDeck: "tributary_region_bottom",
      uncivilizedDeck: "tributary_uncivilized_bottom",
      civilizedDeck: "tributary_civilized_bottom"
    });
  });

  it("does not expose same-suit small deck bottoms when no setup Tributary bottom card exists", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "region_0", setupBannerSuit: "region" }),
        card({ id: "region_1", setupBannerSuit: "region" }),
        card({ id: "uncivilized_0", setupBannerSuit: "uncivilized" }),
        card({ id: "uncivilized_1", setupBannerSuit: "uncivilized" }),
        card({ id: "civilized_0", setupBannerSuit: "civilized" }),
        card({ id: "civilized_1", setupBannerSuit: "civilized" }),
        card({ id: "main_0", setupBannerSuit: "civilized", smallDeckEligible: false }),
        card({ id: "main_1", setupBannerSuit: "uncivilized", smallDeckEligible: false })
      ],
      options: options()
    });

    expect((result as any).smallDeckBottomCards).toEqual({});
  });

  it("limits each default small deck to the player-count setup size and moves excess cards to Main", () => {
    const result = buildCommonsDecks({
      cards: [
        ...Array.from({ length: 9 }, (_, i) => card({ id: `region_${i}`, setupBannerSuit: "region" })),
        ...Array.from({ length: 9 }, (_, i) => card({ id: `uncivilized_${i}`, setupBannerSuit: "uncivilized" })),
        ...Array.from({ length: 9 }, (_, i) => card({ id: `civilized_${i}`, setupBannerSuit: "civilized" })),
        card({ id: "tributary_region_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_uncivilized_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_civilized_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_main", setupBannerSuit: "tributary" }),
        card({ id: "main_base", setupBannerSuit: "none", smallDeckEligible: false })
      ],
      options: options({ playerCount: 3, effectiveCommonsPlayerCount: 3 })
    });

    expect(result.initialMarket.map((slot) => slot.cardId).slice(0, 3)).toEqual(["region_0", "uncivilized_0", "civilized_0"]);
    expect(result.regionDeck).toEqual(["region_1", "region_2", "region_3", "region_4", "region_5", "region_6", "tributary_region_bottom"]);
    expect(result.uncivilizedDeck).toEqual(["uncivilized_1", "uncivilized_2", "uncivilized_3", "uncivilized_4", "uncivilized_5", "uncivilized_6", "tributary_uncivilized_bottom"]);
    expect(result.civilizedDeck).toEqual(["civilized_1", "civilized_2", "civilized_3", "civilized_4", "civilized_5", "civilized_6", "tributary_civilized_bottom"]);
    const mainPathCards = [
      ...result.initialMarket.map((slot) => slot.cardId).slice(3).filter(Boolean),
      ...result.mainDeck
    ];
    expect(mainPathCards).toEqual(expect.arrayContaining(["region_7", "region_8", "uncivilized_7", "uncivilized_8", "civilized_7", "civilized_8"]));
    expect(result.mainDeck).not.toContain("region_6");
    expect(result.mainDeck).not.toContain("uncivilized_6");
    expect(result.mainDeck).not.toContain("civilized_6");
  });

  it("removes extra Tributary cards by player count before the remaining Tributaries join Main", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "region_0", setupBannerSuit: "region" }),
        card({ id: "uncivilized_0", setupBannerSuit: "uncivilized" }),
        card({ id: "civilized_0", setupBannerSuit: "civilized" }),
        card({ id: "tributary_region_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_uncivilized_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_civilized_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_removed_1", setupBannerSuit: "tributary" }),
        card({ id: "tributary_removed_2", setupBannerSuit: "tributary" }),
        card({ id: "tributary_main", setupBannerSuit: "tributary" }),
        card({ id: "main_0", setupBannerSuit: "none", smallDeckEligible: false }),
        card({ id: "main_1", setupBannerSuit: "none", smallDeckEligible: false })
      ],
      options: options({ playerCount: 2, effectiveCommonsPlayerCount: 2 })
    });

    const mainPathCards = [
      ...result.initialMarket.map((slot) => slot.cardId).slice(3).filter(Boolean),
      ...result.mainDeck
    ];
    expect(mainPathCards).toContain("tributary_main");
    expect(mainPathCards).not.toContain("tributary_removed_1");
    expect(mainPathCards).not.toContain("tributary_removed_2");
  });

  it("places setup Progress on initial Market cards with white Tributary banners", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "region_0", setupBannerSuit: "region" }),
        card({ id: "uncivilized_0", setupBannerSuit: "uncivilized" }),
        card({ id: "civilized_0", setupBannerSuit: "civilized" }),
        card({ id: "tributary_region_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_uncivilized_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_civilized_bottom", setupBannerSuit: "tributary" }),
        card({ id: "tributary_removed_1", setupBannerSuit: "tributary" }),
        card({ id: "tributary_removed_2", setupBannerSuit: "tributary" }),
        card({ id: "tributary_visible", setupBannerSuit: "tributary" }),
        card({ id: "main_0", setupBannerSuit: "none", smallDeckEligible: false })
      ],
      options: options({ playerCount: 2, effectiveCommonsPlayerCount: 2 })
    });

    const tributaryMarketSlot = result.initialMarket.find((slot) => slot.cardId === "tributary_visible");
    expect(tributaryMarketSlot?.resourceMarkers).toEqual({ knowledge: 1 });
  });

  it("honors smallDeckEligible=false when splitting banner-suit cards", () => {
    const result = buildCommonsDecks({
      cards: [
        ...Array.from({ length: 5 }, (_, i) => card({ id: `small_${i}`, setupBannerSuit: "region" })),
        card({ id: "uncivilized_seed", setupBannerSuit: "uncivilized" }),
        card({ id: "civilized_seed", setupBannerSuit: "civilized" }),
        card({ id: "main_seed_0", setupBannerSuit: "civilized", smallDeckEligible: false }),
        card({ id: "main_seed_1", setupBannerSuit: "uncivilized", smallDeckEligible: false }),
        card({ id: "main_only_banner_card", setupBannerSuit: "region", smallDeckEligible: false })
      ],
      options: options()
    });
    expect(result.regionDeck).not.toContain("main_only_banner_card");
    expect(result.mainDeck).toEqual(["main_only_banner_card"]);
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
        card({ id: "market_a", setupBannerSuit: "civilized" })
      ],
      options: options()
    });
    const marketSlot = result.initialMarket.find((slot) => slot.cardId === "market_a");
    expect(marketSlot?.attachedUnrestCardIds).toEqual(["unrest_a"]);
  });

  it("does not attach Unrest under Region market cards", () => {
    const result = buildCommonsDecks({
      cards: [
        card({ id: "unrest_a", cardType: "unrest", suit: "unrest", unrestPileEligible: true }),
        card({ id: "region_a", cardType: "region", suit: "region", setupBannerSuit: "region" })
      ],
      options: options()
    });
    expect(result.initialMarket[0].cardId).toBe("region_a");
    expect(result.initialMarket[0].attachedUnrestCardIds).toEqual([]);
    expect(result.unrestPile).toEqual(["unrest_a"]);
  });
});
