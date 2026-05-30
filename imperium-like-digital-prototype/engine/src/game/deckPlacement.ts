import type { GameState, PlaceOnDeckSourceZone } from "./state";

export function placeCardOnDeck(G: GameState, playerId: string, cardId: string, sourceZone: PlaceOnDeckSourceZone): boolean {
  const player = G.players[playerId];
  if (!player) return false;
  const index = player[sourceZone].indexOf(cardId);
  if (index < 0) return false;
  player[sourceZone].splice(index, 1);
  player.deck.unshift(cardId);
  G.log.push({ round: G.round, playerId, message: `CardPlacedOnDeck(${cardId}/${sourceZone})` });
  return true;
}
