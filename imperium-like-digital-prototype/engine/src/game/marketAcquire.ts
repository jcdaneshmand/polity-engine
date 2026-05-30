import type { GameState } from "./state";
import { collectMarketResources, collectMarketUnrest, returnMarketUnrest } from "./marketResources";
import { refillMarketSlot } from "./marketRefill";

function removeMarketCard(G: GameState, cardId: string): { cardId: string; slotIndex: number } | undefined {
  const slotIndex = G.market.indexOf(cardId);
  if (slotIndex < 0) return undefined;
  const [removedCardId] = G.market.splice(slotIndex, 1);
  if (!removedCardId) return undefined;
  return { cardId: removedCardId, slotIndex };
}

export function acquireMarketCard(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard" }): boolean {
  const removed = removeMarketCard(G, args.cardId);
  if (!removed) return false;
  const acquiredCardId = removed.cardId;

  collectMarketResources(G, args.playerId, acquiredCardId);
  G.players[args.playerId][args.destination ?? "hand"].push(acquiredCardId);
  collectMarketUnrest(G, args.playerId, acquiredCardId);
  refillMarketSlot(G, { playerId: args.playerId, slotIndex: removed.slotIndex, acquiredCardId });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: args.playerId, message: `AcquiredFromMarket(${acquiredCardId}/destination=${args.destination ?? "hand"})` });
  return true;
}

export function gainMarketCard(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard" }): boolean {
  const removed = removeMarketCard(G, args.cardId);
  if (!removed) return false;
  const gainedCardId = removed.cardId;

  collectMarketResources(G, args.playerId, gainedCardId);
  G.players[args.playerId][args.destination ?? "hand"].push(gainedCardId);
  collectMarketUnrest(G, args.playerId, gainedCardId);
  refillMarketSlot(G, { playerId: args.playerId, slotIndex: removed.slotIndex, acquiredCardId: gainedCardId });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: args.playerId, message: `CardGainedFromMarket(${gainedCardId}/destination=${args.destination ?? "hand"})` });
  return true;
}

export function takeMarketCard(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard" }): boolean {
  const removed = removeMarketCard(G, args.cardId);
  if (!removed) return false;
  const takenCardId = removed.cardId;

  collectMarketResources(G, args.playerId, takenCardId);
  G.players[args.playerId][args.destination ?? "hand"].push(takenCardId);
  returnMarketUnrest(G, args.playerId, takenCardId);
  refillMarketSlot(G, { playerId: args.playerId, slotIndex: removed.slotIndex, acquiredCardId: takenCardId });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: args.playerId, message: `CardTakenFromMarket(${takenCardId}/destination=${args.destination ?? "hand"})` });
  return true;
}
