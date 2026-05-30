import type { GameState, PlayerState } from "./state";

export function isAccessionCard(G: GameState, player: PlayerState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return cardId === player.accessionCardId
    || (card?.cardType ?? card?.type) === "accession"
    || (card?.tags ?? []).includes("accession");
}

export function lookableNationDeckCards(G: GameState, player: PlayerState): string[] {
  const nonAccessionCards = player.nationDeck.filter((cardId) => !isAccessionCard(G, player, cardId));
  if (nonAccessionCards.length > 0) return nonAccessionCards;
  if (player.nationDeck.length > 0) return [...player.nationDeck];
  return player.accessionCardId ? [player.accessionCardId] : [];
}
