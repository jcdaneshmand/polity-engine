import type { GameState } from "../../../../engine/src/game/state";

export function getCurrentPlayerId(G: GameState, ctx: any): string {
  return ctx?.currentPlayer ?? Object.keys(G.players ?? {})[0] ?? "0";
}
export function getCurrentPlayer(G: GameState, ctx: any) {
  const id = getCurrentPlayerId(G, ctx);
  return G.players?.[id] ?? null;
}
export function getMarketCards(G: GameState): string[] { return Array.isArray(G.market) ? G.market : []; }
export function getSharedPiles(G: GameState) {
  const fameCount = (G.fameDeck?.available?.length ?? 0) + (G.fameDeck?.specialBottomCardId ? 1 : 0);
  const exileCount = Object.values(G.players ?? {}).reduce((sum, player) => sum + (player.exile?.length ?? 0), 0);
  return [
    { id: "region", label: "Region", count: G.marketDecks?.regionDeck?.length ?? 0 },
    { id: "uncivilized", label: "Uncivilized", count: G.marketDecks?.uncivilizedDeck?.length ?? 0 },
    { id: "civilized", label: "Civilized", count: G.marketDecks?.civilizedDeck?.length ?? 0 },
    { id: "main", label: "Main", count: G.marketDecks?.mainDeck?.length ?? G.marketRefillPool?.length ?? 0 },
    { id: "fame", label: "Fame", count: fameCount },
    { id: "unrest", label: "Unrest", count: G.unrestPile?.length ?? 0 },
    { id: "exile", label: "Exile", count: exileCount }
  ];
}
export function getCardById(G: GameState, cardId?: string) { return cardId ? G.cardDb?.[cardId] : undefined; }
export function getPlayerZoneCounts(player: any) {
  if (!player) return { deck: 0, discard: 0, hand: 0, playArea: 0, history: 0, developmentArea: 0, nationDeck: 0 };
  return {
    deck: player.deck?.length ?? 0, discard: player.discard?.length ?? 0, hand: player.hand?.length ?? 0,
    playArea: player.playArea?.length ?? 0, history: player.history?.length ?? 0,
    developmentArea: player.developmentArea?.length ?? 0, nationDeck: player.nationDeck?.length ?? 0
  };
}
export function getZoneCards(player: any, zoneId: string): string[] {
  const direct = player?.[zoneId];
  if (Array.isArray(direct)) return direct;
  const sideArea = player?.sideAreas?.[zoneId];
  if (Array.isArray(sideArea)) return sideArea;
  return [];
}
export function getInspectableZone(
  owner: any,
  zoneId: string,
  viewer?: { ownerPlayerId?: string; viewerPlayerId?: string }
): { hidden: boolean; cardIds: string[]; count: number } {
  if (zoneId === "botSlots") {
    const slots = Object.values(owner?.slots ?? {}) as any[];
    return {
      hidden: false,
      cardIds: slots.filter((slot) => slot.face === "up" && slot.cardId).map((slot) => slot.cardId),
      count: slots.filter((slot) => !!slot.cardId).length
    };
  }

  const cardIds = getZoneCards(owner, zoneId);
  const hiddenZones = new Set(["deck", "nationDeck", "botDeck", "botDynastyDeck"]);
  if (hiddenZones.has(zoneId)) return { hidden: true, cardIds: [], count: cardIds.length };
  const ownerVisibleZones = new Set(["hand", "history"]);
  if (
    ownerVisibleZones.has(zoneId) &&
    viewer?.ownerPlayerId !== undefined &&
    viewer?.viewerPlayerId !== undefined &&
    viewer.ownerPlayerId !== viewer.viewerPlayerId
  ) {
    return { hidden: true, cardIds: [], count: cardIds.length };
  }
  return { hidden: false, cardIds, count: cardIds.length };
}
export function getInspectableLookedCards(
  G: GameState,
  viewerPlayerId: string
): { hidden: boolean; source: string; cardIds: string[]; count: number } | undefined {
  const looked = G.lookedCards;
  if (!looked) return undefined;
  const cardIds = looked.playerId === viewerPlayerId ? looked.cardIds : [];
  return {
    hidden: looked.playerId !== viewerPlayerId,
    source: looked.source,
    cardIds,
    count: looked.cardIds.length
  };
}
export function getBotPiles(bot: any) {
  const slots = Object.values(bot?.slots ?? {}).filter((slot: any) => !!slot?.cardId).length;
  return [
    { id: "botDeck", label: "Bot Deck", count: bot?.botDeck?.length ?? 0 },
    { id: "botDynastyDeck", label: "Dynasty", count: bot?.botDynastyDeck?.length ?? 0 },
    { id: "botDiscard", label: "Bot Discard", count: bot?.botDiscard?.length ?? 0 },
    { id: "botHistory", label: "Bot History", count: bot?.botHistory?.length ?? 0 },
    { id: "botPlayArea", label: "Bot Play", count: bot?.botPlayArea?.length ?? 0 },
    { id: "botSlots", label: "Bot Slots", count: slots }
  ];
}
export function getRecentLogEntries(G: GameState, limit = 20) { return (G.log ?? []).slice(-limit); }
