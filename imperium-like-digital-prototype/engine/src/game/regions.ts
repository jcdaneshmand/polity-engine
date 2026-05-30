import type { GameState, ResourceName } from "./state";

function removeOne(cards: string[], cardId: string): boolean {
  const index = cards.indexOf(cardId);
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

export function isRegionCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "region" || card?.suit === "region";
}

export function garrisonCardOnRegion(G: GameState, playerId: string, hostCardId: string, cardId: string): boolean {
  const player = G.players[playerId];
  if (!isRegionCard(G, hostCardId) || !player.playArea.includes(hostCardId)) return false;
  if (!removeOne(player.hand, cardId)) return false;

  G.cardStates ??= {};
  G.cardStates[hostCardId] ??= {};
  G.cardStates[hostCardId].garrisonedCardIds ??= [];
  G.cardStates[hostCardId].garrisonedCardIds.push(cardId);
  G.log.push({ round: G.round, playerId, message: `Garrisoned(${cardId}/host=${hostCardId})` });
  return true;
}

export function detachGarrisonedCards(G: GameState, hostCardId: string): string[] {
  const garrisoned = G.cardStates?.[hostCardId]?.garrisonedCardIds ?? [];
  delete G.cardStates?.[hostCardId];
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

export function collectCardResourcesToPlayer(G: GameState, playerId: string, cardId: string): void {
  const player = G.players[playerId];
  const state = G.cardStates?.[cardId];
  for (const [resource, amount] of Object.entries(state?.resources ?? {}) as [ResourceName, number | undefined][]) {
    player.resources[resource] = (player.resources[resource] ?? 0) + (amount ?? 0);
  }
}

export function collectAndClearCardStateToPlayer(G: GameState, playerId: string, cardId: string): void {
  collectCardResourcesToPlayer(G, playerId, cardId);
  delete G.cardStates?.[cardId];
}

export function recallRegionToHand(G: GameState, playerId: string, regionCardId: string): boolean {
  const player = G.players[playerId];
  if (!isRegionCard(G, regionCardId)) return false;
  const wasInPlay = removeOne(player.playArea, regionCardId);
  const garrisonHostCardId = wasInPlay ? undefined : detachGarrisonedCard(G, playerId, regionCardId);
  if (!wasInPlay && !garrisonHostCardId) return false;

  collectCardResourcesToPlayer(G, playerId, regionCardId);
  const garrisoned = detachGarrisonedCards(G, regionCardId);
  garrisoned.forEach((cardId) => collectAndClearCardStateToPlayer(G, playerId, cardId));

  player.hand.push(regionCardId, ...garrisoned);
  G.log.push({ round: G.round, playerId, message: `RegionRecalled(${regionCardId}/garrisoned=${garrisoned.length})` });
  return true;
}

export function abandonRegionToDiscard(G: GameState, playerId: string, regionCardId: string): boolean {
  const player = G.players[playerId];
  if (!isRegionCard(G, regionCardId)) return false;
  const wasInPlay = removeOne(player.playArea, regionCardId);
  const garrisonHostCardId = wasInPlay ? undefined : detachGarrisonedCard(G, playerId, regionCardId);
  if (!wasInPlay && !garrisonHostCardId) return false;

  collectCardResourcesToPlayer(G, playerId, regionCardId);
  const garrisoned = detachGarrisonedCards(G, regionCardId);
  garrisoned.forEach((cardId) => collectAndClearCardStateToPlayer(G, playerId, cardId));
  player.discard.push(regionCardId, ...garrisoned);
  G.log.push({ round: G.round, playerId, message: `RegionAbandoned(${regionCardId}/garrisoned=${garrisoned.length})` });
  return true;
}
