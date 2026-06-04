import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";
import { runEffects } from "../cards/effectRunner";
import { playCard, profitCard, resolveReactiveExhaustChoice, resolveTradeChoice } from "../game/moves";

function addScoringUnrest(G: any, counts: Record<string, number>) {
  for (const [playerId, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1) {
      const id = `trade_collapse_score_unrest_${playerId}_${i}`;
      G.cardDb[id] = {
        id,
        displayName: "Unrest",
        type: "unrest",
        cardType: "unrest",
        suit: "unrest",
        cost: 0,
        tags: ["unrest"],
        effects: []
      };
      G.players[playerId].discard.push(id);
    }
  }
}

describe("trade routes module", () => {
  it("enabled adds exhaust token", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    expect(G.players["0"].exhaustTokensBase).toBeGreaterThan(1);
  });
  it("trade op logs ignore when disabled", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:[], enabledVariants:[] } });
    runEffects({ G, playerId:"0", enabledExpansions:[] as any }, [{ trigger:"on_play", op:"trade" } as any]);
    expect(G.log.at(-1)?.message).toContain("Ignored trade");
  });

  it("does not resolve a Profit action when trade_routes is disabled", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:[], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    profitCard({ G, ctx: { currentPlayer: "0" } as any }, "completed_route");

    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].playArea).toEqual(["completed_route"]);
    expect(G.players["0"].history).not.toContain("completed_route");
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates?.completed_route?.resources?.goods).toBe(3);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(profitCard): trade_routes_disabled");
  });

  it("played Trade Route cards stay in play and resolve Commerce immediately", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.route = {
      id: "route",
      displayName: "Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] } as any]
    };
    G.players["0"].hand = ["route"];
    G.players["0"].playArea = [];
    G.players["0"].discard = [];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 1;

    playCard({ G, ctx: { currentPlayer: "0" } as any }, "route");

    expect(G.players["0"].playArea).toContain("route");
    expect(G.players["0"].discard).not.toContain("route");
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("does not play Profit-only text as a normal hand action", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    const card = "profit_only_action";
    G.cardDb[card] = {
      id: card,
      displayName: "Profit Only",
      type: "action",
      cardType: "action",
      suit: "civic",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx: { currentPlayer: "0" } as any }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("offers only the skip path for optional Profit when the source route is not complete", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.incomplete_route = {
      id: "incomplete_route",
      displayName: "Incomplete Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].playArea = ["incomplete_route"];
    G.cardStates = { incomplete_route: { resources: { goods: 2 } } };

    runEffects({ G, playerId:"0", selfCardId:"incomplete_route", enabledExpansions:["trade_routes"] }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "profit", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "incomplete_route",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(incomplete_route/options=1)");
  });

  it("trade spends Goods to gain Progress when enabled and no route is selected", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.knowledge = 0;

    const resolved = runEffects({ G, playerId:"0", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"trade" } as any]);

    expect(resolved).toBe(true);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "UnsupportedEffectOp(trade)")).toBe(false);
  });

  it("pauses an immediate Trade Goods-for-Progress fallback before later text", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.trade_source = {
      id: "trade_source",
      displayName: "Trade Source",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.progress_reactive_exhaust = {
      id: "progress_reactive_exhaust",
      displayName: "Progress Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "influence",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.players["0"].playArea = ["trade_source", "progress_reactive_exhaust"];
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].exhaustTokensAvailable = 1;

    const resolved = runEffects({ G, playerId:"0", selfCardId: "trade_source", enabledExpansions:["trade_routes"] }, [
      { trigger:"on_play", op:"trade" } as any,
      { trigger:"on_play", op:"gain_resource", resource:"materials", amount: 2 } as any
    ]);

    expect(resolved).toBe(true);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["progress_reactive_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "trade_source",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, "progress_reactive_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(2);
  });

  it("trade does not spend Goods when Progress supply makes fallback conversion impossible", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.knowledge = 0;
    G.resourceSupply = { knowledge: 0 };

    const resolved = runEffects({ G, playerId:"0", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"trade" } as any]);

    expect(resolved).toBe(false);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("pauses after a Trade Goods-for-Progress fallback for reactive Exhaust before later text", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.trade_source = {
      id: "trade_source",
      displayName: "Trade Source",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.progress_reactive_exhaust = {
      id: "progress_reactive_exhaust",
      displayName: "Progress Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "influence",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.players["0"].playArea = ["trade_source", "progress_reactive_exhaust"];
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].exhaustTokensAvailable = 1;
    G.pendingTradeChoice = {
      playerId: "0",
      sourceCardId: "trade_source",
      routeCardIds: [],
      allowGoodsForProgress: true,
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 } as any]
    };

    resolveTradeChoice({ G, ctx: { currentPlayer: "0" } as any });

    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["progress_reactive_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "trade_source",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, "progress_reactive_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(2);
  });

  it("trade effects fall back to the game options expansion context", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.knowledge = 0;

    const resolved = runEffects({ G, playerId:"0" }, [{ trigger:"on_play", op:"trade" } as any]);

    expect(resolved).toBe(true);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Ignored trade because trade_routes is disabled.")).toBe(false);
  });

  it("trade with available routes waits for the player to choose route Commerce or Goods for Progress", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.own_route = {
      id: "own_route",
      displayName: "Own Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }] } as any]
    };
    G.players["0"].playArea = ["own_route"];
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.materials = 0;

    const resolved = runEffects({ G, playerId:"0", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"trade" } as any]);

    expect(resolved).toBe(true);
    expect(G.pendingTradeChoice).toEqual({ playerId: "0", routeCardIds: ["own_route"], allowGoodsForProgress: true });
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.cardStates?.own_route?.resources?.goods).toBeUndefined();
  });

  it("trade choices include imported cards with a Trade Route suit icon", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.imported_route = {
      id: "imported_route",
      displayName: "Imported Route",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: ["suit:trade_route"],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }] } as any]
    };
    G.players["0"].playArea = ["imported_route"];
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.knowledge = 0;

    const resolved = runEffects({ G, playerId:"0", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"trade" } as any]);

    expect(resolved).toBe(true);
    expect(G.pendingTradeChoice).toEqual({ playerId: "0", routeCardIds: ["imported_route"], allowGoodsForProgress: true });
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates?.imported_route?.resources?.goods).toBeUndefined();
  });

  it("trade auto-resolves the only available route when no Goods fallback is legal", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.opponent_route = {
      id: "opponent_route",
      displayName: "Opponent Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }] } as any]
    };
    G.players["1"].playArea = ["opponent_route"];
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;

    const resolved = runEffects({ G, playerId:"0", enabledExpansions:["trade_routes"] }, [
      { trigger:"on_play", op:"trade" } as any,
      { trigger:"on_play", op:"gain_resource", resource:"influence", amount: 1 } as any
    ]);

    expect(resolved).toBe(true);
    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.opponent_route?.resources?.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.influence).toBe(1);
  });

  it("resolving a Trade route choice places Goods on that route and resolves Commerce", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.own_route = {
      id: "own_route",
      displayName: "Own Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }] } as any]
    };
    G.players["0"].playArea = ["own_route"];
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.materials = 0;
    G.pendingTradeChoice = { playerId: "0", routeCardIds: ["own_route"], allowGoodsForProgress: true };

    resolveTradeChoice({ G, ctx: { currentPlayer: "0" } as any }, "own_route");

    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.cardStates?.own_route?.resources?.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(2);
  });

  it("keeps a Trade route choice pending when its Commerce effects fail", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.own_route = {
      id: "own_route",
      displayName: "Own Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }] } as any]
    };
    G.players["0"].playArea = ["own_route"];
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.materials = 0;
    G.pendingTradeChoice = { playerId: "0", routeCardIds: ["own_route"], allowGoodsForProgress: true };

    resolveTradeChoice({ G, ctx: { currentPlayer: "0" } as any }, "own_route");

    expect(G.pendingTradeChoice).toEqual({ playerId: "0", routeCardIds: ["own_route"], allowGoodsForProgress: true });
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.cardStates?.own_route?.resources?.goods).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveTradeChoice): trade_choice_failed(own_route)");
  });

  it("resolving an opponent Trade route choice adds Goods from supply, gains Progress, and resolves Commerce for the active player", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.opponent_route = {
      id: "opponent_route",
      displayName: "Opponent Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }] } as any]
    };
    G.players["1"].playArea = ["opponent_route"];
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["1"].resources.materials = 0;
    G.pendingTradeChoice = { playerId: "0", routeCardIds: ["opponent_route"], allowGoodsForProgress: false };

    resolveTradeChoice({ G, ctx: { currentPlayer: "0" } as any }, "opponent_route");

    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.opponent_route?.resources?.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["1"].resources.materials).toBe(0);
  });

  it("pauses after an opponent Trade route Progress reward for reactive Exhaust before Commerce", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.opponent_route = {
      id: "opponent_route",
      displayName: "Opponent Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }] } as any]
    };
    G.cardDb.progress_reactive_exhaust = {
      id: "progress_reactive_exhaust",
      displayName: "Progress Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "influence",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.players["0"].playArea = ["progress_reactive_exhaust"];
    G.players["1"].playArea = ["opponent_route"];
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].exhaustTokensAvailable = 1;
    G.pendingTradeChoice = { playerId: "0", routeCardIds: ["opponent_route"], allowGoodsForProgress: false };

    resolveTradeChoice({ G, ctx: { currentPlayer: "0" } as any }, "opponent_route");

    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["progress_reactive_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "opponent_route",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, "progress_reactive_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(2);
  });

  it("does not resolve an opponent Trade route choice when no Goods token can be placed from supply", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.opponent_route = {
      id: "opponent_route",
      displayName: "Opponent Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "commerce", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }] } as any]
    };
    G.players["1"].playArea = ["opponent_route"];
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.resourceSupply = { goods: 0, knowledge: 1, materials: 2 };
    G.pendingTradeChoice = { playerId: "0", routeCardIds: ["opponent_route"], allowGoodsForProgress: false };

    resolveTradeChoice({ G, ctx: { currentPlayer: "0" } as any }, "opponent_route");

    expect(G.pendingTradeChoice).toEqual({ playerId: "0", routeCardIds: ["opponent_route"], allowGoodsForProgress: false });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.cardStates?.opponent_route?.resources?.goods).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveTradeChoice): trade_choice_failed(opponent_route)");
  });

  it("profit collects Goods from a completed route, moves it to history, and resolves Profit effects", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 2 }] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    const resolved = runEffects({ G, playerId:"0", selfCardId:"completed_route", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"profit", destination: "history", effects: [{ trigger:"on_play", op:"gain_resource", resource:"knowledge", amount: 2 }] } as any]);

    expect(resolved).toBe(true);
    expect(G.players["0"].playArea).not.toContain("completed_route");
    expect(G.players["0"].history).toContain("completed_route");
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.cardStates?.completed_route).toBeUndefined();
  });

  it("profit routes History-bound cards through no-History discard replacement", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].resources.goods = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_history", "discard_instead_of_history"] as any,
      zoneOverrides: [{ op: "disable_history", replacementBehavior: "discard" } as any]
    };

    const resolved = runEffects({ G, playerId:"0", selfCardId:"completed_route", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"profit", destination: "history", effects: [] } as any]);

    expect(resolved).toBe(true);
    expect(G.players["0"].playArea).not.toContain("completed_route");
    expect(G.players["0"].history).not.toContain("completed_route");
    expect(G.players["0"].discard).toContain("completed_route");
    expect(G.players["0"].resources.goods).toBe(3);
  });

  it("profit routes History-bound cards through a Nation History replacement zone", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].resources.goods = 0;
    G.players["0"].sideAreas = { sunken: [] };
    G.cardStates = { completed_route: { resources: { goods: 3 } } };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
    };

    const resolved = runEffects({ G, playerId:"0", selfCardId:"completed_route", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"profit", destination: "history", effects: [] } as any]);

    expect(resolved).toBe(true);
    expect(G.players["0"].playArea).not.toContain("completed_route");
    expect(G.players["0"].history).not.toContain("completed_route");
    expect(G.players["0"].sideAreas?.sunken).toEqual(["completed_route"]);
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.log).toContainEqual(expect.objectContaining({ message: "ProfitResolved(completed_route->sunken)" }));
  });

  it("profit moves a completed route to discard unless the effect specifies another destination", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    const resolved = runEffects({ G, playerId:"0", selfCardId:"completed_route", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"profit", effects: [{ trigger:"on_play", op:"gain_resource", resource:"knowledge", amount: 1 }] } as any]);

    expect(resolved).toBe(true);
    expect(G.players["0"].playArea).not.toContain("completed_route");
    expect(G.players["0"].discard).toContain("completed_route");
    expect(G.players["0"].history).not.toContain("completed_route");
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("profit moves garrisoned cards with the completed route", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", effects: [] } as any]
    };
    G.cardDb.garrisoned_card = {
      id: "garrisoned_card",
      displayName: "Garrisoned Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.materials = 0;
    G.cardStates = {
      completed_route: { resources: { goods: 3 }, garrisonedCardIds: ["garrisoned_card"] },
      garrisoned_card: { resources: { materials: 1 } }
    };

    const resolved = runEffects({ G, playerId:"0", selfCardId:"completed_route", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"profit", effects: [] } as any]);

    expect(resolved).toBe(true);
    expect(G.players["0"].discard).toEqual(["completed_route", "garrisoned_card"]);
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.cardStates?.completed_route).toBeUndefined();
    expect(G.cardStates?.garrisoned_card).toBeUndefined();
  });

  it("matches source-suited reactive Exhausts against garrisoned resources collected by Profit", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] } as any]
    };
    G.cardDb.garrisoned_card = {
      id: "garrisoned_card",
      displayName: "Garrisoned Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.child_resource_reactive_exhaust = {
      id: "child_resource_reactive_exhaust",
      displayName: "Child Resource Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "influence",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };
    G.players["0"].playArea = ["completed_route", "child_resource_reactive_exhaust"];
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = {
      completed_route: { resources: { goods: 3 }, garrisonedCardIds: ["garrisoned_card"] },
      garrisoned_card: { resources: { knowledge: 1 } }
    };

    const resolved = runEffects({ G, playerId:"0", selfCardId:"completed_route", enabledExpansions:["trade_routes"] }, [{ trigger:"on_play", op:"profit", effects: [{ trigger:"on_play", op:"gain_resource", resource:"materials", amount:1 }] } as any]);

    expect(resolved).toBe(true);
    expect(G.players["0"].discard).toEqual(["completed_route", "garrisoned_card"]);
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["child_resource_reactive_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "completed_route",
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: "garrisoned_card",
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, "child_resource_reactive_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("profit action spends an Action token to resolve a completed Trade Route", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    profitCard({ G, ctx: { currentPlayer: "0" } as any }, "completed_route");

    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].history).toContain("completed_route");
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("profit action treats imported cards with a Trade Route suit icon as Trade Routes", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.imported_route = {
      id: "imported_route",
      displayName: "Imported Route",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: ["suit:trade_route"],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.players["0"].playArea = ["imported_route"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { imported_route: { resources: { goods: 3 } } };

    profitCard({ G, ctx: { currentPlayer: "0" } as any }, "imported_route");

    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].history).toContain("imported_route");
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "InvalidMove(profitCard): card_not_trade_route_in_play(imported_route)")).toBe(false);
  });

  it("does not resolve a Profit action outside Activate turns", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.currentTurnType = "revolt";
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    profitCard({ G, ctx: { currentPlayer: "0" } as any }, "completed_route");

    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].playArea).toEqual(["completed_route"]);
    expect(G.players["0"].history).not.toContain("completed_route");
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates?.completed_route?.resources?.goods).toBe(3);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(profitCard): turn_type_not_activate(revolt)");
  });

  it("pauses after collecting Profit Goods for a resource reactive Exhaust before resolving Profit effects", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.cardDb.goods_reactive_exhaust = {
      id: "goods_reactive_exhaust",
      displayName: "Goods Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "influence",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "goods" }
      } as any]
    };
    G.players["0"].playArea = ["completed_route", "goods_reactive_exhaust"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    profitCard({ G, ctx: { currentPlayer: "0" } as any }, "completed_route");

    expect(G.players["0"].history).toContain("completed_route");
    expect(G.cardStates?.completed_route?.actionTokens).toBe(1);
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["goods_reactive_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "completed_route",
      trigger: "after_gain_resource",
      resource: "goods"
    });

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, "goods_reactive_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.goods_reactive_exhaust?.exhaustTokens).toBe(1);
  });

  it("does not resolve a Profit action without an available Action token", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    profitCard({ G, ctx: { currentPlayer: "0" } as any }, "completed_route");

    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.players["0"].playArea).toEqual(["completed_route"]);
    expect(G.players["0"].history).not.toContain("completed_route");
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(profitCard): no_action_tokens_available");
  });

  it("rolls back a Profit action when its Profit effects fail", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "profit", destination: "history", effects: [{ trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 1 }] } as any]
    };
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    profitCard({ G, ctx: { currentPlayer: "0" } as any }, "completed_route");

    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].playArea).toEqual(["completed_route"]);
    expect(G.players["0"].history).not.toContain("completed_route");
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.cardStates?.completed_route?.resources?.goods).toBe(3);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(profitCard): profit_effect_failed(completed_route)");
  });

  it("keeps Collapse from a Profit action instead of rolling the route back", () => {
    const G = createInitialGameState({ options: { playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:[] } });
    G.cardDb.completed_route = {
      id: "completed_route",
      displayName: "Completed Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_play",
        op: "profit",
        destination: "history",
        effects: [
          { trigger: "on_play", op: "take_unrest", count: 1 },
          { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
        ]
      } as any]
    };
    G.unrestPile = [];
    G.players["0"].playArea = ["completed_route"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    addScoringUnrest(G, { "0": 1, "1": 2 });
    G.cardStates = { completed_route: { resources: { goods: 3 } } };

    profitCard({ G, ctx: { currentPlayer: "0" } as any }, "completed_route");

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1, "1": 2 }
    });
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.players["0"].playArea).not.toContain("completed_route");
    expect(G.players["0"].history).toContain("completed_route");
    expect(G.players["0"].resources.goods).toBe(3);
    expect(G.players["0"].resources.knowledge).toBe(0);
  });
});
