import { describe, expect, it } from "vitest";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";

const cards:any = {
  a:{id:"a",displayName:"A",suit:"region",cardType:"attack",cost:{materials:0,population:0,progress:0,goods:0},developmentCost:{materials:0,population:0,progress:0,goods:0},vp:{mode:"none",value:null},startingLocation:"box",isTradeRouteExpansion:false,effects:[],tags:["aggressive"],implemented:false,tested:false,requiredExpansions:[],delayableInLoweredAggression:true,allowedModes:["multiplayer","solo","practice"]}
};
const nation:any = {id:"test_nation_sun_coast",displayName:"N",powerCardIds:[],stateCardIds:[],startingDeckCardIds:["a"],nationDeckCardIds:[],developmentCardIds:[],setupRules:[],passiveRules:[],actionTokensBase:1,exhaustTokensBase:1,requiredExpansions:[],implemented:false,tested:false};

describe("variants",()=>{
  it("lowered aggression delays count",()=>{ const G=createInitialGameStateFromPipeline({ options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["lowered_aggression"]}, cardDb:cards, nationDb:{test_nation_sun_coast:nation}, playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"} }); expect(G.setupReport?.delayedAggressiveCount).toBeGreaterThanOrEqual(1); });
  it("quick_setup path used",()=>{ const G=createInitialGameStateFromPipeline({ options:{playerCount:2,mode:"multiplayer",enabledExpansions:[],enabledVariants:["quick_setup"]}, cardDb:cards, nationDb:{test_nation_sun_coast:nation}, playerNationIds:{"0":"test_nation_sun_coast","1":"test_nation_sun_coast"} }); expect(G.setupReport?.usedQuickSetup).toBe(true); });
});
