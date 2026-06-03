import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { finalizeNormalScoring, scoreBot, scorePlayer, triggerCollapse, triggerScoring } from "../game/scoring";
import { resolveChoice, resolveExileChoice, resolveGiveCardChoice, resolveMarketCardChoice, resolvePlaceOnDeckChoice, resolveReactiveExhaustChoice, resolveReturnUnrestChoice, resolveSwapChoice } from "../game/moves";
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

  it("does not score garrisoned cards attached to unplayed Nation or Development cards", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      nation_host: vpCard("nation_host", 50),
      development_host: vpCard("development_host", 50),
      nation_child: vpCard("nation_child", 50),
      development_child: vpCard("development_child", 50),
      discard_vp: vpCard("discard_vp", 4)
    };
    G.players["0"].nationDeck = ["nation_host"];
    G.players["0"].developmentArea = ["development_host"];
    G.players["0"].discard = ["discard_vp"];
    G.cardStates = {
      nation_host: { garrisonedCardIds: ["nation_child"] },
      development_host: { garrisonedCardIds: ["development_child"] }
    };

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

    expect(scorePlayer(G, "0")).toBe(20);
  });

  it("caps each positive VP card at 10 across fixed, numeric, and conditional VP modes", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      numeric_vp: vpCard("numeric_vp", 12),
      fixed_vp: vpCard("fixed_vp", { mode: "fixed", value: 14 }),
      conditional_met: vpCard("conditional_met", {
        mode: "conditional",
        condition: { op: "self_in_zone", zoneId: "history" },
        trueValue: 13,
        falseValue: 3
      }),
      conditional_unmet: vpCard("conditional_unmet", {
        mode: "conditional",
        condition: { op: "self_in_zone", zoneId: "history" },
        trueValue: 13,
        falseValue: 11
      })
    };
    G.players["0"].discard = ["numeric_vp", "fixed_vp", "conditional_unmet"];
    G.players["0"].history = ["conditional_met"];

    expect(scorePlayer(G, "0")).toBe(40);
  });

  it("scores imported numeric conditional victory points and ignores unresolved conditionals", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      conditional_met: vpCard("conditional_met", { mode: "conditional", value: 6 }),
      conditional_unresolved: vpCard("conditional_unresolved", { mode: "conditional", value: null })
    };
    G.players["0"].discard = ["conditional_met", "conditional_unresolved"];

    expect(scorePlayer(G, "0")).toBe(6);
  });

  it("scores structured conditional victory points based on the card scoring zone", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      conditional_history: vpCard("conditional_history", {
        mode: "conditional",
        condition: { op: "self_in_zone", zoneId: "history" },
        trueValue: 8,
        falseValue: 3
      }),
      conditional_discard: vpCard("conditional_discard", {
        mode: "conditional",
        condition: { op: "self_in_zone", zoneId: "history" },
        trueValue: 8,
        falseValue: 3
      })
    };
    G.players["0"].history = ["conditional_history"];
    G.players["0"].discard = ["conditional_discard"];

    expect(scorePlayer(G, "0")).toBe(11);
  });

  it("scores structured variable victory points by counting matching cards in scored zones with a cap", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      variable_counter: vpCard("variable_counter", {
        mode: "variable",
        formula: { op: "count_cards", tag: "region", zones: ["playArea", "history"], amountEach: 2, cap: 6 }
      }),
      play_region_a: { ...vpCard("play_region_a", 0), tags: ["region"] },
      play_region_b: { ...vpCard("play_region_b", 0), tags: ["region"] },
      history_region: { ...vpCard("history_region", 0), tags: ["region"] },
      deck_region_not_counted: { ...vpCard("deck_region_not_counted", 0), tags: ["region"] }
    };
    G.players["0"].discard = ["variable_counter"];
    G.players["0"].playArea = ["play_region_a", "play_region_b"];
    G.players["0"].history = ["history_region"];
    G.players["0"].deck = ["deck_region_not_counted"];

    expect(scorePlayer(G, "0")).toBe(6);
  });

  it("counts garrisoned cards attached to counted scoring zones for structured variable victory points", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      variable_counter: vpCard("variable_counter", {
        mode: "variable",
        formula: { op: "count_cards", tag: "region", zones: ["playArea"], amountEach: 2, cap: 10 }
      }),
      play_region: { ...vpCard("play_region", 0), tags: ["region"] },
      garrisoned_region: { ...vpCard("garrisoned_region", 0), tags: ["region"] }
    };
    G.players["0"].discard = ["variable_counter"];
    G.players["0"].playArea = ["play_region"];
    G.cardStates = { play_region: { garrisonedCardIds: ["garrisoned_region"] } };

    expect(scorePlayer(G, "0")).toBe(4);
  });

  it("does not count Trade Routes as in-play cards for structured variable victory points", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      variable_counter: vpCard("variable_counter", {
        mode: "variable",
        formula: { op: "count_cards", tag: "region", zones: ["playArea"], amountEach: 2, cap: 10 }
      }),
      play_region: { ...vpCard("play_region", 0), tags: ["region"] },
      route_with_region_tag: {
        ...vpCard("route_with_region_tag", 0),
        type: "trade_route",
        cardType: "trade_route",
        suit: "trade_route",
        tags: ["region"]
      }
    };
    G.players["0"].discard = ["variable_counter"];
    G.players["0"].playArea = ["play_region", "route_with_region_tag"];

    expect(scorePlayer(G, "0")).toBe(2);
  });

  it("scores structured variable victory points from resource pools without counting resources on cards", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      resource_counter: vpCard("resource_counter", {
        mode: "variable",
        formula: { op: "count_resources", resources: ["materials", "influence"], amountEach: 1, denominator: 2, cap: 10 }
      }),
      resource_host: vpCard("resource_host", 0)
    };
    G.players["0"].discard = ["resource_counter"];
    G.players["0"].playArea = ["resource_host"];
    G.players["0"].resources.materials = 3;
    G.players["0"].resources.influence = 2;
    G.cardStates = { resource_host: { resources: { materials: 5, influence: 5 } } };

    expect(scorePlayer(G, "0")).toBe(2);
  });

  it("treats scored History replacement zones as History for structured VP rules", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      conditional_history: vpCard("conditional_history", {
        mode: "conditional",
        condition: { op: "self_in_zone", zoneId: "history" },
        trueValue: 8,
        falseValue: 3
      }),
      variable_counter: vpCard("variable_counter", {
        mode: "variable",
        formula: { op: "count_cards", tag: "region", zones: ["history"], amountEach: 2, cap: 10 }
      }),
      sunken_region: { ...vpCard("sunken_region", 0), tags: ["region"] }
    };
    G.players["0"].discard = ["variable_counter"];
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: ["conditional_history", "sunken_region"] };
    G.activeNationRulesets = {
      ...G.activeNationRulesets,
      "0": {
        ...G.activeNationRulesets!["0"],
        zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
      }
    };

    expect(scorePlayer(G, "0")).toBe(10);
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

  it("applies History scoring exclusions to scored History replacement zones", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      sunken_vp: vpCard("sunken_vp", 6),
      garrison_vp: vpCard("garrison_vp", 4),
      discard_vp: vpCard("discard_vp", 2)
    };
    G.players["0"].discard = ["discard_vp"];
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: ["sunken_vp"] };
    G.cardStates = { sunken_vp: { garrisonedCardIds: ["garrison_vp"] } };
    G.activeNationRulesets = {
      ...G.activeNationRulesets,
      "0": {
        ...G.activeNationRulesets!["0"],
        zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any],
        scoringOverrides: [{ op: "exclude_zone_from_scoring", zoneId: "history" } as any]
      }
    };

    expect(scorePlayer(G, "0")).toBe(2);
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

  it("uses the options recorded when scoring is triggered for scoring timing", () => {
    const G = createInitialState({
      options: {
        playerCount: 2,
        mode: "multiplayer",
        enabledExpansions: [],
        enabledVariants: []
      }
    });
    G.market = [];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    const playOrder = ["0", "1"];

    triggerScoring(G, "test_trigger", "0");
    G.options = {
      playerCount: 2,
      mode: "multiplayer",
      enabledExpansions: [],
      enabledVariants: ["short_game"]
    };

    onTurnEnd(G, { currentPlayer: "0", playOrder } as any);
    onTurnEnd(G, { currentPlayer: "1", playOrder } as any);

    expect(G.gameover).toBeUndefined();
    expect(G.scoring).toMatchObject({ reason: "test_trigger", phase: "final_round", finalRound: 2 });
    expect(G.scoringOptions).toMatchObject({
      playerCount: 2,
      mode: "multiplayer",
      enabledExpansions: [],
      enabledVariants: []
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
      human_vp_a: vpCard("human_vp_a", 7),
      human_vp_b: vpCard("human_vp_b", 5),
      bot_deck_vp: vpCard("bot_deck_vp", 3),
      bot_discard_vp: vpCard("bot_discard_vp", 4),
      bot_history_vp: vpCard("bot_history_vp", 5)
    };
    G.players["0"].hand = ["human_vp_a", "human_vp_b"];
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

  it("records a campaign outcome snapshot when solo campaign scoring finishes", () => {
    const G = createInitialState({
      options: {
        playerCount: 1,
        mode: "solo",
        enabledExpansions: [],
        enabledVariants: [],
        soloDifficulty: "warlord",
        campaignMode: "standard",
        campaignProgress: {
          mode: "standard",
          playerNationId: "test_nation_sun_coast",
          wins: 1,
          losses: 0,
          currentDifficulty: "warlord",
          defeatedBotNationIds: ["first_bot"],
          startingDeckAdditions: [],
          startingDeckRemovals: [],
          setAsideCommonsCardIds: [],
          doubleStartingResourcesForNextGame: false
        }
      }
    });
    G.cardDb = {
      ...G.cardDb,
      human_vp: vpCard("human_vp", 10),
      bot_vp: vpCard("bot_vp", 3)
    };
    G.players["0"].hand = ["human_vp"];
    G.solo!.bot.botNationId = "campaign_bot";
    G.solo!.bot.botDeck = ["bot_vp"];
    G.scoring = { reason: "campaign_test", triggeredBy: "0", phase: "final_round", finalRound: 1 };

    finalizeNormalScoring(G);

    expect(G.gameover?.campaignOutcome).toEqual({
      mode: "standard",
      won: true,
      humanPlayerId: "0",
      botId: "bot_0",
      botNationId: "campaign_bot",
      difficulty: "warlord",
      score: 10,
      scoreKind: "victory_points",
      botScore: 3,
      requiresCampaignChoice: true,
      result: {
        won: true,
        botNationId: "campaign_bot",
        difficulty: "warlord",
        score: 10
      }
    });
  });

  it("records a campaign loss outcome when solo campaign Collapse finishes", () => {
    const G = createInitialState({
      options: {
        playerCount: 1,
        mode: "solo",
        enabledExpansions: [],
        enabledVariants: [],
        soloDifficulty: "chieftain",
        campaignMode: "standard",
        campaignProgress: {
          mode: "standard",
          playerNationId: "test_nation_sun_coast",
          wins: 0,
          losses: 1,
          currentDifficulty: "chieftain",
          defeatedBotNationIds: [],
          startingDeckAdditions: [],
          startingDeckRemovals: [],
          setAsideCommonsCardIds: [],
          doubleStartingResourcesForNextGame: false
        }
      }
    });
    G.solo!.bot.botNationId = "collapse_bot";
    G.players["0"].hand = ["unrest_a", "unrest_b"];
    G.cardDb = { ...G.cardDb, unrest_a: unrestCard("unrest_a"), unrest_b: unrestCard("unrest_b") };

    triggerCollapse(G, "unrest_empty", "0");

    expect(G.gameover?.campaignOutcome).toEqual({
      mode: "standard",
      won: false,
      humanPlayerId: "0",
      botId: "bot_0",
      botNationId: "collapse_bot",
      difficulty: "chieftain",
      score: 2,
      scoreKind: "collapse_unrest",
      requiresCampaignChoice: false,
      result: {
        won: false,
        botNationId: "collapse_bot",
        difficulty: "chieftain",
        score: 2
      }
    });
  });

  it("uses the recorded solo option when normal scoring finalizes", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain" }
    });
    G.cardDb = {
      ...G.cardDb,
      human_vp: vpCard("human_vp", 2),
      bot_vp: vpCard("bot_vp", 4)
    };
    G.players["0"].hand = ["human_vp"];
    G.solo!.bot.botDeck = ["bot_vp"];

    triggerScoring(G, "solo_test", "0");
    G.scoring = { ...G.scoring!, phase: "final_round", finalRound: 1 };
    G.options = { playerCount: 1, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] };

    finalizeNormalScoring(G);

    expect(G.gameover).toEqual({
      winner: "bot_0",
      reason: "normal_scoring:solo_test",
      scores: { "0": 2, bot_0: 4 }
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

    expect(scoreBot(G)).toBe(9);
  });

  it("scores Bot negative VP cards as negative while conditional penalties use the best branch", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "imperator" }
    });
    G.cardDb = {
      ...G.cardDb,
      bot_negative_fixed: vpCard("bot_negative_fixed", { mode: "negative", value: 4 }),
      bot_conditional_penalty: vpCard("bot_conditional_penalty", {
        mode: "conditional",
        value: 0,
        trueValue: -4,
        falseValue: 0
      })
    };
    G.solo!.bot.botDeck = ["bot_negative_fixed", "bot_conditional_penalty"];
    G.solo!.bot.resources = {};

    expect(scoreBot(G)).toBe(-4);
  });

  it("scores Cultist Bot Unrest cards using the solo Cultist difficulty exception", () => {
    const imperator = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "imperator" }
    });
    imperator.cardDb = {
      ...imperator.cardDb,
      bot_unrest_a: vpCard("bot_unrest_a", { mode: "fixed", value: -2 }),
      bot_unrest_b: vpCard("bot_unrest_b", { mode: "negative", value: 2 })
    };
    imperator.cardDb.bot_unrest_a.suit = "unrest";
    imperator.cardDb.bot_unrest_a.cardType = "unrest";
    imperator.cardDb.bot_unrest_b.suit = "unrest";
    imperator.cardDb.bot_unrest_b.cardType = "unrest";
    imperator.solo!.bot.botNationId = "cultists";
    imperator.solo!.bot.botDeck = ["bot_unrest_a"];
    imperator.solo!.bot.botDiscard = ["bot_unrest_b"];
    imperator.solo!.bot.resources = {};

    expect(scoreBot(imperator)).toBe(2);

    const chieftain = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain" }
    });
    chieftain.cardDb = imperator.cardDb;
    chieftain.solo!.bot.botNationId = "cultists";
    chieftain.solo!.bot.botDeck = ["bot_unrest_a"];
    chieftain.solo!.bot.botDiscard = ["bot_unrest_b"];
    chieftain.solo!.bot.resources = {};

    expect(scoreBot(chieftain)).toBe(0);

    const overlord = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "overlord" }
    });
    overlord.cardDb = imperator.cardDb;
    overlord.solo!.bot.botNationId = "cultists";
    overlord.solo!.bot.botDeck = ["bot_unrest_a"];
    overlord.solo!.bot.botDiscard = ["bot_unrest_b"];
    overlord.solo!.bot.resources = {};

    expect(scoreBot(overlord)).toBe(4);

    const supremeRuler = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "supreme_ruler" }
    });
    supremeRuler.cardDb = imperator.cardDb;
    supremeRuler.solo!.bot.botNationId = "cultists";
    supremeRuler.solo!.bot.botDeck = ["bot_unrest_a"];
    supremeRuler.solo!.bot.botDiscard = ["bot_unrest_b"];
    supremeRuler.solo!.bot.resources = {};

    expect(scoreBot(supremeRuler)).toBe(4);
  });

  it("scores Bot structured conditional victory points at the best imported value", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "imperator" }
    });
    G.cardDb = {
      ...G.cardDb,
      bot_conditional_zone: vpCard("bot_conditional_zone", {
        mode: "conditional",
        condition: { op: "self_in_zone", zoneId: "history" },
        trueValue: 8,
        falseValue: 3
      })
    };
    G.solo!.bot.botDeck = ["bot_conditional_zone"];
    G.solo!.bot.resources = {};

    expect(scoreBot(G)).toBe(8);
  });

  it("caps each positive Bot VP card at 10", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "imperator" }
    });
    G.cardDb = {
      ...G.cardDb,
      bot_numeric: vpCard("bot_numeric", 12),
      bot_fixed: vpCard("bot_fixed", { mode: "fixed", value: 13 }),
      bot_variable: vpCard("bot_variable", { mode: "variable", value: 15 }),
      bot_conditional: vpCard("bot_conditional", { mode: "conditional", value: 14 })
    };
    G.solo!.bot.botDeck = ["bot_numeric", "bot_fixed", "bot_variable", "bot_conditional"];
    G.solo!.bot.resources = {};

    expect(scoreBot(G)).toBe(40);
  });

  it("does not score Bot Power cards", () => {
    const G = createInitialState({
      options: { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "imperator" }
    });
    G.cardDb = {
      ...G.cardDb,
      bot_power: vpCard("bot_power", { mode: "fixed", value: 10 }),
      bot_action: vpCard("bot_action", { mode: "fixed", value: 3 })
    };
    G.cardDb.bot_power.cardType = "power";
    G.cardDb.bot_power.type = "power";
    G.cardDb.bot_power.suit = "power";
    G.solo!.bot.botPlayArea = ["bot_power"];
    G.solo!.bot.botDeck = ["bot_action"];
    G.solo!.bot.resources = {};

    expect(scoreBot(G)).toBe(3);
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

  it("collapse scoring counts Unrest in nation-specific History replacement zones", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      flooded_unrest: unrestCard("flooded_unrest")
    };
    G.players["0"].sideAreas = { flooded: ["flooded_unrest"] };
    G.activeNationRulesets!["0"].zoneOverrides = [
      { op: "replace_history_with_zone", zoneId: "flooded", displayName: "Flooded" }
    ];

    triggerCollapse(G, "test_collapse");

    expect(G.gameover).toEqual({
      winner: "1",
      reason: "collapse:test_collapse",
      scores: { "0": 1, "1": 0 }
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

  it("collapse scoring does not count garrisoned Unrest attached to ignored zones", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      nation_host: vpCard("nation_host", 0),
      development_host: vpCard("development_host", 0),
      exile_host: vpCard("exile_host", 0),
      nation_child_unrest: unrestCard("nation_child_unrest"),
      development_child_unrest: unrestCard("development_child_unrest"),
      exile_child_unrest: unrestCard("exile_child_unrest"),
      counted_host: vpCard("counted_host", 0),
      counted_child_unrest: unrestCard("counted_child_unrest")
    };
    G.players["0"].nationDeck = ["nation_host"];
    G.players["0"].developmentArea = ["development_host"];
    G.players["0"].exile = ["exile_host"];
    G.players["0"].discard = ["counted_host"];
    G.cardStates = {
      nation_host: { garrisonedCardIds: ["nation_child_unrest"] },
      development_host: { garrisonedCardIds: ["development_child_unrest"] },
      exile_host: { garrisonedCardIds: ["exile_child_unrest"] },
      counted_host: { garrisonedCardIds: ["counted_child_unrest"] }
    };

    triggerCollapse(G, "test_collapse");

    expect(G.gameover).toEqual({
      winner: "1",
      reason: "collapse:test_collapse",
      scores: { "0": 1, "1": 0 }
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

  it("collapse auto-win zone checks count a separately tracked Accession in the Nation deck", () => {
    const G = createInitialState();
    G.players["0"].nationDeck = [];
    G.players["0"].accessionCardId = "accession_card";
    G.cardDb.accession_card = {
      id: "accession_card",
      displayName: "Accession",
      type: "accession",
      cardType: "accession",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      collapseOverrides: [{ op: "auto_win_if_zone_empty", zoneId: "nationDeck" }]
    };

    triggerCollapse(G, "unrest_pile_empty", "0");

    expect(G.gameover?.reason).not.toBe("auto_win_if_zone_empty:nationDeck");
    expect(G.log.some((entry) => entry.message.includes("CollapseAutoWin") && entry.message.includes("nationDeck"))).toBe(false);
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

  it("collapse tie-break scoring does not run normal scoring lifecycle hooks", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_unrest: unrestCard("p0_unrest"),
      p1_unrest: unrestCard("p1_unrest")
    };
    G.players["0"].discard = ["p0_unrest"];
    G.players["1"].discard = ["p1_unrest"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 5 } as any],
        implemented: true,
        tested: true
      } as any]
    };

    triggerCollapse(G, "test_collapse");

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.gameover).toEqual({
      winner: "0,1",
      reason: "collapse:test_collapse",
      scores: { "0": 1, "1": 1 },
      tieBreakScores: { "0": 0, "1": 0 }
    });
  });

  it("collapse tie-break scoring allows tied players to return Unrest from scoring zones without changing the original Unrest tie", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 1),
      p0_unrest: { ...unrestCard("p0_unrest"), vp: { mode: "negative", value: 2 } },
      p1_unrest: unrestCard("p1_unrest")
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["0"].deck = ["p0_unrest"];
    G.players["1"].hand = ["p1_unrest"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "return_unrest", cardId: "p0_unrest" } as any],
        implemented: true,
        tested: true
      } as any]
    };

    triggerCollapse(G, "test_collapse");

    expect(G.players["0"].deck).toEqual([]);
    expect(G.unrestPile).toContain("p0_unrest");
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:test_collapse",
      scores: { "0": 1, "1": 1 },
      tieBreakScores: { "0": 1, "1": 0 }
    });
  });

  it("collapse tie-break scoring can return Unrest from a nation-specific History replacement zone", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 1),
      flooded_unrest: { ...unrestCard("flooded_unrest"), vp: { mode: "negative", value: 2 } },
      p1_unrest: unrestCard("p1_unrest")
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["0"].sideAreas = { flooded: ["flooded_unrest"] };
    G.players["1"].hand = ["p1_unrest"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "flooded", displayName: "Flooded" }],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "return_unrest", cardId: "flooded_unrest" } as any],
        implemented: true,
        tested: true
      } as any]
    };

    triggerCollapse(G, "test_collapse");

    expect(G.players["0"].sideAreas?.flooded).toEqual([]);
    expect(G.unrestPile).toContain("flooded_unrest");
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:test_collapse",
      scores: { "0": 1, "1": 1 },
      tieBreakScores: { "0": 1, "1": 0 }
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

  it("routes injected randomness through scoring lifecycle hooks", () => {
    const G = createInitialState();
    G.players["0"].hand = ["random_keep", "random_discard"];
    G.players["1"].hand = [];
    G.cardDb.random_keep = vpCard("random_keep", 0);
    G.cardDb.random_discard = vpCard("random_discard", 0);
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "discard_random", count: 1 } as any],
        implemented: true,
        tested: true
      } as any]
    };

    (finalizeNormalScoring as any)(G, () => 0.6);

    expect(G.players["0"].hand).toEqual(["random_keep"]);
    expect(G.players["0"].discard).toContain("random_discard");
    expect(G.log.some((entry) => entry.message === "Discarded random_discard at random.")).toBe(true);
  });

  it("stops scoring lifecycle when a before_scoring hook fails", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5)
    };
    G.players["0"].hand = ["p0_vp"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    const score = scorePlayer(G, "0");

    expect(score).toBe(0);
    expect(G.log.some((entry) => entry.message === "Nation hook before_scoring #0 failed.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "Scored(0=5)")).toBe(false);
  });

  it("stops scoring lifecycle when an after_scoring hook fails", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5)
    };
    G.players["0"].hand = ["p0_vp"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_scoring",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    const score = scorePlayer(G, "0");

    expect(score).toBe(0);
    expect(G.log.some((entry) => entry.message === "Nation hook after_scoring #0 failed.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "Scored(0=5)")).toBe(false);
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

  it("pauses normal scoring finalization when before_scoring opens a reactive Exhaust window", () => {
    const G = createInitialState();
    const exhaustCardId = "scoring_reactive_exhaust";
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2),
      [exhaustCardId]: {
        id: exhaustCardId,
        displayName: "Scoring Reactive Exhaust",
        type: "in_play",
        cardType: "in_play",
        suit: "none",
        cost: 0,
        tags: [],
        effects: [{
          trigger: "on_exhaust",
          op: "gain_resource",
          resource: "knowledge",
          amount: 1,
          reactive: { trigger: "after_gain_resource", resource: "materials" }
        } as any]
      }
    };
    G.players["0"].hand = ["p0_vp"];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["1"].hand = ["p1_vp"];
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any]
      }]
    };

    finalizeNormalScoring(G);

    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "materials"
    });
    expect(G.pendingScoringFinalization).toEqual({ playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 });
    expect(G.gameover).toBeUndefined();

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 6, "1": 2 }
    });
  });

  it("pauses normal scoring finalization when after_scoring opens a reactive Exhaust window", () => {
    const G = createInitialState();
    const exhaustCardId = "after_scoring_reactive_exhaust";
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2),
      [exhaustCardId]: {
        id: exhaustCardId,
        displayName: "After Scoring Reactive Exhaust",
        type: "in_play",
        cardType: "in_play",
        suit: "none",
        cost: 0,
        tags: [],
        effects: [{
          trigger: "on_exhaust",
          op: "gain_resource",
          resource: "knowledge",
          amount: 1,
          reactive: { trigger: "after_gain_resource", resource: "materials" }
        } as any]
      }
    };
    G.players["0"].hand = ["p0_vp"];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["1"].hand = ["p1_vp"];
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_scoring",
        effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any]
      }]
    };

    finalizeNormalScoring(G);

    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "materials"
    });
    expect(G.pendingScoringFinalization).toEqual({ playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 });
    expect(G.gameover).toBeUndefined();

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
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
      hand_unrest: { ...vpCard("hand_unrest", 0), type: "unrest", cardType: "unrest", suit: "unrest", tags: ["unrest"] },
      hand_unrest_b: { ...vpCard("hand_unrest_b", 0), type: "unrest", cardType: "unrest", suit: "unrest", tags: ["unrest"] }
    };
    G.players["0"].hand = ["p0_vp", "hand_unrest", "hand_unrest_b"];
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
      cardIds: ["hand_unrest", "hand_unrest_b"],
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

  it("normal scoring return-Unrest hooks can return specified Unrest from any scored zone", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2),
      deck_unrest: { ...unrestCard("deck_unrest"), vp: { mode: "negative", value: 4 } }
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["0"].deck = ["deck_unrest"];
    G.players["1"].powerArea = ["p1_vp"];
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "return_unrest", cardId: "deck_unrest" } as any]
      } as any]
    };

    finalizeNormalScoring(G);

    expect(G.players["0"].deck).toEqual([]);
    expect(G.unrestPile).toContain("deck_unrest");
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 5, "1": 2 }
    });
  });

  it("normal scoring return-Unrest choices include nation-specific History replacement zones", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2),
      hand_unrest: { ...unrestCard("hand_unrest"), vp: { mode: "negative", value: 0 } },
      flooded_unrest: { ...unrestCard("flooded_unrest"), vp: { mode: "negative", value: 4 } }
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["0"].hand = ["hand_unrest"];
    G.players["0"].sideAreas = { flooded: ["flooded_unrest"] };
    G.players["1"].powerArea = ["p1_vp"];
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "flooded", displayName: "Flooded" }],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "return_unrest" } as any]
      } as any]
    };

    finalizeNormalScoring(G);

    expect(G.pendingReturnUnrestChoice).toEqual({
      playerId: "0",
      cardIds: ["hand_unrest", "flooded_unrest"],
      sourceZones: ["hand", "playArea", "discard", "deck", "flooded"]
    });
    expect(G.pendingScoringFinalization).toEqual({ playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 });
    expect(G.gameover).toBeUndefined();

    resolveReturnUnrestChoice({ G, ctx: { currentPlayer: "0" } as any }, "flooded_unrest");

    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.players["0"].sideAreas?.flooded).toEqual([]);
    expect(G.unrestPile).toContain("flooded_unrest");
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:test_trigger",
      scores: { "0": 5, "1": 2 }
    });
  });

  it("normal scoring return-Unrest choices include garrisoned Unrest attached to scored-zone hosts", () => {
    const G = createInitialState();
    G.cardDb = {
      ...G.cardDb,
      p0_vp: vpCard("p0_vp", 5),
      p1_vp: vpCard("p1_vp", 2),
      discard_host: vpCard("discard_host", 0),
      hand_unrest: { ...unrestCard("hand_unrest"), vp: { mode: "negative", value: 0 } },
      garrisoned_unrest: { ...unrestCard("garrisoned_unrest"), vp: { mode: "negative", value: 4 } }
    };
    G.players["0"].powerArea = ["p0_vp"];
    G.players["0"].hand = ["hand_unrest"];
    G.players["0"].discard = ["discard_host"];
    G.players["1"].powerArea = ["p1_vp"];
    G.cardStates = { discard_host: { garrisonedCardIds: ["garrisoned_unrest"] } };
    G.scoring = { reason: "test_trigger", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{ trigger: "on_play", op: "return_unrest" } as any]
      } as any]
    };

    finalizeNormalScoring(G);

    expect(G.pendingReturnUnrestChoice).toMatchObject({
      playerId: "0"
    });
    expect(G.pendingReturnUnrestChoice?.cardIds).toContain("garrisoned_unrest");
    expect(G.pendingReturnUnrestChoice?.cardIds).toContain("hand_unrest");
    expect(G.pendingReturnUnrestChoice?.sourceZones).toContain("discard");
    expect(G.gameover).toBeUndefined();

    resolveReturnUnrestChoice({ G, ctx: { currentPlayer: "0" } as any }, "garrisoned_unrest");

    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.players["0"].discard).toEqual(["discard_host"]);
    expect(G.cardStates?.discard_host?.garrisonedCardIds).toEqual([]);
    expect(G.unrestPile).toContain("garrisoned_unrest");
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
          G.players["0"].hand = ["p0_vp", "hand_civilized", "hand_uncivilized"];
          G.market = ["market_civilized", "market_uncivilized"];
          G.unrestPile = ["test_unrest_1"];
          G.cardDb.hand_civilized = { ...vpCard("hand_civilized", 0), suit: "civilized" };
          G.cardDb.market_civilized = { ...vpCard("market_civilized", 0), suit: "civilized" };
          G.cardDb.hand_uncivilized = { ...vpCard("hand_uncivilized", 0), suit: "uncivilized" };
          G.cardDb.market_uncivilized = { ...vpCard("market_uncivilized", 0), suit: "uncivilized" };
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolveSwapChoice({ G, ctx: { currentPlayer: "0" } as any }, "hand_civilized", "market_civilized");
        }
      },
      {
        expectedKey: "pendingMarketCardChoice",
        effect: { trigger: "on_play", op: "take_card", source: "market", suit: "civilized", count: 1 },
        setup(G: ReturnType<typeof createInitialState>) {
          G.market = ["market_civilized_a", "market_civilized_b"];
          G.marketRefillPool = [];
          G.marketDecks = undefined;
          G.cardDb.market_civilized_a = { ...vpCard("market_civilized_a", 0), suit: "civilized" };
          G.cardDb.market_civilized_b = { ...vpCard("market_civilized_b", 0), suit: "civilized" };
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolveMarketCardChoice({ G, ctx: { currentPlayer: "0" } as any }, "market_civilized_b");
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
