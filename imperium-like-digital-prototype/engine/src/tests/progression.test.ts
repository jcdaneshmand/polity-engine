import { describe, expect, it } from "vitest";
import { createInitialState as createInitialStateFromEngine } from "../game/initialState";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { resolveAcquireChoice, resolveBreakThroughChoice, resolveChoice, resolveDevelopmentChoice, resolveDrawChoice, resolveExileChoice, resolveFindChoice, resolveGarrisonChoice, resolveGiveCardChoice, resolveLookOrderChoice, resolveMarketCardChoice, resolvePlaceOnDeckChoice, resolveReactiveExhaustChoice, resolveRegionChoice, resolveReturnUnrestChoice, resolveShortGameDevelopmentExileChoice, resolveSwapChoice, resolveTradeChoice, skipDevelopmentChoice } from "../game/moves";
import { currentStateMatches } from "../game/stateMatching";
import { continuePendingReshuffleLifecycle, drawCardWithReshuffleLifecycle } from "../game/zones";
import type { GameOptions } from "../options/gameOptions";
import { card, cardDb } from "./commonsTestFixtures";

const ctx = { currentPlayer: "0" } as any;

function createInitialState(args?: Parameters<typeof createInitialStateFromEngine>[0]) {
  const G = createInitialStateFromEngine({ ...args, usePrivateData: args?.usePrivateData ?? false });
  for (const player of Object.values(G.players)) player.hand = [];
  return G;
}

function queueFailingAfterReshuffleContinuation(G: ReturnType<typeof createInitialState>): void {
  G.pendingReshuffleDraw = { playerId: "0", resumeDrawCount: 1 };
  G.pendingNationHookContinuation = {
    playerId: "0",
    trigger: "after_reshuffle",
    payload: undefined,
    nextIndex: 1,
    resolvedHookIndex: 0
  };
  G.activeNationRulesets = {
    "0": {
      hookRules: [
        { trigger: "after_reshuffle", effects: [] },
        { trigger: "after_reshuffle", effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any] }
      ]
    }
  } as any;
}

