import type { GameState, ResourceName } from "./state";
import { addResourceAmount, normalizeResourceMap } from "./resources";
import { gainMarketResource } from "./resources";
import { triggerCollapse } from "./scoring";

export const DEFAULT_CLEANUP_MARKET_RESOURCE: ResourceName = "knowledge";

function normalizeCleanupResource(resource: string): ResourceName {
  if (resource === "population") return "influence";
  if (resource === "progress") return "knowledge";
  return resource as ResourceName;
}

function cleanupMarketResourceSpec(G: GameState, playerId: string): { resource: ResourceName; amount: number } {
  if (G.options?.mode === "practice") return { resource: DEFAULT_CLEANUP_MARKET_RESOURCE, amount: 1 };
  const override = G.activeNationRulesets?.[playerId]?.cleanupOverrides?.find((candidate) => candidate.op === "market_resource_added");
  if (override?.op === "market_resource_added") {
    return { resource: normalizeCleanupResource(override.resource), amount: override.count };
  }
  return { resource: DEFAULT_CLEANUP_MARKET_RESOURCE, amount: 1 };
}

function practiceCleanupAmount(G: GameState, args: { playerId: string; cardId: string; resource: ResourceName; amount: number; markCleanup?: boolean }): number | undefined {
  if (G.options?.mode !== "practice" || !args.markCleanup) return undefined;
  if (args.resource !== DEFAULT_CLEANUP_MARKET_RESOURCE) return args.amount;
  if (!G.practiceClock || G.practiceClock.progressTokens <= 0) {
    G.log.push({ round: G.round, playerId: args.playerId, message: "PracticeMarketChurnSkipped(no_token)" });
    return 0;
  }
  const amount = Math.min(args.amount, G.practiceClock.progressTokens);
  G.practiceClock.progressTokens -= amount;
  G.log.push({ round: G.round, playerId: args.playerId, message: `PracticeMarketChurn(${args.cardId}/${args.resource}/${amount})` });
  return amount;
}

export function placeMarketResource(G: GameState, args: { playerId: string; cardId: string; resource?: ResourceName; amount?: number; markCleanup?: boolean }): boolean {
  if (!G.market.includes(args.cardId)) return false;
  const resource = args.resource ?? DEFAULT_CLEANUP_MARKET_RESOURCE;
  const requestedAmount = args.amount ?? 1;
  const amount = practiceCleanupAmount(G, { playerId: args.playerId, cardId: args.cardId, resource, amount: requestedAmount, markCleanup: args.markCleanup }) ?? requestedAmount;
  if (amount <= 0) return false;
  const placed = gainMarketResource(G, args.cardId, resource, amount);
  if (args.markCleanup) G.cleanupMarketResourcePlaced = { playerId: args.playerId, round: G.round };
  G.log.push({ round: G.round, playerId: args.playerId, message: `MarketResourceAdded(${args.cardId}/${resource}/${placed === requestedAmount ? requestedAmount : `${placed}/${requestedAmount}`})` });
  return true;
}

export function startCleanupMarketResourceChoice(G: GameState, playerId: string): boolean {
  if (G.market.length <= 1) return false;
  if (G.cleanupMarketResourcePlaced?.playerId === playerId && G.cleanupMarketResourcePlaced.round === G.round) return false;
  const spec = cleanupMarketResourceSpec(G, playerId);
  G.pendingCleanupMarketResourceChoice = {
    playerId,
    resource: spec.resource,
    amount: spec.amount,
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
  const spec = cleanupMarketResourceSpec(G, playerId);
  placeMarketResource(G, { playerId, cardId: firstMarketCard, resource: spec.resource, amount: spec.amount, markCleanup: true });
}

export function collectMarketResources(G: GameState, playerId: string, cardId: string): Partial<Record<ResourceName, number>> {
  const resources = G.marketResources?.[cardId];
  if (!resources) return {};
  const collected = normalizeResourceMap(resources);
  const player = G.players[playerId];
  for (const [resource, amount] of Object.entries(resources) as [ResourceName, number | undefined][]) {
    addResourceAmount(player.resources, resource, amount ?? 0);
  }
  delete G.marketResources?.[cardId];
  return collected;
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
  if (type === "region" || card?.suit === "region") return;
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
