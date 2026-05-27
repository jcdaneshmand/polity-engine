import type { PlayerState } from "./state";

export function drawCard(player: PlayerState): string | null {
  if (player.deck.length === 0 && player.discard.length > 0) {
    player.deck = [...player.discard].reverse();
    player.discard = [];
  }
  const cardId = player.deck.shift();
  if (!cardId) return null;
  player.hand.push(cardId);
  return cardId;
}

export function moveAllToDiscard(player: PlayerState): void {
  player.discard.push(...player.hand, ...player.playArea);
  player.hand = [];
  player.playArea = [];
}
