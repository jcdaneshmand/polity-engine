import type { GameState, PlayerState } from "./state";

export function isAccessionCard(G: GameState, player: PlayerState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return cardId === player.accessionCardId
    || (card?.cardType ?? card?.type) === "accession"
    || (card?.tags ?? []).includes("accession");
}

export function canUseAccession(G: GameState, playerId: string): boolean {
  return !(G.activeNationRulesets?.[playerId]?.rulesetTags ?? []).includes("no_accession");
}

export function isEffectiveAccessionCard(G: GameState, playerId: string, player: PlayerState, cardId: string): boolean {
  return canUseAccession(G, playerId) && isAccessionCard(G, player, cardId);
}

export function lookableNationDeckCards(G: GameState, player: PlayerState, playerId?: string): string[] {
  const isEffectiveAccession = (cardId: string) => playerId
    ? isEffectiveAccessionCard(G, playerId, player, cardId)
    : isAccessionCard(G, player, cardId);
  const nonAccessionCards = player.nationDeck.filter((cardId) => !isEffectiveAccession(cardId));
  if (nonAccessionCards.length > 0) return nonAccessionCards;
  if (player.nationDeck.length > 0) return [...player.nationDeck];
  return player.accessionCardId && (!playerId || canUseAccession(G, playerId)) ? [player.accessionCardId] : [];
}
