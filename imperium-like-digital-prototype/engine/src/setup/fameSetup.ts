export function setupFameDeck(enabledTradeRoutes: boolean): string[] {
  return enabledTradeRoutes ? ["placeholder_fame_tr_1","placeholder_fame_tr_bottom"] : ["placeholder_fame_1","placeholder_fame_bottom"];
}
