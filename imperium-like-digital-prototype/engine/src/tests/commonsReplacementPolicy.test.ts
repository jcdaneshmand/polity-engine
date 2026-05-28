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
});
