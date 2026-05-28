import type { PlayerState } from "./state";

function getRoll(randomNumber?: () => number): number {
  if (!randomNumber) return 0;
  const roll = randomNumber();
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) return 0;
  return roll;
}

function shuffleWithRandom<T>(items: T[], randomNumber?: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const roll = getRoll(randomNumber);
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
