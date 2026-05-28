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
      cardDb: cardDb([card({ id: "two_plus", playerCountRequirement: "2+" }), card({ id: "three_plus", playerCountRequirement: "3+" })]),
      nationDb
    });
    expect(G.setupReport?.commonsSetup?.selectedCommonsCards).toEqual(["two_plus"]);
    expect(G.setupReport?.commonsSetup?.removedForPlayerCount).toEqual(["three_plus"]);
    expect(G.cardDb.two_plus).toBeDefined();
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
});
