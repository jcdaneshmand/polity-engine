import type { GameState, ResourceName } from "./state";
import { addResourceAmount, normalizeResourceMap } from "./resources";
import { gainMarketResource } from "./resources";
import { triggerCollapse } from "./scoring";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { cardHasSuitIcon } from "./suitIcons";

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

function hasPracticeCleanupProgressToken(G: GameState): boolean {
  return G.options?.mode !== "practice" || (G.practiceClock?.progressTokens ?? 0) > 0;
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
  if (placed <= 0) return false;
  if (args.markCleanup) G.cleanupMarketResourcePlaced = { playerId: args.playerId, round: G.round };
  G.log.push({ round: G.round, playerId: args.playerId, message: `MarketResourceAdded(${args.cardId}/${resource}/${placed === requestedAmount ? requestedAmount : `${placed}/${requestedAmount}`})` });
  return true;
}

export function startCleanupMarketResourceChoice(G: GameState, playerId: string): boolean {
  if (G.market.length <= 1) return false;
  if (G.cleanupMarketResourcePlaced?.playerId === playerId && G.cleanupMarketResourcePlaced.round === G.round) return false;
  if (!hasPracticeCleanupProgressToken(G)) return false;
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
  const legacy = normalizeResourceMap(G.marketResources?.[cardId]);
  const slot = G.marketSlots?.find((candidate) => candidate.cardId === cardId);
  const slotResources = normalizeResourceMap(slot?.resourceMarkers);
  const collected: Partial<Record<ResourceName, number>> = { ...legacy };
  for (const [resource, amount] of Object.entries(slotResources) as [ResourceName, number | undefined][]) {
    collected[resource] = Math.max(collected[resource] ?? 0, amount ?? 0);
  }
  if (Object.keys(collected).length === 0) return {};
  const player = G.players[playerId];
  for (const [resource, amount] of Object.entries(collected) as [ResourceName, number | undefined][]) {
    addResourceAmount(player.resources, resource, amount ?? 0);
  }
  delete G.marketResources?.[cardId];
  if (slot) slot.resourceMarkers = {};
  return collected;
}

function hasMarketUnrestInterruption(G: GameState): boolean {
  return Boolean(
    G.pendingChoice
    ?? G.pendingDrawChoice
    ?? G.pendingFindChoice
    ?? G.pendingAcquireChoice
    ?? G.pendingMarketCardChoice
    ?? G.pendingBreakThroughChoice
    ?? G.pendingExileChoice
    ?? G.pendingGarrisonChoice
    ?? G.pendingRegionChoice
    ?? G.pendingRegionChoiceContinuation
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingDiscardChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingReturnFameChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingReturnExhaustTokenChoice
    ?? G.pendingFreePlayChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingReactiveExhaustChoice
    ?? G.pendingNationHookContinuation
    ?? G.pendingUnrestTakeContinuation
    ?? G.pendingUnrestAllocationResolution
    ?? G.pendingPostDevelopmentResolution
    ?? G.pendingReshuffleResolution
    ?? G.pendingAfterReshuffleEffects
    ?? G.pendingReshuffleDraw
    ?? G.pendingTurnEndCleanup
    ?? G.pendingScoringFinalization
    ?? G.pendingScoringLifecycle
    ?? G.pendingCollapseLifecycle
    ?? G.pendingSolsticeContinuation
    ?? G.pendingSolsticeRoundEnd
    ?? G.pendingPracticeMarketExileBeforeCleanup
    ?? G.pausedSolstice
  );
}

export function collectMarketUnrest(G: GameState, playerId: string, cardId: string, options?: { takenUnrestPlayerIds?: string[]; randomNumber?: () => number }): boolean {
  const slot = G.marketSlots?.find((candidate) => candidate.cardId === cardId);
  const unrestCards = [...new Set([...(G.marketUnrest?.[cardId] ?? []), ...(slot?.attachedUnrestCardIds ?? [])])];
  if (unrestCards.length === 0) return true;
  G.players[playerId].hand.push(...unrestCards);
  delete G.marketUnrest?.[cardId];
  if (slot) slot.attachedUnrestCardIds = [];
  options?.takenUnrestPlayerIds?.push(playerId);
  for (let index = 0; index < unrestCards.length; index += 1) {
    const unrestCardId = unrestCards[index];
    if (!runNationHooks({ G, playerId, trigger: "after_gain_unrest", payload: { cardId: unrestCardId, triggeredBy: playerId }, randomNumber: options?.randomNumber })) return false;
    if (G.gameover) break;
    if (hasMarketUnrestInterruption(G)) {
      if (index + 1 < unrestCards.length) G.pendingMarketUnrestHookContinuation = { playerId, cardIds: unrestCards, nextIndex: index + 1 };
      break;
    }
  }
  G.log.push({ round: G.round, playerId, message: `MarketUnrestTaken(${cardId}/count=${unrestCards.length})` });
  return true;
}

export function continuePendingMarketUnrestHooks(G: GameState, playerId: string, randomNumber?: () => number): boolean {
  const pending = G.pendingMarketUnrestHookContinuation;
  if (!pending || pending.playerId !== playerId || hasMarketUnrestInterruption(G) || G.gameover) return true;
  G.pendingMarketUnrestHookContinuation = undefined;
  for (let index = pending.nextIndex; index < pending.cardIds.length; index += 1) {
    const unrestCardId = pending.cardIds[index];
    if (!runNationHooks({ G, playerId, trigger: "after_gain_unrest", payload: { cardId: unrestCardId, triggeredBy: playerId }, randomNumber })) return false;
    if (G.gameover) return true;
    if (hasMarketUnrestInterruption(G)) {
      if (index + 1 < pending.cardIds.length) G.pendingMarketUnrestHookContinuation = { playerId, cardIds: pending.cardIds, nextIndex: index + 1 };
      return true;
    }
  }
  return true;
}

export function returnMarketUnrest(G: GameState, playerId: string, cardId: string): void {
  const slot = G.marketSlots?.find((candidate) => candidate.cardId === cardId);
  const unrestCards = [...new Set([...(G.marketUnrest?.[cardId] ?? []), ...(slot?.attachedUnrestCardIds ?? [])])];
  if (unrestCards.length === 0) return;
  G.unrestPile ??= [];
  G.unrestPile.push(...unrestCards);
  delete G.marketUnrest?.[cardId];
  if (slot) slot.attachedUnrestCardIds = [];
  G.log.push({ round: G.round, playerId, message: `MarketUnrestReturned(${cardId}/count=${unrestCards.length})` });
}

export function tuckUnrestUnderMarketCard(G: GameState, playerId: string, cardId: string): void {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  if (type === "unrest" || card?.suit === "unrest" || card?.tags?.includes("unrest") || cardHasSuitIcon(card, "unrest")) return;
  if (type === "region" || card?.suit === "region" || card?.setupBannerSuit === "region" || cardHasSuitIcon(card, "region")) return;
  const unrestCardId = G.unrestPile?.shift();
  if (!unrestCardId) {
    triggerCollapse(G, "unrest_pile_empty", playerId);
    return;
  }
  G.marketUnrest ??= {};
  G.marketUnrest[cardId] ??= [];
  G.marketUnrest[cardId].push(unrestCardId);
  const slot = G.marketSlots?.find((candidate) => candidate.cardId === cardId);
  if (slot) slot.attachedUnrestCardIds.push(unrestCardId);
  G.log.push({ round: G.round, playerId, message: `MarketUnrestTucked(${cardId}/${unrestCardId})` });
}
