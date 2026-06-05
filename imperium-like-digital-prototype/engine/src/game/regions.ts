import type { GameState, ResourceGainSource, ResourceName } from "./state";
import { addResourceAmount, normalizeResourceMap } from "./resources";
import { cardHasSuitIcon } from "./suitIcons";

function removeOne(cards: string[], cardId: string): boolean {
  const index = cards.indexOf(cardId);
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

function deleteEmptyCardState(G: GameState, cardId: string): void {
  const state = G.cardStates?.[cardId];
  if (!state) return;
  if (
    state.activeState === undefined
    && state.exhausted === undefined
    && state.actionTokens === undefined
    && state.exhaustTokens === undefined
    && Object.keys(state.resources ?? {}).length === 0
    && (state.garrisonedCardIds?.length ?? 0) === 0
  ) {
    delete G.cardStates?.[cardId];
  }
}

export function isRegionCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "region" || card?.suit === "region" || cardHasSuitIcon(card, "region");
}

function normalizedTag(tag: string): string {
  return tag.toLowerCase().replace(/[_\s-]+/g, "_");
}

export function canBeGarrisoned(G: GameState, cardId: string): boolean {
  const tags = G.cardDb[cardId]?.tags ?? [];
  return !tags.some((tag) => {
    const normalized = normalizedTag(tag);
    return normalized === "cannot_be_garrisoned" || normalized === "not_garrisonable";
  });
}

export function garrisonCardOnRegion(G: GameState, playerId: string, hostCardId: string, cardId: string): boolean {
  const player = G.players[playerId];
  if (!isRegionCard(G, hostCardId) || !player.playArea.includes(hostCardId)) return false;
  if (!canBeGarrisoned(G, cardId)) return false;
  if (!removeOne(player.hand, cardId)) return false;

  G.cardStates ??= {};
  G.cardStates[hostCardId] ??= {};
  G.cardStates[hostCardId].garrisonedCardIds ??= [];
  G.cardStates[hostCardId].garrisonedCardIds.push(cardId);
  G.log.push({ round: G.round, playerId, message: `Garrisoned(${cardId}/host=${hostCardId})` });
  return true;
}

export function detachGarrisonedCards(G: GameState, hostCardId: string): string[] {
  const garrisoned = [...(G.cardStates?.[hostCardId]?.garrisonedCardIds ?? [])];
  if (G.cardStates?.[hostCardId]) {
    delete G.cardStates[hostCardId].garrisonedCardIds;
    deleteEmptyCardState(G, hostCardId);
  }
  return garrisoned;
}

export function garrisonedCardsInPlay(G: GameState, playerId: string): string[] {
  const player = G.players[playerId];
  return player.playArea.flatMap((hostCardId) => G.cardStates?.[hostCardId]?.garrisonedCardIds ?? []);
}

export function detachGarrisonedCard(G: GameState, playerId: string, cardId: string): string | undefined {
  const player = G.players[playerId];
  for (const hostCardId of player.playArea) {
    const garrisoned = G.cardStates?.[hostCardId]?.garrisonedCardIds;
    const index = garrisoned?.indexOf(cardId) ?? -1;
    if (!garrisoned || index < 0) continue;
    garrisoned.splice(index, 1);
    return hostCardId;
  }
  return undefined;
}

export function collectCardResourcesToPlayer(G: GameState, playerId: string, cardId: string): Partial<Record<ResourceName, number>> {
  const player = G.players[playerId];
  const state = G.cardStates?.[cardId];
  const collected = normalizeResourceMap(state?.resources);
  for (const [resource, amount] of Object.entries(state?.resources ?? {}) as [ResourceName, number | undefined][]) {
    addResourceAmount(player.resources, resource, amount ?? 0);
  }
  if (state) {
    delete state.resources;
    deleteEmptyCardState(G, cardId);
  }
  return collected;
}

export function collectAndClearCardStateToPlayer(G: GameState, playerId: string, cardId: string): Partial<Record<ResourceName, number>> {
  const collected = collectCardResourcesToPlayer(G, playerId, cardId);
  delete G.cardStates?.[cardId];
  return collected;
}

function addCollectedResources(target: Partial<Record<ResourceName, number>> | undefined, collected: Partial<Record<ResourceName, number>>): void {
  if (!target) return;
  for (const [resource, amount] of Object.entries(collected) as Array<[ResourceName, number | undefined]>) {
    if ((amount ?? 0) <= 0) continue;
    target[resource] = (target[resource] ?? 0) + (amount ?? 0);
  }
}

function recordCollectedResources(
  collectedResources: Partial<Record<ResourceName, number>> | undefined,
  collectedResourceSources: ResourceGainSource[] | undefined,
  sourceCardId: string,
  collected: Partial<Record<ResourceName, number>>
): void {
  addCollectedResources(collectedResources, collected);
  if (collectedResourceSources && Object.values(collected).some((amount) => (amount ?? 0) > 0)) {
    collectedResourceSources.push({ sourceCardId, sourceWasInPlay: true, gains: collected });
  }
}

export function recallRegionToHand(
  G: GameState,
  playerId: string,
  regionCardId: string,
  collectedResources?: Partial<Record<ResourceName, number>>,
  collectedResourceSources?: ResourceGainSource[]
): boolean {
  const player = G.players[playerId];
  if (!isRegionCard(G, regionCardId)) return false;
  const wasInPlay = removeOne(player.playArea, regionCardId);
  const garrisonHostCardId = wasInPlay ? undefined : detachGarrisonedCard(G, playerId, regionCardId);
  if (!wasInPlay && !garrisonHostCardId) return false;

  recordCollectedResources(collectedResources, collectedResourceSources, regionCardId, collectCardResourcesToPlayer(G, playerId, regionCardId));
  const garrisoned = detachGarrisonedCards(G, regionCardId);
  garrisoned.forEach((cardId) => recordCollectedResources(collectedResources, collectedResourceSources, cardId, collectAndClearCardStateToPlayer(G, playerId, cardId)));

  player.hand.push(regionCardId, ...garrisoned);
  G.log.push({ round: G.round, playerId, message: `RegionRecalled(${regionCardId}/garrisoned=${garrisoned.length})` });
  return true;
}

export function abandonRegionToDiscard(
  G: GameState,
  playerId: string,
  regionCardId: string,
  collectedResources?: Partial<Record<ResourceName, number>>,
  collectedResourceSources?: ResourceGainSource[]
): boolean {
  const player = G.players[playerId];
  if (!isRegionCard(G, regionCardId)) return false;
  const wasInPlay = removeOne(player.playArea, regionCardId);
  const garrisonHostCardId = wasInPlay ? undefined : detachGarrisonedCard(G, playerId, regionCardId);
  if (!wasInPlay && !garrisonHostCardId) return false;

  recordCollectedResources(collectedResources, collectedResourceSources, regionCardId, collectCardResourcesToPlayer(G, playerId, regionCardId));
  const garrisoned = detachGarrisonedCards(G, regionCardId);
  garrisoned.forEach((cardId) => recordCollectedResources(collectedResources, collectedResourceSources, cardId, collectAndClearCardStateToPlayer(G, playerId, cardId)));
  player.discard.push(regionCardId, ...garrisoned);
  G.log.push({ round: G.round, playerId, message: `RegionAbandoned(${regionCardId}/garrisoned=${garrisoned.length})` });
  return true;
}
