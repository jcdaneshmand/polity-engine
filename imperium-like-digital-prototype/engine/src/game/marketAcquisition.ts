import type { GameState } from "./state";

export function acquireMarketCardToDiscard(G: GameState, playerId: string, cardId: string): boolean {
  const player = G.players[playerId];
  if (!player) return false;

  const marketIndex = G.market.indexOf(cardId);
  if (marketIndex < 0) return false;

  G.market.splice(marketIndex, 1);
  player.discard.push(cardId);

  const slotIndex = G.marketSlots?.findIndex((slot) => slot.cardId === cardId) ?? -1;
  if (slotIndex >= 0 && G.marketSlots) {
    const [slot] = G.marketSlots.splice(slotIndex, 1);
    const attachedUnrest = slot?.attachedUnrestCardIds ?? [];
    if (attachedUnrest.length > 0) {
      player.discard.push(...attachedUnrest);
      G.log.push({ round: G.round, playerId, message: `Acquired attached unrest: ${attachedUnrest.join(", ")}.` });
    }
  }

  return true;
}
