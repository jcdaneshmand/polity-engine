import { describe, expect, it } from "vitest";
import { getAvailableActionsForSelection, getSelectedCard } from "../../../app/src/ui/controller/selectionModel";

describe("selection model", () => {
  const G:any = { cardDb:{c1:{id:"c1",displayName:"Card1"},m1:{id:"m1",displayName:"Market1"}}, market:["m1"], players:{"0":{hand:["c1"],actionsRemaining:1}} };
  const ctx:any = { currentPlayer:"0" };
  it("hand selection returns card",()=> expect(getSelectedCard({kind:"hand_card",id:"c1"},G)?.id).toBe("c1"));
  it("market selection returns card",()=> expect(getSelectedCard({kind:"market_slot",id:"m1"},G)?.id).toBe("m1"));
  it("empty selection returns undefined",()=> expect(getSelectedCard({kind:"market_slot",id:"none"},G)).toBeUndefined());
  it("actions include play for hand",()=> expect(getAvailableActionsForSelection({kind:"hand_card",id:"c1"},G,ctx).some(a=>a.label==="Play Card")).toBe(true));
  it("actions include acquire for market",()=> expect(getAvailableActionsForSelection({kind:"market_slot",id:"m1"},G,ctx).some(a=>a.label==="Acquire Card")).toBe(true));
  it("disabled action includes reason",()=> { const acts=getAvailableActionsForSelection({kind:"hand_card",id:"not"},G,ctx); const play=acts.find(a=>a.label==="Play Card"); expect(play?.enabled).toBe(false); expect(play?.reason).toBeTruthy(); });
});
