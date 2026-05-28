import { describe, expect, it } from "vitest";
import { buildInitialMarket, constructDecks } from "../setup/commonsDeckConstruction";

describe("commons deck construction",()=>{
  it("quick_setup uses combined deck path",()=>{ const r=constructDecks([{id:"a",suit:"region",cardType:"action",marketEligible:true}] as any, true); expect(r.constructionPath).toBe("quick_setup"); });
  it("default setup uses suit-separated path",()=>{ const r=constructDecks([{id:"a",suit:"region",cardType:"action"}] as any, false); expect(r.constructionPath).toBe("default"); });
  it("initial market has 5 slots",()=> expect(buildInitialMarket(["a","b"],["u"]).length).toBe(5));
});
