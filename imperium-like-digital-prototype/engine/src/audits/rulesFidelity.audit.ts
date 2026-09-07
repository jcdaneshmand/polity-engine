import { describe, expect, it } from "vitest";
import { runEffects } from "../cards/effectRunner";
import type { Effect } from "../cards/effects";
import { breakThrough } from "../game/breakThrough";
import { acquireFromExile } from "../game/exile";
import { createInitialState } from "../game/initialState";
import { resolveChoice } from "../game/moves";
import { payResourceCosts } from "../game/payments";
import { redactGameStateForPlayer } from "../game/playerView";
import { scoreBot, scorePlayer, triggerCollapse, triggerScoring } from "../game/scoring";
import type { Card, GameState } from "../game/state";
import { onTurnBegin, onTurnEnd } from "../game/turn";
import { drawCardWithReshuffleLifecycle } from "../game/zones";
import { defaultGameOptions } from "../options/gameOptions";
import { botAcquireFromMarket, botBreakThrough } from "../solo/botMarket";
import { resolveBotTrade } from "../solo/botTradeRoutesResolver";

// Independent rulebook expectations, not expected-failure assertions. See the audit report.
function card(id: string, overrides: Partial<Card> = {}): Card {
  return { id, displayName: id, type: "action", cardType: "action", suit: "none", cost: 0, effects: [], tags: [], ...overrides };
}

