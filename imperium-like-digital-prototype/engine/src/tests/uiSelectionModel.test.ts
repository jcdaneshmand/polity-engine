import { describe, expect, it } from "vitest";
import { getAvailableActionsForSelection, getSelectedCard } from "../../../app/src/ui/controller/selectionModel";

describe("selection model", () => {
  const G:any = { cardDb:{c1:{id:"c1",displayName:"Card1"},m1:{id:"m1",displayName:"Market1",cost:2}}, market:["m1"], players:{"0":{hand:["c1"],actionsRemaining:1,resources:{materials:3}}} };
  const ctx:any = { currentPlayer:"0" };
  it("hand selection returns card",()=> expect(getSelectedCard({kind:"hand_card",id:"c1"},G)?.id).toBe("c1"));
  it("market selection returns card",()=> expect(getSelectedCard({kind:"market_slot",id:"m1"},G)?.id).toBe("m1"));
  it("empty selection returns undefined",()=> expect(getSelectedCard({kind:"market_slot",id:"none"},G)).toBeUndefined());
  it("actions include play for hand",()=> expect(getAvailableActionsForSelection({kind:"hand_card",id:"c1"},G,ctx).some(a=>a.label==="Play Card")).toBe(true));
  it("actions include acquire for market",()=> expect(getAvailableActionsForSelection({kind:"market_slot",id:"m1"},G,ctx).some(a=>a.label==="Acquire Card")).toBe(true));
  it("disabled action includes reason",()=> { const acts=getAvailableActionsForSelection({kind:"hand_card",id:"not"},G,ctx); const play=acts.find(a=>a.label==="Play Card"); expect(play?.enabled).toBe(false); expect(play?.reason).toBeTruthy(); });
  it("pending choice actions take priority",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingChoice:{playerId:"0",sourceCardId:"c1",choices:[[{op:"gain_resource",resource:"knowledge",amount:1}],[{op:"draw",count:2}]]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveChoice","resolveChoice","endTurn"]);
    expect(acts[0].label).toBe("Choose 1: Gain 1 knowledge");
    expect(acts[1].label).toBe("Choose 2: Draw 2 cards");
    expect(acts[0].choiceIndex).toBe(0);
    expect(acts[1].choiceIndex).toBe(1);
  });
  it("pending cleanup discard exposes discard and keep-hand actions",()=> {
    const acts=getAvailableActionsForSelection({kind:"hand_card",id:"c1"}, {...G,pendingCleanupDiscardChoice:{playerId:"0",cardIds:["c1"]}}, ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveCleanupDiscard","resolveCleanupDiscard","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Discard Card1", enabled:true, cardId:"c1" });
    expect(acts[1]).toMatchObject({ label:"Keep Hand", enabled:true });
    expect(acts[2].enabled).toBe(false);
  });
  it("disables acquire when materials are too low",()=> {
    const poor = {...G,players:{"0":{...G.players["0"],resources:{materials:1}}}};
    const acquire=getAvailableActionsForSelection({kind:"market_slot",id:"m1"},poor,ctx).find(a=>a.action==="acquire");
    expect(acquire?.enabled).toBe(false);
    expect(acquire?.reason).toBe("Need 2 materials; you can pay 1");
  });
  it("enables acquire when goods can cover the material shortfall",()=> {
    const withGoods = {...G,players:{"0":{...G.players["0"],resources:{materials:1,goods:1}}}};
    const acquire=getAvailableActionsForSelection({kind:"market_slot",id:"m1"},withGoods,ctx).find(a=>a.action==="acquire");
    expect(acquire?.enabled).toBe(true);
    expect(acquire?.reason).toBeUndefined();
  });
  it("offers recall and abandon for a region in play",()=> {
    const withRegion = {
      ...G,
      cardDb: {...G.cardDb, r1:{id:"r1",displayName:"Region",type:"region",cardType:"region",suit:"region"}},
      players:{"0":{...G.players["0"],playArea:["r1"]}}
    };
    const acts=getAvailableActionsForSelection({kind:"play_area_card",id:"r1"},withRegion,ctx);
    expect(acts.some((a)=>a.action==="recallRegion" && a.enabled)).toBe(true);
    expect(acts.some((a)=>a.action==="abandonRegion" && a.enabled)).toBe(true);
  });
  it("offers garrison for a hand card when a region is in play",()=> {
    const withRegion = {
      ...G,
      cardDb: {...G.cardDb, r1:{id:"r1",displayName:"Region",type:"region",cardType:"region",suit:"region"}},
      players:{"0":{...G.players["0"],hand:["c1"],playArea:["r1"]}}
    };
    const acts=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},withRegion,ctx);
    expect(acts.find((a)=>a.action==="garrison")?.cardId).toBe("c1");
    expect(acts.find((a)=>a.action==="garrison")?.hostCardId).toBe("r1");
  });
});
