import type { GameState } from "./state";
import { triggerScoring } from "./scoring";

export function triggerScoringIfMainDeckEmpty(G: GameState, playerId: string): void {
  if ((G.marketDecks?.mainDeck.length ?? 0) === 0) {
    triggerScoring(G, "main_deck_empty", playerId);
  }
}
