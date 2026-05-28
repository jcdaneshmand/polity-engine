import type { NationDefinition } from "./nationSchema";

export function validateNationCardReferences(nation: NationDefinition, cardDb: Record<string, unknown>): string[] {
  const refs = [...nation.powerCardIds, ...nation.stateCardIds, ...nation.startingDeckCardIds, ...nation.nationDeckCardIds, ...nation.developmentCardIds, ...(nation.accessionCardId ? [nation.accessionCardId] : [])];
  return refs.filter((id) => !cardDb[id]);
}
