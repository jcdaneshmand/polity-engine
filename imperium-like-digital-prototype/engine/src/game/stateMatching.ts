import type { GameState } from "./state";

export function normalizeStateToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[_\s-]+/g, "");
  if (normalized === "empire" || normalized === "civilised") return "civilized";
  if (normalized === "barbarian" || normalized === "uncivilised") return "uncivilized";
  return normalized;
}

function stateRequirementTokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s*(?:\||,|;|\/|\bor\b)\s*/i)
    .map(normalizeStateToken)
    .filter(Boolean) as string[];
}

function stateCardTokens(G: GameState, cardId: string): string[] {
  const stateCard = G.cardDb[cardId];
  return [
    cardId,
    stateCard?.displayName,
    stateCard?.suit,
    ...(stateCard?.tags ?? [])
  ].map(normalizeStateToken).filter(Boolean) as string[];
}

function tradeRoutesExhaustTokenBonus(G: GameState): number {
  return G.options?.enabledExpansions?.includes("trade_routes") ? 1 : 0;
}

export function stateCardSupports(G: GameState, cardId: string, state: string | undefined): boolean {
  const expected = normalizeStateToken(state);
  return !!expected && stateCardTokens(G, cardId).includes(expected);
}

export function stateCardMatches(G: GameState, cardId: string, state: string | undefined): boolean {
  const expected = normalizeStateToken(state);
  if (!expected) return false;
  const activeState = normalizeStateToken(G.cardStates?.[cardId]?.activeState);
  if (activeState) return activeState === expected;
  return stateCardSupports(G, cardId, expected);
}

export function currentStateMatches(G: GameState, playerId: string, state: string | undefined): boolean {
  const expected = normalizeStateToken(state);
  if (!expected) return false;
  const stateCardId = G.players[playerId]?.stateArea[0];
  return stateCardId ? stateCardMatches(G, stateCardId, state) : false;
}

export function currentStateMatchesAny(G: GameState, playerId: string, requirement: string | undefined): boolean {
  const expectedStates = stateRequirementTokens(requirement);
  if (expectedStates.length === 0) return false;
  return expectedStates.some((state) => currentStateMatches(G, playerId, state));
}

export function syncPlayerStateCardStats(G: GameState, playerId: string): void {
  const player = G.players[playerId];
  if (!player) return;
  const stateCard = G.cardDb[player.stateArea[0]];
  if (!stateCard) return;
  const previousActionBase = player.actionTokensBase;
  const previousExhaustBase = player.exhaustTokensBase;
  if (typeof stateCard.stateActionTokens === "number") {
    player.actionTokensBase = stateCard.stateActionTokens;
    player.actionsRemaining = player.actionsRemaining === previousActionBase ? stateCard.stateActionTokens : Math.min(player.actionsRemaining, stateCard.stateActionTokens);
    player.actionTokensAvailable = player.actionTokensAvailable === previousActionBase ? stateCard.stateActionTokens : Math.min(player.actionTokensAvailable, stateCard.stateActionTokens);
  }
  if (typeof stateCard.stateExhaustTokens === "number") {
    const exhaustTokensBase = stateCard.stateExhaustTokens + tradeRoutesExhaustTokenBonus(G);
    player.exhaustTokensBase = exhaustTokensBase;
    player.exhaustTokensAvailable = player.exhaustTokensAvailable === previousExhaustBase ? exhaustTokensBase : Math.min(player.exhaustTokensAvailable, exhaustTokensBase);
  }
  if (typeof stateCard.stateHandSize === "number") {
    player.handSize = stateCard.stateHandSize;
  }
}

export function activateState(G: GameState, playerId: string, state: string | undefined): void {
  if (!state) return;
  const player = G.players[playerId];
  if (!player) return;
  const stateIndex = player.stateArea.findIndex((cardId) => stateCardMatches(G, cardId, state) || stateCardSupports(G, cardId, state));
  if (stateIndex >= 0) {
    const [stateCardId] = player.stateArea.splice(stateIndex, 1);
    if (stateCardId) {
      player.stateArea.unshift(stateCardId);
      G.cardStates ??= {};
      G.cardStates[stateCardId] ??= {};
      G.cardStates[stateCardId].activeState = normalizeStateToken(state);
    }
    syncPlayerStateCardStats(G, playerId);
    return;
  }
  if (player.stateArea.length === 1) {
    const stateCardId = player.stateArea[0];
    G.cardStates ??= {};
    G.cardStates[stateCardId] ??= {};
    G.cardStates[stateCardId].activeState = normalizeStateToken(state);
    syncPlayerStateCardStats(G, playerId);
    return;
  }
  if (!player.stateArea.includes(state)) player.stateArea.unshift(state);
  syncPlayerStateCardStats(G, playerId);
}
