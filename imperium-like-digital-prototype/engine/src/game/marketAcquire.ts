import type { GameState } from "./state";
import { collectMarketResources, collectMarketUnrest } from "./marketResources";
import { refillMarketSlot } from "./marketRefill";

export function acquireMarketCard(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard" }): boolean {
  const slotIndex = G.market.indexOf(args.cardId);
  if (slotIndex < 0) return false;

  const [acquiredCardId] = G.market.splice(slotIndex, 1);
  if (!acquiredCardId) return false;

  collectMarketResources(G, args.playerId, acquiredCardId);
  G.players[args.playerId][args.destination ?? "hand"].push(acquiredCardId);
  collectMarketUnrest(G, args.playerId, acquiredCardId);
  refillMarketSlot(G, { playerId: args.playerId, slotIndex, acquiredCardId });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: args.playerId, message: `AcquiredFromMarket(${acquiredCardId}/destination=${args.destination ?? "hand"})` });
  return true;
}
