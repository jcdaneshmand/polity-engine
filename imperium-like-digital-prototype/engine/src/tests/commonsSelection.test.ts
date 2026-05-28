import { describe, expect, it } from "vitest";
import { applyExpansionAndPlayerCountFilters, selectCommonsCandidates } from "../setup/commonsSelection";

const cards: any[] = [
  { id:"c1", ownership:"commons", commonsSetId:"classics", playerCountRequirement:"2+" },
  { id:"c2", ownership:"nation", commonsSetId:"classics" },
  { id:"c3", ownership:"commons", commonsSetId:"legends", playerCountRequirement:"3+" },
  { id:"c4", ownership:"commons", commonsSetId:"classics", playerCountRequirement:"4+" }
];
const baseOptions:any={commonsSetId:"classics",playerCount:2,effectiveCommonsPlayerCount:2,enabledExpansions:[],enabledVariants:[],selectedNationIds:[],replacementPolicy:"none"};

describe("commons selection",()=>{
  it("selects only commons ownership cards",()=> expect(selectCommonsCandidates(cards as any, baseOptions).map(c=>c.id)).toEqual(["c1","c4"]));
  it("excludes 3+ and 4+ at effective 2",()=>{ const r=applyExpansionAndPlayerCountFilters(cards as any, baseOptions); expect(r.removedForPlayerCount).toContain("c4"); });
  it("includes 3+ at effective 3",()=>{ const r=applyExpansionAndPlayerCountFilters(cards as any,{...baseOptions,effectiveCommonsPlayerCount:3,commonsSetId:"legends"}); expect(r.kept.some((c:any)=>c.id==="c3")).toBe(true); });
  it("includes 4+ at effective 4",()=>{ const r=applyExpansionAndPlayerCountFilters(cards as any,{...baseOptions,effectiveCommonsPlayerCount:4}); expect(r.kept.some((c:any)=>c.id==="c4")).toBe(true); });
});
