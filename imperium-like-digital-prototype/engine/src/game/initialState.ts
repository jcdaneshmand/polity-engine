import { loadCardDbWithOptionalPrivateData } from "../cards/privateCardLoader";
import { loadNationDb } from "../nations/nationLoader";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { defaultGameOptions, type GameOptions } from "../options/gameOptions";
import type { GameState } from "./state";

export function createInitialGameState(args?: { options?: GameOptions; playerNationIds?: Record<string,string>; usePrivateData?: boolean; privateRulesetPath?: string; privateStrategyPath?: string }): GameState {
  const options = args?.options ?? defaultGameOptions;
  const cards = loadCardDbWithOptionalPrivateData({ enabledExpansions: options.enabledExpansions, usePrivate: args?.usePrivateData ?? false });
  const nationDb = loadNationDb({ enabledExpansions: options.enabledExpansions, usePrivate: args?.usePrivateData ?? false });
  const normCards = Object.fromEntries(Object.values(cards).map((c)=>[c.id,{id:c.id,displayName:c.displayName,suit:"none",cardType:"action",cost:{materials:c.cost ?? 0,population:0,progress:0,goods:0},developmentCost:{materials:0,population:0,progress:0,goods:0},vp:{mode:"none",value:null},startingLocation:(c.startingLocation as any) ?? "market",isTradeRouteExpansion:false,effects:c.effects as any,tags:c.tags,implemented:false,tested:false,requiredExpansions:[],allowedModes:c.allowedModes ?? ["multiplayer","solo","practice"],disallowedModes:c.disallowedModes ?? [],playerCountRequirement:c.playerCountRequirement}]));
  return createInitialGameStateFromPipeline({ options, playerNationIds: args?.playerNationIds, cardDb: normCards as any, nationDb, usePrivateRules: args?.usePrivateData ?? false, privateRulesetPath: args?.privateRulesetPath, privateStrategyPath: args?.privateStrategyPath });
}
export const createInitialState = createInitialGameState;
