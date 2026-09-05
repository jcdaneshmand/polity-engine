import type { GameState } from "./state";

export function hasPendingResolution(G: GameState): boolean {
  return Object.entries(G).some(([key, value]) => key.startsWith("pending") && value != null);
}

// Compare private zones inside the engine only; never store this snapshot in G or logs.
export function hiddenZoneSnapshot(G: GameState): string {
  return JSON.stringify({
    players: Object.values(G.players).map((p) => [p.deck, p.nationDeck]),
    marketDecks: G.marketDecks, refill: G.marketRefillPool,
    bottom: G.marketDeckBottomCards, fame: G.fameDeck, solo: G.solo,
    lookedCards: G.lookedCards, round: G.round, gameover: G.gameover
  });
}

export function canUndoLastMove(G: GameState): boolean {
  return G.options?.mode !== "multiplayer" && G.lastMoveUndoable === true && !hasPendingResolution(G) && !G.gameover;
}
