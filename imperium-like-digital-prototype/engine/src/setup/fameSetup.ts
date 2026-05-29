import type { FameDeckState } from "../game/state";

export function setupFameDeck(enabledTradeRoutes: boolean): FameDeckState {
  const cards = enabledTradeRoutes ? ["placeholder_fame_tr_1","placeholder_fame_tr_bottom"] : ["placeholder_fame_1","placeholder_fame_bottom"];
  return {
    available: cards.slice(0, -1),
    specialBottomCardId: cards.at(-1),
    resolvedSpecialByPlayer: {}
  };
}
