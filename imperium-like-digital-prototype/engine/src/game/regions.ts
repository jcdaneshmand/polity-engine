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

export function recallRegionToHand(G: GameState, playerId: string, regionCardId: string): boolean {
  const player = G.players[playerId];
  if (!isRegionCard(G, regionCardId) || !removeOne(player.playArea, regionCardId)) return false;

  const state = G.cardStates?.[regionCardId];
  const garrisoned = state?.garrisonedCardIds ?? [];
  for (const [resource, amount] of Object.entries(state?.resources ?? {}) as [ResourceName, number | undefined][]) {
    player.resources[resource] = (player.resources[resource] ?? 0) + (amount ?? 0);
  }

  player.hand.push(regionCardId, ...garrisoned);
  delete G.cardStates?.[regionCardId];
  G.log.push({ round: G.round, playerId, message: `RegionRecalled(${regionCardId}/garrisoned=${garrisoned.length})` });
  return true;
}

export function abandonRegionToDiscard(G: GameState, playerId: string, regionCardId: string): boolean {
  const player = G.players[playerId];
  if (!isRegionCard(G, regionCardId) || !removeOne(player.playArea, regionCardId)) return false;

  const garrisoned = G.cardStates?.[regionCardId]?.garrisonedCardIds ?? [];
  player.discard.push(regionCardId, ...garrisoned);
  delete G.cardStates?.[regionCardId];
  G.log.push({ round: G.round, playerId, message: `RegionAbandoned(${regionCardId}/garrisoned=${garrisoned.length})` });
  return true;
}
