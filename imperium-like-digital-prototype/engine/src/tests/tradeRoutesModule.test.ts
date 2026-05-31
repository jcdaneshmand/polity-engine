import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";
import { runEffects } from "../cards/effectRunner";
import { playCard, profitCard, resolveTradeChoice } from "../game/moves";

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

  it("resolving an opponent Trade route choice adds Goods from supply, gains Progress, and resolves owner Commerce", () => {
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
    G.players["1"].resources.materials = 0;
    G.pendingTradeChoice = { playerId: "0", routeCardIds: ["opponent_route"], allowGoodsForProgress: false };

    resolveTradeChoice({ G, ctx: { currentPlayer: "0" } as any }, "opponent_route");

    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.opponent_route?.resources?.goods).toBe(1);
    expect(G.players["1"].resources.materials).toBe(2);
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
