import type { RulesModule } from "./rulesModuleTypes";

export const tradeRoutesModule: RulesModule = {
  id: "trade_routes",
  kind: "expansion",
  modifyPlayerSetup: ({ options, players }) => {
    if (!options.enabledExpansions.includes("trade_routes")) return;
    Object.values(players).forEach((p) => {
      p.powerArea.push("placeholder_merchants_module_card");
      p.exhaustTokensBase += 1;
      p.exhaustTokensAvailable += 1;
      p.resources.goods = p.resources.goods ?? 0;
    });
  }
};
