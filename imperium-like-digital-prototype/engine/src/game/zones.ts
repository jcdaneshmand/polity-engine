import type { PlayerState } from "./state";

function shuffleWithRandom<T>(items: T[], randomNumber?: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const roll = randomNumber ? randomNumber() : Math.random();
    const j = Math.floor(roll * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function drawCard(player: PlayerState, randomNumber?: () => number): string | null {
  if (player.deck.length === 0 && player.discard.length > 0) {
    player.deck = shuffleWithRandom(player.discard, randomNumber);
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
