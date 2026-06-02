import type { GameState } from "./state";

function hasReturnableExhaustToken(G: GameState, cardId: string): boolean {
  const state = G.cardStates?.[cardId];
  return (state?.exhaustTokens ?? 0) > 0 || state?.exhausted === true;
}

export function returnableExhaustTokenCardIds(G: GameState, playerId: string): string[] {
  const p = G.players[playerId];
  if (!p) return [];
  return p.playArea.filter((cardId) => hasReturnableExhaustToken(G, cardId));
}

export function returnExhaustToken(G: GameState, playerId: string, cardId: string): boolean {
  if (!returnableExhaustTokenCardIds(G, playerId).includes(cardId)) return false;
  G.cardStates ??= {};
  G.cardStates[cardId] ??= {};
  const state = G.cardStates[cardId];
  const remainingTokens = Math.max(0, (state.exhaustTokens ?? 0) - 1);
  state.exhaustTokens = remainingTokens;
  if (remainingTokens === 0) state.exhausted = false;
  G.players[playerId].exhaustTokensAvailable += 1;
  G.log.push({ round: G.round, playerId, message: `ExhaustTokenReturned(${cardId})` });
  return true;
}
