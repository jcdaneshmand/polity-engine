import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { finalizeNormalScoring, scoreBot, scorePlayer, triggerCollapse, triggerScoring } from "../game/scoring";
import { resolveChoice, resolveExileChoice, resolveGiveCardChoice, resolvePlaceOnDeckChoice, resolveReturnUnrestChoice, resolveSwapChoice } from "../game/moves";
import { onTurnEnd } from "../game/turn";

function vpCard(id: string, vp: unknown): any {
  return { id, displayName: id, type: "action", cardType: "action", suit: "none", cost: 0, vp, tags: [], effects: [] };
}

function unrestCard(id: string): any {
  return { ...vpCard(id, 0), type: "unrest", cardType: "unrest", suit: "unrest", tags: ["unrest"] };
}

describe("scoring", () => {
  it("scores owned cards in normal scoring zones, including garrisoned cards", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      hand_vp: vpCard("hand_vp", 2),
      deck_vp: vpCard("deck_vp", 3),
      discard_vp: vpCard("discard_vp", 4),
      play_vp: vpCard("play_vp", 5),
      history_vp: vpCard("history_vp", 6),
      power_vp: vpCard("power_vp", 7),
      garrison_vp: vpCard("garrison_vp", 8)
    };
    G.players["0"].hand = ["hand_vp"];
    G.players["0"].deck = ["deck_vp"];
    G.players["0"].discard = ["discard_vp"];
    G.players["0"].playArea = ["play_vp"];
    G.players["0"].history = ["history_vp"];
    G.players["0"].powerArea = ["power_vp"];
    G.players["0"].resources.knowledge = 2;
    G.players["0"].resources.unrest = 1;
    G.cardStates = {
      play_vp: { garrisonedCardIds: ["garrison_vp"] }
    };

    expect(scorePlayer(G, "0")).toBe(37);
  });

  it("does not score unplayed Nation deck or undeveloped Development area cards", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      nation_vp: vpCard("nation_vp", 50),
      development_vp: vpCard("development_vp", 50),
      discard_vp: vpCard("discard_vp", 4)
    };
    G.players["0"].nationDeck = ["nation_vp"];
    G.players["0"].developmentArea = ["development_vp"];
    G.players["0"].discard = ["discard_vp"];

    expect(scorePlayer(G, "0")).toBe(4);
  });

  it("scores only Progress resources from the player resource pool", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 5;
    G.players["0"].resources.knowledge = 4;
    G.players["0"].resources.influence = 7;
    G.players["0"].resources.goods = 3;
    G.players["0"].resources.unrest = 2;

    expect(scorePlayer(G, "0")).toBe(4);
  });

  it("can score Progress resources at a reduced state-gated nation ratio", () => {
    const G = createInitialState();
    G.players["0"].resources.knowledge = 8;
    G.players["0"].stateArea = ["alien_state"];
    G.cardDb.alien_state = {
      id: "alien_state",
      displayName: "Alien / Gone Native",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["alien", "native"],
      effects: []
    };
    G.cardStates = { alien_state: { activeState: "alien" } };
    G.activeNationRulesets!["0"].scoringOverrides = [
      { op: "score_resource_ratio", resource: "knowledge", denominator: 3, state: "alien" } as any
    ];

    expect(scorePlayer(G, "0")).toBe(2);
  });

  it("caps variable victory points at 10 and applies structured VP modes", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      fixed_vp: vpCard("fixed_vp", { mode: "fixed", value: 4 }),
      variable_vp: vpCard("variable_vp", { mode: "variable", value: 15 }),
      negative_vp: vpCard("negative_vp", { mode: "negative", value: 3 }),
      none_vp: vpCard("none_vp", { mode: "none", value: null }),
      conditional_vp: vpCard("conditional_vp", { mode: "conditional", value: 9 })
    };
    G.players["0"].discard = ["fixed_vp", "variable_vp", "negative_vp", "none_vp", "conditional_vp"];

    expect(scorePlayer(G, "0")).toBe(11);
  });

  it("honors scoring zone exclusions", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      discard_vp: vpCard("discard_vp", 4),
      history_vp: vpCard("history_vp", 6)
    };
    G.players["0"].discard = ["discard_vp"];
    G.players["0"].history = ["history_vp"];
    G.activeNationRulesets!["0"].scoringOverrides = [{ op: "exclude_zone_from_scoring", zoneId: "discard" }];

    expect(scorePlayer(G, "0")).toBe(6);
  });

  it("normal scoring waits for the current round, one final round, and final solstice", () => {
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 3),
      p1_vp: vpCard("p1_vp", 5)
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["1"].powerArea = ["p1_vp"];
    const playOrder = ["0", "1"];

    triggerScoring(G, "test_trigger", "0");

    expect(G.scoring).toEqual({ reason: "test_trigger", triggeredBy: "0", phase: "finish_current_round" });
    expect(G.gameover).toBeUndefined();

    onTurnEnd(G, { currentPlayer: "0", playOrder } as any);
    expect(G.gameover).toBeUndefined();
    expect(G.scoring?.phase).toBe("finish_current_round");

    onTurnEnd(G, { currentPlayer: "1", playOrder } as any);
    expect(G.round).toBe(2);
    expect(G.gameover).toBeUndefined();
    expect(G.scoring).toEqual({ reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 2 });

    onTurnEnd(G, { currentPlayer: "0", playOrder } as any);
    expect(G.gameover).toBeUndefined();
    expect(G.scoring?.phase).toBe("final_round");

    onTurnEnd(G, { currentPlayer: "1", playOrder } as any);
    expect(G.round).toBe(3);
    expect(G.gameover).toEqual({
      winner: "1",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 3, "1": 5 }
    });
  });

  it("short game scoring ends after the current round and Solstice without a final round", () => {
    const G = createInitialState({
      options: {
        playerCount: 2,
        mode: "multiplayer",
        enabledExpansions: [],
        enabledVariants: ["short_game"]
      }
    });
    G.market = [];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 3),
      p1_vp: vpCard("p1_vp", 5)
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["1"].powerArea = ["p1_vp"];
    const playOrder = ["0", "1"];

    triggerScoring(G, "test_trigger", "0");

    onTurnEnd(G, { currentPlayer: "0", playOrder } as any);
    expect(G.gameover).toBeUndefined();
    expect(G.scoring?.phase).toBe("finish_current_round");

    onTurnEnd(G, { currentPlayer: "1", playOrder } as any);
    expect(G.round).toBe(2);
    expect(G.scoring?.phase).not.toBe("final_round");
    expect(G.gameover).toEqual({
      winner: "1",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 3, "1": 5 }
    });
  });

  it("clears the active scoring lifecycle when normal scoring finalizes", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 3),
      p1_vp: vpCard("p1_vp", 5)
    };
    G.players["0"].hand = ["p0_vp"];
    G.players["1"].hand = ["p1_vp"];
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };

    finalizeNormalScoring(G);

    expect(G.gameover).toEqual({
      winner: "1",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 3, "1": 5 }
    });
    expect(G.scoring).toBeUndefined();
  });

  it("solo normal scoring compares the human score to the Bot score and ties go to the Bot", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain" }
    });
    G.cardDb = {
      ...G.cardDb,
      human_vp: vpCard("human_vp", 12),
      bot_deck_vp: vpCard("bot_deck_vp", 3),
      bot_discard_vp: vpCard("bot_discard_vp", 4),
      bot_history_vp: vpCard("bot_history_vp", 5)
    };
    G.players["0"].hand = ["human_vp"];
    const bot = G.solo!.bot;
    bot.botDeck = ["bot_deck_vp"];
    bot.botDiscard = ["bot_discard_vp"];
    bot.botHistory = ["bot_history_vp"];
    bot.resources.knowledge = 0;
    G.scoring = { reason: "solo_test", triggeredBy: "0", phase: "final_round", finalRound: 1 };

    expect(scoreBot(G)).toBe(12);

    finalizeNormalScoring(G);

    expect(G.gameover).toEqual({
      winner: "bot_0",
      reason: "normal_scoring:solo_test",
      scores: { "0": 12, bot_0: 12 }
    });
  });

  it("scores Bot resources with the solo difficulty resource formulas", () => {
    const normal = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "imperator" }
    });
    normal.solo!.bot.resources = { knowledge: 2, materials: 4, influence: 1, goods: 1 };

    expect(scoreBot(normal)).toBe(3);

    const sovereign = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "sovereign" }
    });
    sovereign.solo!.bot.resources = { knowledge: 2, materials: 4, influence: 1, goods: 1 };

    expect(scoreBot(sovereign)).toBe(4);
  });

  it("scores Bot cards using solo Bot VP valuation rules", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "imperator" }
    });
    G.cardDb = {
      ...G.cardDb,
      bot_variable: vpCard("bot_variable", 0),
      bot_conditional: vpCard("bot_conditional", 0),
      bot_negative: vpCard("bot_negative", 0)
    };
    G.cardDb.bot_variable.vp = { mode: "variable", value: null };
    G.cardDb.bot_conditional.vp = { mode: "conditional", value: 8 };
    G.cardDb.bot_negative.vp = { mode: "negative", value: -4 };
    G.solo!.bot.botDeck = ["bot_variable", "bot_conditional", "bot_negative"];
    G.solo!.bot.resources = {};

    expect(scoreBot(G)).toBe(13);
  });

  it("collapse scoring ends immediately and uses lowest Unrest instead of VP", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 1),
      p1_vp: vpCard("p1_vp", 99),
      unrest_card: unrestCard("unrest_card"),
      p0_unrest: unrestCard("p0_unrest"),
      p1_unrest_extra_a: unrestCard("p1_unrest_extra_a"),
      p1_unrest_extra_b: unrestCard("p1_unrest_extra_b")
    };
    G.players["0"].discard = ["p0_vp", "p0_unrest"];
    G.players["1"].discard = ["p1_vp", "unrest_card", "p1_unrest_extra_a", "p1_unrest_extra_b"];

    triggerCollapse(G, "unrest_pile_empty", "1");

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1, "1": 3 }
    });
    expect(G.scoring).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("CollapseFinalized(winner=0)");
  });

  it("collapse scoring ignores resource-pool Unrest counters and counts only Unrest cards in scoring zones", () => {
    const G = createInitialState();
    G.players["0"].resources.unrest = 9;
    G.players["1"].resources.unrest = 0;

    triggerCollapse(G, "test_collapse");

    expect(G.gameover).toEqual({
      winner: "0,1",
      reason: "collapse:test_collapse",
      scores: { "0": 0, "1": 0 },
      tieBreakScores: { "0": 0, "1": 0 }
    });
  });

  it("collapse scoring does not count Unrest cards in the Power area", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      power_unrest: unrestCard("power_unrest")
    };
    G.players["0"].powerArea = ["power_unrest"];

    triggerCollapse(G, "test_collapse");

    expect(G.gameover).toEqual({
      winner: "0,1",
      reason: "collapse:test_collapse",
      scores: { "0": 0, "1": 0 },
      tieBreakScores: { "0": 0, "1": 0 }
    });
  });

  it("solo Collapse makes the human lose even when they have the fewest Unrest", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain" }
    });
    G.players["0"].resources.unrest = 0;
    G.solo!.bot.resources.unrest = 9;

    triggerCollapse(G, "unrest_pile_empty", "0");

    expect(G.gameover).toMatchObject({
      winner: "bot_0",
      reason: "collapse:unrest_pile_empty"
    });
  });

  it("collapse auto-win overrides beat normal Collapse scoring when their zone is empty", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p1_unrest: unrestCard("p1_unrest")
    };
    G.players["1"].discard = ["p1_unrest"];
    G.specialZones = {
      "1": {
        chaos_pile: { id: "chaos_pile", displayName: "Chaos Pile", cardIds: [], visibility: "public", scoresAsOwned: false }
      }
    };
    G.activeNationRulesets!["1"] = {
      ...G.activeNationRulesets!["1"],
      collapseOverrides: [{ op: "auto_win_if_zone_empty", zoneId: "chaos_pile" }]
    };

    triggerCollapse(G, "unrest_pile_empty", "0");

    expect(G.gameover).toEqual({
      winner: "1",
      reason: "auto_win_if_zone_empty:chaos_pile"
    });
    expect(G.log.at(-1)?.message).toMatch(/^CollapseAutoWin\(.+\/chaos_pile\)$/);
  });

  it("solo collapse auto-win overrides beat the default Bot Collapse win", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain" }
    });
    G.specialZones = {
      "0": {
        chaos_pile: { id: "chaos_pile", displayName: "Chaos Pile", cardIds: [], visibility: "public", scoresAsOwned: false }
      }
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      collapseOverrides: [{ op: "auto_win_if_zone_empty", zoneId: "chaos_pile" }]
    };

    triggerCollapse(G, "unrest_pile_empty", "0");

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "auto_win_if_zone_empty:chaos_pile"
    });
  });

  it("collapse tie among lowest-Unrest players is broken by normal scoring among tied players", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 2),
      p1_vp: vpCard("p1_vp", 5),
      p2_vp: vpCard("p2_vp", 99),
      p0_unrest: unrestCard("p0_unrest"),
      p1_unrest: unrestCard("p1_unrest"),
      p2_unrest_a: unrestCard("p2_unrest_a"),
      p2_unrest_b: unrestCard("p2_unrest_b"),
      p2_unrest_c: unrestCard("p2_unrest_c")
    };
    G.players["2"] = { ...G.players["0"], resources: { ...G.players["0"].resources, unrest: 3, influence: 0 }, discard: [], hand: [], deck: [], playArea: [], history: [], exile: [], powerArea: ["p2_vp"], stateArea: [], developmentArea: [], nationDeck: [] };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["1"].powerArea = ["p1_vp"];
    G.players["0"].discard = ["p0_unrest"];
    G.players["1"].discard = ["p1_unrest"];
    G.players["2"].discard = ["p2_unrest_a", "p2_unrest_b", "p2_unrest_c"];

    triggerCollapse(G, "test_collapse");

    expect(G.gameover).toEqual({
      winner: "1",
      reason: "collapse:test_collapse",
      scores: { "0": 1, "1": 1, "2": 3 },
      tieBreakScores: { "0": 2, "1": 5 }
    });
  });

  it("collapse shares victory only when tied lowest-Unrest players also tie normal scoring", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 2),
      p1_vp: vpCard("p1_vp", 2),
      p0_unrest: unrestCard("p0_unrest"),
      p1_unrest: unrestCard("p1_unrest")
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["1"].powerArea = ["p1_vp"];
    G.players["0"].discard = ["p0_unrest"];
    G.players["1"].discard = ["p1_unrest"];

    triggerCollapse(G, "test_collapse");

    expect(G.gameover).toEqual({
      winner: "0,1",
      reason: "collapse:test_collapse",
      scores: { "0": 1, "1": 1 },
      tieBreakScores: { "0": 2, "1": 2 }
    });
  });

  it("stops scoring lifecycle hooks and overrides when before_scoring triggers Collapse", () => {
    const G = createInitialState();
    G.unrestPile = [];
    G.cardDb.p1_unrest = unrestCard("p1_unrest");
    G.players["1"].discard = ["p1_unrest"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [
        {
          id: "collapse_before_scoring",
          trigger: "before_scoring",
          effects: [{ op: "take_unrest", count: 1 } as any],
          implemented: true,
          tested: true
        } as any,
        {
          id: "should_not_run",
          trigger: "before_scoring",
          effects: [{ op: "gain_resource", resource: "knowledge", amount: 3 } as any],
          implemented: true,
          tested: true
        } as any,
        {
          id: "after_should_not_run",
          trigger: "after_scoring",
          effects: [{ op: "gain_resource", resource: "knowledge", amount: 5 } as any],
          implemented: true,
          tested: true
        } as any
      ],
      scoringOverrides: [
        {
          op: "custom_scoring_effect",
          effect: [{ op: "gain_resource", resource: "knowledge", amount: 7 } as any]
        } as any
      ]
    };

    expect(scorePlayer(G, "0")).toBe(0);

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 0, "1": 1 }
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message.includes("after_scoring"))).toBe(false);
    expect(G.log.some((entry) => entry.message === "NationRulesetApplied(test/scoring/custom_scoring_effect)")).toBe(false);
  });

  it("pauses normal scoring finalization when before_scoring creates a pending choice", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2)
    };
    G.players["0"].hand = ["p0_vp"];
    G.players["1"].hand = ["p1_vp"];
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
        }]
      } as any]
    };

    finalizeNormalScoring(G);

    expect(G.pendingChoice).toBeDefined();
    expect(G.gameover).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 6, "1": 2 }
    });
  });

  it("pauses and resumes later collapse overrides when an earlier collapse override creates a pending choice during scoring", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2)
    };
    G.players["0"].hand = ["p0_vp"];
    G.players["1"].hand = ["p1_vp"];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      collapseOverrides: [
        {
          op: "custom_collapse_resolution",
          effect: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
          }]
        } as any,
        {
          op: "custom_collapse_resolution",
          effect: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        } as any
      ]
    };

    finalizeNormalScoring(G);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingScoringFinalization).toEqual({ playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.gameover).toBeUndefined();

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 6, "1": 2 }
    });
  });

  it("pauses normal scoring finalization when before_scoring creates a pending Exile choice", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2),
      market_civilized: { ...vpCard("market_civilized", 0), suit: "civilized" },
      market_refill: { ...vpCard("market_refill", 0), suit: "civilized" }
    };
    G.players["0"].hand = ["p0_vp"];
    G.players["1"].hand = ["p1_vp"];
    G.market = ["market_civilized"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_1"];
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" } as any]
      } as any]
    };

    finalizeNormalScoring(G);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      source: "market",
      cardIds: ["market_civilized"]
    });
    expect(G.gameover).toBeUndefined();

    resolveExileChoice({ G, ctx: { currentPlayer: "0" } as any }, "market_civilized");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.players["0"].exile).toContain("market_civilized");
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 5, "1": 2 }
    });
  });

  it("pauses normal scoring finalization when before_scoring creates a pending Return Unrest choice", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2),
      hand_unrest: { ...vpCard("hand_unrest", 0), type: "unrest", cardType: "unrest", suit: "unrest", tags: ["unrest"] }
    };
    G.players["0"].hand = ["p0_vp", "hand_unrest"];
    G.players["1"].hand = ["p1_vp"];
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "return_unrest", sourceZones: ["hand"] } as any]
      } as any]
    };

    finalizeNormalScoring(G);

    expect(G.pendingReturnUnrestChoice).toEqual({
      playerId: "0",
      cardIds: ["hand_unrest"],
      sourceZones: ["hand"]
    });
    expect(G.pendingScoringFinalization).toEqual({ playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 });
    expect(G.gameover).toBeUndefined();

    resolveReturnUnrestChoice({ G, ctx: { currentPlayer: "0" } as any }, "hand_unrest");

    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.unrestPile).toContain("hand_unrest");
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 5, "1": 2 }
    });
  });

  it("pauses normal scoring finalization when before_scoring creates newer pending keyword choices", () => {
    const scenarios = [
      {
        expectedKey: "pendingPlaceOnDeckChoice",
        effect: { trigger: "on_play", op: "place_card_on_deck" },
        setup(G: ReturnType<typeof createInitialState>) {
          G.players["0"].hand = ["p0_vp", "place_target"];
          G.cardDb.place_target = vpCard("place_target", 0);
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolvePlaceOnDeckChoice({ G, ctx: { currentPlayer: "0" } as any }, "place_target");
        }
      },
      {
        expectedKey: "pendingGiveCardChoice",
        effect: { trigger: "on_play", op: "give_card" },
        setup(G: ReturnType<typeof createInitialState>) {
          G.players["0"].hand = ["p0_vp", "give_target"];
          G.cardDb.give_target = vpCard("give_target", 0);
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolveGiveCardChoice({ G, ctx: { currentPlayer: "0" } as any }, "give_target", "1");
        }
      },
      {
        expectedKey: "pendingSwapChoice",
        effect: { trigger: "on_play", op: "swap_card", sourceZone: "hand" },
        setup(G: ReturnType<typeof createInitialState>) {
          G.players["0"].hand = ["p0_vp", "hand_civilized"];
          G.market = ["market_civilized"];
          G.unrestPile = ["test_unrest_1"];
          G.cardDb.hand_civilized = { ...vpCard("hand_civilized", 0), suit: "civilized" };
          G.cardDb.market_civilized = { ...vpCard("market_civilized", 0), suit: "civilized" };
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolveSwapChoice({ G, ctx: { currentPlayer: "0" } as any }, "hand_civilized", "market_civilized");
        }
      }
    ] as const;

    for (const scenario of scenarios) {
      const G = createInitialState();
      G.cardDb = {
        ...G.cardDb,
        p0_vp: vpCard("p0_vp", 5),
        p1_vp: vpCard("p1_vp", 2)
      };
      G.players["0"].hand = ["p0_vp"];
      G.players["1"].hand = ["p1_vp"];
      G.scoring = { reason: scenario.expectedKey, triggeredBy: "0", phase: "final_round", finalRound: 1 };
      scenario.setup(G);
      G.activeNationRulesets!["0"] = {
        ...G.activeNationRulesets!["0"],
        hookRules: [{
          trigger: "before_scoring",
          effects: [scenario.effect as any]
        } as any]
      };

      finalizeNormalScoring(G);

      expect((G as any)[scenario.expectedKey]).toBeDefined();
      expect(G.pendingScoringFinalization).toEqual({ playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 });
      expect(G.gameover).toBeUndefined();

      scenario.resolve(G);

      expect((G as any)[scenario.expectedKey]).toBeUndefined();
      expect(G.gameover?.reason).toBe(`normal_scoring:${scenario.expectedKey}`);
    }
  });
});
