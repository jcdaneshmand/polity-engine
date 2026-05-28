import type { GameState } from "../game/state";

export function practiceMarketChurn(G: GameState): void {
  G.log.push({ round: G.round, playerId: "practice", message: "Practice market churn executed." });
}

export function tickPracticeClock(G: GameState): void {
  if (!G.practiceClock) return;
  G.practiceClock.turnsRemaining -= 1;
  practiceMarketChurn(G);
}
