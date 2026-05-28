import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsReplacementPolicy, CommonsSetupOptions } from "./commonsTypes";
import { satisfiesCommonsExpansionRules, satisfiesCommonsModeRules, satisfiesCommonsPlayerCount } from "./commonsSelection";

export function hasNationConflict(card: NormalizedCardRecord, selectedNationIds: string[]): boolean {
  const conflicts = card.conflictsWithNationIds ?? [];
  return conflicts.some((nationId) => selectedNationIds.includes(nationId));
}

export function replacementPolicyAllowsSubstitution(policy: CommonsReplacementPolicy): boolean {
  return policy === "use_replacements" || policy === "prefer_latest";
}

export function findEligibleReplacementCard(args: {
  removedCard: NormalizedCardRecord;
  allCards: NormalizedCardRecord[];
  selectedCards: NormalizedCardRecord[];
  options: CommonsSetupOptions;
}): NormalizedCardRecord | undefined {
  const { removedCard, allCards, selectedCards, options } = args;
  if (!replacementPolicyAllowsSubstitution(options.replacementPolicy)) return undefined;
  const selectedIds = new Set(selectedCards.map((card) => card.id));
  const candidates = allCards.filter((card) => {
    if (selectedIds.has(card.id) || card.id === removedCard.id) return false;
    const matchesRemovedCard = card.replacementForCardId === removedCard.id;
    const matchesReplacementGroup = Boolean(
      removedCard.replacementGroupId && card.replacementGroupId === removedCard.replacementGroupId
    );
    if (!matchesRemovedCard && !matchesReplacementGroup) return false;
    if (!satisfiesCommonsModeRules(card, options)) return false;
    if (!satisfiesCommonsExpansionRules(card, options)) return false;
    if (!satisfiesCommonsPlayerCount(card, options.effectiveCommonsPlayerCount)) return false;
    if (hasNationConflict(card, options.selectedNationIds)) return false;
    return true;
  });

  if (options.replacementPolicy === "prefer_latest") {
    return candidates.sort(compareReplacementFreshness)[0];
  }
  return candidates[0];
}

function compareReplacementFreshness(a: NormalizedCardRecord, b: NormalizedCardRecord): number {
  const priority = new Map<string, number>([["horizons", 0], ["legends", 1], ["classics", 2], ["custom", 3]]);
  return (priority.get(a.commonsSetId ?? "") ?? 4) - (priority.get(b.commonsSetId ?? "") ?? 4) || a.id.localeCompare(b.id);
}
