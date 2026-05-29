import type { GameState } from "./state";
import { triggerScoring } from "./scoring";

function ensureFameDeck(G: GameState): NonNullable<GameState["fameDeck"]> {
  G.fameDeck ??= { available: [], resolvedSpecialByPlayer: {} };
  G.fameDeck.resolvedSpecialByPlayer ??= {};
  return G.fameDeck;
}

export function peekFameCards(G: GameState, count: number): string[] {
  const fameDeck = ensureFameDeck(G);
  const visible = fameDeck.available.slice(0, count);
  if (visible.length === 0 && count > 0 && fameDeck.specialBottomCardId) {
    return [fameDeck.specialBottomCardId];
  }
  return visible;
}

export function takeFameCard(G: GameState, playerId: string): string | undefined {
  const fameDeck = ensureFameDeck(G);
  const cardId = fameDeck.available.shift();
  if (cardId) {
    G.players[playerId]?.discard.push(cardId);
    return cardId;
  }

  const specialBottomCardId = fameDeck.specialBottomCardId;
  if (!specialBottomCardId) return undefined;

  delete fameDeck.specialBottomCardId;
  fameDeck.resolvedSpecialByPlayer[playerId] = true;
  G.players[playerId]?.discard.push(specialBottomCardId);
  triggerScoring(G, "fame_deck_terminal_condition", playerId);
  return specialBottomCardId;
}

export function returnFameCardToTop(G: GameState, cardId: string): void {
  const fameDeck = ensureFameDeck(G);
  fameDeck.available.unshift(cardId);
}
