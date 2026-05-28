import type { GameOptions } from "./gameOptions";
import type { RulesModule } from "./rulesModuleTypes";
import { tradeRoutesModule } from "./expansionModules";
import { loweredAggressionModule, preciousCardsModule, quickSetupModule, shortGameModule } from "./variantModules";
import { multiplayerModeModule, practiceModeModule, soloModeModule } from "./modeModules";

export function getEnabledRulesModules(options: GameOptions): RulesModule[] {
  const out: RulesModule[] = [];
  if (options.mode === "multiplayer") out.push(multiplayerModeModule);
  if (options.mode === "solo") out.push(soloModeModule);
  if (options.mode === "practice") out.push(practiceModeModule);
  if (options.enabledExpansions.includes("trade_routes")) out.push(tradeRoutesModule);
  if (options.enabledVariants.includes("lowered_aggression")) out.push(loweredAggressionModule);
  if (options.enabledVariants.includes("quick_setup")) out.push(quickSetupModule);
  if (options.enabledVariants.includes("precious_cards")) out.push(preciousCardsModule);
  if (options.enabledVariants.includes("short_game")) out.push(shortGameModule);
  return out;
}
