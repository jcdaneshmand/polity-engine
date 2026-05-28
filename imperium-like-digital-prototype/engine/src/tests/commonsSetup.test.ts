import { describe, expect, it } from "vitest";
import { buildCommonsSetup } from "../setup/commonsSetup";

const nationDb:any={n1:{id:"n1"}};
const cardDb:any={
  a:{id:"a",ownership:"commons",commonsSetId:"horizons",suit:"region",cardType:"attack",tags:["aggressive"],delayableInLoweredAggression:true,marketEligible:true,cost:{materials:0,population:0,progress:0,goods:0}},
  b:{id:"b",ownership:"commons",commonsSetId:"horizons",suit:"civilized",cardType:"action",tags:[],marketEligible:true,conflictsWithNationIds:["n1"],replacementGroupId:"g1",cost:{materials:0,population:0,progress:0,goods:0}},
  r:{id:"r",ownership:"replacement",commonsSetId:"classics",suit:"civilized",cardType:"action",tags:[],marketEligible:true,replacementGroupId:"g1",cost:{materials:0,population:0,progress:0,goods:0}},
  tr:{id:"tr",ownership:"commons",commonsSetId:"horizons",commonsGroup:"trade_routes",suit:"region",cardType:"trade_route",tags:[],marketEligible:true,cost:{materials:0,population:0,progress:0,goods:0}}
};

describe("commons setup",()=>{
  it("trade_routes disabled excludes trade-route-only cards",()=>{ const r=buildCommonsSetup({cardDb,nationDb,options:{commonsSetId:"horizons",playerCount:2,effectiveCommonsPlayerCount:2,enabledExpansions:[],enabledVariants:[],selectedNationIds:[],replacementPolicy:"none"},rng:Math.random}); expect(r.selectedCommonsCards).not.toContain("tr");});
  it("lowered aggression delays aggressive cards",()=>{ const r=buildCommonsSetup({cardDb,nationDb,options:{commonsSetId:"horizons",playerCount:2,effectiveCommonsPlayerCount:2,enabledExpansions:["trade_routes"],enabledVariants:["lowered_aggression"],selectedNationIds:[],replacementPolicy:"none"},rng:Math.random}); expect(r.delayedCards).toContain("a");});
  it("nation conflict removes and replacement used",()=>{ const r=buildCommonsSetup({cardDb,nationDb,options:{commonsSetId:"horizons",playerCount:2,effectiveCommonsPlayerCount:2,enabledExpansions:["trade_routes"],enabledVariants:[],selectedNationIds:["n1"],replacementPolicy:"use_replacements"},rng:Math.random}); expect(r.removedForNationConflict).toContain("b"); expect(r.replacementCardsUsed).toContain("r");});
});
