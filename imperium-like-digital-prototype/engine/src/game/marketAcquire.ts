import type { GameState, ResourceGainSource, ResourceName } from "./state";
import { collectMarketResources, collectMarketUnrest, returnMarketUnrest } from "./marketResources";
import { refillMarketSlot } from "./marketRefill";

function removeMarketCard(G: GameState, cardId: string): { cardId: string; slotIndex: number } | undefined {
  const slotIndex = G.market.indexOf(cardId);
  if (slotIndex < 0) return undefined;
  const [removedCardId] = G.market.splice(slotIndex, 1);
  if (!removedCardId) return undefined;
  return { cardId: removedCardId, slotIndex };
}

function addCollectedResources(target: Partial<Record<ResourceName, number>> | undefined, collected: Partial<Record<ResourceName, number>>): void {
  if (!target) return;
  for (const [resource, amount] of Object.entries(collected) as Array<[ResourceName, number | undefined]>) {
    if ((amount ?? 0) <= 0) continue;
    target[resource] = (target[resource] ?? 0) + (amount ?? 0);
  }
}

function addCollectedResourceSource(target: ResourceGainSource[] | undefined, sourceCardId: string, collected: Partial<Record<ResourceName, number>>): void {
  if (!target || Object.values(collected).every((amount) => (amount ?? 0) <= 0)) return;
  target.push({ sourceCardId, sourceWasInPlay: true, gains: collected });
}

export function acquireMarketCard(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard"; collectedResources?: Partial<Record<ResourceName, number>>; collectedResourceSources?: ResourceGainSource[]; takenUnrestPlayerIds?: string[]; randomNumber?: () => number }): boolean {
  const removed = removeMarketCard(G, args.cardId);
  if (!removed) return false;
  const acquiredCardId = removed.cardId;

  const collected = collectMarketResources(G, args.playerId, acquiredCardId);
  addCollectedResources(args.collectedResources, collected);
  addCollectedResourceSource(args.collectedResourceSources, acquiredCardId, collected);
  G.players[args.playerId][args.destination ?? "hand"].push(acquiredCardId);
  collectMarketUnrest(G, args.playerId, acquiredCardId, { takenUnrestPlayerIds: args.takenUnrestPlayerIds, randomNumber: args.randomNumber });
  refillMarketSlot(G, { playerId: args.playerId, slotIndex: removed.slotIndex, acquiredCardId });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: args.playerId, message: `AcquiredFromMarket(${acquiredCardId}/destination=${args.destination ?? "hand"})` });
  return true;
}

export function gainMarketCard(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard"; collectedResources?: Partial<Record<ResourceName, number>>; collectedResourceSources?: ResourceGainSource[]; takenUnrestPlayerIds?: string[]; randomNumber?: () => number }): boolean {
  const removed = removeMarketCard(G, args.cardId);
  if (!removed) return false;
  const gainedCardId = removed.cardId;

  const collected = collectMarketResources(G, args.playerId, gainedCardId);
  addCollectedResources(args.collectedResources, collected);
  addCollectedResourceSource(args.collectedResourceSources, gainedCardId, collected);
  G.players[args.playerId][args.destination ?? "hand"].push(gainedCardId);
  collectMarketUnrest(G, args.playerId, gainedCardId, { takenUnrestPlayerIds: args.takenUnrestPlayerIds, randomNumber: args.randomNumber });
  refillMarketSlot(G, { playerId: args.playerId, slotIndex: removed.slotIndex, acquiredCardId: gainedCardId });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: args.playerId, message: `CardGainedFromMarket(${gainedCardId}/destination=${args.destination ?? "hand"})` });
  return true;
}

export function takeMarketCard(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard"; collectedResources?: Partial<Record<ResourceName, number>>; collectedResourceSources?: ResourceGainSource[] }): boolean {
  const removed = removeMarketCard(G, args.cardId);
  if (!removed) return false;
  const takenCardId = removed.cardId;

  const collected = collectMarketResources(G, args.playerId, takenCardId);
  addCollectedResources(args.collectedResources, collected);
  addCollectedResourceSource(args.collectedResourceSources, takenCardId, collected);
  G.players[args.playerId][args.destination ?? "hand"].push(takenCardId);
  returnMarketUnrest(G, args.playerId, takenCardId);
  refillMarketSlot(G, { playerId: args.playerId, slotIndex: removed.slotIndex, acquiredCardId: takenCardId });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: args.playerId, message: `CardTakenFromMarket(${takenCardId}/destination=${args.destination ?? "hand"})` });
  return true;
}
