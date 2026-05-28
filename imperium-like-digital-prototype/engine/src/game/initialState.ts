import { loadCardDb } from "../cards/cardLoader";
import type { GameState } from "./state";
import { loadNationDb } from "../nations/nationLoader";
import { setupPlayerFromNation } from "../nations/setupPlayerFromNation";

export function createInitialGameState(args?: { playerNationIds?: Record<string,string>; cardDb?: ReturnType<typeof loadCardDb>; nationDb?: ReturnType<typeof loadNationDb> }): GameState {
  const cardDb = args?.cardDb ?? loadCardDb();
  const nationDb = args?.nationDb ?? loadNationDb();
  const ids = args?.playerNationIds ?? { "0": "test_nation_sun_coast", "1": "test_nation_river_court" };
  const toNorm = Object.fromEntries(Object.values(cardDb).map((c)=>[c.id,{id:c.id,displayName:c.displayName,suit:"none",cardType:"other",cost:{materials:0,population:0,progress:0,goods:0},developmentCost:{materials:0,population:0,progress:0,goods:0},vp:{mode:"none",value:null},startingLocation:"box",isTradeRouteExpansion:false,effects:[],tags:c.tags,implemented:false,tested:false}]));
  const players = Object.fromEntries(Object.entries(ids).map(([pid,nid])=>[pid, setupPlayerFromNation({ nation: nationDb[nid], cardDb: toNorm as any, playerId: pid, shuffle: (items)=>[...items] })]));
  return { players, cardDb, market: Object.keys(cardDb).slice(0, 8), sharedDiscard: [], log: [], round: 1 };
}
export const createInitialState = createInitialGameState;
