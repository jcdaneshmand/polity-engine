import type { GameState, ResourceName } from "./state";
import { triggerCollapse } from "./scoring";

export const DEFAULT_CLEANUP_MARKET_RESOURCE: ResourceName = "knowledge";

export function placeMarketResource(G: GameState, args: { playerId: string; cardId: string; resource?: ResourceName; amount?: number; markCleanup?: boolean }): boolean {
  if (!G.market.includes(args.cardId)) return false;
  const resource = args.resource ?? DEFAULT_CLEANUP_MARKET_RESOURCE;
  const amount = args.amount ?? 1;
  G.marketResources ??= {};
  G.marketResources[args.cardId] ??= {};
  G.marketResources[args.cardId][resource] = (G.marketResources[args.cardId][resource] ?? 0) + amount;
  if (args.markCleanup) G.cleanupMarketResourcePlaced = { playerId: args.playerId, round: G.round };
  G.log.push({ round: G.round, playerId: args.playerId, message: `MarketResourceAdded(${args.cardId}/${resource}/${amount})` });
  return true;
}

export function startCleanupMarketResourceChoice(G: GameState, playerId: string): boolean {
  if (G.market.length === 0) return false;
  if (G.cleanupMarketResourcePlaced?.playerId === playerId && G.cleanupMarketResourcePlaced.round === G.round) return false;
  G.pendingCleanupMarketResourceChoice = {
    playerId,
    resource: DEFAULT_CLEANUP_MARKET_RESOURCE,
    amount: 1,
    cardIds: [...G.market]
  };
  G.log.push({ round: G.round, playerId, message: `CleanupMarketResourceChoicePending(options=${G.market.length})` });
  return true;
}

export function resolveCleanupMarketResourceChoice(G: GameState, playerId: string, cardId: string): boolean {
  const pending = G.pendingCleanupMarketResourceChoice;
  if (!pending || pending.playerId !== playerId || !pending.cardIds.includes(cardId)) return false;
  const placed = placeMarketResource(G, {
    playerId,
    cardId,
    resource: pending.resource,
    amount: pending.amount,
    markCleanup: true
  });
  if (!placed) return false;
  G.pendingCleanupMarketResourceChoice = undefined;
  return true;
}

export function ensureCleanupMarketResourcePlaced(G: GameState, playerId: string): void {
  if (G.cleanupMarketResourcePlaced?.playerId === playerId && G.cleanupMarketResourcePlaced.round === G.round) return;
  const firstMarketCard = G.market[0];
  if (!firstMarketCard) return;
  placeMarketResource(G, { playerId, cardId: firstMarketCard, markCleanup: true });
}

export function collectMarketResources(G: GameState, playerId: string, cardId: string): void {
  const resources = G.marketResources?.[cardId];
  if (!resources) return;
  const player = G.players[playerId];
  for (const [resource, amount] of Object.entries(resources) as [ResourceName, number | undefined][]) {
    player.resources[resource] = (player.resources[resource] ?? 0) + (amount ?? 0);
  }
  delete G.marketResources?.[cardId];
}

export function collectMarketUnrest(G: GameState, playerId: string, cardId: string): void {
  const unrestCards = G.marketUnrest?.[cardId] ?? [];
  if (unrestCards.length === 0) return;
  G.players[playerId].hand.push(...unrestCards);
  delete G.marketUnrest?.[cardId];
  G.log.push({ round: G.round, playerId, message: `MarketUnrestTaken(${cardId}/count=${unrestCards.length})` });
}

export function returnMarketUnrest(G: GameState, playerId: string, cardId: string): void {
  const unrestCards = G.marketUnrest?.[cardId] ?? [];
  if (unrestCards.length === 0) return;
  G.unrestPile ??= [];
  G.unrestPile.push(...unrestCards);
  delete G.marketUnrest?.[cardId];
  G.log.push({ round: G.round, playerId, message: `MarketUnrestReturned(${cardId}/count=${unrestCards.length})` });
}

export function tuckUnrestUnderMarketCard(G: GameState, playerId: string, cardId: string): void {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  if (type === "unrest" || card?.suit === "unrest" || card?.tags?.includes("unrest")) return;
  const unrestCardId = G.unrestPile?.shift();
  if (!unrestCardId) {
    triggerCollapse(G, "unrest_pile_empty", playerId);
    return;
  }
  G.marketUnrest ??= {};
  G.marketUnrest[cardId] ??= [];
  G.marketUnrest[cardId].push(unrestCardId);
  G.log.push({ round: G.round, playerId, message: `MarketUnrestTucked(${cardId}/${unrestCardId})` });
}
