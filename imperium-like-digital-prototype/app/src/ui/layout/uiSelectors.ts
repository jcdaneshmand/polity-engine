import type { GameState } from "../../../../engine/src/game/state";

export function getCurrentPlayerId(G: GameState, ctx: any): string {
  return ctx?.currentPlayer ?? Object.keys(G.players ?? {})[0] ?? "0";
}
export function getCurrentPlayer(G: GameState, ctx: any) {
  const id = getCurrentPlayerId(G, ctx);
  return G.players?.[id] ?? null;
}
export function getMarketCards(G: GameState): string[] { return Array.isArray(G.market) ? G.market : []; }
export function getSharedPiles(_G: GameState) {
  return [
    { id: "region", label: "Region", count: 0 },
    { id: "uncivilized", label: "Uncivilized", count: 0 },
    { id: "civilized", label: "Civilized", count: 0 },
    { id: "main", label: "Main", count: _G.marketRefillPool?.length ?? 0 },
    { id: "fame", label: "Fame", count: 0 },
    { id: "unrest", label: "Unrest", count: 0 },
    { id: "exile", label: "Exile", count: 0 }
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
export function getInspectableZone(owner: any, zoneId: string): { hidden: boolean; cardIds: string[]; count: number } {
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
  return { hidden: false, cardIds, count: cardIds.length };
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