function fixture(solo = false): GameState {
  const G = createInitialState({
    usePrivateData: false,
    randomSeed: "rules-fidelity-public-2026-09-05",
    options: { ...defaultGameOptions, playerCount: solo ? 1 : 2, mode: solo ? "solo" : "multiplayer" }
  });
  for (const p of Object.values(G.players)) {
    p.hand = []; p.deck = []; p.discard = []; p.playArea = []; p.history = [];
    p.nationDeck = []; p.developmentArea = []; p.powerArea = []; p.stateArea = [];
    p.accessionCardId = undefined;
    p.handSize = 0;
    p.actionTokensBase = 3; p.actionTokensAvailable = 3; p.actionsRemaining = 3;
    p.exhaustTokensBase = 5; p.exhaustTokensAvailable = 5;
    p.progressionTokens = { nationDeck: 0, developmentArea: 0 };
    p.resources = { materials: 0, knowledge: 0, influence: 0, goods: 0, unrest: 0 };
  }
  G.activeNationRulesets = {};
  G.cardDb = { reserve: card("reserve"), unrest_reserve: card("unrest_reserve", { type: "unrest", suit: "unrest" }) };
  G.cardStates = {};
  G.market = []; G.marketSlots = []; G.marketResources = {}; G.marketUnrest = {};
  G.marketDecks = { mainDeck: ["reserve"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
  G.marketDeckBottomCards = {};
  G.unrestPile = ["unrest_reserve"];
  G.log = [];
  if (G.solo) {
    const bot = G.solo.bot;
    bot.botDeck = []; bot.botDiscard = []; bot.botPlayArea = []; bot.botHistory = []; bot.botDynastyDeck = ["reserve"];
    bot.slots = [];
    bot.resources = { materials: 0, knowledge: 0, influence: 0, goods: 0, unrest: 0 };
  }
  return G;
}

function progressionFixture(): GameState {
  const G = fixture();
  G.cardDb.new_nation = card("new_nation");
  G.cardDb.later_nation = card("later_nation");
  G.players["1"].nationDeck = ["new_nation", "later_nation"];
  return G;
}

describe("Horizons pp. 6, 15-16: token lifecycle", () => {
  it("R01 progresses with no Actions when an Exhaust is available", () => {
    const G = progressionFixture();
    G.players["1"].actionTokensAvailable = 0;
    G.players["1"].actionsRemaining = 0;
    expect(drawCardWithReshuffleLifecycle(G, "1", () => 0)).toBe("new_nation");
  });

  it("R02 does not progress when all Exhausts are spent", () => {
    const G = progressionFixture();
    G.players["1"].exhaustTokensAvailable = 0;
    expect(drawCardWithReshuffleLifecycle(G, "1", () => 0)).toBeNull();
    expect(G.players["1"].nationDeck).toEqual(["new_nation", "later_nation"]);
  });

  it("R03 consumes an Exhaust rather than an Action for progression", () => {
    const G = progressionFixture();
    expect(drawCardWithReshuffleLifecycle(G, "1", () => 0)).toBe("new_nation");
    expect([G.players["1"].actionTokensAvailable, G.players["1"].exhaustTokensAvailable]).toEqual([3, 4]);
  });

  it("R04 preserves inter-turn Exhaust spending at the next turn start", () => {
    const G = fixture();
    G.players["1"].exhaustTokensAvailable = 4;
    G.players["1"].progressionTokens = { nationDeck: 1, developmentArea: 0 };
    onTurnBegin(G, { currentPlayer: "1" } as any);
    expect(G.players["1"].exhaustTokensAvailable).toBe(4);
  });

  it("R05 cleanup resets token pools before drawing", () => {
    const G = fixture();
    const p = G.players["1"];
    p.actionTokensAvailable = 0; p.exhaustTokensAvailable = 0;
    p.progressionTokens = { nationDeck: 1, developmentArea: 0 };
    onTurnEnd(G, { currentPlayer: "1", playOrder: ["1", "2"] } as any);
    expect([p.actionTokensAvailable, p.exhaustTokensAvailable]).toEqual([3, 5]);
    expect(p.progressionTokens).toEqual({ nationDeck: 0, developmentArea: 0 });
  });

  it("R06 Draw-if-able does not trigger progression", () => {
    const G = progressionFixture();
    runEffects({ G, playerId: "1" }, [{ trigger: "on_play", op: "draw_if_able", count: 1 }]);
    expect(G.players["1"].nationDeck).toEqual(["new_nation", "later_nation"]);
    expect(G.players["1"].hand).toEqual([]);
  });

  it("R07 permits only one progression addition before cleanup", () => {
    const G = progressionFixture();
    expect(drawCardWithReshuffleLifecycle(G, "1", () => 0)).toBe("new_nation");
    expect(drawCardWithReshuffleLifecycle(G, "1", () => 0)).toBeNull();
    expect(G.players["1"].nationDeck).toEqual(["later_nation"]);
    expect(G.players["1"].progressionTokens).toEqual({ nationDeck: 1, developmentArea: 0 });
  });
});

describe("Horizons pp. 14, 39: payment and optional text", () => {
  const paidNoDraw: Effect[] = [
    { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
    { trigger: "on_play", op: "draw_if_able", count: 1 }
  ];

  it("R08 allows an optional payable cost even when its benefit cannot resolve", () => {
    const G = fixture();
    G.players["1"].resources.materials = 1;
    runEffects({ G, playerId: "1" }, [{ trigger: "on_play", op: "optional", effects: paidNoDraw }]);
    expect(G.pendingChoice?.choices).toHaveLength(2);
    resolveChoice({ G, ctx: { currentPlayer: "1" } as any }, 0);
    expect(G.players["1"].resources.materials).toBe(0);
  });

  it("R09 retains a payable Choose branch even when its benefit cannot resolve", () => {
    const G = fixture();
    G.players["1"].resources.materials = 1;
    runEffects({ G, playerId: "1" }, [{ trigger: "on_play", op: "choose_one", choices: [paidNoDraw, [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]] }]);
    expect(G.pendingChoice?.choices).toHaveLength(2);
  });

  it("R10 rejects an optional cost that cannot be paid", () => {
    const G = fixture();
    runEffects({ G, playerId: "1" }, [{ trigger: "on_play", op: "optional", effects: paidNoDraw }]);
    expect(G.pendingChoice?.choices).toEqual([[]]);
  });

  it("R11 accepts Progress substitution for odd Materials costs without change", () => {
    const G = fixture();
    G.players["1"].resources.knowledge = 2;
    expect(payResourceCosts(G, "1", { materials: 3 }, { knowledge: 2 })).toBe(true);
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect(G.players["1"].resources.materials).toBe(0);
  });

  it("R12 does not substitute Goods for a Progress cost", () => {
    const G = fixture();
    G.players["1"].resources.goods = 1;
    expect(payResourceCosts(G, "1", { knowledge: 1 }, { goods: 1 })).toBe(false);
    expect(G.players["1"].resources.goods).toBe(1);
  });
});

describe("Horizons pp. 16-17: Solstice and scoring", () => {
  it("R13 lets the recipient order an incoming Solstice effect with their own effects", () => {
    const G = fixture();
    G.cardDb.outgoing = card("outgoing", { type: "in_play", effects: [{ trigger: "on_solstice", op: "take_unrest", targetPlayerScope: "others", count: 1 }] });
    G.cardDb.returner = card("returner", { type: "in_play", effects: [{ trigger: "on_solstice", op: "return_unrest", sourceZones: ["discard"] }] });
    G.cardDb.held_unrest = card("held_unrest", { type: "unrest", suit: "unrest" });
    G.players["1"].playArea = ["outgoing"];
    G.players["2"].playArea = ["returner"];
    G.players["2"].discard = ["held_unrest"];
    onTurnEnd(G, { currentPlayer: "2", playOrder: ["1", "2"] } as any);
    expect(G.gameover).toBeUndefined();
    expect(G.pendingSolsticeOrderChoice?.playerId).toBe("2");
  });

  it.each([
    ["R14", 14],
    ["R15", { mode: "fixed", value: 14 }],
    ["R16", { mode: "conditional", condition: { op: "self_in_zone", zoneId: "history" }, trueValue: 14, falseValue: 0 }]
  ])("%s preserves literal non-variable human VP", (_id, vp) => {
    const G = fixture();
    G.cardDb.score = card("score", { vp: vp as Card["vp"] });
    G.players["1"].history = ["score"];
    expect(scorePlayer(G, "1")).toBe(14);
  });

  it("R17 enforces the variable-card maximum even with a larger formula cap", () => {
    const G = fixture();
    G.cardDb.score = card("score", { vp: { mode: "variable", value: 0, formula: { op: "count_resources", resource: "materials", amountEach: 1, cap: 20 } } as any });
    G.players["1"].history = ["score"];
    G.players["1"].resources.materials = 20;
    expect(scorePlayer(G, "1")).toBe(10);
  });

  it("R18 caps ordinary variable-card VP at ten", () => {
    const G = fixture();
    G.cardDb.score = card("score", { vp: { mode: "variable", value: 20 } as any });
    G.players["1"].history = ["score"];
    expect(scorePlayer(G, "1")).toBe(10);
  });

  it("R19 includes garrisoned cards but excludes undeveloped cards and hosted Progress", () => {
    const G = fixture();
    G.cardDb.host = card("host", { vp: 2 });
    G.cardDb.child = card("child", { vp: 3 });
    G.cardDb.unplayed = card("unplayed", { vp: 7 });
    G.players["1"].playArea = ["host"];
    G.players["1"].developmentArea = ["unplayed"];
    G.players["1"].resources.knowledge = 1;
    G.cardStates = { host: { garrisonedCardIds: ["child"], resources: { knowledge: 4 } } };
    expect(scorePlayer(G, "1")).toBe(6);
  });

  it("R20 Collapse supersedes pending normal scoring immediately", () => {
    const G = fixture();
    triggerScoring(G, "audit", "1");
    triggerCollapse(G, "unrest_pile_empty", "1");
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
  });
});

describe("Horizons pp. 17, 31, 36: terminal and keyword edge cases", () => {
  it("R30 triggers Collapse on taking the last Unrest, not the next request", () => {
    const G = fixture();
    runEffects({ G, playerId: "1" }, [{ trigger: "on_play", op: "take_unrest", count: 1 }]);
    expect(G.unrestPile).toHaveLength(0);
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
  });

  it("R31 stops the remaining sentence after the final Unrest leaves the pile", () => {
    const G = fixture();
    runEffects({ G, playerId: "1" }, [
      { trigger: "on_play", op: "take_unrest", count: 1 },
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 3 }
    ]);
    expect(G.players["1"].resources.knowledge).toBe(0);
  });

  it("R32 a failed human Break-through grants Progress, not Materials", () => {
    const G = fixture();
    breakThrough(G, { playerId: "1", suit: "region", source: "deck", count: 1 });
    expect([G.players["1"].resources.knowledge, G.players["1"].resources.materials]).toEqual([2, 0]);
  });

  it("R33 a failed Bot Break-through grants Progress, not Materials", () => {
    const G = fixture(true);
    botBreakThrough(G, G.solo!.bot, { suits: ["region"] });
    expect([G.solo!.bot.resources.knowledge, G.solo!.bot.resources.materials]).toEqual([2, 0]);
  });

  it("R34 acquiring an Exiled Region does not add Unrest", () => {
    const G = fixture();
    G.cardDb.region = card("region", { type: "region", suit: "region" });
    G.players["1"].exile = ["region"];
    expect(acquireFromExile(G, { playerId: "1", cardId: "region" })).toBe(true);
    expect(G.players["1"].hand).toEqual(["region"]);
  });

  it("R35 an Exiled Unrest card is not the Region exemption", () => {
    const G = fixture();
    G.cardDb.exiled_unrest = card("exiled_unrest", { type: "unrest", suit: "unrest" });
    G.players["1"].exile = ["exiled_unrest"];
    expect(acquireFromExile(G, { playerId: "1", cardId: "exiled_unrest" })).toBe(true);
    expect(G.players["1"].hand).toEqual(["exiled_unrest", "unrest_reserve"]);
  });
});

describe("Horizons pp. 30-32: solo adapters and valuation", () => {
  it("R21 includes the Bot when a human effect gives other players resources", () => {
    const G = fixture(true);
    const humanId = Object.keys(G.players)[0];
    runEffects({ G, playerId: humanId }, [{ trigger: "on_play", op: "gain_resource", targetPlayerScope: "others", resource: "materials", amount: 2 }]);
    expect(G.solo!.bot.resources.materials).toBe(2);
  });

  it("R22 adapts a human-imposed Bot draw into Bot deck-to-discard movement", () => {
    const G = fixture(true);
    G.cardDb.bot_draw = card("bot_draw");
    G.solo!.bot.botDeck = ["bot_draw"];
    const humanId = Object.keys(G.players)[0];
    runEffects({ G, playerId: humanId }, [{ trigger: "on_play", op: "draw", targetPlayerScope: "others", count: 1 }]);
    expect(G.solo!.bot.botDiscard).toEqual(["bot_draw"]);
  });

  it("R41 does not reshuffle the Bot discard for an imposed draw", () => {
    const G = fixture(true);
    G.cardDb.bot_discard = card("bot_discard");
    G.solo!.bot.botDiscard = ["bot_discard"];
    const humanId = Object.keys(G.players)[0];
    runEffects({ G, playerId: humanId }, [{ trigger: "on_play", op: "draw", targetPlayerScope: "others", count: 1 }]);
    expect(G.solo!.bot.botDeck).toEqual([]);
    expect(G.solo!.bot.botDiscard).toEqual(["bot_discard"]);
  });

  it("R42 routes human-imposed Unrest to the Bot deck", () => {
    const G = fixture(true);
    const humanId = Object.keys(G.players)[0];
    G.cardDb.solo_unrest = card("solo_unrest", { type: "unrest", cardType: "unrest", suit: "unrest" });
    G.cardDb.spare_unrest = card("spare_unrest", { type: "unrest", cardType: "unrest", suit: "unrest" });
    G.unrestPile = ["solo_unrest", "spare_unrest"];
    runEffects({ G, playerId: humanId }, [{ trigger: "on_play", op: "take_unrest", targetPlayerScope: "others", count: 1 }]);
    expect(G.solo!.bot.botDeck[0]).toBe("solo_unrest");
    expect(G.unrestPile).toEqual(["spare_unrest"]);
  });

  it("R23 preserves the Bot's fixed card VP above ten", () => {
    const G = fixture(true);
    G.cardDb.score = card("score", { vp: { mode: "fixed", value: 14 } as any });
    G.solo!.bot.botHistory = ["score"];
    expect(scoreBot(G)).toBe(14);
  });

  it("R24 uses non-Progress market tokens only as a tie-breaker, not printed VP", () => {
    const G = fixture(true);
    G.cardDb.low = card("low", { suit: "region", vp: 0 });
    G.cardDb.high = card("high", { suit: "region", vp: 3 });
    G.market = ["low", "high"];
    G.marketResources = { low: { materials: 10 } };
    expect(botAcquireFromMarket(G, G.solo!.bot)).toBe(true);
    expect(G.solo!.bot.botDeck[0]).toBe("high");
  });

  it("R25 breaks equal Bot card values by tokens before slot order", () => {
    const G = fixture(true);
    G.cardDb.first = card("first", { suit: "region", vp: 3 });
    G.cardDb.second = card("second", { suit: "region", vp: 3 });
    G.market = ["first", "second"];
    G.marketResources = { second: { materials: 1 } };
    expect(botAcquireFromMarket(G, G.solo!.bot)).toBe(true);
    expect(G.solo!.bot.botDeck[0]).toBe("second");
  });
});

describe("Horizons pp. 36-38: deck and visibility boundaries", () => {
  it("R26 normal deck Break-through uses the small deck before the Main deck", () => {
    const G = fixture();
    G.cardDb.small = card("small", { suit: "region" });
    G.cardDb.main = card("main", { suit: "region" });
    G.marketDecks!.regionDeck = ["small"];
    G.marketDecks!.mainDeck = ["main", "reserve"];
    expect(breakThrough(G, { playerId: "1", suit: "region", source: "deck", count: 1 }).gainedCardIds).toEqual(["small"]);
    expect(G.marketDecks!.mainDeck).toEqual(["main", "reserve"]);
  });

  it("R27 exposes History identities only to their owner", () => {
    const G = fixture();
    G.cardDb.history_card = card("history_card");
    G.players["1"].history = ["history_card"];
    expect(redactGameStateForPlayer(G, "1").players["1"].history).toEqual(["history_card"]);
    expect(redactGameStateForPlayer(G, "2").players["1"].history).toEqual([]);
  });

  it("R28 the same other-player resource effect works in multiplayer", () => {
    const G = fixture();
    runEffects({ G, playerId: "1" }, [{ trigger: "on_play", op: "gain_resource", targetPlayerScope: "others", resource: "materials", amount: 2 }]);
    expect(G.players["2"].resources.materials).toBe(2);
    expect(G.players["1"].resources.materials).toBe(0);
  });

  it("R29 returning before the incoming Solstice Unrest avoids Collapse", () => {
    const G = fixture();
    G.currentTurnType = "solstice";
    G.cardDb.held_unrest = card("held_unrest", { type: "unrest", suit: "unrest" });
    G.players["2"].discard = ["held_unrest"];
    runEffects({ G, playerId: "2" }, [{ trigger: "on_solstice", op: "return_unrest", sourceZones: ["discard"] }]);
    runEffects({ G, playerId: "1" }, [{ trigger: "on_solstice", op: "take_unrest", targetPlayerScope: "others", count: 1 }]);
    expect(G.gameover).toBeUndefined();
    expect(G.unrestPile).toHaveLength(1);
    expect(G.players["2"].hand).toHaveLength(1);
  });
});

describe("Horizons pp. 31, 39: Trade resource identities", () => {
  function tradeFixture(solo = false): GameState {
    const G = fixture(solo);
    G.options!.enabledExpansions = ["trade_routes"];
    return G;
  }

  it("R36 human Trade pays Progress to gain Goods when no route is available", () => {
    const G = tradeFixture();
    G.players["1"].resources.knowledge = 1;
    runEffects({ G, playerId: "1" }, [{ trigger: "on_play", op: "trade" }]);
    expect([G.players["1"].resources.knowledge, G.players["1"].resources.goods]).toEqual([0, 1]);
  });

  it("R37 trading with an opponent rewards the human trader with Goods", () => {
    const G = tradeFixture();
    G.cardDb.route = card("route", { type: "trade_route", suit: "trade_route" });
    G.players["2"].playArea = ["route"];
    runEffects({ G, playerId: "1" }, [{ trigger: "on_play", op: "trade" }]);
    expect(G.cardStates?.route?.resources?.goods).toBe(1);
    expect([G.players["1"].resources.knowledge, G.players["1"].resources.goods]).toEqual([0, 1]);
  });

  it("R38 Bot Trade pays Progress to gain Goods when no route is available", () => {
    const G = tradeFixture(true);
    G.solo!.bot.resources.knowledge = 1;
    resolveBotTrade(G, G.solo!.bot);
    expect([G.solo!.bot.resources.knowledge, G.solo!.bot.resources.goods]).toEqual([0, 1]);
  });

  it("R39 trading with a human route rewards the Bot with Goods", () => {
    const G = tradeFixture(true);
    G.cardDb.route = card("route", { type: "trade_route", suit: "trade_route" });
    G.players[Object.keys(G.players)[0]].playArea = ["route"];
    resolveBotTrade(G, G.solo!.bot);
    expect(G.cardStates?.route?.resources?.goods).toBe(1);
    expect([G.solo!.bot.resources.knowledge, G.solo!.bot.resources.goods]).toEqual([0, 1]);
  });

  it("R40 Bot trading with its own route adds Goods without paying its pool", () => {
    const G = tradeFixture(true);
    G.cardDb.route = card("route", { type: "trade_route", suit: "trade_route" });
    G.solo!.bot.botPlayArea = ["route"];
    resolveBotTrade(G, G.solo!.bot);
    expect(G.cardStates?.route?.resources?.goods).toBe(1);
    expect(G.solo!.bot.resources.goods).toBe(0);
  });
});
