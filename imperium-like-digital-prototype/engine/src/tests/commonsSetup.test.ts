import { describe, expect, it } from "vitest";
import { buildCommonsSetup } from "../setup/commonsSetup";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { card, cardDb, nationDb, options } from "./commonsTestFixtures";

describe("commons setup", () => {
  it("nation conflict removes conflicting Commons card", () => {
    const result = buildCommonsSetup({
      cardDb: cardDb([card({ id: "conflict", conflictsWithNationIds: ["test_nation_alpha"] }), card({ id: "safe" })]),
      nationDb,
      options: options({ selectedNationIds: ["test_nation_alpha"], replacementPolicy: "none" })
    });
    expect(result.selectedCommonsCards).toEqual(["safe"]);
    expect(result.removedForNationConflict).toEqual(["conflict"]);
  });

  it("replacement policy can substitute eligible replacement card", () => {
    const result = buildCommonsSetup({
      cardDb: cardDb([
        card({ id: "conflict", conflictsWithNationIds: ["test_nation_alpha"], replacementGroupId: "group_a" }),
        card({ id: "replacement_a", ownership: "replacement", commonsGroup: "replacement", replacementGroupId: "group_a" })
      ]),
      nationDb,
      options: options({ selectedNationIds: ["test_nation_alpha"], replacementPolicy: "use_replacements" })
    });
    expect(result.selectedCommonsCards).toEqual(["replacement_a"]);
    expect(result.replacementCardsUsed).toEqual(["replacement_a"]);
  });

  it("setup report records removed/delayed/replaced cards", () => {
    const result = buildCommonsSetup({
      cardDb: cardDb([
        card({ id: "too_many", playerCountRequirement: "3+" }),
        card({ id: "conflict", conflictsWithNationIds: ["test_nation_alpha"], replacementGroupId: "group_a" }),
        card({ id: "replacement_a", ownership: "replacement", commonsGroup: "replacement", replacementGroupId: "group_a" }),
        card({ id: "aggressive_a", cardType: "attack", tags: ["aggressive"] })
      ]),
      nationDb,
      options: options({ selectedNationIds: ["test_nation_alpha"], enabledVariants: ["lowered_aggression"], replacementPolicy: "use_replacements" })
    });
    expect(result.removedForPlayerCount).toEqual(["too_many"]);
    expect(result.removedForNationConflict).toEqual(["conflict"]);
    expect(result.replacementCardsUsed).toEqual(["replacement_a"]);
    expect(result.delayedCards).toEqual(["aggressive_a"]);
  });

  it("solo mode uses effective count 2", () => {
    const G = createInitialGameStateFromPipeline({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain", commonsSetId: "classics", replacementPolicy: "none" },
      playerNationIds: { "0": "test_nation_alpha" },
      cardDb: cardDb([
        card({ id: "two_plus", playerCountRequirement: "2+" }),
        card({ id: "three_plus", playerCountRequirement: "3+" }),
        card({ id: "multiplayer_only", playerCountRequirement: "2+", allowedModes: ["multiplayer"] })
      ]),
      nationDb
    });
    expect(G.setupReport?.commonsSetup?.selectedCommonsCards).toEqual(["two_plus"]);
    expect(G.setupReport?.commonsSetup?.removedForPlayerCount).toEqual(["three_plus"]);
    expect(G.cardDb.two_plus).toBeDefined();
    expect(G.cardDb.multiplayer_only).toBeUndefined();
  });

  it("practice mode uses effective count 2", () => {
    const G = createInitialGameStateFromPipeline({
      options: { playerCount: 1, mode: "practice", enabledExpansions: [], enabledVariants: [], commonsSetId: "classics", replacementPolicy: "none" },
      playerNationIds: { "0": "test_nation_alpha" },
      cardDb: cardDb([card({ id: "two_plus", playerCountRequirement: "2+" }), card({ id: "three_plus", playerCountRequirement: "3+" })]),
      nationDb
    });
    expect(G.setupReport?.commonsSetup?.selectedCommonsCards).toEqual(["two_plus"]);
    expect(G.setupReport?.commonsSetup?.removedForPlayerCount).toEqual(["three_plus"]);
    expect(G.cardDb.two_plus).toBeDefined();
  });

  it("stores initial market slot metadata on game state", () => {
    const G = createInitialGameStateFromPipeline({
      options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [], commonsSetId: "classics", replacementPolicy: "none" },
      playerNationIds: { "0": "test_nation_alpha", "1": "test_nation_alpha" },
      cardDb: cardDb([
        card({ id: "market_a" }),
        card({ id: "unrest_a", cardType: "unrest", suit: "unrest", unrestPileEligible: true })
      ]),
      nationDb
    });
    expect(G.market).toEqual(["market_a"]);
    expect(G.marketSlots).toHaveLength(1);
    expect(G.marketSlots?.[0]).toMatchObject({ cardId: "market_a", attachedUnrestCardIds: ["unrest_a"] });
    expect(G.log.some((entry) => entry.message === "MarketInitialized(slots=1)")).toBe(true);
  });

  it("keeps setup report market slots immutable from live market mutations", () => {
    const G = createInitialGameStateFromPipeline({
      options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [], commonsSetId: "classics", replacementPolicy: "none" },
      playerNationIds: { "0": "test_nation_alpha", "1": "test_nation_alpha" },
      cardDb: cardDb([
        card({ id: "market_a" }),
        card({ id: "unrest_a", cardType: "unrest", suit: "unrest", unrestPileEligible: true })
      ]),
      nationDb
    });
    G.marketSlots?.splice(0, 1);
    expect(G.marketSlots).toEqual([]);
    expect(G.setupReport?.commonsSetup?.initialMarket[0]).toMatchObject({ cardId: "market_a", attachedUnrestCardIds: ["unrest_a"] });
  });

  it("removes rejected Commons cards from the runtime card database", () => {
    const G = createInitialGameStateFromPipeline({
      options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [], commonsSetId: "classics", replacementPolicy: "none" },
      playerNationIds: { "0": "test_nation_alpha", "1": "test_nation_alpha" },
      cardDb: cardDb([
        card({ id: "selected_commons" }),
        card({ id: "conflicting_commons", conflictsWithNationIds: ["test_nation_alpha"] }),
        card({ id: "other_set_commons", commonsSetId: "legends" }),
        card({ id: "nation_card", ownership: "nation" })
      ]),
      nationDb
    });
    expect(G.cardDb.selected_commons).toBeDefined();
    expect(G.cardDb.nation_card).toBeDefined();
    expect(G.cardDb.conflicting_commons).toBeUndefined();
    expect(G.cardDb.other_set_commons).toBeUndefined();
  });

  it("preserves selected nation cards when using a different Commons set", () => {
    const G = createInitialGameStateFromPipeline({
      options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [], commonsSetId: "legends", replacementPolicy: "none" },
      playerNationIds: { "0": "test_nation_alpha", "1": "test_nation_alpha" },
      cardDb: cardDb([
        card({ id: "legacy_starting_card", commonsSetId: "classics" }),
        card({ id: "legends_commons", commonsSetId: "legends" })
      ]),
      nationDb: {
        test_nation_alpha: {
          ...nationDb.test_nation_alpha,
          startingDeckCardIds: ["legacy_starting_card"]
        }
      }
    });
    expect(G.players["0"].hand).toContain("legacy_starting_card");
    expect(G.cardDb.legacy_starting_card).toBeDefined();
    expect(G.cardDb.legends_commons).toBeDefined();
  });

  it("preserves cards added by player setup hooks after Commons pruning", () => {
    const G = createInitialGameStateFromPipeline({
      options: { playerCount: 2, mode: "multiplayer", enabledExpansions: ["trade_routes"], enabledVariants: [], commonsSetId: "legends", replacementPolicy: "none" },
      playerNationIds: { "0": "test_nation_alpha", "1": "test_nation_alpha" },
      cardDb: cardDb([
        card({ id: "legends_commons", commonsSetId: "legends" }),
        card({ id: "test_action_civic_assembly", commonsSetId: "classics" })
      ]),
      nationDb
    });
    expect(G.players["0"].powerArea).toContain("test_action_civic_assembly");
    expect(G.cardDb.test_action_civic_assembly).toBeDefined();
    expect(G.cardDb.legends_commons).toBeDefined();
  });
});
