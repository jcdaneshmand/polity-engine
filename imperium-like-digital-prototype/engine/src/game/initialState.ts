import { loadCardDbWithOptionalPrivateData } from "../cards/privateCardLoader";
import { loadNationDb } from "../nations/nationLoader";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { defaultGameOptions, type GameOptions } from "../options/gameOptions";
import type { GameState } from "./state";

export function createInitialGameState(args?: { options?: GameOptions; playerNationIds?: Record<string,string> }): GameState {
  const options = args?.options ?? defaultGameOptions;
  const cards = loadCardDbWithOptionalPrivateData({ enabledExpansions: options.enabledExpansions, usePrivate: false });
  const nationDb = loadNationDb({ enabledExpansions: options.enabledExpansions });
  const normCards = Object.fromEntries(Object.values(cards).map((c)=>[c.id,{id:c.id,displayName:c.displayName,suit:"none",cardType:"action",cost:{materials:0,population:0,progress:0,goods:0},developmentCost:{materials:0,population:0,progress:0,goods:0},vp:{mode:"none",value:null},startingLocation:"box",isTradeRouteExpansion:false,effects:c.effects as any,tags:c.tags,implemented:false,tested:false,requiredExpansions:[],allowedModes:["multiplayer","solo","practice"]}]));
  return createInitialGameStateFromPipeline({ options, playerNationIds: args?.playerNationIds, cardDb: normCards as any, nationDb });
}
export const createInitialState = createInitialGameState;
