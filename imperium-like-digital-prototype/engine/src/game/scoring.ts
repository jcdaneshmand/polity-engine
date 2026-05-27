import type { GameState } from "./state";

export function scorePlayer(G: GameState, playerId: string): number {
  const p = G.players[playerId];
  return p.history.length + p.resources.influence - p.resources.unrest;
}
