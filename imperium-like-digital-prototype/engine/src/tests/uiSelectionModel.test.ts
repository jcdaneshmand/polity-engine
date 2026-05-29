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
  it("offers Innovate break-through on eligible market suits and Revolt return on Unrest",()=> {
    const withSpecials = {
      ...G,
      cardDb: {
        ...G.cardDb,
        m1: {...G.cardDb.m1,suit:"uncivilized"},
        u1:{id:"u1",displayName:"Unrest",type:"unrest",cardType:"unrest",suit:"unrest"}
      },
      players:{"0":{...G.players["0"],hand:["u1"],actionsRemaining:1,resources:{materials:3}}}
    };
    const innovate=getAvailableActionsForSelection({kind:"market_slot",id:"m1"},withSpecials,ctx).find(a=>a.action==="innovate");
    expect(innovate).toMatchObject({ label:"Innovate Break Through", enabled:true, cardId:"m1", suit:"uncivilized", source:"market" });
    const revolt=getAvailableActionsForSelection({kind:"hand_card",id:"u1"},withSpecials,ctx).find(a=>a.action==="revolt");
    expect(revolt).toMatchObject({ label:"Revolt Return", enabled:true, cardId:"u1" });
  });
  it("disabled action includes reason",()=> { const acts=getAvailableActionsForSelection({kind:"hand_card",id:"not"},G,ctx); const play=acts.find(a=>a.label==="Play Card"); expect(play?.enabled).toBe(false); expect(play?.reason).toBeTruthy(); });
  it("disables normal play and acquire actions outside Activate turns",()=> {
    const innovate = {...G,currentTurnType:"innovate"};
    const play=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},innovate,ctx).find(a=>a.action==="play");
    expect(play?.enabled).toBe(false);
    expect(play?.reason).toBe("Normal actions require an Activate turn");

    const revolt = {...G,currentTurnType:"revolt"};
    const acquire=getAvailableActionsForSelection({kind:"market_slot",id:"m1"},revolt,ctx).find(a=>a.action==="acquire");
    expect(acquire?.enabled).toBe(false);
    expect(acquire?.reason).toBe("Normal acquisition requires an Activate turn");
  });
  it("enables Free play cards with no Action tokens and blocks repeat Free play this turn",()=> {
    const freePlay={...G,cardDb:{...G.cardDb,c1:{...G.cardDb.c1,tags:["free_play"]}},players:{"0":{...G.players["0"],hand:["c1"],actionsRemaining:0}}};
    const play=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},freePlay,ctx).find(a=>a.action==="play");
    expect(play?.enabled).toBe(true);
    expect(play?.reason).toBeUndefined();

    const repeated={...freePlay,freePlayedThisTurn:{"0":["c1"]}};
    const repeatPlay=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},repeated,ctx).find(a=>a.action==="play");
    expect(repeatPlay?.enabled).toBe(false);
    expect(repeatPlay?.reason).toBe("Free play already used this turn");
  });
  it("disables play actions when the selected card does not meet its State requirement",()=> {
    const stateLocked={...G,cardDb:{...G.cardDb,c1:{...G.cardDb.c1,stateRequirement:"empire"},s1:{id:"s1",displayName:"Barbarian",suit:"uncivilized",tags:["barbarian"]}},players:{"0":{...G.players["0"],hand:["c1"],actionsRemaining:1,stateArea:["s1"]}}};
    const play=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},stateLocked,ctx).find(a=>a.action==="play");
    expect(play?.enabled).toBe(false);
    expect(play?.reason).toBe("Requires empire State");
  });
  it("pending choice actions take priority",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingChoice:{playerId:"0",sourceCardId:"c1",choices:[[{op:"gain_resource",resource:"knowledge",amount:1}],[{op:"draw",count:2}]]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveChoice","resolveChoice","endTurn"]);
    expect(acts[0].label).toBe("Choose 1: Gain 1 knowledge");
    expect(acts[1].label).toBe("Choose 2: Draw 2 cards");
    expect(acts[0].choiceIndex).toBe(0);
    expect(acts[1].choiceIndex).toBe(1);
  });
  it("pending Find choice actions expose the eligible cards",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingFindChoice:{playerId:"0",sourceCardId:"finder",cardIds:["c1","m1"],destination:"discard"}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveFindChoice","resolveFindChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Find Card1", enabled:true, cardId:"c1" });
    expect(acts[1]).toMatchObject({ label:"Find Market1", enabled:true, cardId:"m1" });
    expect(acts[2].enabled).toBe(false);
  });
  it("labels empty pending-choice options as Skip",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingChoice:{playerId:"0",sourceCardId:"c1",choices:[[{op:"gain_resource",resource:"knowledge",amount:1}],[]]}},ctx);
    expect(acts[0].label).toBe("Choose 1: Gain 1 knowledge");
    expect(acts[1].label).toBe("Choose 2: Skip");
  });
  it("labels resource-removal effects distinctly from costs",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingChoice:{playerId:"0",sourceCardId:"c1",choices:[[{op:"remove_resource",resource:"materials",amount:2}]]}},ctx);
    expect(acts[0].label).toBe("Choose 1: Remove 2 materials");
  });
  it("labels steal and return resource effects distinctly from costs",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingChoice:{playerId:"0",sourceCardId:"c1",choices:[[{
      op:"steal_resource",fromPlayerId:"1",resource:"materials",amount:2
    }],[{op:"return_resource",resource:"influence",amount:1}]]}},ctx);
    expect(acts[0].label).toBe("Choose 1: Steal 2 materials");
    expect(acts[1].label).toBe("Choose 2: Return 1 influence");
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
  it("offers exhaust for an exhaust ability in play when an Exhaust token is available",()=> {
    const withExhaust = {
      ...G,
      cardDb: {...G.cardDb, e1:{id:"e1",displayName:"Engine",type:"in_play",cardType:"in_play",effects:[{trigger:"on_exhaust",op:"gain_resource",resource:"knowledge",amount:1}]}},
      players:{"0":{...G.players["0"],playArea:["e1"],exhaustTokensAvailable:1}}
    };
    const exhaust=getAvailableActionsForSelection({kind:"play_area_card",id:"e1"},withExhaust,ctx).find(a=>a.action==="exhaust");
    expect(exhaust).toMatchObject({ label:"Exhaust Ability", enabled:true, cardId:"e1" });
  });
  it("disables exhaust abilities without an Exhaust token",()=> {
    const withoutToken = {
      ...G,
      cardDb: {...G.cardDb, e1:{id:"e1",displayName:"Engine",type:"in_play",cardType:"in_play",effects:[{trigger:"on_exhaust",op:"gain_resource",resource:"knowledge",amount:1}]}},
      players:{"0":{...G.players["0"],playArea:["e1"],exhaustTokensAvailable:0}}
    };
    const exhaust=getAvailableActionsForSelection({kind:"play_area_card",id:"e1"},withoutToken,ctx).find(a=>a.action==="exhaust");
    expect(exhaust?.enabled).toBe(false);
    expect(exhaust?.reason).toBe("No Exhaust tokens available");
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
