import type { GameState } from "../game/state";
import { triggerScoring } from "../game/scoring";
import { marketCardHasTokens } from "../game/exile";

export function startPracticeMarketExileChoice(G: GameState, playerId: string): boolean {
  if (G.options?.mode !== "practice" || G.pendingExileChoice) return false;
  if (G.practiceMarketExileResolved?.playerId === playerId && G.practiceMarketExileResolved.round === G.round) return false;
  const cardIds = G.market.filter((cardId) => !marketCardHasTokens(G, cardId));
  if (cardIds.length === 0) return false;
  G.pendingExileChoice = {
    playerId,
    sourceCardId: "practice_market_churn",
    source: "market",
    cardIds,
    optional: true
  };
  G.log.push({ round: G.round, playerId, message: `PracticeMarketExileChoicePending(options=${cardIds.length})` });
  return true;
}

export function practiceMarketChurn(G: GameState): void {
  const firstMarketCard = G.market[0];
  if (!G.practiceClock || !firstMarketCard || G.practiceClock.progressTokens <= 0) {
    G.log.push({ round: G.round, playerId: "practice", message: "PracticeMarketChurnSkipped(no_token_or_market)" });
    return;
  }
  G.practiceClock.progressTokens -= 1;
  G.marketResources ??= {};
  G.marketResources[firstMarketCard] ??= {};
  G.marketResources[firstMarketCard].knowledge = (G.marketResources[firstMarketCard].knowledge ?? 0) + 1;
  const slot = G.marketSlots?.find((candidate) => candidate.cardId === firstMarketCard);
  if (slot) slot.resourceMarkers.knowledge = (slot.resourceMarkers.knowledge ?? 0) + 1;
  G.log.push({ round: G.round, playerId: "practice", message: `PracticeMarketChurn(${firstMarketCard}/knowledge/1)` });
}

export function tickPracticeClock(G: GameState): void {
  if (!G.practiceClock) return;
  G.practiceClock.turnsRemaining -= 1;
  if (G.practiceClock.turnsRemaining <= 0 && !G.scoring && !G.gameover) {
    triggerScoring(G, "practice_turn_limit", "practice");
  }
}
