import { describe, expect, it } from "vitest";
import { runEffects } from "../cards/effectRunner";
import { createInitialState } from "../game/initialState";
import * as moves from "../game/moves";
import { resolveChoice, resolveExileChoice, resolveLookOrderChoice } from "../game/moves";
import { resolvePendingUnrestAllocationChoice } from "../game/unrest";
import type { GameOptions } from "../options/gameOptions";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { card, cardDb } from "./commonsTestFixtures";

describe("effectRunner", () => {
  it("draws from deck", () => {
    const G = createInitialState();
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "draw", count: 1 }]);
    expect(G.players["0"].hand.length).toBe(1);
  });

  it("reshuffles discard when deck empty", () => {
    const G = createInitialState();
    G.players["0"].deck = [];
    G.players["0"].discard = ["test_action_foundry_shift"];
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "draw", count: 1 }]);
    expect(G.players["0"].hand.length).toBe(1);
    expect(["test_action_foundry_shift", "test_action_lineage_record"]).toContain(G.players["0"].hand[0]);
  });

  it("resumes the full remaining draw count after a Development reshuffle choice", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "draw", count: 2 }]);

    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 2,
      allowSkip: true
    });
    expect(p.hand).toEqual([]);
  });

  it("draw_if_able does not reshuffle or add progression cards", () => {
    const G = createInitialState();
    G.players["0"].deck = [];
    G.players["0"].discard = ["test_action_foundry_shift"];
    G.players["0"].nationDeck = ["test_action_lineage_record"];

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "draw_if_able", count: 1 } as any]);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].deck).toEqual([]);
    expect(G.players["0"].discard).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].nationDeck).toEqual(["test_action_lineage_record"]);
    expect(G.log.at(-1)?.message).toBe("Draw-if-able stopped (deck empty).");
  });

  it("draw from a face-up discard pile creates a card choice instead of drawing from deck", () => {
    const G = createInitialState();
    G.players["0"].deck = ["deck_card"];
    G.players["0"].discard = ["discard_a", "discard_b"];
    G.players["0"].hand = [];
    for (const id of ["deck_card", "discard_a", "discard_b"]) {
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

    const result = runEffects({ G, playerId: "0", selfCardId: "discard_drawer" }, [
      { trigger: "on_play", op: "draw", count: 1, source: "discard" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].deck).toEqual(["deck_card"]);
    expect(G.pendingDrawChoice).toEqual({
      playerId: "0",
      sourceCardId: "discard_drawer",
      source: "discard",
      cardIds: ["discard_a", "discard_b"],
      remainingCount: 1
    });
  });

  it("resolves repeated draw choices from the same face-up pile before resuming effects", () => {
    const G = createInitialState();
    G.players["0"].discard = ["discard_a", "discard_b"];
    G.players["0"].hand = [];
    G.players["0"].resources.materials = 0;
    for (const id of ["discard_a", "discard_b"]) {
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

    runEffects({ G, playerId: "0", selfCardId: "discard_drawer" }, [
      { trigger: "on_play", op: "draw", count: 2, source: "discard" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(G.pendingDrawChoice?.remainingCount).toBe(2);
    expect(G.players["0"].resources.materials).toBe(0);

    (moves as any).resolveDrawChoice({ G, ctx: { currentPlayer: "0" } as any }, "discard_b");

    expect(G.pendingDrawChoice).toEqual({
      playerId: "0",
      sourceCardId: "discard_drawer",
      source: "discard",
      cardIds: ["discard_a"],
      remainingCount: 1,
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });
    expect(G.players["0"].hand).toEqual(["discard_b"]);
    expect(G.players["0"].resources.materials).toBe(0);

    (moves as any).resolveDrawChoice({ G, ctx: { currentPlayer: "0" } as any }, "discard_a");

    expect(G.pendingDrawChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["discard_b", "discard_a"]);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("gain resource", () => {
    const G = createInitialState();
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("caps gained resources by the available component supply", () => {
    const G = createInitialState();
    G.resourceSupply = { materials: 1 };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 3 }]);

    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.resourceSupply.materials).toBe(0);
    expect(G.log.at(-1)?.message).toBe("Gained 1/3 materials.");
  });

  it("returns spent resources to the component supply", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 2;
    G.resourceSupply = { materials: 0 };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 }]);

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.resourceSupply.materials).toBe(2);
  });

  it("fails clearly when an unsupported effect op is encountered", () => {
    const G = createInitialState();

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "unsupported_private_effect" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(false);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.log.at(-1)?.message).toBe("UnsupportedEffectOp(unsupported_private_effect)");
  });

  it("triggers normal scoring from a card effect", () => {
    const G = createInitialState();

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "trigger_scoring", reason: "card_effect" } as any
    ]);

    expect(result).toBe(true);
    expect(G.scoring).toEqual({
      reason: "card_effect",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
    expect(G.log.at(-1)?.message).toBe("ScoringTriggered(card_effect)");
  });

  it("gain_fame resolves King of Kings when no ordinary Fame cards remain", () => {
    const G = createInitialState();
    G.cardDb.uncivilized_state = {
      id: "uncivilized_state",
      displayName: "Barbarian",
      type: "state",
      cardType: "state",
      suit: "uncivilized",
      cost: 0,
      tags: ["barbarian"],
      effects: []
    };
    G.players["0"].stateArea = ["uncivilized_state"];
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_source" }, [
      { trigger: "on_play", op: "gain_fame", count: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(6);
    expect(G.players["0"].discard).not.toContain("king_of_kings");
    expect(G.fameDeck).toEqual({
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { "0": true }
    });
    expect(G.scoring).toBeUndefined();
    expect(G.log.map((entry) => entry.message)).toContain("FameGained(fame_source/count=1/gained=king_of_kings)");
  });

  it("takes Unrest for multiple players in the specified allocation order", () => {
    const G = createInitialState();
    G.unrestPile = ["unrest_a", "unrest_b", "unrest_c"];

    const result = runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "take_unrest",
      targetPlayerIds: ["1", "0"],
      count: 1
    } as any]);

    expect(result).toBe(true);
    expect(G.players["1"].discard).toContain("unrest_a");
    expect(G.players["0"].discard).toContain("unrest_b");
    expect(G.unrestPile).toEqual(["unrest_c"]);
    expect(G.gameover).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("UnrestTaken(players=1,0/count=1/taken=2)");
  });

  it("runs imported nation passive rules when that nation gains Unrest", () => {
    const options: GameOptions = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] };
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: cardDb([
        card({ id: "market_1", startingLocation: "market" }),
        card({ id: "market_2", startingLocation: "market" }),
        card({ id: "market_3", startingLocation: "market" }),
        card({ id: "market_4", startingLocation: "market" }),
        card({ id: "market_5", startingLocation: "market" })
      ]),
      nationDb: {
        unrest_passive_nation: {
          id: "unrest_passive_nation",
          displayName: "Unrest Passive Nation",
          powerCardIds: [],
          stateCardIds: [],
          startingDeckCardIds: [],
          nationDeckCardIds: [],
          developmentCardIds: [],
          setupRules: [],
          passiveRules: [{ trigger: "on_gain_unrest", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any] }],
          actionTokensBase: 1,
          exhaustTokensBase: 1,
          requiredExpansions: [],
          implemented: true,
          tested: true
        }
      },
      playerNationIds: { "0": "unrest_passive_nation", "1": "unrest_passive_nation" }
    });
    G.unrestPile = ["unrest_a"];

    const result = runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]);

    expect(result).toBe(true);
    expect(G.players["0"].discard).toContain("unrest_a");
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #0 resolved.")).toBe(true);
  });

  it("pauses taking additional Unrest when an after-gain-Unrest passive creates a choice", () => {
    const options: GameOptions = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] };
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: cardDb([
        card({ id: "market_1", startingLocation: "market" }),
        card({ id: "market_2", startingLocation: "market" }),
        card({ id: "market_3", startingLocation: "market" }),
        card({ id: "market_4", startingLocation: "market" }),
        card({ id: "market_5", startingLocation: "market" })
      ]),
      nationDb: {
        unrest_choice_nation: {
          id: "unrest_choice_nation",
          displayName: "Unrest Choice Nation",
          powerCardIds: [],
          stateCardIds: [],
          startingDeckCardIds: [],
          nationDeckCardIds: [],
          developmentCardIds: [],
          setupRules: [],
          passiveRules: [{
            trigger: "on_gain_unrest",
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
      playerNationIds: { "0": "unrest_choice_nation", "1": "unrest_choice_nation" }
    });
    G.unrestPile = ["unrest_a", "unrest_b"];

    const result = runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "take_unrest", count: 2 } as any]);

    expect(result).toBe(true);
    expect(G.players["0"].discard).toEqual(["unrest_a"]);
    expect(G.unrestPile).toEqual(["unrest_b"]);
    expect(G.pendingChoice).toBeDefined();
    expect(G.log.some((entry) => entry.message === "UnrestTaken(players=0/count=2/taken=2)")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].discard).toEqual(["unrest_a", "unrest_b"]);
    expect(G.unrestPile).toEqual([]);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.log.some((entry) => entry.message === "UnrestTaken(players=0/count=2/taken=2)")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].discard).toEqual(["unrest_a", "unrest_b"]);
    expect(G.unrestPile).toEqual([]);
    expect(G.players["0"].resources.goods).toBe(2);
    expect(G.log.some((entry) => entry.message === "UnrestTaken(players=0/count=2/taken=2)")).toBe(true);
  });

  it("pauses for the triggering player to allocate Unrest before Collapse when a multi-player effect runs short", () => {
    const G = createInitialState();
    G.unrestPile = ["unrest_a"];

    const result = runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "take_unrest",
      targetPlayerIds: ["1", "0"],
      count: 1
    } as any]);

    expect(result).toBe(true);
    expect(G.pendingUnrestAllocationChoice).toEqual({
      playerId: "0",
      recipientPlayerIds: ["1", "0"],
      countPerPlayer: 1,
      availableUnrestCardIds: ["unrest_a"]
    });
    expect(G.players["1"].discard).not.toContain("unrest_a");
    expect(G.players["0"].discard).not.toContain("unrest_a");
    expect(G.unrestPile).toEqual([]);
    expect(G.gameover).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("UnrestAllocationChoicePending(players=1,0/count=1/available=1)");
  });

  it("resolves short multi-player Unrest allocation by triggering-player choice before Collapse scoring", () => {
    const G = createInitialState();
    G.unrestPile = ["unrest_a"];
    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "take_unrest",
      targetPlayerIds: ["1", "0"],
      count: 1
    } as any]);

    expect(resolvePendingUnrestAllocationChoice(G, "0", ["0"])).toBe(true);

    expect(G.players["0"].discard).toContain("unrest_a");
    expect(G.players["1"].discard).not.toContain("unrest_a");
    expect(G.pendingUnrestAllocationChoice).toBeUndefined();
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.log.some((entry) => entry.message === "UnrestAllocationResolved(players=0/taken=1)")).toBe(true);
  });

  it("pauses short Unrest allocation before Collapse when an after-gain-Unrest passive creates a choice", () => {
    const options: GameOptions = { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] };
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: cardDb([
        card({ id: "market_1", startingLocation: "market" }),
        card({ id: "market_2", startingLocation: "market" }),
        card({ id: "market_3", startingLocation: "market" }),
        card({ id: "market_4", startingLocation: "market" }),
        card({ id: "market_5", startingLocation: "market" })
      ]),
      nationDb: {
        unrest_choice_nation: {
          id: "unrest_choice_nation",
          displayName: "Unrest Choice Nation",
          powerCardIds: [],
          stateCardIds: [],
          startingDeckCardIds: [],
          nationDeckCardIds: [],
          developmentCardIds: [],
          setupRules: [],
          passiveRules: [{
            trigger: "on_gain_unrest",
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
      playerNationIds: { "0": "unrest_choice_nation", "1": "unrest_choice_nation" }
    });
    G.unrestPile = ["unrest_a"];
    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "take_unrest",
      targetPlayerIds: ["1", "0"],
      count: 1
    } as any]);

    expect(resolvePendingUnrestAllocationChoice(G, "0", ["0"])).toBe(true);

    expect(G.pendingUnrestAllocationChoice).toBeUndefined();
    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].discard).toContain("unrest_a");
    expect(G.gameover).toBeUndefined();
    expect(G.log.some((entry) => entry.message === "UnrestAllocationResolved(players=0/taken=1)")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.log.some((entry) => entry.message === "UnrestAllocationResolved(players=0/taken=1)")).toBe(true);
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
  });

  it("resolves state-gated effects when the current State matches", () => {
    const G = createInitialState();
    G.players["0"].stateArea = ["state_barbarian", "state_civilized"];

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "conditional_state_is",
      state: "state_barbarian",
      then: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
      else: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
    } as any]);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
  });

  it("resolves state-gated effects using State suit aliases", () => {
    const G = createInitialState();
    G.cardDb.civilized_state = {
      id: "civilized_state",
      displayName: "Civilized",
      type: "state",
      cardType: "state",
      suit: "civilized",
      cost: 0,
      tags: ["empire"],
      effects: []
    };
    G.players["0"].stateArea = ["civilized_state"];

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "conditional_state_is",
      state: "empire",
      then: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
      else: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
    } as any]);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
  });

  it("resolves state-gated fallback effects when the current State does not match", () => {
    const G = createInitialState();
    G.players["0"].stateArea = ["state_civilized", "state_barbarian"];

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "conditional_state_is",
      state: "state_barbarian",
      then: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
      else: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
    } as any]);

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(1);
  });

  it("does not pay an unaffordable resource cost or continue its effect chain", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 },
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(false);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("CostUnpaid(materials/required=2/available=1)");
  });

  it("uses goods to cover ordinary resource payment shortfalls", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.goods = 2;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 3 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.log.at(-1)?.message).toBe("Spent 3 materials.");
  });

  it("pays material costs with Progress or Goods as two Materials each without change", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 1;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 5 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.goods).toBe(0);
  });

  it("takes Unrest for each Progress spent while a state-gated payment override is active", () => {
    const G = createInitialState();
    G.players["0"].resources.knowledge = 2;
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
    G.unrestPile = ["alien_unrest_1", "alien_unrest_2", "alien_unrest_3"];
    G.activeNationRulesets!["0"].stateOverrides = [
      { op: "take_unrest_when_spending_resource", resource: "knowledge", state: "alien" } as any
    ];

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 2 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].discard).toEqual(["alien_unrest_1", "alien_unrest_2"]);
    expect(G.unrestPile).toEqual(["alien_unrest_3"]);
  });

  it("pays Population costs with Progress or Goods as one Population each", () => {
    const G = createInitialState();
    G.players["0"].resources.influence = 1;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 1;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "influence", amount: 3 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.goods).toBe(0);
  });

  it("does not pay Progress costs with Goods or other resources", () => {
    const G = createInitialState();
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 2;
    G.players["0"].resources.materials = 3;
    G.players["0"].resources.influence = 3;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 2 }
    ]);

    expect(result).toBe(false);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.goods).toBe(2);
    expect(G.log.at(-1)?.message).toBe("CostUnpaid(knowledge/required=2/available=1)");
  });

  it("does not use ordinary resources to pay goods costs", () => {
    const G = createInitialState();
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.materials = 3;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "goods", amount: 2 }
    ]);

    expect(result).toBe(false);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(3);
    expect(G.log.at(-1)?.message).toBe("CostUnpaid(goods/required=2/available=1)");
  });

  it("removes resources without using Goods as substitution", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.goods = 2;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "remove_resource", resource: "materials", amount: 3 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.goods).toBe(2);
    expect(G.log.at(-1)?.message).toBe("Removed 1/3 materials.");
  });

  it("continues after mandatory resource removal resolves as much as possible", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "remove_resource", resource: "materials", amount: 3 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("steals resources from another player without using Goods substitution", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.players["1"].resources.materials = 1;
    G.players["1"].resources.goods = 2;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "materials", amount: 3 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["1"].resources.materials).toBe(0);
    expect(G.players["1"].resources.goods).toBe(2);
    expect(G.log.at(-1)?.message).toBe("Stole 1/3 materials from player 1.");
  });

  it("returns resources to supply as much as possible without using Goods substitution", () => {
    const G = createInitialState();
    G.players["0"].resources.influence = 1;
    G.players["0"].resources.goods = 2;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_resource", resource: "influence", amount: 3 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].resources.goods).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.at(-2)?.message).toBe("Returned 1/3 influence.");
  });

  it("return_unrest moves a specified Unrest card from discard to the Unrest pile", () => {
    const G = createInitialState();
    G.players["0"].discard = ["discard_unrest"];
    G.unrestPile = [];
    G.cardDb.discard_unrest = {
      id: "discard_unrest",
      displayName: "Discard Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_unrest", cardId: "discard_unrest", sourceZones: ["discard"] } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.unrestPile).toEqual(["discard_unrest"]);
    expect(G.log.at(-1)?.message).toBe("UnrestReturned(discard_unrest/discard)");
  });

  it("return_unrest creates a choice from hand and discard and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_unrest"];
    G.players["0"].discard = ["discard_unrest"];
    G.unrestPile = [];
    for (const id of ["hand_unrest", "discard_unrest"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "unrest",
        cardType: "unrest",
        suit: "unrest",
        cost: 0,
        tags: [],
        effects: []
      };
    }

    const result = runEffects({ G, playerId: "0", selfCardId: "returner" }, [
      { trigger: "on_play", op: "return_unrest" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingReturnUnrestChoice).toEqual({
      playerId: "0",
      sourceCardId: "returner",
      cardIds: ["hand_unrest", "discard_unrest"],
      sourceZones: ["hand", "discard"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.unrestPile).toEqual([]);
  });

  it("place_card_on_deck moves a specified card from hand to the top of the draw deck", () => {
    const G = createInitialState();
    G.players["0"].hand = ["top_card", "other_card"];
    G.players["0"].deck = ["existing_top"];

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "place_card_on_deck", cardId: "top_card" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual(["other_card"]);
    expect(G.players["0"].deck).toEqual(["top_card", "existing_top"]);
    expect(G.log.at(-1)?.message).toBe("CardPlacedOnDeck(top_card/hand)");
  });

  it("place_card_on_deck creates a choice from hand and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["first_card", "second_card"];
    G.players["0"].deck = ["existing_top"];

    const result = runEffects({ G, playerId: "0", selfCardId: "deck_setter" }, [
      { trigger: "on_play", op: "place_card_on_deck" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingPlaceOnDeckChoice).toEqual({
      playerId: "0",
      sourceCardId: "deck_setter",
      sourceZone: "hand",
      cardIds: ["first_card", "second_card"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });
    expect(G.players["0"].deck).toEqual(["existing_top"]);
    expect(G.players["0"].resources.materials).toBe(0);
  });

  it("give_card moves a specified hand card to the target opponent's hand", () => {
    const G = createInitialState();
    G.players["0"].hand = ["gift_card", "kept_card"];
    G.players["1"].hand = ["opponent_card"];

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "give_card", cardId: "gift_card", targetPlayerId: "1" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual(["kept_card"]);
    expect(G.players["1"].hand).toEqual(["opponent_card", "gift_card"]);
    expect(G.log.at(-1)?.message).toBe("CardGiven(gift_card/0->1)");
  });

  it("give_card creates a choice for card and opponent and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["first_card", "second_card"];
    G.players["0"].resources.knowledge = 0;

    const result = runEffects({ G, playerId: "0", selfCardId: "giver" }, [
      { trigger: "on_play", op: "give_card" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingGiveCardChoice).toEqual({
      playerId: "0",
      sourceCardId: "giver",
      cardIds: ["first_card", "second_card"],
      recipientPlayerIds: ["1"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("swap_card swaps a hand card with a matching market card and preserves market tokens", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_civilized"];
    G.market = ["market_civilized"];
    G.marketResources = { market_civilized: { knowledge: 2 } };
    G.marketUnrest = { market_civilized: ["old_unrest"] };
    G.unrestPile = ["new_unrest"];
    G.cardDb.hand_civilized = {
      id: "hand_civilized",
      displayName: "Hand Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.market_civilized = {
      id: "market_civilized",
      displayName: "Market Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "swap_card", cardId: "hand_civilized", marketCardId: "market_civilized", sourceZone: "hand" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual(["market_civilized"]);
    expect(G.market).toEqual(["hand_civilized"]);
    expect(G.marketResources).toEqual({ hand_civilized: { knowledge: 2 } });
    expect(G.marketUnrest).toEqual({ hand_civilized: ["new_unrest"] });
    expect(G.unrestPile).toEqual(["old_unrest"]);
    expect(G.log.map((entry) => entry.message)).toContain("MarketUnrestReturned(market_civilized/count=1)");
    expect(G.log.at(-1)?.message).toBe("CardSwapped(hand_civilized<->market_civilized/source=hand)");
  });

  it("swap_card creates a matching hand and market choice and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_civilized", "hand_region"];
    G.players["0"].resources.materials = 0;
    G.market = ["market_civilized", "market_uncivilized"];
    for (const [id, suit] of [
      ["hand_civilized", "civilized"],
      ["hand_region", "region"],
      ["market_civilized", "civilized"],
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

    const result = runEffects({ G, playerId: "0", selfCardId: "swapper" }, [
      { trigger: "on_play", op: "swap_card", sourceZone: "hand" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingSwapChoice).toEqual({
      playerId: "0",
      sourceCardId: "swapper",
      sourceZone: "hand",
      choices: [{ cardId: "hand_civilized", marketCardId: "market_civilized" }],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });
    expect(G.players["0"].resources.materials).toBe(0);
  });

  it("swap_card matches market cards by shared suit icon instead of exact primary suit", () => {
    const G = createInitialState();
    G.players["0"].hand = ["multi_icon_hand"];
    G.market = ["market_civilized", "market_fame"];
    G.cardDb.multi_icon_hand = {
      id: "multi_icon_hand",
      displayName: "Multi Icon Hand",
      type: "action",
      cardType: "action",
      suit: "multi",
      cost: 0,
      tags: ["suit:civilized", "suit:uncivilized"],
      effects: []
    };
    for (const [id, suit] of [
      ["market_civilized", "civilized"],
      ["market_fame", "fame"]
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

    const result = runEffects({ G, playerId: "0", selfCardId: "swapper" }, [
      { trigger: "on_play", op: "swap_card", sourceZone: "hand" } as any
    ]);

    expect(result).toBe(true);
    expect(G.pendingSwapChoice?.choices).toEqual([
      { cardId: "multi_icon_hand", marketCardId: "market_civilized" }
    ]);
  });

  it("acquire_card effect takes market card and tucked unrest into hand", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.marketResources = { test_action_foundry_shift: { knowledge: 1 } };
    G.marketUnrest = { test_action_foundry_shift: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "acquire_card", count: 1 }]);

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].discard).not.toContain("test_action_foundry_shift");
    expect(G.market).toEqual(["test_action_archive_survey"]);
    expect(G.marketUnrest.test_action_archive_survey).toEqual(["test_unrest_2"]);
  });

  it("acquire_card by suit treats secondary printed suit icons as eligible", () => {
    const G = createInitialState();
    G.market = ["multi_icon_market", "fame_market"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb.multi_icon_market = {
      id: "multi_icon_market",
      displayName: "Multi Icon Market",
      type: "action",
      cardType: "action",
      suit: "multi",
      cost: 0,
      tags: ["suit:civilized", "suit:uncivilized"],
      effects: []
    };
    G.cardDb.fame_market = {
      id: "fame_market",
      displayName: "Fame Market",
      type: "fame",
      cardType: "fame",
      suit: "fame",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "acquire_card",
      count: 1,
      source: "market",
      suit: "civilized",
      destination: "hand"
    }]);

    expect(G.pendingAcquireChoice).toEqual({
      playerId: "0",
      source: "market",
      cardIds: ["multi_icon_market"],
      destination: "hand"
    });
    expect(G.market).toEqual(["multi_icon_market", "fame_market"]);
  });

  it("acquire_card by suit reads explicit suitIcons metadata", () => {
    const G = createInitialState();
    G.market = ["multi_icon_market"];
    G.cardDb.multi_icon_market = {
      id: "multi_icon_market",
      displayName: "Multi Icon Market",
      type: "action",
      cardType: "action",
      suit: "multi",
      suitIcons: ["civilized"],
      cost: 0,
      tags: [],
      effects: []
    } as any;

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "acquire_card",
      count: 1,
      source: "market",
      suit: "civilized",
      destination: "hand"
    }]);

    expect(G.pendingAcquireChoice?.cardIds).toEqual(["multi_icon_market"]);
  });

  it("stops remaining effects when acquire_card refill triggers Collapse", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.unrestPile = [];
    G.players["0"].resources.unrest = 1;
    G.players["1"].resources.unrest = 2;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "acquire_card", source: "market", cardId: "test_action_foundry_shift", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message === "AcquiredFromMarket(test_action_foundry_shift/destination=hand)")).toBe(false);
  });

  it("acquire_card effect can acquire a specified non-Unrest card from Exile and take Unrest", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_action"];
    G.cardDb.exiled_action = {
      id: "exiled_action",
      displayName: "Exiled Action",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.unrestPile = ["test_unrest_1"];

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "acquire_card",
      source: "exile",
      cardId: "exiled_action",
      count: 1
    } as any]);

    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].hand).toContain("exiled_action");
    expect(G.players["0"].discard).toContain("test_unrest_1");
    expect(G.unrestPile).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("AcquiredFromExile(exiled_action/destination=hand)");
  });

  it("exile_card effect exiles a market card, returns tucked Unrest, and refills the slot", () => {
    const G = createInitialState();
    G.market = ["market_civilized"];
    G.marketRefillPool = ["refill_civilized"];
    G.marketDecks = undefined;
    G.marketUnrest = { market_civilized: ["old_unrest"] };
    G.unrestPile = ["new_unrest"];
    G.cardDb.market_civilized = {
      id: "market_civilized",
      displayName: "Market Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.refill_civilized = {
      id: "refill_civilized",
      displayName: "Refill Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "exile_source" }, [
      { trigger: "on_play", op: "exile_card", source: "market", cardId: "market_civilized" } as any
    ]);

    expect(result).toBe(true);
    expect(G.market).toEqual(["refill_civilized"]);
    expect(G.players["0"].exile).toEqual(["market_civilized"]);
    expect(G.marketUnrest.market_civilized).toBeUndefined();
    expect(G.marketUnrest.refill_civilized).toEqual(["new_unrest"]);
    expect(G.unrestPile).toEqual(["old_unrest"]);
    expect(G.log.map((entry) => entry.message)).toContain("ExiledFromMarket(market_civilized)");
  });

  it("exile_card refills from the matching small deck even in the first two market slots", () => {
    const G = createInitialState();
    G.market = ["market_civilized", "market_region"];
    G.marketDecks = {
      mainDeck: ["main_refill"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: ["civilized_refill"],
      tributaryDeck: []
    };
    G.unrestPile = ["new_unrest"];
    for (const id of ["market_civilized", "market_region", "main_refill", "civilized_refill"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: id === "market_region" ? "region" : "action",
        cardType: id === "market_region" ? "region" : "action",
        suit: id === "market_region" ? "region" : "civilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }

    const result = runEffects({ G, playerId: "0", selfCardId: "exile_source" }, [
      { trigger: "on_play", op: "exile_card", source: "market", cardId: "market_civilized" } as any
    ]);

    expect(result).toBe(true);
    expect(G.market).toEqual(["civilized_refill", "market_region"]);
    expect(G.marketDecks.mainDeck).toEqual(["main_refill"]);
    expect(G.marketDecks.civilizedDeck).toEqual([]);
    expect(G.players["0"].exile).toEqual(["market_civilized"]);
  });

  it("exile_card from Market without a specified card records an explicit eligible choice", () => {
    const G = createInitialState();
    G.market = ["market_civilized", "market_uncivilized", "market_region"];
    G.marketResources = { market_uncivilized: { knowledge: 1 } };
    G.cardDb.market_civilized = {
      id: "market_civilized",
      displayName: "Market Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.market_uncivilized = {
      id: "market_uncivilized",
      displayName: "Market Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.market_region = {
      id: "market_region",
      displayName: "Market Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "exile_picker" }, [
      { trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" } as any
    ]);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "market",
      cardIds: ["market_civilized"]
    });
    expect(G.market).toEqual(["market_civilized", "market_uncivilized", "market_region"]);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("ExileChoicePending(exile_picker/source=market/options=1)");
  });

  it("exile_card can choose cards from History and resume for multiple exiles", () => {
    const G = createInitialState();
    G.players["0"].history = ["history_civilized", "history_uncivilized"];
    G.cardDb.history_civilized = {
      id: "history_civilized",
      displayName: "History Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.history_uncivilized = {
      id: "history_uncivilized",
      displayName: "History Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "history_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "history", count: 2 } as any
    ]);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "history_exiler",
      source: "history",
      cardIds: ["history_civilized", "history_uncivilized"],
      resumeEffects: [{ trigger: "on_play", op: "exile_card", source: "history", count: 1 }]
    });
  });

  it("exile_card can move a specified discard card into Exile", () => {
    const G = createInitialState();
    G.players["0"].discard = ["discard_civilized"];
    G.cardDb.discard_civilized = {
      id: "discard_civilized",
      displayName: "Discard Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "discard_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "discard", cardId: "discard_civilized" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.players["0"].exile).toEqual(["discard_civilized"]);
    expect(G.log.at(-1)?.message).toBe("ExiledFromDiscard(discard_civilized)");
  });

  it("exile_card removes a play-area host with its garrisoned cards and collects resources", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["play_region"];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardDb.play_region = {
      id: "play_region",
      displayName: "Play Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
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
    G.cardStates = {
      play_region: {
        resources: { materials: 2 },
        garrisonedCardIds: ["garrisoned_card"]
      },
      garrisoned_card: {
        resources: { knowledge: 1 }
      }
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "play_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "playArea", cardId: "play_region" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].exile).toEqual(["play_region", "garrisoned_card"]);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.play_region).toBeUndefined();
    expect(G.cardStates?.garrisoned_card).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("ExiledFromPlayArea(play_region/garrisoned=1)");
  });

  it("exile_card can target a garrisoned card without removing its host", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["play_region"];
    G.players["0"].resources.knowledge = 0;
    G.cardDb.play_region = {
      id: "play_region",
      displayName: "Play Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
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
    G.cardStates = {
      play_region: {
        garrisonedCardIds: ["garrisoned_card"]
      },
      garrisoned_card: {
        resources: { knowledge: 1 }
      }
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "garrison_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "garrison", cardId: "garrisoned_card" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].playArea).toEqual(["play_region"]);
    expect(G.cardStates?.play_region?.garrisonedCardIds).toEqual([]);
    expect(G.players["0"].exile).toEqual(["garrisoned_card"]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.garrisoned_card).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("ExiledFromGarrison(garrisoned_card/host=play_region)");
  });

  it("exile_card can offer a garrisoned-card choice by criteria", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["play_region"];
    G.cardDb.play_region = {
      id: "play_region",
      displayName: "Play Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.garrisoned_civilized = {
      id: "garrisoned_civilized",
      displayName: "Garrisoned Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.garrisoned_uncivilized = {
      id: "garrisoned_uncivilized",
      displayName: "Garrisoned Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardStates = {
      play_region: {
        garrisonedCardIds: ["garrisoned_civilized", "garrisoned_uncivilized"]
      }
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "garrison_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "garrison", suit: "civilized" } as any
    ]);

    expect(result).toBe(true);
    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "garrison_exiler",
      source: "garrison",
      cardIds: ["garrisoned_civilized"]
    });

    resolveExileChoice({ G, ctx: { currentPlayer: "0" } as any }, "garrisoned_civilized");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.players["0"].playArea).toEqual(["play_region"]);
    expect(G.cardStates?.play_region?.garrisonedCardIds).toEqual(["garrisoned_uncivilized"]);
    expect(G.players["0"].exile).toEqual(["garrisoned_civilized"]);
  });

  it("acquire_card effect can acquire an Unrest card from Exile without taking extra Unrest", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_unrest"];
    G.cardDb.exiled_unrest = {
      id: "exiled_unrest",
      displayName: "Exiled Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };
    G.unrestPile = ["test_unrest_1"];

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "acquire_card",
      source: "exile",
      cardId: "exiled_unrest",
      count: 1
    } as any]);

    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].hand).toContain("exiled_unrest");
    expect(G.players["0"].discard).not.toContain("test_unrest_1");
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
  });

  it("acquire_card from Exile without a specified card records a pending acquisition choice", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_civilized", "exiled_uncivilized"];
    G.cardDb.exiled_civilized = {
      id: "exiled_civilized",
      displayName: "Exiled Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.exiled_uncivilized = {
      id: "exiled_uncivilized",
      displayName: "Exiled Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "exile_picker" }, [{
      trigger: "on_play",
      op: "acquire_card",
      source: "exile",
      suit: "civilized",
      count: 1
    } as any]);

    expect(G.pendingAcquireChoice).toEqual({
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "exile",
      cardIds: ["exiled_civilized"],
      destination: "hand"
    });
    expect(G.players["0"].exile).toEqual(["exiled_civilized", "exiled_uncivilized"]);
    expect(G.log.at(-1)?.message).toBe("AcquireChoicePending(exile_picker/source=exile/options=1)");
  });

  it("acquire_card from Market without a specified card records matching pending choices", () => {
    const G = createInitialState();
    G.market = ["market_region", "market_civilized", "market_uncivilized"];
    G.cardDb.market_region = {
      id: "market_region",
      displayName: "Market Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.market_civilized = {
      id: "market_civilized",
      displayName: "Market Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.market_uncivilized = {
      id: "market_uncivilized",
      displayName: "Market Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "market_picker" }, [{ trigger: "on_play", op: "acquire_card", source: "market", suit: "civilized", count: 1 } as any]);

    expect(G.pendingAcquireChoice).toEqual({
      playerId: "0",
      sourceCardId: "market_picker",
      source: "market",
      cardIds: ["market_civilized"],
      destination: "hand"
    });
    expect(G.market).toEqual(["market_region", "market_civilized", "market_uncivilized"]);
    expect(G.players["0"].hand).not.toContain("market_civilized");
    expect(G.log.at(-1)?.message).toBe("AcquireChoicePending(market_picker/source=market/options=1)");
  });

  it("break_through from market returns tucked unrest instead of taking it", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.marketResources = { test_action_foundry_shift: { knowledge: 1 } };
    G.marketUnrest = { test_action_foundry_shift: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "market", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].hand).not.toContain("test_unrest_1");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.market).toEqual(["test_action_archive_survey"]);
    expect(G.marketUnrest.test_action_archive_survey).toEqual(["test_unrest_2"]);
  });

  it("acquire_card triggers acquired-card on-acquire text but break_through does not", () => {
    const G = createInitialState();
    G.market = ["trigger_card"];
    G.marketRefillPool = ["refill_card"];
    G.marketDecks = undefined;
    G.unrestPile = ["unrest_a", "unrest_b"];
    G.cardDb.trigger_card = {
      id: "trigger_card",
      displayName: "Trigger Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb.refill_card = {
      id: "refill_card",
      displayName: "Refill Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "knowledge", amount: 10 } as any]
    };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "acquire_card", cardId: "trigger_card", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("trigger_card");
    expect(G.players["0"].resources.knowledge).toBe(1);

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "market", cardId: "refill_card", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("refill_card");
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("break_through from Market records a pending choice when multiple cards match", () => {
    const G = createInitialState();
    G.market = ["market_uncivilized_a", "market_region", "market_uncivilized_b"];
    G.cardDb.market_uncivilized_a = {
      id: "market_uncivilized_a",
      displayName: "Market Uncivilized A",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.market_region = {
      id: "market_region",
      displayName: "Market Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.market_uncivilized_b = {
      id: "market_uncivilized_b",
      displayName: "Market Uncivilized B",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "market_breaker" }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "market", count: 1 } as any]);

    expect(G.pendingBreakThroughChoice).toEqual({
      playerId: "0",
      sourceCardId: "market_breaker",
      source: "market",
      suit: "uncivilized",
      cardIds: ["market_uncivilized_a", "market_uncivilized_b"]
    });
    expect(G.market).toEqual(["market_uncivilized_a", "market_region", "market_uncivilized_b"]);
    expect(G.players["0"].hand).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("BreakThroughChoicePending(market_breaker/source=market/options=2)");
  });

  it("break_through can take a specified matching card from Exile without taking Unrest", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_civilized"];
    G.cardDb.exiled_civilized = {
      id: "exiled_civilized",
      displayName: "Exiled Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.unrestPile = ["test_unrest_1"];

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "break_through",
      source: "exile",
      suit: "civilized",
      cardId: "exiled_civilized",
      count: 1
    } as any]);

    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].hand).toContain("exiled_civilized");
    expect(G.players["0"].discard).not.toContain("test_unrest_1");
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.log.at(-1)?.message).toBe("BreakThroughExile(exiled_civilized/civilized)");
  });

  it("break_through from Exile without a specified card records a pending choice", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_civilized", "exiled_uncivilized"];
    G.cardDb.exiled_civilized = {
      id: "exiled_civilized",
      displayName: "Exiled Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.exiled_uncivilized = {
      id: "exiled_uncivilized",
      displayName: "Exiled Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "exile_breaker" }, [{
      trigger: "on_play",
      op: "break_through",
      source: "exile",
      suit: "civilized",
      count: 1
    } as any]);

    expect(G.pendingBreakThroughChoice).toEqual({
      playerId: "0",
      sourceCardId: "exile_breaker",
      source: "exile",
      suit: "civilized",
      cardIds: ["exiled_civilized"]
    });
    expect(G.players["0"].exile).toEqual(["exiled_civilized", "exiled_uncivilized"]);
    expect(G.log.at(-1)?.message).toBe("BreakThroughChoicePending(exile_breaker/source=exile/options=1)");
  });

  it("break_through from deck takes from the matching small deck", () => {
    const G = createInitialState();
    G.marketDecks = {
      mainDeck: ["test_action_archive_survey"],
      regionDeck: [],
      uncivilizedDeck: ["test_action_foundry_shift"],
      civilizedDeck: [],
      tributaryDeck: []
    };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "deck", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.marketDecks.uncivilizedDeck).toEqual([]);
    expect(G.marketDecks.mainDeck).toEqual(["test_action_archive_survey"]);
  });

  it("break_through deck falls back to main deck and shuffles non-matching revealed cards back", () => {
    const G = createInitialState();
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.cardDb.test_action_archive_survey = { ...G.cardDb.test_action_archive_survey, suit: "civilized" };
    G.cardDb.test_action_scholars_circle = { ...G.cardDb.test_action_scholars_circle, suit: "civilized" };
    G.marketDecks = {
      mainDeck: ["test_action_archive_survey", "test_action_scholars_circle", "test_action_foundry_shift", "test_action_risk_audit"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: [],
      tributaryDeck: []
    };

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "deck", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.marketDecks.mainDeck).toEqual(["test_action_archive_survey", "test_action_scholars_circle", "test_action_risk_audit"]);
  });

  it("break_through from deck triggers normal scoring when it empties the main deck", () => {
    const G = createInitialState();
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.marketDecks = {
      mainDeck: ["test_action_foundry_shift"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: [],
      tributaryDeck: []
    };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "deck", count: 1 } as any]);

    expect(G.marketDecks.mainDeck).toEqual([]);
    expect(G.scoring).toEqual({
      reason: "main_deck_empty",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
  });

  it("break_through from main deck gains 2 materials if no matching suit is found", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.cardDb.test_action_archive_survey = { ...G.cardDb.test_action_archive_survey, suit: "civilized" };
    G.cardDb.test_action_risk_audit = { ...G.cardDb.test_action_risk_audit, suit: "civilized" };
    G.marketDecks = {
      mainDeck: ["test_action_archive_survey", "test_action_risk_audit"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: [],
      tributaryDeck: []
    };

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "deck", count: 1 } as any]);

    expect(G.players["0"].hand).not.toContain("test_action_archive_survey");
    expect(G.players["0"].hand).not.toContain("test_action_risk_audit");
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.marketDecks.mainDeck).toEqual(["test_action_risk_audit", "test_action_archive_survey"]);
    expect(G.log.at(-1)?.message).toBe("BreakThroughFailed(uncivilized/gained=2 materials)");
  });

  it("break_through from deck gains fallback Materials when no matching source or main deck exists", () => {
    const G = createInitialState();
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 0;

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "break_through", suit: "civilized", source: "deck", count: 1 } as any]);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.log.at(-1)?.message).toBe("BreakThroughFailed(civilized/gained=2 materials)");
  });

  it("find_card searches hand, discard, deck, then Nation deck and stops on the first exact match", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].discard = ["test_action_archive_survey"];
    G.players["0"].deck = ["test_action_archive_survey"];
    G.players["0"].nationDeck = ["test_action_archive_survey"];

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "test_action_archive_survey",
      destination: "hand"
    } as any]);

    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.players["0"].deck).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].nationDeck).toEqual(["test_action_archive_survey"]);
    expect(G.log.at(-1)?.message).toBe("FindResolved(test_action_archive_survey/discard->hand)");
  });

  it("look_cards reveals the top available Draw deck cards without moving them", () => {
    const G = createInitialState();
    G.players["0"].deck = ["test_action_archive_survey", "test_action_foundry_shift"];

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "look_cards",
      source: "deck",
      count: 3
    } as any]);

    expect(G.players["0"].deck).toEqual(["test_action_archive_survey", "test_action_foundry_shift"]);
    expect(G.lookedCards).toEqual({
      playerId: "0",
      source: "deck",
      cardIds: ["test_action_archive_survey", "test_action_foundry_shift"]
    });
    expect(G.log.at(-1)?.message).toBe("LookResolved(deck/count=2)");
  });

  it("look_cards pauses for return order when multiple Draw deck cards are revealed", () => {
    const G = createInitialState();
    G.players["0"].deck = ["test_action_archive_survey", "test_action_foundry_shift", "test_action_scholars_circle"];

    runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "look_cards", source: "deck", count: 2 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(G.pendingLookOrderChoice).toEqual({
      playerId: "0",
      source: "deck",
      cardIds: ["test_action_archive_survey", "test_action_foundry_shift"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveLookOrderChoice({ G, ctx: { currentPlayer: "0" } as any }, ["test_action_foundry_shift", "test_action_archive_survey"]);

    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.players["0"].deck).toEqual(["test_action_foundry_shift", "test_action_archive_survey", "test_action_scholars_circle"]);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("look order resolution keeps Nation accession at the bottom", () => {
    const G = createInitialState();
    G.players["0"].nationDeck = ["nation_a", "nation_b", "accession_card"];
    G.players["0"].accessionCardId = "accession_card";
    for (const id of ["nation_a", "nation_b", "accession_card"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: id === "accession_card" ? "accession" : "nation",
        cardType: id === "accession_card" ? "accession" : "nation",
        suit: "none",
        cost: 0,
        tags: [],
        effects: []
      };
    }

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "look_cards", source: "nationDeck", count: 2 } as any]);
    resolveLookOrderChoice({ G, ctx: { currentPlayer: "0" } as any }, ["nation_b", "nation_a"]);

    expect(G.players["0"].nationDeck).toEqual(["nation_b", "nation_a", "accession_card"]);
  });

  it("look_cards ignores a Nation accession card unless it is the only card available", () => {
    const G = createInitialState();
    G.players["0"].nationDeck = ["test_action_archive_survey", "accession_card"];
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

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "look_cards",
      source: "nationDeck",
      count: 2
    } as any]);

    expect(G.lookedCards?.cardIds).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].nationDeck).toEqual(["test_action_archive_survey", "accession_card"]);

    G.players["0"].nationDeck = ["accession_card"];
    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "look_cards",
      source: "nationDeck",
      count: 2
    } as any]);

    expect(G.lookedCards?.cardIds).toEqual(["accession_card"]);
  });

  it("look_cards ignores the special bottom Fame card unless it is the only Fame card available", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: ["fame_top"],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "face_down",
      resolvedSpecialByPlayer: {}
    };

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "look_cards",
      source: "fameDeck",
      count: 2
    } as any]);

    expect(G.lookedCards).toEqual({
      playerId: "0",
      source: "fameDeck",
      cardIds: ["fame_top"]
    });

    G.fameDeck.available = [];
    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "look_cards",
      source: "fameDeck",
      count: 2
    } as any]);

    expect(G.lookedCards?.cardIds).toEqual(["fame_bottom"]);
  });

  it("find_card shuffles searched Draw and Nation decks and does not Find the accession card", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].discard = [];
    G.players["0"].deck = ["test_action_foundry_shift", "test_action_scholars_circle"];
    G.players["0"].nationDeck = ["test_action_archive_survey", "accession_card"];
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

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "test_action_archive_survey",
      destination: "hand"
    } as any]);

    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].deck).toEqual(["test_action_scholars_circle", "test_action_foundry_shift"]);
    expect(G.players["0"].nationDeck).toEqual(["accession_card"]);
    expect(G.log.map((entry) => entry.message)).toContain("FindShuffled(deck)");
    expect(G.log.map((entry) => entry.message)).toContain("FindShuffled(nationDeck)");

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "accession_card",
      destination: "hand"
    } as any]);

    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].nationDeck).toEqual(["accession_card"]);
    expect(G.log.at(-1)?.message).toBe("FindMissed(accession_card)");
  });

  it("does not Find an accession-typed Nation card when accessionCardId is omitted", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].discard = [];
    G.players["0"].deck = [];
    G.players["0"].nationDeck = ["accession_card"];
    G.players["0"].accessionCardId = undefined;
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

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "accession_card",
      destination: "hand"
    } as any]);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].nationDeck).toEqual(["accession_card"]);
    expect(G.log.at(-1)?.message).toBe("FindMissed(accession_card)");
  });

  it("find_card by criteria records an explicit choice after searching all eligible areas", () => {
    const G = createInitialState();
    G.players["0"].hand = ["test_action_foundry_shift"];
    G.players["0"].discard = ["test_action_archive_survey"];
    G.players["0"].deck = ["test_action_scholars_circle"];
    G.players["0"].nationDeck = ["test_action_lineage_record"];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.cardDb.test_action_archive_survey = { ...G.cardDb.test_action_archive_survey, suit: "uncivilized" };
    G.cardDb.test_action_scholars_circle = { ...G.cardDb.test_action_scholars_circle, suit: "civilized" };
    G.cardDb.test_action_lineage_record = { ...G.cardDb.test_action_lineage_record, suit: "uncivilized" };

    runEffects({ G, playerId: "0", selfCardId: "finder", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      suit: "uncivilized",
      destination: "discard"
    } as any]);

    expect(G.pendingFindChoice).toEqual({
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["test_action_foundry_shift", "test_action_archive_survey", "test_action_lineage_record"],
      destination: "discard"
    });
    expect(G.players["0"].deck).toEqual(["test_action_scholars_circle"]);
    expect(G.players["0"].nationDeck).toEqual(["test_action_lineage_record"]);
    expect(G.log.at(-1)?.message).toBe("FindChoicePending(finder/options=3)");
  });

  it("find_card can explicitly search only History for an exact card", () => {
    const G = createInitialState();
    G.players["0"].hand = ["history_target"];
    G.players["0"].history = ["history_target"];
    G.cardDb.history_target = {
      id: "history_target",
      displayName: "History Target",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "history_target",
      sourceZones: ["history"],
      destination: "hand"
    } as any]);

    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].hand).toEqual(["history_target", "history_target"]);
    expect(G.log.at(-1)?.message).toBe("FindResolved(history_target/history->hand)");
  });

  it("find_card by criteria can include History as the searched source", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_civilized"];
    G.players["0"].history = ["history_civilized"];
    for (const id of ["hand_civilized", "history_civilized"]) {
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

    runEffects({ G, playerId: "0", selfCardId: "finder" }, [{
      trigger: "on_play",
      op: "find_card",
      suit: "civilized",
      sourceZones: ["history"],
      destination: "discard"
    } as any]);

    expect(G.pendingFindChoice).toEqual({
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["history_civilized"],
      destination: "discard"
    });
  });

  it("stops resolving later effects after find_card creates a pending decision", () => {
    const G = createInitialState();
    G.players["0"].hand = ["test_action_foundry_shift"];
    G.players["0"].discard = ["test_action_archive_survey"];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.cardDb.test_action_archive_survey = { ...G.cardDb.test_action_archive_survey, suit: "uncivilized" };
    G.players["0"].resources.materials = 0;

    runEffects({ G, playerId: "0", selfCardId: "finder" }, [
      { trigger: "on_play", op: "find_card", suit: "uncivilized", destination: "discard" },
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }
    ] as any);

    expect(G.pendingFindChoice).toBeDefined();
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.log.some((entry) => entry.message === "Gained 2 materials.")).toBe(false);
  });

  it("runs explicit garrison, recall, and abandon region effects", () => {
    const G = createInitialState();
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
    G.players["0"].playArea = ["test_region", "second_region"];
    G.players["0"].hand = ["test_action_archive_survey"];

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "garrison_card", hostCardId: "test_region", cardId: "test_action_archive_survey" },
      { trigger: "on_play", op: "recall_region", cardId: "test_region" },
      { trigger: "on_play", op: "abandon_region", cardId: "second_region" }
    ] as any)).toBe(true);

    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].hand).toEqual(["test_region", "test_action_archive_survey"]);
    expect(G.players["0"].discard).toContain("second_region");
    expect(G.cardStates?.test_region).toBeUndefined();
    expect(G.log.map((entry) => entry.message)).toContain("Garrisoned(test_action_archive_survey/host=test_region)");
    expect(G.log.map((entry) => entry.message)).toContain("RegionRecalled(test_region/garrisoned=1)");
    expect(G.log.map((entry) => entry.message)).toContain("RegionAbandoned(second_region/garrisoned=0)");
  });

  it("moves resources on a card to the player when putting itself into History", () => {
    const G = createInitialState();
    G.cardDb.history_card = {
      id: "history_card",
      displayName: "History Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].playArea = ["history_card"];
    G.players["0"].resources.knowledge = 1;
    G.cardStates = {
      history_card: {
        resources: { knowledge: 2, materials: 1 }
      }
    };

    expect(runEffects({ G, playerId: "0", selfCardId: "history_card" }, [
      { trigger: "on_play", op: "move_self_to_history" }
    ] as any)).toBe(true);

    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].history).toEqual(["history_card"]);
    expect(G.players["0"].resources.knowledge).toBe(3);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.cardStates?.history_card).toBeUndefined();
  });

  it("moves a targeted garrisoned card to History without moving its host", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["play_region"];
    G.players["0"].resources.knowledge = 0;
    G.cardDb.play_region = {
      id: "play_region",
      displayName: "Play Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
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
    G.cardStates = {
      play_region: {
        garrisonedCardIds: ["garrisoned_card"]
      },
      garrisoned_card: {
        resources: { knowledge: 1 }
      }
    };

    expect(runEffects({ G, playerId: "0", selfCardId: "garrisoned_card" }, [
      { trigger: "on_play", op: "move_self_to_history" }
    ] as any)).toBe(true);

    expect(G.players["0"].playArea).toEqual(["play_region"]);
    expect(G.cardStates?.play_region?.garrisonedCardIds).toEqual([]);
    expect(G.players["0"].history).toEqual(["garrisoned_card"]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.garrisoned_card).toBeUndefined();
  });

  it("records a pending garrison choice when host and hand card are unspecified", () => {
    const G = createInitialState();
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
    G.players["0"].playArea = ["test_region", "test_action_foundry_shift"];
    G.players["0"].hand = ["test_action_archive_survey", "test_action_scholars_circle"];

    expect(runEffects({ G, playerId: "0", selfCardId: "garrison_source" }, [
      { trigger: "on_play", op: "garrison_card" }
    ] as any)).toBe(true);

    expect(G.pendingGarrisonChoice).toEqual({
      playerId: "0",
      sourceCardId: "garrison_source",
      hostCardIds: ["test_region"],
      cardIds: ["test_action_archive_survey", "test_action_scholars_circle"]
    });
    expect(G.players["0"].hand).toEqual(["test_action_archive_survey", "test_action_scholars_circle"]);
    expect(G.cardStates?.test_region?.garrisonedCardIds).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("GarrisonChoicePending(garrison_source/hosts=1/cards=2)");
  });

  it("defaults an unspecified Garrison host to the source card when it is a Region", () => {
    const G = createInitialState();
    G.cardDb.garrison_source = {
      id: "garrison_source",
      displayName: "Garrison Source",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.other_region = {
      id: "other_region",
      displayName: "Other Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].playArea = ["other_region", "garrison_source"];
    G.players["0"].hand = ["test_action_archive_survey"];

    expect(runEffects({ G, playerId: "0", selfCardId: "garrison_source" }, [
      { trigger: "on_play", op: "garrison_card" }
    ] as any)).toBe(true);

    expect(G.pendingGarrisonChoice?.hostCardIds).toEqual(["garrison_source"]);
    expect(G.pendingGarrisonChoice?.cardIds).toEqual(["test_action_archive_survey"]);
  });

  it("records pending region choices when recall or abandon targets are unspecified", () => {
    const G = createInitialState();
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
    G.players["0"].playArea = ["test_region", "test_action_foundry_shift"];

    expect(runEffects({ G, playerId: "0", selfCardId: "recall_source" }, [
      { trigger: "on_play", op: "recall_region" }
    ] as any)).toBe(true);

    expect(G.pendingRegionChoice).toEqual({
      playerId: "0",
      sourceCardId: "recall_source",
      op: "recall_region",
      cardIds: ["test_region"]
    });
    expect(G.log.at(-1)?.message).toBe("RegionChoicePending(recall_source/recall_region/options=1)");

    G.pendingRegionChoice = undefined;
    expect(runEffects({ G, playerId: "0", selfCardId: "abandon_source" }, [
      { trigger: "on_play", op: "abandon_region" }
    ] as any)).toBe(true);

    expect(G.pendingRegionChoice).toEqual({
      playerId: "0",
      sourceCardId: "abandon_source",
      op: "abandon_region",
      cardIds: ["test_region"]
    });
    expect(G.log.at(-1)?.message).toBe("RegionChoicePending(abandon_source/abandon_region/options=1)");
  });

  it("moves History-bound cards to a named replacement zone", () => {
    const G = createInitialState();
    const cardId = "test_action_archive_survey";
    G.players["0"].playArea = [cardId];
    G.players["0"].sideAreas = { sunken: [] };
    G.activeNationRulesets = {
      "0": {
        nationId: "history_replacement",
        displayName: "History Replacement",
        rulesetTags: ["alternate_history_zone"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any],
        stateOverrides: [],
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

    runEffects({ G, playerId: "0", selfCardId: cardId }, [{ trigger: "on_play", op: "move_self_to_history" }]);

    expect(G.players["0"].history).not.toContain(cardId);
    expect(G.players["0"].sideAreas?.sunken).toEqual([cardId]);
  });

  it("records choose_one as a pending player decision", () => {
    const G = createInitialState();

    runEffects({ G, playerId: "0", selfCardId: "test_action_forum_debate" }, [{
      trigger: "on_play",
      op: "choose_one",
      choices: [
        [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
        [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
      ]
    }]);

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_forum_debate",
      choices: [
        [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
        [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
      ]
    });
    expect(G.log.at(-1)?.message).toBe("ChoicePending(test_action_forum_debate/options=2)");
  });

  it("does not offer choose_one options with unpaid explicit costs", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;

    runEffects({ G, playerId: "0", selfCardId: "test_action_forum_debate" }, [{
      trigger: "on_play",
      op: "choose_one",
      choices: [
        [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }],
        [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
      ]
    }]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_forum_debate",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
    });
    expect(G.log.at(-1)?.message).toBe("ChoicePending(test_action_forum_debate/options=1)");
  });

  it("does not offer choose_one options whose combined explicit costs are unaffordable", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 3;

    runEffects({ G, playerId: "0", selfCardId: "test_action_forum_debate" }, [{
      trigger: "on_play",
      op: "choose_one",
      choices: [
        [
          { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 },
          { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 },
          { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
        ],
        [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
      ]
    }]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_forum_debate",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]]
    });
    expect(G.log.at(-1)?.message).toBe("ChoicePending(test_action_forum_debate/options=1)");
  });

  it("stops resolving later effects after a choose_one creates a pending decision", () => {
    const G = createInitialState();

    runEffects({ G, playerId: "0", selfCardId: "test_action_forum_debate" }, [
      {
        trigger: "on_play",
        op: "choose_one",
        choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
      },
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }
    ] as any);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.log.some((entry) => entry.message === "Gained 2 materials.")).toBe(false);
  });

  it("records Develop as a card-driven development choice without requiring a progression token", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.exhaustTokensAvailable = 0;
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const result = runEffects({ G, playerId: "0", selfCardId: "develop_source" }, [{
      trigger: "on_play",
      op: "develop"
    } as any]);

    expect(result).toBe(true);
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      sourceCardId: "develop_source",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 0,
      resumeBehavior: "none",
      usesProgressionToken: false
    });
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.exhaustTokensAvailable).toBe(0);
    expect(G.log.at(-1)?.message).toBe("DevelopmentChoicePending(develop_source/source=card_effect/options=1)");
  });

  it("does not resolve a Develop effect when no Development card is payable", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 0;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const result = runEffects({ G, playerId: "0", selfCardId: "develop_source" }, [
      { trigger: "on_play", op: "develop" },
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ] as any);

    expect(result).toBe(false);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("DevelopmentSkipped(no_payable_cards)");
  });

  it("stops later effects when a conditional branch cannot pay its cost", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.resources.materials = 0;
    p.resources.knowledge = 0;

    const result = runEffects({ G, playerId: "0", selfCardId: "conditional_source" }, [
      {
        trigger: "on_play",
        op: "conditional_resource_at_least",
        resource: "materials",
        atLeast: 0,
        then: [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }],
      } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any,
    ]);

    expect(result).toBe(false);
    expect(p.resources.materials).toBe(0);
    expect(p.resources.knowledge).toBe(0);
  });

  it("propagates failures from conditional state branches", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.stateArea = ["barbarian_state"];
    p.resources.materials = 0;
    p.resources.knowledge = 0;

    const result = runEffects({ G, playerId: "0", selfCardId: "conditional_source" }, [
      {
        trigger: "on_play",
        op: "conditional_state_is",
        state: "barbarian_state",
        then: [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }],
      } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any,
    ]);

    expect(result).toBe(false);
    expect(p.resources.knowledge).toBe(0);
  });

  it("records optional effects as an explicit resolve-or-skip decision", () => {
    const G = createInitialState();

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any]);

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [
        [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
        []
      ]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=2)");
  });

  it("offers only the skip path for optional effects with unpaid explicit costs", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers only the skip path for optional effects whose combined explicit costs are unaffordable", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 3;

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 },
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });
});
