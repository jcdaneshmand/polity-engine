import { describe, expect, it } from "vitest";
import { loadNationDb } from "../nations/nationLoader";
import { createInitialGameState } from "../game/initialState";
import { runEffects } from "../cards/effectRunner";
import fs from "node:fs";
import { loadCardDbWithOptionalPrivateData } from "../cards/privateCardLoader";
import { playCard } from "../game/moves";

const fakeCardDb = {
  c1: { id: "c1", displayName: "C1", type: "action", cost: 1, tags: [], effects: [] },
  trade_route_only: { id: "trade_route_only", displayName: "TR", type: "action", cost: 1, tags: ["trade_route"], effects: [] }
} as any;

describe("trade_routes expansion toggle", () => {

  it("trade_routes off excludes Trade Route-only cards", () => {
    const path = "./tmp-cards.json";
    fs.writeFileSync(path, JSON.stringify([
      { id:"a", displayName:"A", suit:"region", cardType:"action", cost:{materials:0,population:0,progress:0,goods:0}, developmentCost:{materials:0,population:0,progress:0,goods:0}, vp:{mode:"none",value:null}, startingLocation:"box", isTradeRouteExpansion:false, effects:[], tags:[], implemented:false, tested:false, requiredExpansions:[] },
      { id:"b", displayName:"B", suit:"trade_route", cardType:"trade_route", cost:{materials:0,population:0,progress:0,goods:0}, developmentCost:{materials:0,population:0,progress:0,goods:0}, vp:{mode:"none",value:null}, startingLocation:"box", isTradeRouteExpansion:true, effects:[], tags:[], implemented:false, tested:false, requiredExpansions:["trade_routes"] }
    ]));
    const off = loadCardDbWithOptionalPrivateData({ usePrivate:true, privatePath:path, enabledExpansions:[] });
    const on = loadCardDbWithOptionalPrivateData({ usePrivate:true, privatePath:path, enabledExpansions:["trade_routes"] });
    fs.unlinkSync(path);
    expect(off.b).toBeUndefined();
    expect(on.b).toBeDefined();
  });

  it("preserves imported private card VP metadata", () => {
    const path = "./tmp-cards-vp.json";
    fs.writeFileSync(path, JSON.stringify([
      { id:"vp_card", displayName:"VP", suit:"region", cardType:"action", cost:{materials:0,population:0,progress:0,goods:0}, developmentCost:{materials:0,population:0,progress:0,goods:0}, vp:{mode:"variable",value:12}, startingLocation:"box", isTradeRouteExpansion:false, effects:[], tags:[], implemented:true, tested:true, requiredExpansions:[] }
    ]));

    const cards = loadCardDbWithOptionalPrivateData({ usePrivate:true, privatePath:path, enabledExpansions:[] });
    fs.unlinkSync(path);

    expect(cards.vp_card?.vp).toEqual({ mode: "variable", value: 12 });
  });

  it("maps imported private Development costs to engine resource names", () => {
    const path = "./tmp-cards-development-cost.json";
    fs.writeFileSync(path, JSON.stringify([
      { id:"dev_card", displayName:"Development", suit:"civilized", cardType:"action", cost:{materials:0,population:0,progress:0,goods:0}, developmentCost:{materials:1,population:2,progress:3,goods:4}, vp:{mode:"none",value:null}, startingLocation:"development_area", isTradeRouteExpansion:false, effects:[], tags:[], implemented:true, tested:true, requiredExpansions:[] }
    ]));

    const cards = loadCardDbWithOptionalPrivateData({ usePrivate:true, privatePath:path, enabledExpansions:[] });
    fs.unlinkSync(path);

    expect(cards.dev_card?.developmentCost).toEqual({ materials: 1, influence: 2, knowledge: 3, goods: 4 });
    expect((cards.dev_card?.developmentCost as any).population).toBeUndefined();
    expect((cards.dev_card?.developmentCost as any).progress).toBeUndefined();
  });

  it("nation requiring trade_routes rejected when disabled", () => {
    const nations = loadNationDb({ enabledExpansions: [] });
    expect(nations["test_nation_river_court"]).toBeUndefined();
  });

  it("nation requiring trade_routes accepted when enabled", () => {
    const nations = loadNationDb({ enabledExpansions: ["trade_routes"] });
    expect(nations["test_nation_river_court"]).toBeDefined();
  });

  it("trade_routes on includes setup modifications", () => {
    const G = createInitialGameState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: ["trade_routes"], enabledVariants: [] } });
    expect(G.players["0"].powerArea).toContain("test_action_civic_assembly");
    expect(G.players["0"].exhaustTokensBase).toBeGreaterThan(1);
  });

  it("player tokens differ when trade_routes enabled", () => {
    const off = createInitialGameState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] } });
    const on = createInitialGameState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: ["trade_routes"], enabledVariants: [] } });
    expect(on.players["0"].exhaustTokensBase).toBe(off.players["0"].exhaustTokensBase + 1);
  });

  it("trade effect option ignored when trade_routes disabled", () => {
    const G = createInitialGameState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] } });
    runEffects({ G, playerId: "0", enabledExpansions: [] }, [{ trigger: "on_play", op: "trade" } as any]);
    expect(G.log.at(-1)?.message).toContain("Ignored trade");
  });

  it("played card effects receive the enabled trade_routes expansion context", () => {
    const G = createInitialGameState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: ["trade_routes"], enabledVariants: [] } });
    G.cardDb.trade_action = {
      id: "trade_action",
      displayName: "Trade Action",
      type: "action",
      cardType: "action",
      suit: "civic",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "trade" } as any]
    };
    G.players["0"].hand = ["trade_action"];
    G.players["0"].resources.goods = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    Object.values(G.players).forEach((player) => {
      player.playArea = [];
    });

    playCard({ G, ctx: { currentPlayer: "0" } as any }, "trade_action");

    expect(G.log.some((entry) => entry.message.includes("Ignored trade"))).toBe(false);
    expect(G.log.some((entry) => entry.message === "UnsupportedEffectOp(trade)")).toBe(false);
    expect(G.log.some((entry) => entry.message === "TradeResolved(goods_to_progress)")).toBe(true);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });
});
