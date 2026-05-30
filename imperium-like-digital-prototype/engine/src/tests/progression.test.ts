import { describe, expect, it } from "vitest";
import { createInitialState } from "../game/initialState";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { resolveChoice, resolveDevelopmentChoice, resolveExileChoice, resolveLookOrderChoice, resolveShortGameDevelopmentExileChoice, resolveSwapChoice, skipDevelopmentChoice } from "../game/moves";
import { currentStateMatches } from "../game/stateMatching";
import { drawCardWithReshuffleLifecycle } from "../game/zones";
import type { GameOptions } from "../options/gameOptions";
import { card, cardDb } from "./commonsTestFixtures";

const ctx = { currentPlayer: "0" } as any;

describe("reshuffle progression", () => {
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
    expect(G.players["0"].hand).toEqual([]);

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].hand).toEqual(["dev_card"]);
    expect(G.players["0"].deck).toEqual(["discard_seed"]);
  });

  it("adds the top nation card to discard before shuffling", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = ["test_action_lineage_record"];

    drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(p.nationDeck).toEqual([]);
    expect(p.hand).toContain("test_action_lineage_record");
    expect(p.progressionTokens?.developmentArea).toBe(1);
    expect(p.exhaustTokensAvailable).toBe(p.exhaustTokensBase - 1);
  });

  it("runs nation progression when a draw needs reshuffle even if discard starts empty", () => {
    const G = createInitialState();
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

  it("can offer development on reshuffle even if discard starts empty", () => {
    const G = createInitialState();
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

  it("flips state when the accession card is added from the nation deck", () => {
    const G = createInitialState();
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

  it("flips the active side of a single two-sided State card on accession", () => {
    const G = createInitialState();
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
    const G = createInitialState();
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
    const G = createInitialState();
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

  it("flips only the active two-sided state pair on accession", () => {
    const G = createInitialState();
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
    const G = createInitialState();
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

  it("short game accession pauses reshuffle for a Development removal choice", () => {
    const G = createInitialState();
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

  it("short game accession can skip the Development removal for nation exceptions", () => {
    const G = createInitialState();
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
    const G = createInitialState();
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

  it("allows the player to skip a payable Development choice during reshuffle", () => {
    const G = createInitialState();
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
    const G = createInitialState();
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
    const G = createInitialState();
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
    const G = createInitialState();
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

  it("moves a configured nadir Nation card to play instead of discard without flipping State", () => {
    const G = createInitialState();
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

  it("resolves a paid development choice, shuffles, and resumes the interrupted draw", () => {
    const G = createInitialState();
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
    expect(p.exhaustTokensAvailable).toBe(p.exhaustTokensBase - 1);
    expect(p.hand).toHaveLength(1);
    expect(["test_action_archive_survey", "test_action_scholars_circle"]).toContain(p.hand[0]);
  });

  it("resolves a card-driven development choice without using a progression token, shuffling, or drawing", () => {
    const G = createInitialState();
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
    const G = createInitialState();
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
    const G = createInitialState();
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
    const G = createInitialState();
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

  it("pauses and resumes later after-reshuffle overrides when an earlier override creates a pending choice", () => {
    const G = createInitialState();
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
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.market = ["market_civilized"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_1"];
    for (const id of ["market_civilized", "market_refill"]) {
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
      cardIds: ["market_civilized"]
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

  it("pauses the interrupted draw when after-reshuffle creates a pending Look order choice", () => {
    const G = createInitialState();
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

  it("pauses later nation hooks when an earlier hook creates a pending Look order choice", () => {
    const G = createInitialState();
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

  it("pauses the interrupted draw when after-reshuffle creates a pending Swap choice", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.hand = ["hand_civilized"];
    p.nationDeck = [];
    p.developmentArea = [];
    G.market = ["market_civilized"];
    G.unrestPile = ["new_unrest"];
    for (const id of ["hand_civilized", "market_civilized"]) {
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
          effects: [{ trigger: "on_play", op: "swap_card", sourceZone: "hand" } as any]
        }]
      }
    } as any;

    const drawn = drawCardWithReshuffleLifecycle(G, "0", () => 0);

    expect(drawn).toBeNull();
    expect(G.pendingSwapChoice).toEqual({
      playerId: "0",
      sourceZone: "hand",
      choices: [{ cardId: "hand_civilized", marketCardId: "market_civilized" }]
    });
    expect(G.pendingReshuffleDraw).toEqual({ playerId: "0", resumeDrawCount: 1 });
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual(["hand_civilized"]);

    resolveSwapChoice({ G, ctx, random: { Number: () => 0 } }, "hand_civilized", "market_civilized");

    expect(G.pendingSwapChoice).toBeUndefined();
    expect(G.pendingReshuffleDraw).toBeUndefined();
    expect(p.hand).toEqual(["market_civilized", "test_action_archive_survey"]);
    expect(G.market).toEqual(["hand_civilized"]);
  });

  it("triggers normal scoring when the last Development card is developed", () => {
    const G = createInitialState();
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
    const G = createInitialState();
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
    const G = createInitialState();
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
    const G = createInitialState();
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

  it("does not offer development cards when total goods substitution cannot cover the full cost", () => {
    const G = createInitialState();
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
    const G = createInitialState();
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

  it("pauses reshuffle progression when before_reshuffle creates a pending choice", () => {
    const G = createInitialState();
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
});
