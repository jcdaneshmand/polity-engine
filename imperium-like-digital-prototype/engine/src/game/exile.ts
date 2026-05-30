import type { GameState, PlayerExileSource } from "./state";
import { returnMarketUnrest } from "./marketResources";
import { refillMarketSlot } from "./marketRefill";
import { collectAndClearCardStateToPlayer, collectCardResourcesToPlayer, detachGarrisonedCard, detachGarrisonedCards, garrisonedCardsInPlay } from "./regions";
import { triggerCollapse } from "./scoring";
import { actualHistorySourceZoneIds } from "./history";

function removeOne(cards: string[], cardId: string): boolean {
  const index = cards.indexOf(cardId);
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

function isUnrestCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "unrest" || card?.cardType === "unrest" || card?.type === "unrest";
}

export function acquireFromExile(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard" }): boolean {
  const player = G.players[args.playerId];
  if (!player || !player.exile.includes(args.cardId)) return false;
  const requiresUnrest = !isUnrestCard(G, args.cardId);
  if (requiresUnrest && (G.unrestPile?.length ?? 0) === 0) {
    triggerCollapse(G, "unrest_pile_empty", args.playerId);
    return false;
  }

  if (!removeOne(player.exile, args.cardId)) return false;

  const destination = args.destination ?? "hand";
  player[destination].push(args.cardId);

  if (requiresUnrest) {
    const unrestCardId = G.unrestPile?.shift();
    if (unrestCardId) player.discard.push(unrestCardId);
  }

  G.log.push({ round: G.round, playerId: args.playerId, message: `AcquiredFromExile(${args.cardId}/destination=${destination})` });
  return true;
}

function marketCardHasTokens(G: GameState, cardId: string): boolean {
  const resources = G.marketResources?.[cardId] ?? {};
  return Object.values(resources).some((amount) => (amount ?? 0) > 0);
}

export function exileMarketCard(G: GameState, args: { playerId: string; cardId: string }): boolean {
  const slotIndex = G.market.indexOf(args.cardId);
  if (slotIndex < 0) return false;
  if (marketCardHasTokens(G, args.cardId)) {
    G.log.push({ round: G.round, playerId: args.playerId, message: `ExileSkipped(market_card_has_tokens/${args.cardId})` });
    return false;
  }

  const [exiledCardId] = G.market.splice(slotIndex, 1);
  if (!exiledCardId) return false;
  returnMarketUnrest(G, args.playerId, exiledCardId);
  delete G.marketResources?.[exiledCardId];
  G.players[args.playerId].exile.push(exiledCardId);
  refillMarketSlot(G, { playerId: args.playerId, slotIndex, acquiredCardId: exiledCardId, preferSuitDeck: true });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: args.playerId, message: `ExiledFromMarket(${exiledCardId})` });
  return true;
}

function sourceLabel(source: string): string {
  if (source === "garrison") return "Garrison";
  if (source === "playArea") return "PlayArea";
  return source.split(/[_\s-]+/g).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join("");
}

function zoneCards(G: GameState, playerId: string, zoneId: string): string[] | undefined {
  const player = G.players[playerId];
  if (!player) return undefined;
  const direct = (player as unknown as Record<string, unknown>)[zoneId];
  if (Array.isArray(direct)) return direct as string[];
  if (player.sideAreas?.[zoneId]) return player.sideAreas[zoneId];
  if (G.specialZones?.[playerId]?.[zoneId]?.cardIds) return G.specialZones[playerId][zoneId].cardIds;
  if (G.globalSpecialZones?.[zoneId]?.cardIds) return G.globalSpecialZones[zoneId].cardIds;
  return undefined;
}

function resolvedPlayerExileSources(G: GameState, playerId: string, source: PlayerExileSource): string[] {
  if (source === "garrison") return ["garrison"];
  if (source === "history") return actualHistorySourceZoneIds(G, playerId);
  return [source];
}

export function playerExileSourceCards(G: GameState, playerId: string, source: PlayerExileSource): string[] {
  if (source === "garrison") return garrisonedCardsInPlay(G, playerId);
  return resolvedPlayerExileSources(G, playerId, source).flatMap((zoneId) => zoneCards(G, playerId, zoneId) ?? []);
}

export function exilePlayerCard(G: GameState, args: { playerId: string; source: PlayerExileSource; cardId: string }): boolean {
  const player = G.players[args.playerId];
  if (!player) return false;
  if (args.source === "garrison") {
    const hostCardId = detachGarrisonedCard(G, args.playerId, args.cardId);
    if (!hostCardId) return false;
    collectAndClearCardStateToPlayer(G, args.playerId, args.cardId);
    player.exile.push(args.cardId);
    G.log.push({ round: G.round, playerId: args.playerId, message: `ExiledFromGarrison(${args.cardId}/host=${hostCardId})` });
    return true;
  }
  const resolvedSource = resolvedPlayerExileSources(G, args.playerId, args.source).find((zoneId) => removeOne(zoneCards(G, args.playerId, zoneId) ?? [], args.cardId));
  if (!resolvedSource) return false;
  if (resolvedSource === "playArea") {
    collectCardResourcesToPlayer(G, args.playerId, args.cardId);
    const garrisoned = detachGarrisonedCards(G, args.cardId);
    garrisoned.forEach((cardId) => collectAndClearCardStateToPlayer(G, args.playerId, cardId));
    player.exile.push(args.cardId, ...garrisoned);
    G.log.push({ round: G.round, playerId: args.playerId, message: `ExiledFromPlayArea(${args.cardId}/garrisoned=${garrisoned.length})` });
    return true;
  }
  player.exile.push(args.cardId);
  G.log.push({ round: G.round, playerId: args.playerId, message: `ExiledFrom${sourceLabel(resolvedSource)}(${args.cardId})` });
  return true;
}
