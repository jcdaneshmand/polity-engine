import { describe, expect, it } from "vitest";
import { findEligibleReplacementCard } from "../setup/commonsReplacementPolicy";
import { card, options } from "./commonsTestFixtures";

describe("commons replacement policy", () => {
  it("replacement policy can substitute eligible replacement card", () => {
    const removed = card({ id: "conflicting", replacementGroupId: "group_a" });
    const replacement = card({ id: "replacement_a", ownership: "replacement", commonsGroup: "replacement", replacementGroupId: "group_a" });
    const found = findEligibleReplacementCard({ removedCard: removed, allCards: [removed, replacement], selectedCards: [], options: options({ replacementPolicy: "use_replacements" }) });
    expect(found?.id).toBe("replacement_a");
  });

  it("replacement respects player count/expansion filters", () => {
    const removed = card({ id: "conflicting", replacementGroupId: "group_a" });
    const tooManyPlayers = card({ id: "replacement_3p", ownership: "replacement", commonsGroup: "replacement", replacementGroupId: "group_a", playerCountRequirement: "3+" });
    const needsExpansion = card({ id: "replacement_trade", ownership: "replacement", commonsGroup: "replacement", replacementGroupId: "group_a", requiredExpansions: ["trade_routes"] });
    const eligible = card({ id: "replacement_eligible", ownership: "replacement", commonsGroup: "replacement", replacementGroupId: "group_a" });
    const found = findEligibleReplacementCard({ removedCard: removed, allCards: [removed, tooManyPlayers, needsExpansion, eligible], selectedCards: [], options: options({ replacementPolicy: "use_replacements", effectiveCommonsPlayerCount: 2 }) });
    expect(found?.id).toBe("replacement_eligible");
  });

  it("does not substitute unrelated cards when the removed card has no replacement link", () => {
    const removed = card({ id: "conflicting" });
    const unrelated = card({ id: "unrelated", ownership: "replacement", commonsGroup: "replacement" });
    const found = findEligibleReplacementCard({ removedCard: removed, allCards: [removed, unrelated], selectedCards: [], options: options({ replacementPolicy: "use_replacements" }) });
    expect(found).toBeUndefined();
  });

  it("can substitute a card linked directly to the removed card", () => {
    const removed = card({ id: "conflicting" });
    const replacement = card({ id: "replacement_direct", ownership: "replacement", commonsGroup: "replacement", replacementForCardId: "conflicting" });
    const found = findEligibleReplacementCard({ removedCard: removed, allCards: [removed, replacement], selectedCards: [], options: options({ replacementPolicy: "use_replacements" }) });
    expect(found?.id).toBe("replacement_direct");
  });

  it("does not substitute non-replacement cards even when replacement metadata matches", () => {
    const removed = card({ id: "conflicting", replacementGroupId: "group_a" });
    const nationCandidate = card({ id: "nation_candidate", ownership: "nation", replacementGroupId: "group_a" });
    const commonsCandidate = card({ id: "commons_candidate", ownership: "commons", replacementForCardId: "conflicting" });
    const replacement = card({ id: "replacement_a", ownership: "replacement", commonsGroup: "replacement", replacementGroupId: "group_a" });
    const found = findEligibleReplacementCard({
      removedCard: removed,
      allCards: [removed, nationCandidate, commonsCandidate, replacement],
      selectedCards: [],
      options: options({ replacementPolicy: "use_replacements" })
    });
    expect(found?.id).toBe("replacement_a");
  });
});