describe("reshuffle progression", () => {
  it("does not add a Nation card during reshuffle when no Action token is available", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];
    p.developmentArea = [];
    p.actionTokensAvailable = 0;
    p.exhaustTokensAvailable = 1;

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("test_action_archive_survey");
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(p.nationDeck).toEqual(["test_action_lineage_record"]);
    expect(p.progressionTokens).toEqual({ nationDeck: 0, developmentArea: 0 });
    expect(p.actionTokensAvailable).toBe(0);
    expect(p.exhaustTokensAvailable).toBe(1);
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(test_action_lineage_record)")).toBe(false);
  });

  it("runs imported nation passive rules at their matching reshuffle hook", () => {
    const options: GameOptions = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] };
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: cardDb([
        card({ id: "discard_seed", startingLocation: "box", ownership: "nation" }),
        card({ id: "market_1", startingLocation: "market" }),
        card({ id: "market_2", startingLocation: "market" }),
        card({ id: "market_3", startingLocation: "market" }),
        card({ id: "market_4", startingLocation: "market" }),
        card({ id: "market_5", startingLocation: "market" })
      ]),
      nationDb: {
        passive_nation: {
          id: "passive_nation",
          displayName: "Passive Nation",
          powerCardIds: [],
          stateCardIds: [],
          startingDeckCardIds: [],
          nationDeckCardIds: [],
          developmentCardIds: [],
          setupRules: [{ op: "place_card_in_area", cardId: "discard_seed", area: "discard" }],
          passiveRules: [{ trigger: "before_reshuffle", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any] }],
          actionTokensBase: 1,
          exhaustTokensBase: 1,
          requiredExpansions: [],
          implemented: true,
          tested: true
        }
      },
      playerNationIds: { "0": "passive_nation", "1": "passive_nation" }
    });
    G.players["0"].resources.materials = 0;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook before_reshuffle #0 resolved.")).toBe(true);
  });

  it("runs imported nation passive rules when a Development card is developed", () => {
    const options: GameOptions = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] };
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: cardDb([
        card({ id: "discard_seed", startingLocation: "box", ownership: "nation" }),
        card({ id: "dev_card", startingLocation: "box", ownership: "nation", developmentCost: { materials: 1, population: 0, progress: 0, goods: 0 } }),
        card({ id: "market_1", startingLocation: "market" }),
        card({ id: "market_2", startingLocation: "market" }),
        card({ id: "market_3", startingLocation: "market" }),
        card({ id: "market_4", startingLocation: "market" }),
        card({ id: "market_5", startingLocation: "market" })
      ]),
      nationDb: {
        develop_passive_nation: {
          id: "develop_passive_nation",
          displayName: "Develop Passive Nation",
          powerCardIds: [],
          stateCardIds: [],
          startingDeckCardIds: [],
          nationDeckCardIds: [],
          developmentCardIds: ["dev_card"],
          setupRules: [
            { op: "place_card_in_area", cardId: "discard_seed", area: "discard" },
            { op: "gain_resource", resource: "materials", count: 1 }
          ],
          passiveRules: [{ trigger: "on_develop", effects: [{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 } as any] }],
          actionTokensBase: 1,
          exhaustTokensBase: 1,
          requiredExpansions: [],
          implemented: true,
          tested: true
        }
      },
      playerNationIds: { "0": "develop_passive_nation", "1": "develop_passive_nation" }
    });

    drawCardWithReshuffleLifecycle(G, "0", () => 0);
    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "dev_card");

    expect(G.players["0"].discard).not.toContain("dev_card");
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_develop #0 resolved.")).toBe(true);
  });

  it("routes injected randomness into after-develop passive hooks", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.developmentArea = ["dev_card"];
    p.hand = ["random_keep", "random_discard"];
    G.cardDb.dev_card = {
      ...G.cardDb.test_action_scholars_circle,
      id: "dev_card",
      displayName: "Development",
      developmentCost: { materials: 0 }
    };
    G.cardDb.random_keep = {
      id: "random_keep",
      displayName: "Random Keep",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.random_discard = {
      id: "random_discard",
      displayName: "Random Discard",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["dev_card"],
      resumeDrawCount: 0,
      resumeBehavior: "none",
      usesProgressionToken: false,
      free: true
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_develop",
          effects: [{ trigger: "on_play", op: "discard_random", count: 1 } as any]
        }]
      }
    } as any;

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0.6 } }, "dev_card");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.discard).toEqual(["dev_card", "random_discard"]);
    expect(p.hand).toEqual(["random_keep"]);
    expect(G.log.some((entry) => entry.message === "Discarded random_discard at random.")).toBe(true);
  });

  it("resumes the reshuffle draw after an after-develop passive choice resolves", () => {
    const options: GameOptions = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] };
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: cardDb([
        card({ id: "discard_seed", startingLocation: "box", ownership: "nation" }),
        card({ id: "dev_card", startingLocation: "box", ownership: "nation", developmentCost: { materials: 1, population: 0, progress: 0, goods: 0 } }),
        card({ id: "market_1", startingLocation: "market" }),
        card({ id: "market_2", startingLocation: "market" }),
        card({ id: "market_3", startingLocation: "market" }),
        card({ id: "market_4", startingLocation: "market" }),
        card({ id: "market_5", startingLocation: "market" })
      ]),
      nationDb: {
        develop_choice_nation: {
          id: "develop_choice_nation",
          displayName: "Develop Choice Nation",
          powerCardIds: [],
          stateCardIds: [],
          startingDeckCardIds: [],
          nationDeckCardIds: [],
          developmentCardIds: ["dev_card"],
          setupRules: [
            { op: "place_card_in_area", cardId: "discard_seed", area: "discard" },
            { op: "gain_resource", resource: "materials", count: 1 }
          ],
          passiveRules: [{
            trigger: "on_develop",
            effects: [{
              trigger: "on_play",
              op: "choose_one",
              choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
            } as any]
          }],
          actionTokensBase: 1,
          exhaustTokensBase: 1,
          requiredExpansions: [],
          implemented: true,
          tested: true
        }
      },
      playerNationIds: { "0": "develop_choice_nation", "1": "develop_choice_nation" }
    });

    drawCardWithReshuffleLifecycle(G, "0", () => 0);
    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "dev_card");

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: undefined,
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
    });
    expect(G.scoring).toEqual({
      reason: "development_area_empty",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
    expect(G.players["0"].hand).toEqual([]);

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].hand).toEqual(["dev_card"]);
    expect(G.players["0"].deck).toEqual(["discard_seed"]);
  });

  it("adds the top nation card to discard before shuffling", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.nationDeck).toEqual([]);
    expect(p.hand).toContain("test_action_lineage_record");
    expect(p.progressionTokens?.developmentArea).toBe(1);
    expect(p.actionTokensAvailable).toBe(p.actionTokensBase - 1);
    expect(p.exhaustTokensAvailable).toBe(p.exhaustTokensBase);
  });

  it("consumes ordered Nation cards deterministically before Development choices", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["first_nation_card", "second_nation_card"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.first_nation_card = { ...G.cardDb.test_action_lineage_record, id: "first_nation_card", displayName: "First Nation" };
    G.cardDb.second_nation_card = { ...G.cardDb.test_action_lineage_record, id: "second_nation_card", displayName: "Second Nation" };
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    drawCardWithReshuffleLifecycle(G, "0", () => 0.99);

    expect(p.nationDeck).toEqual(["second_nation_card"]);
    expect(p.deck).toEqual(["first_nation_card"]);
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.progressionTokens).toEqual({ nationDeck: 1, developmentArea: 0 });
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(first_nation_card)")).toBe(true);
    expect(G.log.some((entry) => entry.message.includes("DevelopmentChoicePending"))).toBe(false);
  });

  it("runs nation progression when a draw needs reshuffle even if discard starts empty", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = ["test_action_lineage_record"];

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("test_action_lineage_record");
    expect(p.hand).toEqual(["test_action_lineage_record"]);
    expect(p.nationDeck).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(p.progressionTokens?.developmentArea).toBe(1);
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(test_action_lineage_record)")).toBe(true);
  });

  it("places the reshuffle progression marker in Development when adding the last Nation card", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = ["test_action_lineage_record"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.actionTokensAvailable = 1;
    p.exhaustTokensAvailable = 1;
    p.progressionTokens = { nationDeck: 0, developmentArea: 0 };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.progressionTokens).toEqual({ nationDeck: 0, developmentArea: 1 });
    expect(p.actionTokensAvailable).toBe(0);
    expect(p.exhaustTokensAvailable).toBe(1);
    expect(p.hand).toEqual(["test_action_lineage_record"]);
  });

  it("can offer development on reshuffle even if discard starts empty", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    });
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
  });

  it("does not start reshuffle hooks when only unpayable Development is available", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = [];
    p.developmentArea = ["dev_card"];
    p.resources = { materials: 0, influence: 0, knowledge: 0, unrest: 0, goods: 0 };
    G.cardDb.dev_card = { ...G.cardDb.test_action_scholars_circle, id: "dev_card", displayName: "Development", developmentCost: { knowledge: 1 } };
    G.activeNationRulesets = {
      "0": {
        nationId: "unpayable_development_nation",
        displayName: "Unpayable Development Nation",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [{ trigger: "before_reshuffle", effects: [{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 } as any] }],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.goods).toBe(0);
    expect(G.log.some((entry) => entry.message.includes("reshuffle"))).toBe(false);
  });

  it("terminates safely when no draw, discard, Nation, Accession, or payable Development cards are available", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = [];
    p.accessionCardId = undefined;
    p.developmentArea = [];

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(p.hand).toEqual([]);
    expect(p.deck).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(G.pendingReshuffleResolution).toBeUndefined();
    expect(G.log.some((entry) => entry.message.startsWith("ReshuffleResolved("))).toBe(false);
  });

  it("flips state when the accession card is added from the nation deck", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    p.accessionCardId = "test_action_lineage_record";
    p.nationDeck = ["test_action_lineage_record"];

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea[0]).toBe("civilized_state");
    expect(G.log.some((entry) => entry.message === "StateFlippedOnAccession(test_action_lineage_record)")).toBe(true);
  });

  it("uses the active State card token metadata after accession", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    p.accessionCardId = "test_action_lineage_record";
    p.nationDeck = ["test_action_lineage_record"];
    G.cardDb.barbarian_state = {
      id: "barbarian_state",
      displayName: "Barbarian State",
      type: "state",
      cardType: "state",
      suit: "uncivilized",
      cost: 0,
      tags: ["barbarian"],
      effects: [],
      stateActionTokens: 3,
      stateExhaustTokens: 4,
      stateHandSize: 5
    } as any;
    G.cardDb.civilized_state = {
      id: "civilized_state",
      displayName: "Civilized State",
      type: "state",
      cardType: "state",
      suit: "civilized",
      cost: 0,
      tags: ["empire"],
      effects: [],
      stateActionTokens: 2,
      stateExhaustTokens: 6,
      stateHandSize: 6
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea[0]).toBe("civilized_state");
    expect(p.actionTokensBase).toBe(2);
    expect(p.exhaustTokensBase).toBe(6);
    expect(p.handSize).toBe(6);
  });

  it("flips the active side of a single two-sided State card on accession", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.stateArea = ["two_sided_state"];
    p.accessionCardId = "test_action_lineage_record";
    p.nationDeck = ["test_action_lineage_record"];
    G.cardDb.two_sided_state = {
      id: "two_sided_state",
      displayName: "Two Sided State",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["barbarian", "empire"],
      effects: []
    };
    G.cardStates = { two_sided_state: { activeState: "uncivilized" } };

    expect(currentStateMatches(G, "0", "barbarian")).toBe(true);
    expect(currentStateMatches(G, "0", "empire")).toBe(false);

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea).toEqual(["two_sided_state"]);
    expect(currentStateMatches(G, "0", "barbarian")).toBe(false);
    expect(currentStateMatches(G, "0", "empire")).toBe(true);
    expect(G.cardStates?.two_sided_state?.activeState).toBe("civilized");
    expect(G.log.some((entry) => entry.message === "StateFlippedOnAccession(test_action_lineage_record)")).toBe(true);
  });

  it("does not flip state on accession for nations that never become empire", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    p.accessionCardId = "test_action_lineage_record";
    p.nationDeck = ["test_action_lineage_record"];
    G.activeNationRulesets = {
      "0": {
        nationId: "never_empire",
        displayName: "Never Empire",
        rulesetTags: ["never_becomes_empire"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [{ op: "never_flip_to_empire" }],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea).toEqual(["barbarian_state", "civilized_state"]);
    expect(G.log.some((entry) => entry.message === "StateFlipSkippedOnAccession(test_action_lineage_record/never_empire)")).toBe(true);
  });

  it("recognizes an accession-typed Nation card as the accession even without a separate pointer", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    p.nationDeck = ["accession_card"];
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

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea[0]).toBe("civilized_state");
    expect(G.log.some((entry) => entry.message === "StateFlippedOnAccession(accession_card)")).toBe(true);
  });

  it("treats accession-typed Nation cards as regular progression for no-accession nations", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    p.accessionCardId = "accession_card";
    p.nationDeck = ["accession_card"];
    G.cardDb.accession_card = {
      id: "accession_card",
      displayName: "Accession",
      type: "accession",
      cardType: "accession",
      suit: "civilized",
      cost: 0,
      tags: ["accession"],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_accession"] as any
    };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea[0]).toBe("barbarian_state");
    expect(p.accessionCardId).toBeUndefined();
    expect(p.hand).toEqual(["accession_card"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "StateFlippedOnAccession(accession_card)")).toBe(false);
  });

  it("flips only the active two-sided state pair on accession", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.stateArea = ["barbarian_state", "civilized_state", "custom_state_reference"];
    p.accessionCardId = "test_action_lineage_record";
    p.nationDeck = ["test_action_lineage_record"];

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea).toEqual(["civilized_state", "barbarian_state", "custom_state_reference"]);
  });

  it("adds a separately tracked accession card before offering Development", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    p.stateArea = ["barbarian_state", "civilized_state"];
    p.accessionCardId = "accession_card";
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
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.hand).toContain("accession_card");
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.accessionCardId).toBeUndefined();
    expect(p.stateArea[0]).toBe("civilized_state");
    expect(p.progressionTokens?.developmentArea).toBe(1);
  });

  it("treats separately tracked Accession as a Nation deck card for hook zone conditions", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = [];
    p.accessionCardId = "accession_card";
    p.resources.goods = 0;
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
    G.activeNationRulesets = {
      "0": {
        nationId: "accession_condition_nation",
        displayName: "Accession Condition Nation",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [{
          trigger: "before_reshuffle",
          condition: { op: "zone_empty", zoneId: "nationDeck" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 } as any]
        }],
        implemented: true,
        tested: true
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.resources.goods).toBe(0);
    expect(p.hand).toEqual(["accession_card"]);
    expect(p.accessionCardId).toBeUndefined();
  });

  it("short game accession pauses reshuffle for a Development removal choice", () => {
    const G = createInitialState({ usePrivateData: false });
    G.options = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: ["short_game"] };
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["accession_card"];
    p.developmentArea = ["test_action_scholars_circle", "test_action_foundry_shift"];
    p.stateArea = ["barbarian_state", "civilized_state"];
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

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingShortGameDevelopmentExileChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle", "test_action_foundry_shift"],
      resumeDrawCount: 1
    });
    expect(p.stateArea[0]).toBe("civilized_state");
    expect(p.discard).toEqual(["test_action_archive_survey", "accession_card"]);
    expect(p.hand).toEqual([]);

    resolveShortGameDevelopmentExileChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_foundry_shift");

    expect(G.pendingShortGameDevelopmentExileChoice).toBeUndefined();
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.exile).toEqual(["test_action_foundry_shift"]);
    expect(p.hand).toHaveLength(1);
    expect(p.discard).toEqual([]);
  });

  it("short game accession auto-exiles the lone Development and resumes reshuffle", () => {
    const G = createInitialState({ usePrivateData: false });
    G.options = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: ["short_game"] };
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["accession_card"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.stateArea = ["barbarian_state", "civilized_state"];
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

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingShortGameDevelopmentExileChoice).toBeUndefined();
    expect(p.developmentArea).toEqual([]);
    expect(p.exile).toEqual(["test_action_scholars_circle"]);
    expect(p.hand).toHaveLength(1);
    expect(p.discard).toEqual([]);
    expect(p.stateArea[0]).toBe("civilized_state");
  });

  it("short game accession can skip the Development removal for nation exceptions", () => {
    const G = createInitialState({ usePrivateData: false });
    G.options = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: ["short_game"] };
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["accession_card"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.stateArea = ["barbarian_state", "civilized_state"];
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
    G.activeNationRulesets = {
      "0": {
        nationId: "short_game_exception",
        displayName: "Short Game Exception",
        rulesetTags: ["short_game_exception"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [{ op: "skip_accession_development_exile" }],
        hookRules: [],
        implemented: true,
        tested: true
      } as any
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("accession_card");
    expect(G.pendingShortGameDevelopmentExileChoice).toBeUndefined();
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.exile).toEqual([]);
    expect(p.hand).toEqual(["accession_card"]);
  });

  it("creates a pending development choice when the nation deck is empty", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    });
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.discard).toEqual(["test_action_archive_survey"]);
  });

  it("does not offer reshuffle Development for nations whose Development area is replaced", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_development_area", "quest_development_replacement"] as any
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("test_action_archive_survey");
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.progressionTokens?.developmentArea).toBe(0);
  });

  it("does not add default Nation cards for nations tagged as having no Nation deck", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];
    p.developmentArea = [];
    p.actionTokensAvailable = 1;
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_nation_deck"] as any
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("test_action_archive_survey");
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(p.nationDeck).toEqual(["test_action_lineage_record"]);
    expect(p.progressionTokens).toEqual({ nationDeck: 0, developmentArea: 0 });
    expect(p.actionTokensAvailable).toBe(1);
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(test_action_lineage_record)")).toBe(false);
  });

  it("allows the player to skip a payable Development choice during reshuffle", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingDevelopmentChoice).toMatchObject({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    });

    skipDevelopmentChoice({ G, ctx, random: { Number: () => 0 } });

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(2);
    expect(p.exhaustTokensAvailable).toBe(p.exhaustTokensBase);
    expect(p.progressionTokens?.developmentArea).toBe(0);
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.discard).toEqual([]);
    expect(p.deck).toEqual([]);
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "DevelopmentSkipped(player_declined)")).toBe(true);
  });

  it("adds Nation cards before offering Development even when development is available from the start", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.activeNationRulesets = {
      "0": {
        nationId: "early_development",
        displayName: "Early Development",
        rulesetTags: ["development_area_available_from_start"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [{ op: "development_available_from_start" } as any],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("test_action_lineage_record");
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.hand).toEqual(["test_action_lineage_record"]);
    expect(p.nationDeck).toEqual([]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.discard).toEqual([]);
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.progressionTokens?.developmentArea).toBe(1);
  });

  it("can offer development for no-Nation-deck nations that develop from the start", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = [];
    p.accessionCardId = undefined;
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.activeNationRulesets = {
      "0": {
        nationId: "no_nation_development",
        displayName: "No Nation Development",
        rulesetTags: ["no_nation_deck", "development_area_available_from_start"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [
          { op: "skip_default_nation_card_addition" } as any,
          { op: "development_available_from_start" } as any
        ],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    });
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.exhaustTokensAvailable).toBe(p.exhaustTokensBase);
    expect(p.progressionTokens?.developmentArea ?? 0).toBe(0);
  });

  it("triggers scoring when a configured terminal nation card is added on reshuffle", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["terminal_nation_card"];
    G.cardDb.terminal_nation_card = {
      id: "terminal_nation_card",
      displayName: "Terminal Nation Card",
      type: "nation",
      cardType: "nation",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        nationId: "terminal_progression",
        displayName: "Terminal Progression",
        rulesetTags: ["nadir_card"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [{ op: "trigger_game_end_when_card_added", cardId: "terminal_nation_card" } as any],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.scoring).toEqual({
      reason: "nation_card_added:terminal_nation_card",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
  });

  it("does not flip state when a configured terminal accession-style Nation card is added on reshuffle", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["terminal_accession_card"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    G.cardDb.terminal_accession_card = {
      id: "terminal_accession_card",
      displayName: "Terminal Accession",
      type: "accession",
      cardType: "accession",
      suit: "none",
      cost: 0,
      tags: ["accession"],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        nationId: "terminal_progression",
        displayName: "Terminal Progression",
        rulesetTags: ["zenith_card"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [{ op: "trigger_game_end_when_card_added", cardId: "terminal_accession_card" } as any],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.stateArea).toEqual(["barbarian_state", "civilized_state"]);
    expect(G.scoring).toEqual({
      reason: "nation_card_added:terminal_accession_card",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
    expect(G.log.some((entry) => entry.message === "StateFlippedOnAccession(terminal_accession_card)")).toBe(false);
  });

  it("moves a configured nadir Nation card to play instead of discard without flipping State", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["discard_seed"];
    p.nationDeck = ["nadir_nation_card"];
    p.stateArea = ["alien_state"];
    G.cardDb.discard_seed = {
      id: "discard_seed",
      displayName: "Discard Seed",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.alien_state = {
      id: "alien_state",
      displayName: "Alien / Native",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["alien", "native"],
      effects: []
    };
    G.cardStates = { alien_state: { activeState: "alien" } };
    G.cardDb.nadir_nation_card = {
      id: "nadir_nation_card",
      displayName: "Nadir Nation Card",
      type: "nation",
      cardType: "nation",
      suit: "none",
      cost: 0,
      tags: ["accession"],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        nationId: "nadir_progression",
        displayName: "Nadir Progression",
        rulesetTags: ["nadir_card", "custom_state_card"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [{ op: "place_nation_card_in_play_when_added", cardId: "nadir_nation_card", suppressStateFlip: true } as any],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("discard_seed");
    expect(p.nationDeck).toEqual([]);
    expect(p.playArea).toEqual(["nadir_nation_card"]);
    expect(p.discard).toEqual([]);
    expect(p.hand).toEqual(["discard_seed"]);
    expect(p.stateArea).toEqual(["alien_state"]);
    expect(G.cardStates?.alien_state?.activeState).toBe("alien");
    expect(G.log.some((entry) => entry.message === "NationCardAddedToPlayOnReshuffle(nadir_nation_card)")).toBe(true);
    expect(G.log.some((entry) => entry.message === "StateFlippedOnAccession(nadir_nation_card)")).toBe(false);
  });

  it("does not flip state when an accession-style Nation card is placed in play on reshuffle", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["discard_seed"];
    p.nationDeck = ["in_play_accession_card"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    G.cardDb.discard_seed = {
      id: "discard_seed",
      displayName: "Discard Seed",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.in_play_accession_card = {
      id: "in_play_accession_card",
      displayName: "In-Play Accession",
      type: "nation",
      cardType: "nation",
      suit: "none",
      cost: 0,
      tags: ["accession"],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        nationId: "in_play_accession_progression",
        displayName: "In-Play Accession Progression",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [{ op: "place_nation_card_in_play_when_added", cardId: "in_play_accession_card" } as any],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("discard_seed");
    expect(p.playArea).toEqual(["in_play_accession_card"]);
    expect(p.stateArea).toEqual(["barbarian_state", "civilized_state"]);
    expect(G.log.some((entry) => entry.message === "NationCardAddedToPlayOnReshuffle(in_play_accession_card)")).toBe(true);
    expect(G.log.some((entry) => entry.message === "StateFlippedOnAccession(in_play_accession_card)")).toBe(false);
  });

  it("does not start short-game Development exile when an accession-style Nation card is placed in play", () => {
    const G = createInitialState({ usePrivateData: false });
    G.options = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: ["short_game"] };
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["discard_seed"];
    p.nationDeck = ["in_play_accession_card"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.stateArea = ["barbarian_state", "civilized_state"];
    G.cardDb.discard_seed = {
      id: "discard_seed",
      displayName: "Discard Seed",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.in_play_accession_card = {
      id: "in_play_accession_card",
      displayName: "In-Play Accession",
      type: "nation",
      cardType: "nation",
      suit: "none",
      cost: 0,
      tags: ["accession"],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        nationId: "in_play_accession_progression",
        displayName: "In-Play Accession Progression",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [{ op: "place_nation_card_in_play_when_added", cardId: "in_play_accession_card" } as any],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBe("discard_seed");
    expect(G.pendingShortGameDevelopmentExileChoice).toBeUndefined();
    expect(p.playArea).toEqual(["in_play_accession_card"]);
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.stateArea).toEqual(["barbarian_state", "civilized_state"]);
  });

  it("resolves a paid development choice, shuffles, and resumes the interrupted draw", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(0);
    expect(p.developmentArea).toEqual([]);
    expect(p.progressionTokens?.developmentArea).toBe(1);
    expect(p.actionTokensAvailable).toBe(p.actionTokensBase - 1);
    expect(p.exhaustTokensAvailable).toBe(p.exhaustTokensBase);
    expect(p.hand).toHaveLength(1);
    expect(["test_action_archive_survey", "test_action_scholars_circle"]).toContain(p.hand[0]);
  });

  it("restores a pending Development choice if its after-develop hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    };
    G.activeNationRulesets = {
      "0": {
        nationId: "failing_after_develop",
        displayName: "Failing After Develop",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [{
          trigger: "after_develop",
          effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
        } as any],
        implemented: true,
        tested: true
      }
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    const restoredPlayer = G.players["0"];
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    });
    expect(restoredPlayer.resources.materials).toBe(2);
    expect(restoredPlayer.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(restoredPlayer.discard).toEqual(["test_action_archive_survey"]);
    expect(restoredPlayer.hand).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveDevelopmentChoice): development_resolution_failed(test_action_scholars_circle)");
  });

  it("restores a pending Development choice if a continued after-develop hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    };
    G.activeNationRulesets = {
      "0": {
        nationId: "failing_continued_after_develop",
        displayName: "Failing Continued After Develop",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [
          {
            trigger: "after_develop",
            effects: [{
              trigger: "on_play",
              op: "choose_one",
              choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
            } as any]
          } as any,
          {
            trigger: "after_develop",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          } as any
        ],
        implemented: true,
        tested: true
      }
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingPostDevelopmentResolution).toBeDefined();

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    const restoredPlayer = G.players["0"];
    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingPostDevelopmentResolution).toBeUndefined();
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    });
    expect(restoredPlayer.resources.materials).toBe(2);
    expect(restoredPlayer.resources.knowledge).toBe(0);
    expect(restoredPlayer.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(restoredPlayer.discard).toEqual(["test_action_archive_survey"]);
    expect(restoredPlayer.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_develop #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveDevelopmentChoice): development_resolution_failed(test_action_scholars_circle)");
  });

  it("resolves a card-driven development choice without using a progression token, shuffling, or drawing", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = ["test_action_archive_survey"];
    p.discard = ["test_action_foundry_shift"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.exhaustTokensAvailable = 0;
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 0,
      resumeBehavior: "none",
      usesProgressionToken: false
    } as any;

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(0);
    expect(p.developmentArea).toEqual([]);
    expect(p.progressionTokens?.developmentArea).toBe(0);
    expect(p.exhaustTokensAvailable).toBe(0);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.discard).toEqual(["test_action_foundry_shift", "test_action_scholars_circle"]);
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message.startsWith("ReshuffleResolved("))).toBe(false);
  });

  it("resolves a free card-driven development choice without paying its Development cost", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = ["test_action_archive_survey"];
    p.discard = ["test_action_foundry_shift"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.exhaustTokensAvailable = 0;
    p.resources.materials = 0;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 99 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 0,
      resumeBehavior: "none",
      usesProgressionToken: false,
      free: true
    } as any;

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(0);
    expect(p.developmentArea).toEqual([]);
    expect(p.discard).toEqual(["test_action_foundry_shift", "test_action_scholars_circle"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.progressionTokens?.developmentArea).toBe(0);
  });

  it("delays after-reshuffle hooks until a pending development choice completes", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_reshuffle",
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
        }]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingDevelopmentChoice).toBeDefined();
    expect(p.resources.influence).toBe(0);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #0 resolved.")).toBe(false);

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.influence).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #0 resolved.")).toBe(true);
  });

  it("pauses the interrupted draw when after-reshuffle creates a pending choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_reshuffle",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
          }]
        }]
      }
    } as any;

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingChoice).toBeDefined();
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.discard).toEqual([]);
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #0 resolved.")).toBe(false);

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.deck).toEqual([]);
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #0 resolved.")).toBe(true);
  });

  it("pauses the interrupted draw when after-reshuffle creates a reactive Exhaust choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    const exhaustCardId = "after_reshuffle_reactive_exhaust";
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.playArea = [exhaustCardId];
    p.exhaustTokensAvailable = 1;
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "After Reshuffle Reactive Exhaust",
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
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_reshuffle",
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual([]);

    resolveReactiveExhaustChoice({ G, ctx, random: { Number: () => 0 } }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.influence).toBe(1);
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #0 resolved.")).toBe(true);
  });

  it("continues a resumed draw through a later ordinary reshuffle", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = ["test_action_archive_survey"];
    p.discard = ["test_action_foundry_shift"];
    p.hand = [];
    p.nationDeck = [];
    p.accessionCardId = undefined;
    p.developmentArea = [];
    G.pendingReshuffleDraw = { playerId: "0", resumeDrawCount: 2 };

    continuePendingReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_archive_survey", "test_action_foundry_shift"]);
    expect(p.deck).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(G.log.some((entry) => entry.message === "ReshuffleResolved(deck=1, deterministic=injected_rng)")).toBe(true);
  });

  it("keeps a pending reshuffle draw behind an unfinished nation hook continuation", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = ["test_action_archive_survey"];
    p.hand = [];
    G.pendingReshuffleDraw = { playerId: "0", resumeDrawCount: 1 };
    G.pendingNationHookContinuation = {
      playerId: "0",
      trigger: "after_reshuffle",
      payload: undefined,
      nextIndex: 1,
      resolvedHookIndex: 0
    };

    const continued = continuePendingReshuffleLifecycle(G, "0", () => 0);

    expect(continued).toBe(false);
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });
    expect(G.pendingNationHookContinuation).toEqual({
      playerId: "0",
      trigger: "after_reshuffle",
      payload: undefined,
      nextIndex: 1,
      resolvedHookIndex: 0
    });
    expect(p.hand).toEqual([]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
  });

  it("pauses and resumes later after-reshuffle overrides when an earlier override creates a pending choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.resources.materials = 0;
    p.resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        nationId: "pending_reshuffle_overrides",
        displayName: "Pending Reshuffle Overrides",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [
          {
            op: "custom_reshuffle_effect",
            effect: [{
              trigger: "on_play",
              op: "choose_one",
              choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
            }]
          } as any,
          {
            op: "custom_reshuffle_effect",
            effect: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
          } as any
        ],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingChoice).toBeDefined();
    expect(p.resources.knowledge).toBe(0);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual([]);

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(p.resources.materials).toBe(1);
    expect(p.resources.knowledge).toBe(1);
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "NationRulesetApplied(pending_reshuffle_overrides/reshuffle/custom_reshuffle_effect)")).toBe(true);
  });

  it("pauses the interrupted draw when after-reshuffle creates a pending Exile choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.market = ["market_civilized", "market_civilized_b"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_1"];
    for (const id of ["market_civilized", "market_civilized_b", "market_refill"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "civilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_reshuffle",
          effects: [{ trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" } as any]
        }]
      }
    } as any;

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      source: "market",
      cardIds: ["market_civilized", "market_civilized_b"]
    });
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual([]);

    resolveExileChoice({ G, ctx, random: { Number: () => 0 } }, "market_civilized");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].exile).toContain("market_civilized");
  });

  it("keeps a resolved Exile choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.market = ["market_civilized", "market_civilized_b"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_1"];
    for (const id of ["market_civilized", "market_civilized_b", "market_refill"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "civilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingExileChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveExileChoice({ G, ctx, random: { Number: () => 0 } }, "market_civilized");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual([]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].exile).toContain("market_civilized");
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveExileChoice): after_reshuffle_hook_failed");
  });

  it("pauses the interrupted draw when after-reshuffle creates a pending Look order choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey", "test_action_foundry_shift"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_reshuffle",
          effects: [{ trigger: "on_play", op: "look_cards", source: "deck", count: 2 } as any]
        }]
      }
    } as any;

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingLookOrderChoice).toEqual({
      playerId: "0",
      sourceCardId: undefined,
      source: "deck",
      cardIds: ["test_action_foundry_shift", "test_action_archive_survey"]
    });
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });
    expect(p.deck).toEqual(["test_action_foundry_shift", "test_action_archive_survey"]);
    expect(p.hand).toEqual([]);

    resolveLookOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["test_action_archive_survey", "test_action_foundry_shift"]);

    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(p.deck).toEqual(["test_action_foundry_shift"]);
  });

  it("evaluates History hook conditions against a nation replacement zone", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.history = [];
    p.sideAreas = { sunken: ["history_replacement_card"] };
    p.resources.knowledge = 0;
    G.cardDb.history_replacement_card = {
      id: "history_replacement_card",
      displayName: "History Replacement Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true }],
        hookRules: [{
          trigger: "after_reshuffle",
          condition: { op: "zone_has_at_least", zoneId: "history", count: 1 },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
        }]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #0 resolved.")).toBe(true);
  });

  it("pauses later nation hooks when an earlier hook creates a pending Look order choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey", "test_action_foundry_shift"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "look_cards", source: "deck", count: 2 } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingLookOrderChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toEqual({
      playerId: "0",
      trigger: "after_reshuffle",
      payload: undefined,
      nextIndex: 1,
      resolvedHookIndex: 0
    });
    expect(p.resources.knowledge).toBe(0);

    resolveLookOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["test_action_foundry_shift", "test_action_archive_survey"]);

    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.hand).toEqual(["test_action_foundry_shift"]);
  });

  it("pauses later nation hooks when an earlier hook creates a pending Draw choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.exile = ["test_action_foundry_shift", "test_action_scholars_circle"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "draw", source: "exile", count: 1 } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingDrawChoice).toEqual({
      playerId: "0",
      sourceCardId: undefined,
      source: "exile",
      cardIds: ["test_action_foundry_shift", "test_action_scholars_circle"],
      remainingCount: 1
    });
    expect(G.pendingNationHookContinuation).toEqual({
      playerId: "0",
      trigger: "after_reshuffle",
      payload: undefined,
      nextIndex: 1,
      resolvedHookIndex: 0
    });
    expect(p.resources.knowledge).toBe(0);

    resolveDrawChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_foundry_shift");

    expect(G.pendingDrawChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.hand).toEqual(["test_action_foundry_shift", "test_action_archive_survey"]);
    expect(p.exile).toEqual(["test_action_scholars_circle"]);
  });

  it("does not draw through a failed continued after_reshuffle hook", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey", "test_action_foundry_shift"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "look_cards", source: "deck", count: 2 } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingLookOrderChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveLookOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["test_action_foundry_shift", "test_action_archive_survey"]);

    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual([]);
    expect(p.deck).toEqual(["test_action_foundry_shift", "test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveLookOrderChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved generic choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.resources.materials = 0;
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{
              trigger: "on_play",
              op: "choose_one",
              choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
            } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.resources.materials).toBe(1);
    expect(p.hand).toEqual([]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Draw choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.exile = ["test_action_foundry_shift", "test_action_scholars_circle"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "draw", source: "exile", count: 1 } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingDrawChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveDrawChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_foundry_shift");

    expect(G.pendingDrawChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_foundry_shift"]);
    expect(p.exile).toEqual(["test_action_scholars_circle"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveDrawChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Find choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.discard = ["test_action_archive_survey"];
    G.pendingFindChoice = {
      playerId: "0",
      cardIds: ["test_action_archive_survey"],
      destination: "hand"
    } as any;
    queueFailingAfterReshuffleContinuation(G);

    resolveFindChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_archive_survey");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(p.discard).toEqual([]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveFindChoice): after_reshuffle_hook_failed");
  });

  it("pauses the interrupted draw when after-reshuffle creates a pending Swap choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.hand = ["hand_civilized", "hand_uncivilized"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.market = ["market_civilized", "market_uncivilized"];
    G.unrestPile = ["new_unrest"];
    for (const [id, suit] of [
      ["hand_civilized", "civilized"],
      ["market_civilized", "civilized"],
      ["hand_uncivilized", "uncivilized"],
      ["market_uncivilized", "uncivilized"]
    ] as const) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit,
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_reshuffle",
          effects: [{ trigger: "on_play", op: "swap_card", sourceZone: "hand" } as any]
        }]
      }
    } as any;

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingSwapChoice).toEqual({
      playerId: "0",
      sourceZone: "hand",
      choices: [
        { cardId: "hand_civilized", marketCardId: "market_civilized" },
        { cardId: "hand_uncivilized", marketCardId: "market_uncivilized" }
      ]
    });
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual(["hand_civilized", "hand_uncivilized"]);

    resolveSwapChoice({ G, ctx, random: { Number: () => 0 } }, "hand_civilized", "market_civilized");

    expect(G.pendingSwapChoice).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["hand_uncivilized", "market_civilized", "test_action_archive_survey"]);
    expect(G.market).toEqual(["hand_civilized", "market_uncivilized"]);
  });

  it("keeps a resolved Swap choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.hand = ["hand_civilized", "hand_uncivilized"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.market = ["market_civilized", "market_uncivilized"];
    G.unrestPile = ["new_unrest"];
    for (const [id, suit] of [
      ["hand_civilized", "civilized"],
      ["market_civilized", "civilized"],
      ["hand_uncivilized", "uncivilized"],
      ["market_uncivilized", "uncivilized"]
    ] as const) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit,
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "swap_card", sourceZone: "hand" } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingSwapChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveSwapChoice({ G, ctx, random: { Number: () => 0 } }, "hand_civilized", "market_civilized");

    expect(G.pendingSwapChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["hand_uncivilized", "market_civilized"]);
    expect(G.market).toEqual(["hand_civilized", "market_uncivilized"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveSwapChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Place-on-deck choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.hand = ["test_action_foundry_shift", "test_action_civic_focus"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "place_card_on_deck", sourceZone: "hand" } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingPlaceOnDeckChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolvePlaceOnDeckChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_foundry_shift");

    expect(G.pendingPlaceOnDeckChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_civic_focus"]);
    expect(p.deck).toEqual(["test_action_foundry_shift", "test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolvePlaceOnDeckChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Give-card choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.hand = ["test_action_foundry_shift", "test_action_civic_focus"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.players["1"].hand = [];
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "give_card" } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingGiveCardChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveGiveCardChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_foundry_shift", "1");

    expect(G.pendingGiveCardChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_civic_focus"]);
    expect(G.players["1"].hand).toEqual(["test_action_foundry_shift"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveGiveCardChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Return Unrest choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.hand = ["hand_unrest", "hand_unrest_b"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.unrestPile = [];
    G.cardDb.hand_unrest = {
      id: "hand_unrest",
      displayName: "Hand Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.hand_unrest_b = {
      id: "hand_unrest_b",
      displayName: "Hand Unrest B",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "return_unrest" } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingReturnUnrestChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveReturnUnrestChoice({ G, ctx, random: { Number: () => 0 } }, "hand_unrest");

    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["hand_unrest_b"]);
    expect(G.unrestPile).toEqual(["hand_unrest"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveReturnUnrestChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Garrison choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.playArea = ["test_region", "second_region"];
    p.hand = ["test_action_foundry_shift", "test_action_scholars_circle"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.cardDb.test_region = {
      id: "test_region",
      displayName: "Test Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.second_region = {
      id: "second_region",
      displayName: "Second Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "garrison_card" } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingGarrisonChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveGarrisonChoice({ G, ctx, random: { Number: () => 0 } }, "test_region", "test_action_foundry_shift");

    expect(G.pendingGarrisonChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_scholars_circle"]);
    expect(G.cardStates?.test_region?.garrisonedCardIds).toEqual(["test_action_foundry_shift"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveGarrisonChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Region choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.playArea = ["test_region", "second_region"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.cardDb.test_region = {
      id: "test_region",
      displayName: "Test Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.second_region = {
      id: "second_region",
      displayName: "Second Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "recall_region" } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingRegionChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveRegionChoice({ G, ctx, random: { Number: () => 0 } }, "test_region");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.playArea).toEqual(["second_region"]);
    expect(p.hand).toEqual(["test_region"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveRegionChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Trade choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    G.options = { playerCount: 2, mode: "multiplayer", enabledExpansions: ["trade_routes"], enabledVariants: [] };
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.playArea = ["own_route"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.resources.goods = 1;
    p.resources.knowledge = 0;
    G.cardDb.own_route = {
      id: "own_route",
      displayName: "Own Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "trade" } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingTradeChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveTradeChoice({ G, ctx, random: { Number: () => 0 } });

    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.resources.goods).toBe(0);
    expect(p.resources.knowledge).toBe(1);
    expect(p.hand).toEqual([]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveTradeChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Acquire choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.market = ["market_civilized_a", "market_civilized_b", "market_filler_a", "market_filler_b", "market_filler_c"];
    G.marketRefillPool = ["market_refill_a"];
    G.unrestPile = ["unrest_refill_a"];
    for (const id of [...G.market, ...G.marketRefillPool]) {
      const isCivilized = id.startsWith("market_civilized");
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: isCivilized ? "civilized" : "uncivilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "acquire_card", source: "market", suit: "civilized", count: 1 } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingAcquireChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveAcquireChoice({ G, ctx, random: { Number: () => 0 } }, "market_civilized_a");

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["market_civilized_a"]);
    expect(G.market).toEqual(["test_action_market_pull", "market_civilized_b", "market_filler_a", "market_filler_b", "market_filler_c"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveAcquireChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Market-card choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.market = ["market_civilized_a", "market_civilized_b", "market_filler_a", "market_filler_b", "market_filler_c"];
    G.marketRefillPool = ["market_refill_a"];
    G.unrestPile = ["unrest_refill_a"];
    for (const id of [...G.market, ...G.marketRefillPool]) {
      const isCivilized = id.startsWith("market_civilized");
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: isCivilized ? "civilized" : "uncivilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any]
          },
          {
            trigger: "after_reshuffle",
            effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
          }
        ]
      }
    } as any;

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingMarketCardChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });

    resolveMarketCardChoice({ G, ctx, random: { Number: () => 0 } }, "market_civilized_a");

    expect(G.pendingMarketCardChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["market_civilized_a"]);
    expect(G.market).toEqual(["test_action_market_pull", "market_civilized_b", "market_filler_a", "market_filler_b", "market_filler_c"]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveMarketCardChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Break Through choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    G.cardDb.test_action_archive_survey.suit = "civilized";
    p.exile = ["test_action_archive_survey"];
    G.pendingBreakThroughChoice = {
      playerId: "0",
      source: "exile",
      suit: "civilized",
      cardIds: ["test_action_archive_survey"]
    } as any;
    queueFailingAfterReshuffleContinuation(G);

    resolveBreakThroughChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_archive_survey");

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(p.exile).toEqual([]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveBreakThroughChoice): after_reshuffle_hook_failed");
  });

  it("keeps a resolved Development choice but stops the interrupted draw when a continued after_reshuffle hook fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1,
      allowSkip: true
    };
    queueFailingAfterReshuffleContinuation(G);

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.resources.materials).toBe(0);
    expect(p.developmentArea).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(p.deck).toEqual(["test_action_scholars_circle", "test_action_archive_survey"]);
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveDevelopmentChoice): after_reshuffle_hook_failed");
  });

  it("triggers normal scoring when the last Development card is developed", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.scoring).toEqual({
      reason: "development_area_empty",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
    expect(G.gameover).toBeUndefined();
  });

  it("uses goods to cover development material shortfalls atomically", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 1;
    p.resources.knowledge = 1;
    p.resources.goods = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 3, knowledge: 1 };
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(0);
    expect(p.resources.knowledge).toBe(0);
    expect(p.resources.goods).toBe(1);
    expect(p.developmentArea).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(p.hand).toHaveLength(1);
  });

  it("applies state-gated Progress spend penalties during Development payments", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 0;
    p.resources.knowledge = 2;
    G.unrestPile = ["alien_unrest_1", "alien_unrest_2"];
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
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
    p.stateArea = ["alien_state"];
    G.cardStates = { alien_state: { activeState: "alien" } };
    G.activeNationRulesets!["0"].stateOverrides = [
      { op: "take_unrest_when_spending_resource", resource: "knowledge", state: "alien" } as any
    ];
    G.pendingDevelopmentChoice = {
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 1
    };

    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle");

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect([...p.hand, ...p.deck, ...p.discard]).toContain("alien_unrest_1");
    expect(G.unrestPile).toEqual(["alien_unrest_2"]);
    expect(p.developmentArea).toEqual([]);
  });

  it("honors the selected Progress/Goods substitution when paying a Development cost", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 0;
    p.resources.knowledge = 1;
    p.resources.goods = 1;
    p.stateArea = ["alien_state"];
    G.unrestPile = ["alien_unrest_1", "alien_unrest_2"];
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
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.activeNationRulesets!["0"].stateOverrides = [
      { op: "take_unrest_when_spending_resource", resource: "knowledge", state: "alien" } as any
    ];

    drawCardWithReshuffleLifecycle(G, "0", () => 0);
    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle", { knowledge: 1 });

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(0);
    expect(p.resources.goods).toBe(1);
    expect([...p.hand, ...p.deck, ...p.discard]).toContain("alien_unrest_1");
    expect(G.unrestPile).toEqual(["alien_unrest_2"]);
    expect(p.developmentArea).toEqual([]);
  });

  it("rejects selected Development payments that include extra resources", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 0;
    p.resources.knowledge = 1;
    p.resources.goods = 1;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);
    resolveDevelopmentChoice({ G, ctx, random: { Number: () => 0 } }, "test_action_scholars_circle", { knowledge: 1, goods: 1 });

    expect(G.pendingDevelopmentChoice?.cardIds).toEqual(["test_action_scholars_circle"]);
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.goods).toBe(1);
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.discard).toEqual([]);
  });

  it("does not offer development cards when total goods substitution cannot cover the full cost", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 1;
    p.resources.knowledge = 1;
    p.resources.goods = 1;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2, knowledge: 2 };

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.materials).toBe(1);
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.goods).toBe(1);
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(G.log.some((entry) => entry.message === "DevelopmentSkipped(no_payable_cards)")).toBe(true);
  });

  it("stops reshuffle progression when before_reshuffle triggers Collapse", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    G.unrestPile = [];
    G.players["1"].resources.unrest = 1;
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];
    G.activeNationRulesets = {
      "0": {
        nationId: "collapse_reshuffle",
        displayName: "Collapse Reshuffle",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [
          {
            trigger: "before_reshuffle",
            effects: [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]
          } as any
        ],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(p.nationDeck).toEqual(["test_action_lineage_record"]);
    expect(p.discard).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(test_action_lineage_record)")).toBe(false);
    expect(G.log.some((entry) => entry.message.startsWith("ReshuffleResolved("))).toBe(false);
  });

  it("stops reshuffle progression when a before_reshuffle hook effect fails", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];
    G.activeNationRulesets = {
      "0": {
        nationId: "failing_reshuffle",
        displayName: "Failing Reshuffle",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [{
          trigger: "before_reshuffle",
          effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
        } as any],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(p.nationDeck).toEqual(["test_action_lineage_record"]);
    expect(p.discard).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message === "UnsupportedEffectOp(unsupported_private_effect)")).toBe(true);
    expect(G.log.some((entry) => entry.message === "Nation hook before_reshuffle #0 failed.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(test_action_lineage_record)")).toBe(false);
    expect(G.log.some((entry) => entry.message.startsWith("ReshuffleResolved("))).toBe(false);
  });

  it("pauses reshuffle progression when before_reshuffle creates a pending choice", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];
    p.resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        nationId: "choice_reshuffle",
        displayName: "Choice Reshuffle",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [{
          trigger: "before_reshuffle",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
          } as any]
        } as any],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingChoice).toBeDefined();
    expect(p.nationDeck).toEqual(["test_action_lineage_record"]);
    expect(p.discard).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(test_action_lineage_record)")).toBe(false);
    expect(G.log.some((entry) => entry.message.startsWith("ReshuffleResolved("))).toBe(false);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.nationDeck).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(p.hand).toEqual(["test_action_lineage_record"]);
    expect(G.log.some((entry) => entry.message === "Nation hook before_reshuffle #0 resolved.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(test_action_lineage_record)")).toBe(true);
  });

  it("does not draw through a failed after_reshuffle hook", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.accessionCardId = undefined;
    G.activeNationRulesets = {
      "0": {
        nationId: "failing_after_reshuffle",
        displayName: "Failing After Reshuffle",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [{
          trigger: "after_reshuffle",
          effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
        } as any],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(p.hand).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_reshuffle #0 failed.")).toBe(true);
  });

  it("continues Nation progression after a before-reshuffle choice places a card on deck", () => {
    const G = createInitialState({ usePrivateData: false });
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.hand = ["test_action_foundry_shift"];
    p.nationDeck = ["test_action_lineage_record"];
    G.activeNationRulesets = {
      "0": {
        nationId: "deck_mutating_reshuffle",
        displayName: "Deck Mutating Reshuffle",
        rulesetTags: [],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [{
          trigger: "before_reshuffle",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "place_card_on_deck", cardId: "test_action_foundry_shift", sourceZone: "hand" }]]
          } as any]
        } as any],
        implemented: true,
        tested: true
      }
    };

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingChoice).toBeDefined();
    expect(p.nationDeck).toEqual(["test_action_lineage_record"]);

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(p.hand).toEqual(["test_action_foundry_shift"]);
    expect(p.nationDeck).toEqual([]);
    expect(p.discard).toEqual([]);
    expect(p.deck).toEqual(["test_action_lineage_record", "test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "NationCardAddedOnReshuffle(test_action_lineage_record)")).toBe(true);
    expect(G.log.some((entry) => entry.message.startsWith("ReshuffleResolved("))).toBe(true);
  });
});
