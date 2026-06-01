import { describe, expect, it } from "vitest";
import { getActionHintsByCardId, getAvailableActionsForSelection, getMarketCardClickAction, getPendingUiState, getSelectedCard } from "../../../app/src/ui/controller/selectionModel";
import { compactReason, groupActionsForMenu } from "../../../app/src/ui/layout/ActionMenu";
import { formatLogMessage } from "../../../app/src/ui/layout/GameLogPanel";
import { marketResourceTokens } from "../../../app/src/ui/layout/MarketRow";

describe("selection model", () => {
  const G:any = { cardDb:{c1:{id:"c1",displayName:"Card1"},m1:{id:"m1",displayName:"Market1",cost:2}}, market:["m1"], players:{"0":{hand:["c1"],actionsRemaining:1,resources:{materials:3}}} };
  const ctx:any = { currentPlayer:"0" };
  it("hand selection returns card",()=> expect(getSelectedCard({kind:"hand_card",id:"c1"},G)?.id).toBe("c1"));
  it("market selection returns card",()=> expect(getSelectedCard({kind:"market_slot",id:"m1"},G)?.id).toBe("m1"));
  it("empty selection returns undefined",()=> expect(getSelectedCard({kind:"market_slot",id:"none"},G)).toBeUndefined());
  it("pin details carries the selected card id for card selections",()=> {
    const view=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},G,ctx).find(a=>a.action==="view");
    expect(view).toMatchObject({ label:"Pin Details", enabled:true, cardId:"c1" });
  });
  it("pin details is disabled for non-card selections",()=> {
    const view=getAvailableActionsForSelection({kind:"player_zone",id:"discard",playerId:"0"},G,ctx).find(a=>a.action==="view");
    expect(view).toMatchObject({ label:"Pin Details", enabled:false, reason:"Select a card to pin details" });
  });
  it("actions include play for hand",()=> expect(getAvailableActionsForSelection({kind:"hand_card",id:"c1"},G,ctx).some(a=>a.label==="Play Card")).toBe(true));
  it("offers deck Innovate choices even without a selected card",()=> {
    const acts=getAvailableActionsForSelection(null,G,ctx);
    const innovate=acts.filter((a)=>a.action==="innovate");
    expect(innovate).toEqual([
      expect.objectContaining({ label:"Region from Deck", group:"Innovate", enabled:true, suit:"region", source:"deck" }),
      expect.objectContaining({ label:"Uncivilized from Deck", group:"Innovate", enabled:true, suit:"uncivilized", source:"deck" }),
      expect.objectContaining({ label:"Civilized from Deck", group:"Innovate", enabled:true, suit:"civilized", source:"deck" }),
      expect.objectContaining({ label:"Tributary from Deck", group:"Innovate", enabled:true, suit:"tributary", source:"deck" })
    ]);
  });
  it("disables deck Innovate choices outside Activate turns",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,currentTurnType:"revolt"},ctx);
    const innovate=acts.filter((a)=>a.action==="innovate");
    expect(innovate).toHaveLength(4);
    expect(innovate.every((a)=>!a.enabled && a.reason==="Innovate requires starting from an Activate turn")).toBe(true);
  });
  it("offers a global Revolt action for all Unrest in hand",()=> {
    const withUnrest = {
      ...G,
      cardDb: {
        ...G.cardDb,
        u1:{id:"u1",displayName:"Unrest 1",type:"unrest",cardType:"unrest",suit:"unrest"},
        u2:{id:"u2",displayName:"Unrest 2",type:"unrest",cardType:"unrest",suit:"unrest"}
      },
      players:{"0":{...G.players["0"],hand:["c1","u1","u2"]}}
    };
    const revolt=getAvailableActionsForSelection(null,withUnrest,ctx).find((a)=>a.action==="revolt");
    expect(revolt).toMatchObject({ label:"Revolt Return All Unrest", enabled:true, cardIds:["u1","u2"] });
  });
  it("disables the global Revolt action when there is no Unrest in hand",()=> {
    const revolt=getAvailableActionsForSelection(null,G,ctx).find((a)=>a.action==="revolt");
    expect(revolt).toMatchObject({ label:"Revolt", enabled:false, reason:"No Unrest in hand" });
  });
  it("menu grouping preserves Innovate above Revolt",()=> {
    const menuItems=groupActionsForMenu(getAvailableActionsForSelection(null,G,ctx));
    const turnSection=menuItems.find((item)=>item.label==="Turn");
    expect(turnSection?.kind).toBe("section");
    if (turnSection?.kind !== "section") throw new Error("Turn section missing");
    const labels=turnSection.items.map((item:any)=>item.label);
    expect(labels.indexOf("Innovate")).toBeLessThan(labels.indexOf("Revolt"));
  });
  it("action menu groups actions into sections",()=> {
    const menuItems=groupActionsForMenu(getAvailableActionsForSelection({kind:"hand_card",id:"c1"},G,ctx));
    expect(menuItems.map((item)=>item.label)).toEqual(["Card","Turn"]);
  });
  it("compacts disabled reasons for menu display",()=> {
    expect(compactReason("Innovate requires starting from an Activate turn")).toBe("Needs Activate turn");
    expect(compactReason("Resolve the pending Development choice first")).toBe("Resolve Development first");
  });
  it("summarizes pending choices for the board banner",()=> {
    expect(getPendingUiState({...G,pendingAcquireChoice:{playerId:"0",sourceCardId:"picker",source:"market",cardIds:["m1"],destination:"hand"}},ctx)).toMatchObject({
      title:"Pending Acquire",
      detail:"Choose 1 card"
    });
  });
  it("summarizes pending Gain/Take market card choices for the board banner",()=> {
    expect(getPendingUiState({...G,pendingMarketCardChoice:{playerId:"0",sourceCardId:"picker",op:"take_card",cardIds:["m1"],destination:"hand"}},ctx)).toMatchObject({
      title:"Pending Take Card",
      detail:"Choose 1 market card"
    });
  });
  it("describes pending Exile as one choice from options",()=> {
    expect(getPendingUiState({...G,pendingExileChoice:{playerId:"0",sourceCardId:"practice_market_churn",source:"market",cardIds:["m1","m2","m3","m4"],optional:true}},ctx)).toMatchObject({
      title:"Pending Exile",
      detail:"Choose 1 market card to exile, or skip"
    });
    expect(getPendingUiState({...G,pendingExileChoice:{playerId:"0",sourceCardId:"picker",source:"market",cardIds:["m1","m2","m3","m4"]}},ctx)).toMatchObject({
      title:"Pending Exile",
      detail:"Choose 1 card to exile from 4 options"
    });
  });
  it("describes cleanup market resource as choosing one destination card",()=> {
    expect(getPendingUiState({...G,pendingCleanupMarketResourceChoice:{playerId:"0",resource:"knowledge",amount:1,cardIds:["m1","m2","m3","m4","m5"]}},ctx)).toMatchObject({
      title:"Pending Cleanup Resource",
      detail:"Choose a market card for 1 cleanup resource"
    });
  });
  it("builds card action hints and highlights from available actions",()=> {
    const withPending={...G,pendingAcquireChoice:{playerId:"0",sourceCardId:"picker",source:"market",cardIds:["m1"],destination:"hand"}};
    const hints=getActionHintsByCardId(getAvailableActionsForSelection(null,withPending,ctx));
    expect(hints.m1).toMatchObject({ highlighted:true, labels:["Acquire"] });
  });
  it("builds market-card choice actions and highlights",()=> {
    const withPending={...G,pendingMarketCardChoice:{playerId:"0",sourceCardId:"picker",op:"gain_card",cardIds:["m1"],destination:"hand"}};
    const actions=getAvailableActionsForSelection(null,withPending,ctx);
    expect(actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ label:"Gain Market1", action:"resolveMarketCardChoice", enabled:true, cardId:"m1" })
    ]));
    expect(getActionHintsByCardId(actions,"market").m1).toMatchObject({ highlighted:true, labels:["Gain"] });
  });
  it("keeps Play hints scoped to hand cards",()=> {
    const actions=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},G,ctx);
    expect(getActionHintsByCardId(actions,"hand").c1.labels).toContain("Play");
    expect(getActionHintsByCardId(actions,"market").c1?.labels ?? []).not.toContain("Play");
  });
  it("formats market cleanup resource tokens for market cards",()=> {
    expect(marketResourceTokens({ knowledge:2, goods:1 },{})).toEqual(["2 Progress","1 Goods"]);
  });
  it("formats engine log codes into readable player messages",()=> {
    expect(formatLogMessage("MarketInitialized(slots=5)")).toBe("Market initialized with 5 cards.");
    expect(formatLogMessage("CleanupMarketResourceChoicePending(options=5)")).toBe("Choose a market card for the cleanup resource.");
    expect(formatLogMessage("TurnPhase(cleanup): draw_up(hand=5)")).toBe("Cleanup: drew up to 5 cards in hand.");
    expect(formatLogMessage("MarketDecks(main=5,region=0,uncivilized=0,civilized=0,tributary=0)")).toBe("Market decks: Main 5, Region 0, Uncivilized 0, Civilized 0, Tributary 0.");
    expect(formatLogMessage("TurnPhase(action_execution): playCard(test_action_foundry_shift)")).toBe("Played Foundry Shift.");
  });
  it("clicking an eligible market card resolves pending cleanup resource directly",()=> {
    const clickAction=getMarketCardClickAction({...G,pendingCleanupMarketResourceChoice:{playerId:"0",resource:"knowledge",amount:1,cardIds:["m1"]}},ctx,"m1");
    expect(clickAction).toEqual({ action:"resolveCleanupMarketResource", cardId:"m1", enabled:true });
    expect(getMarketCardClickAction({...G,pendingCleanupMarketResourceChoice:{playerId:"1",resource:"knowledge",amount:1,cardIds:["m1"]}},ctx,"m1")).toBeUndefined();
  });
  it("clicking an eligible market card resolves practice churn Exile directly",()=> {
    const clickAction=getMarketCardClickAction({
      ...G,
      pendingExileChoice:{playerId:"0",sourceCardId:"practice_market_churn",source:"market",cardIds:["m1"],optional:true}
    },ctx,"m1");
    expect(clickAction).toEqual({ action:"resolveExileChoice", cardId:"m1", enabled:true });
    expect(getMarketCardClickAction({
      ...G,
      pendingExileChoice:{playerId:"0",sourceCardId:"picker",source:"market",cardIds:["m1"],optional:true}
    },ctx,"m1")).toBeUndefined();
    expect(getMarketCardClickAction({
      ...G,
      pendingExileChoice:{playerId:"1",sourceCardId:"practice_market_churn",source:"market",cardIds:["m1"],optional:true}
    },ctx,"m1")).toBeUndefined();
  });
  it("clicking an eligible market card resolves pending Gain/Take directly",()=> {
    const clickAction=getMarketCardClickAction({
      ...G,
      pendingMarketCardChoice:{playerId:"0",sourceCardId:"picker",op:"take_card",cardIds:["m1"],destination:"hand"}
    },ctx,"m1");
    expect(clickAction).toEqual({ action:"resolveMarketCardChoice", cardId:"m1", enabled:true });
    expect(getMarketCardClickAction({
      ...G,
      pendingMarketCardChoice:{playerId:"1",sourceCardId:"picker",op:"take_card",cardIds:["m1"],destination:"hand"}
    },ctx,"m1")).toBeUndefined();
  });
  it("scales order choices by first-card options instead of all permutations",()=> {
    const withLookOrder = {
      ...G,
      cardDb: {...G.cardDb, a:{id:"a",displayName:"A"},b:{id:"b",displayName:"B"},c:{id:"c",displayName:"C"}},
      pendingLookOrderChoice:{playerId:"0",source:"deck",cardIds:["a","b","c"]}
    };
    const acts=getAvailableActionsForSelection(null,withLookOrder,ctx);
    expect(acts.filter((a)=>a.action==="resolveLookOrderChoice")).toHaveLength(3);
    expect(acts[0]).toMatchObject({ label:"Return A first", cardIds:["a","b","c"] });
    expect(acts[1]).toMatchObject({ label:"Return B first", cardIds:["b","a","c"] });
  });
  it("does not expose direct market Acquire as a normal player action",()=> {
    expect(getAvailableActionsForSelection({kind:"market_slot",id:"m1"},G,ctx).some(a=>a.action==="acquire")).toBe(false);
  });
  it("still hides direct market acquisition when no Action tokens are available",()=> {
    const noAction = {...G,players:{"0":{...G.players["0"],actionsRemaining:0,actionTokensAvailable:0,resources:{materials:3}}}};
    const acquire=getAvailableActionsForSelection({kind:"market_slot",id:"m1"},noAction,ctx).find(a=>a.action==="acquire");
    expect(acquire).toBeUndefined();
  });
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
    expect(innovate).toMatchObject({ label:"Break Through Market1", group:"Innovate", enabled:true, cardId:"m1", suit:"uncivilized", source:"market" });
    const revolt=getAvailableActionsForSelection({kind:"hand_card",id:"u1"},withSpecials,ctx).find(a=>a.action==="revolt");
    expect(revolt).toMatchObject({ label:"Revolt Return", enabled:true, cardId:"u1" });
  });
  it("disabled action includes reason",()=> { const acts=getAvailableActionsForSelection({kind:"hand_card",id:"not"},G,ctx); const play=acts.find(a=>a.label==="Play Card"); expect(play?.enabled).toBe(false); expect(play?.reason).toBeTruthy(); });
  it("disables normal play outside Activate turns and does not expose direct market acquisition",()=> {
    const innovate = {...G,currentTurnType:"innovate"};
    const play=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},innovate,ctx).find(a=>a.action==="play");
    expect(play?.enabled).toBe(false);
    expect(play?.reason).toBe("Normal actions require an Activate turn");

    const revolt = {...G,currentTurnType:"revolt"};
    const acquire=getAvailableActionsForSelection({kind:"market_slot",id:"m1"},revolt,ctx).find(a=>a.action==="acquire");
    expect(acquire).toBeUndefined();
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
  it("enables play actions when any multi-state requirement matches the active State",()=> {
    const multiState={...G,cardDb:{...G.cardDb,c1:{...G.cardDb.c1,stateRequirement:"barbarian|empire"},s1:{id:"s1",displayName:"Barbarian",suit:"uncivilized",tags:["barbarian"]}},players:{"0":{...G.players["0"],hand:["c1"],actionsRemaining:1,stateArea:["s1"]}}};
    const play=getAvailableActionsForSelection({kind:"hand_card",id:"c1"},multiState,ctx).find(a=>a.action==="play");
    expect(play?.enabled).toBe(true);
    expect(play?.reason).toBeUndefined();
  });
  it("pending choice actions take priority",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingChoice:{playerId:"0",sourceCardId:"c1",choices:[[{op:"gain_resource",resource:"knowledge",amount:1}],[{op:"draw",count:2}]]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveChoice","resolveChoice","endTurn"]);
    expect(acts[0].label).toBe("Choose 1: Gain 1 knowledge");
    expect(acts[1].label).toBe("Choose 2: Draw 2 cards");
    expect(acts[0].choiceIndex).toBe(0);
    expect(acts[1].choiceIndex).toBe(1);
  });
  it("disables pending choices with explicit costs the player cannot pay",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,players:{"0":{...G.players["0"],resources:{materials:0}}},pendingChoice:{playerId:"0",sourceCardId:"c1",choices:[[{op:"spend_resource",resource:"materials",amount:2}]]}},ctx);
    expect(acts[0]).toMatchObject({ action:"resolveChoice", enabled:false, reason:"Cannot pay choice cost" });
  });
  it("pending Find choice actions expose the eligible cards",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingFindChoice:{playerId:"0",sourceCardId:"finder",cardIds:["c1","m1"],destination:"discard"}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveFindChoice","resolveFindChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Find Card1", enabled:true, cardId:"c1" });
    expect(acts[1]).toMatchObject({ label:"Find Market1", enabled:true, cardId:"m1" });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Draw choice actions expose the eligible face-up pile cards",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingDrawChoice:{playerId:"0",sourceCardId:"drawer",source:"discard",cardIds:["c1","m1"],remainingCount:1}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveDrawChoice","resolveDrawChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Draw Card1", enabled:true, cardId:"c1", source:"discard" });
    expect(acts[1]).toMatchObject({ label:"Draw Market1", enabled:true, cardId:"m1", source:"discard" });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Acquire choice actions expose the eligible cards",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingAcquireChoice:{playerId:"0",sourceCardId:"picker",source:"exile",cardIds:["c1","m1"],destination:"hand"}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveAcquireChoice","resolveAcquireChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Acquire Card1", enabled:true, cardId:"c1" });
    expect(acts[1]).toMatchObject({ label:"Acquire Market1", enabled:true, cardId:"m1" });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Exile choice actions expose the eligible cards",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingExileChoice:{playerId:"0",sourceCardId:"picker",source:"market",cardIds:["c1","m1"]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveExileChoice","resolveExileChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Exile Card1", enabled:true, cardId:"c1" });
    expect(acts[1]).toMatchObject({ label:"Exile Market1", enabled:true, cardId:"m1" });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending optional Exile choice exposes a skip action",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingExileChoice:{playerId:"0",sourceCardId:"picker",source:"market",cardIds:["c1"],optional:true}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveExileChoice","skipExileChoice","endTurn"]);
    expect(acts[1]).toMatchObject({ label:"Skip Exile", enabled:true });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Break Through choice actions expose the eligible cards",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingBreakThroughChoice:{playerId:"0",sourceCardId:"breaker",source:"exile",suit:"civilized",cardIds:["c1","m1"]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveBreakThroughChoice","resolveBreakThroughChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Break Through Card1", enabled:true, cardId:"c1" });
    expect(acts[1]).toMatchObject({ label:"Break Through Market1", enabled:true, cardId:"m1" });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending garrison choice actions expose eligible host and hand-card pairs",()=> {
    const withRegion = {
      ...G,
      cardDb: {...G.cardDb, r1:{id:"r1",displayName:"Region",type:"region",cardType:"region",suit:"region"}},
      pendingGarrisonChoice:{playerId:"0",sourceCardId:"garrison_source",hostCardIds:["r1"],cardIds:["c1","m1"]}
    };
    const acts=getAvailableActionsForSelection(null,withRegion,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveGarrisonChoice","resolveGarrisonChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Garrison Card1 on Region", enabled:true, cardId:"c1", hostCardId:"r1" });
    expect(acts[1]).toMatchObject({ label:"Garrison Market1 on Region", enabled:true, cardId:"m1", hostCardId:"r1" });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending region choice actions expose eligible regions",()=> {
    const withRegion = {
      ...G,
      cardDb: {...G.cardDb, r1:{id:"r1",displayName:"Region",type:"region",cardType:"region",suit:"region"}},
      pendingRegionChoice:{playerId:"0",sourceCardId:"recall_source",op:"recall_region",cardIds:["r1"]}
    };
    const acts=getAvailableActionsForSelection(null,withRegion,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveRegionChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Recall Region", enabled:true, cardId:"r1" });
    expect(acts[1].enabled).toBe(false);
  });
  it("pending Development choice actions expose eligible Development cards",()=> {
    const withDevelopment = {
      ...G,
      cardDb: {...G.cardDb, d1:{id:"d1",displayName:"Development",type:"development",cardType:"development"}},
      pendingDevelopmentChoice:{playerId:"0",sourceCardId:"develop_source",cardIds:["d1"],resumeDrawCount:0,resumeBehavior:"none",usesProgressionToken:false}
    };
    const acts=getAvailableActionsForSelection(null,withDevelopment,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveDevelopmentChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Develop Development", enabled:true, cardId:"d1" });
    expect(acts[1].enabled).toBe(false);
  });
  it("pending skippable Development choice exposes a skip action",()=> {
    const withDevelopment = {
      ...G,
      cardDb: {...G.cardDb, d1:{id:"d1",displayName:"Development",type:"development",cardType:"development"}},
      pendingDevelopmentChoice:{playerId:"0",sourceCardId:"develop_source",cardIds:["d1"],resumeDrawCount:0,resumeBehavior:"none",usesProgressionToken:false,allowSkip:true}
    };
    const acts=getAvailableActionsForSelection(null,withDevelopment,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveDevelopmentChoice","skipDevelopmentChoice","endTurn"]);
    expect(acts[1]).toMatchObject({ label:"Skip Development", enabled:true });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending short-game Development removal exposes eligible Development cards",()=> {
    const withDevelopmentRemoval = {
      ...G,
      cardDb: {...G.cardDb, d1:{id:"d1",displayName:"Development",type:"development",cardType:"development"}},
      pendingShortGameDevelopmentExileChoice:{playerId:"0",cardIds:["d1"],resumeDrawCount:1}
    };
    const acts=getAvailableActionsForSelection(null,withDevelopmentRemoval,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveShortGameDevelopmentExileChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Remove Development", enabled:true, cardId:"d1" });
    expect(acts[1].enabled).toBe(false);
  });
  it("pending Trade choice actions expose route and Goods-for-Progress choices",()=> {
    const withTrade = {
      ...G,
      cardDb: {...G.cardDb, tr1:{id:"tr1",displayName:"River Road",type:"trade_route",cardType:"trade_route",suit:"trade_route"}},
      pendingTradeChoice:{playerId:"0",sourceCardId:"trade_source",routeCardIds:["tr1"],allowGoodsForProgress:true}
    };
    const acts=getAvailableActionsForSelection(null,withTrade,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveTradeChoice","resolveTradeChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Trade via River Road", enabled:true, cardId:"tr1" });
    expect(acts[1]).toMatchObject({ label:"Trade Goods for Progress", enabled:true });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Return Unrest choice actions expose eligible Unrest cards",()=> {
    const withUnrest = {
      ...G,
      cardDb: {...G.cardDb, u1:{id:"u1",displayName:"Unrest",type:"unrest",cardType:"unrest",suit:"unrest"}},
      pendingReturnUnrestChoice:{playerId:"0",sourceCardId:"return_source",cardIds:["u1"],sourceZones:["hand"]}
    };
    const acts=getAvailableActionsForSelection(null,withUnrest,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveReturnUnrestChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Return Unrest", enabled:true, cardId:"u1" });
    expect(acts[1].enabled).toBe(false);
  });
  it("pending selected discard-cost actions expose card combinations",()=> {
    const withDiscard = {
      ...G,
      cardDb: {
        ...G.cardDb,
        c2:{id:"c2",displayName:"Card2",type:"action",cardType:"action",suit:"civilized"},
        c3:{id:"c3",displayName:"Card3",type:"action",cardType:"action",suit:"civilized"}
      },
      pendingDiscardChoice:{playerId:"0",sourceCardId:"discard_source",cardIds:["c1","c2","c3"],count:2}
    };
    const acts=getAvailableActionsForSelection(null,withDiscard,ctx);
    expect(getPendingUiState(withDiscard,ctx)).toMatchObject({
      title:"Pending Discard",
      detail:"Choose 2 cards from 3 options"
    });
    expect(acts.map((a)=>a.action)).toEqual(["resolveDiscardChoice","resolveDiscardChoice","resolveDiscardChoice","endTurn"]);
    expect(acts.map((a)=>a.cardIds)).toEqual([["c1","c2"],["c1","c3"],["c2","c3"],undefined]);
    expect(acts[0]).toMatchObject({ label:"Discard Card1, Card2", enabled:true });
    expect(acts[3].enabled).toBe(false);
  });
  it("pending Place On Deck choice actions expose eligible cards",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingPlaceOnDeckChoice:{playerId:"0",sourceCardId:"place_source",sourceZone:"discard",cardIds:["c1","m1"]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolvePlaceOnDeckChoice","resolvePlaceOnDeckChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Place Card1 on deck", enabled:true, cardId:"c1" });
    expect(acts[1]).toMatchObject({ label:"Place Market1 on deck", enabled:true, cardId:"m1" });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Give Card choice actions expose card and recipient pairs",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingGiveCardChoice:{playerId:"0",sourceCardId:"give_source",cardIds:["c1"],recipientPlayerIds:["1","2"]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveGiveCardChoice","resolveGiveCardChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Give Card1 to player 1", enabled:true, cardId:"c1", recipientPlayerId:"1" });
    expect(acts[1]).toMatchObject({ label:"Give Card1 to player 2", enabled:true, cardId:"c1", recipientPlayerId:"2" });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Swap choice actions expose eligible card pairs",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingSwapChoice:{playerId:"0",sourceCardId:"swap_source",sourceZone:"hand",choices:[{cardId:"c1",marketCardId:"m1"}]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveSwapChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Swap Card1 with Market1", enabled:true, cardId:"c1", marketCardId:"m1" });
    expect(acts[1].enabled).toBe(false);
  });
  it("pending short Unrest allocation exposes recipient choices",()=> {
    const acts=getAvailableActionsForSelection(null,{...G,pendingUnrestAllocationChoice:{playerId:"0",recipientPlayerIds:["1","0"],countPerPlayer:1,availableUnrestCardIds:["u1"]}},ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveUnrestAllocationChoice","resolveUnrestAllocationChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Give Unrest to 1", enabled:true, recipientPlayerIds:["1"] });
    expect(acts[1]).toMatchObject({ label:"Give Unrest to 0", enabled:true, recipientPlayerIds:["0"] });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Solstice order choice exposes available card orders",()=> {
    const withSolsticeOrder = {
      ...G,
      cardDb: {...G.cardDb, s1:{id:"s1",displayName:"Spend"},g1:{id:"g1",displayName:"Gain"}},
      pendingSolsticeOrderChoice:{playerId:"0",phase:"on_solstice",cardIds:["s1","g1"]}
    };
    const acts=getAvailableActionsForSelection(null,withSolsticeOrder,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveSolsticeOrderChoice","resolveSolsticeOrderChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Resolve Spend then Gain", enabled:true, cardIds:["s1","g1"] });
    expect(acts[1]).toMatchObject({ label:"Resolve Gain then Spend", enabled:true, cardIds:["g1","s1"] });
    expect(acts[2].enabled).toBe(false);
  });
  it("pending Look order choice exposes available card orders",()=> {
    const withLookOrder = {
      ...G,
      cardDb: {...G.cardDb, a:{id:"a",displayName:"A"},b:{id:"b",displayName:"B"}},
      pendingLookOrderChoice:{playerId:"0",source:"deck",cardIds:["a","b"]}
    };
    const acts=getAvailableActionsForSelection(null,withLookOrder,ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveLookOrderChoice","resolveLookOrderChoice","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Return A then B", enabled:true, cardIds:["a","b"] });
    expect(acts[1]).toMatchObject({ label:"Return B then A", enabled:true, cardIds:["b","a"] });
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
  it("pending cleanup market resource exposes eligible market cards",()=> {
    const acts=getAvailableActionsForSelection(null, {...G,pendingCleanupMarketResourceChoice:{playerId:"0",cardIds:["m1"]}}, ctx);
    expect(acts.map((a)=>a.action)).toEqual(["resolveCleanupMarketResource","endTurn"]);
    expect(acts[0]).toMatchObject({ label:"Place cleanup resource on Market1", enabled:true, cardId:"m1" });
    expect(acts[1].enabled).toBe(false);
  });
  it("does not expose direct market Acquire when materials are too low",()=> {
    const poor = {...G,players:{"0":{...G.players["0"],resources:{materials:1}}}};
    const acquire=getAvailableActionsForSelection({kind:"market_slot",id:"m1"},poor,ctx).find(a=>a.action==="acquire");
    expect(acquire).toBeUndefined();
  });
  it("does not expose direct market Acquire when goods can cover the material shortfall",()=> {
    const withGoods = {...G,players:{"0":{...G.players["0"],resources:{materials:1,goods:1}}}};
    const acquire=getAvailableActionsForSelection({kind:"market_slot",id:"m1"},withGoods,ctx).find(a=>a.action==="acquire");
    expect(acquire).toBeUndefined();
  });
  it("does not expose direct market Acquire for structured acquire costs",()=> {
    const structured = {
      ...G,
      cardDb:{...G.cardDb,m2:{id:"m2",displayName:"Market2",cost:{materials:1,knowledge:1,goods:1}}},
      market:["m2"],
      players:{"0":{...G.players["0"],resources:{materials:1,knowledge:0,goods:1}}}
    };
    const acquire=getAvailableActionsForSelection({kind:"market_slot",id:"m2"},structured,ctx).find(a=>a.action==="acquire");
    expect(acquire).toBeUndefined();
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
  it("offers Profit for a completed Trade Route in play when an Action token is available",()=> {
    const withRoute = {
      ...G,
      options: { enabledExpansions: ["trade_routes"] },
      cardDb: {...G.cardDb, tr1:{id:"tr1",displayName:"Route",type:"trade_route",cardType:"trade_route",suit:"trade_route",effects:[{trigger:"on_play",op:"profit",effects:[]}]}},
      cardStates: { tr1: { resources: { goods: 3 } } },
      players:{"0":{...G.players["0"],playArea:["tr1"],actionsRemaining:1}}
    };
    const profit=getAvailableActionsForSelection({kind:"play_area_card",id:"tr1"},withRoute,ctx).find(a=>a.action==="profit");
    expect(profit).toMatchObject({ label:"Profit", enabled:true, cardId:"tr1" });
  });
  it("does not offer Profit when Trade Routes is disabled",()=> {
    const withRoute = {
      ...G,
      options: { enabledExpansions: [] },
      cardDb: {...G.cardDb, tr1:{id:"tr1",displayName:"Route",type:"trade_route",cardType:"trade_route",suit:"trade_route",effects:[{trigger:"on_play",op:"profit",effects:[]}]}},
      cardStates: { tr1: { resources: { goods: 3 } } },
      players:{"0":{...G.players["0"],playArea:["tr1"],actionsRemaining:1}}
    };
    const profit=getAvailableActionsForSelection({kind:"play_area_card",id:"tr1"},withRoute,ctx).find(a=>a.action==="profit");
    expect(profit).toBeUndefined();
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
  it("disables exhaust abilities on already exhausted cards",()=> {
    const exhausted = {
      ...G,
      cardDb: {...G.cardDb, e1:{id:"e1",displayName:"Engine",type:"in_play",cardType:"in_play",effects:[{trigger:"on_exhaust",op:"gain_resource",resource:"knowledge",amount:1}]}},
      cardStates: { e1: { exhausted: true } },
      players:{"0":{...G.players["0"],playArea:["e1"],exhaustTokensAvailable:1}}
    };
    const exhaust=getAvailableActionsForSelection({kind:"play_area_card",id:"e1"},exhausted,ctx).find(a=>a.action==="exhaust");
    expect(exhaust?.enabled).toBe(false);
    expect(exhaust?.reason).toBe("Card already exhausted");
  });
  it("disables exhaust abilities when an Exhaust token is already on the card",()=> {
    const exhausted = {
      ...G,
      cardDb: {...G.cardDb, e1:{id:"e1",displayName:"Engine",type:"in_play",cardType:"in_play",effects:[{trigger:"on_exhaust",op:"gain_resource",resource:"knowledge",amount:1}]}},
      cardStates: { e1: { exhaustTokens: 1 } },
      players:{"0":{...G.players["0"],playArea:["e1"],exhaustTokensAvailable:1}}
    };
    const exhaust=getAvailableActionsForSelection({kind:"play_area_card",id:"e1"},exhausted,ctx).find(a=>a.action==="exhaust");
    expect(exhaust?.enabled).toBe(false);
    expect(exhaust?.reason).toBe("Card already exhausted");
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
