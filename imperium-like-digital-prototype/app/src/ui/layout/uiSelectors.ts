import type { GameState } from "../../../engine/src/game/state";

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
    { id: "region", label: "Region Deck", count: 0 },
    { id: "uncivilized", label: "Uncivilized Deck", count: 0 },
    { id: "civilized", label: "Civilized Deck", count: 0 },
    { id: "main", label: "Main Deck", count: 0 },
    { id: "fame", label: "Fame Deck", count: 0 },
    { id: "unrest", label: "Unrest Pile", count: 0 },
    { id: "exile", label: "Exile Pile", count: 0 }
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
export function getRecentLogEntries(G: GameState, limit = 20) { return (G.log ?? []).slice(-limit); }
