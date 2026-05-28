import type { NationDefinition } from "./nationSchema";

export function validateNationCardReferences(nation: NationDefinition, cardDb: Record<string, unknown>): string[] {
  const setupRuleRefs = (nation.setupRules ?? []).flatMap((rule) => {
    if (rule.op === "place_card_in_area") return [rule.cardId];
    if (rule.op === "use_custom_state") return [rule.stateCardId];
    return [] as string[];
  });

  const refs = [
    ...nation.powerCardIds,
    ...nation.stateCardIds,
    ...nation.startingDeckCardIds,
    ...nation.nationDeckCardIds,
    ...nation.developmentCardIds,
    ...(nation.accessionCardId ? [nation.accessionCardId] : []),
    ...setupRuleRefs,
  ];

  return [...new Set(refs)].filter((id) => !cardDb[id]);
}
