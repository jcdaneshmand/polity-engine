import { describe, expect, it } from "vitest";
import { loadNationDb } from "../nations/nationLoader";
import { createInitialGameState } from "../game/initialState";
import { runEffects } from "../cards/effectRunner";
import fs from "node:fs";
import { loadCardDbWithOptionalPrivateData } from "../cards/privateCardLoader";

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
});
