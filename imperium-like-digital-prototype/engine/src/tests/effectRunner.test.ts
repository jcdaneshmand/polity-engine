import { describe, expect, it } from "vitest";
import { runEffects } from "../cards/effectRunner";
import { createInitialState } from "../game/initialState";

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

  it("gain resource", () => {
    const G = createInitialState();
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]);
    expect(G.players["0"].resources.materials).toBe(1);
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
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.log.at(-1)?.message).toBe("Spent 3 materials.");
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
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional)");
  });
});
