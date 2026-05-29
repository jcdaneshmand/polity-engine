import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../game/initialState";
import { acquireCard, endTurnMove, exhaustCard, innovateTurn, playCard, resolveChoice, resolveCleanupDiscard, resolveCleanupMarketResource, resolveFindChoice, revoltTurn } from "../game/moves";
import { onTurnBegin, onTurnEnd } from "../game/turn";

const ctx = { currentPlayer: "0" } as any;

describe("turn loop", () => {
  it("moves a resolved action card to discard after play", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.players["0"].hand = [card];
    playCard({ G, ctx }, card);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).toContain(card);
  });

  it("keeps in-play cards in the play area after play", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = { ...G.cardDb[card], type: "in_play", cardType: "in_play" };
    G.players["0"].hand = [card];
    playCard({ G, ctx }, card);
    expect(G.players["0"].playArea).toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
  });

  it("Free play cards do not spend Actions and cannot be Free played twice in the same turn", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = { ...G.cardDb[card], tags: ["free_play"] };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 0;
    G.players["0"].actionTokensAvailable = 0;

    playCard({ G, ctx }, card);

    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.freePlayedThisTurn?.["0"]).toEqual([card]);

    G.players["0"].discard = [];
    G.players["0"].hand = [card];
    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): free_play_already_used(${card})`);

    onTurnBegin(G, ctx);
    G.players["0"].actionsRemaining = 0;
    playCard({ G, ctx }, card);

    expect(G.players["0"].discard).toContain(card);
    expect(G.freePlayedThisTurn?.["0"]).toEqual([card]);
  });

  it("blocks playing cards whose state requirement does not match the visible State card", () => {
    const G = createInitialState();
    G.players["0"].stateArea = ["barbarian_state"];
    G.cardDb.barbarian_state = {
      id: "barbarian_state",
      displayName: "Barbarian",
      type: "state",
      cardType: "state",
      suit: "uncivilized",
      cost: 0,
      tags: ["barbarian"],
      effects: []
    };
    G.cardDb.empire_only_action = {
      id: "empire_only_action",
      displayName: "Empire Only",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any],
      stateRequirement: "empire"
    } as any;
    G.players["0"].hand = ["empire_only_action"];
    G.players["0"].actionsRemaining = 1;

    playCard({ G, ctx }, "empire_only_action");

    expect(G.players["0"].hand).toEqual(["empire_only_action"]);
    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(playCard): state_requirement_not_met(empire)");
  });

  it("does not resolve Solstice-triggered effects when a card is played", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.players["0"].hand = [card];

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("end turn triggers boardgame endTurn event", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    endTurnMove({ G, ctx, events: { endTurn } });
    expect(endTurn).toHaveBeenCalledTimes(1);
  });

  it("end turn waits for the cleanup market resource choice", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.players["0"].hand = [];

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupMarketResourceChoice).toEqual({
      playerId: "0",
      resource: "knowledge",
      amount: 1,
      cardIds: ["test_action_foundry_shift", "test_action_archive_survey"]
    });

    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(G.pendingCleanupMarketResourceChoice).toBeUndefined();
    expect(G.marketResources?.test_action_archive_survey?.knowledge).toBe(1);
  });

  it("end turn waits for an optional cleanup discard choice before ending the turn", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_action_archive_survey", "test_action_foundry_shift"];

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_archive_survey", "test_action_foundry_shift"]
    });

    resolveCleanupDiscard({ G, ctx, events: { endTurn } }, ["test_action_archive_survey"]);

    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(G.pendingCleanupDiscardChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].discard).toContain("test_action_archive_survey");
  });

  it("can skip optional cleanup discard", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_action_archive_survey"];

    endTurnMove({ G, ctx, events: { endTurn } });
    resolveCleanupDiscard({ G, ctx, events: { endTurn } }, []);

    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].discard).not.toContain("test_action_archive_survey");
  });

  it("cleanup does not discard cards that remain in play", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["test_action_archive_survey"];
    G.players["0"].hand = [];
    G.cardDb.test_action_archive_survey = { ...G.cardDb.test_action_archive_survey, type: "in_play", cardType: "in_play" };

    onTurnEnd(G, ctx);

    expect(G.players["0"].playArea).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].discard).not.toContain("test_action_archive_survey");
  });

  it("cleanup retains hand after optional discard resolution and draws up immediately", () => {
    const G = createInitialState();
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].deck = [
      "test_action_foundry_shift",
      "test_action_scholars_circle",
      "test_action_risk_audit",
      "test_action_lineage_record",
      "test_action_civic_assembly"
    ];
    G.players["0"].discard = [];

    onTurnEnd(G, ctx, () => 0);

    expect(G.players["0"].hand).toEqual([
      "test_action_archive_survey",
      "test_action_foundry_shift",
      "test_action_scholars_circle",
      "test_action_risk_audit",
      "test_action_lineage_record"
    ]);
    expect(G.players["0"].discard).not.toContain("test_action_archive_survey");
  });

  it("cleanup adds a market resource when called directly", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.players["0"].hand = [];

    onTurnEnd(G, ctx);

    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBe(1);
  });

  it("runs solstice only after all players have completed the round", () => {
    const G = createInitialState();
    G.activeNationRulesets!["0"].solsticeOverrides = [{
      op: "custom_solstice_effect",
      effect: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
    }];
    G.players["0"].hand = [];
    G.players["1"].hand = [];

    onTurnEnd(G, { currentPlayer: "0" } as any);

    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.round).toBe(1);

    onTurnEnd(G, { currentPlayer: "1" } as any);

    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.round).toBe(2);
  });

  it("runs Solstice-triggered effects from play area, Power, and State cards", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_play_card"];
    G.players["0"].powerArea = ["solstice_power_card"];
    G.players["0"].stateArea = ["solstice_state_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.solstice_play_card = {
      id: "solstice_play_card",
      displayName: "Solstice Play",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.cardDb.solstice_power_card = {
      id: "solstice_power_card",
      displayName: "Solstice Power",
      type: "power",
      cardType: "power",
      suit: "power",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb.solstice_state_card = {
      id: "solstice_state_card",
      displayName: "Solstice State",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "goods", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1" } as any);

    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.goods).toBe(1);
  });

  it("runs end-of-Solstice effects after ordinary Solstice effects", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_timing_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.solstice_timing_card = {
      id: "solstice_timing_card",
      displayName: "Solstice Timing",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_solstice", op: "gain_resource", resource: "materials", amount: 1 } as any,
        { trigger: "end_of_solstice", op: "spend_resource", resource: "materials", amount: 1 } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1" } as any);

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("spends an Exhaust token to resolve an exhaust ability from a card in play", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["exhaust_play_card"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.exhaust_play_card = {
      id: "exhaust_play_card",
      displayName: "Exhaust Play",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    exhaustCard({ G, ctx }, "exhaust_play_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("can resolve an exhaust ability from the Power card", () => {
    const G = createInitialState();
    G.players["0"].powerArea = ["exhaust_power_card"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.exhaust_power_card = {
      id: "exhaust_power_card",
      displayName: "Exhaust Power",
      type: "power",
      cardType: "power",
      suit: "power",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };

    exhaustCard({ G, ctx }, "exhaust_power_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("blocks exhaust abilities outside Activate turns", () => {
    const G = createInitialState();
    G.currentTurnType = "revolt";
    G.players["0"].playArea = ["exhaust_play_card"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.exhaust_play_card = {
      id: "exhaust_play_card",
      displayName: "Exhaust Play",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    exhaustCard({ G, ctx }, "exhaust_play_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): turn_type_not_activate(revolt)");
  });

  it("logs invalid play attempts without mutating actions", () => {
    const G = createInitialState();
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].actionsRemaining = 0;

    playCard({ G, ctx }, "test_action_archive_survey");

    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(playCard): no_actions_remaining");
  });

  it("blocks normal card play during an Innovate turn", () => {
    const G = createInitialState();
    G.currentTurnType = "innovate";
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].actionsRemaining = 1;

    playCard({ G, ctx }, "test_action_archive_survey");

    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(playCard): turn_type_not_activate(innovate)");
  });

  it("blocks normal market acquisition during a Revolt turn", () => {
    const G = createInitialState();
    G.currentTurnType = "revolt";
    G.market = ["test_action_foundry_shift"];
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(acquireCard): turn_type_not_activate(revolt)");
  });

  it("still resolves cleanup and resets to Activate after a specialized turn ends", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.currentTurnType = "innovate";
    G.market = [];
    G.players["0"].hand = [];

    endTurnMove({ G, ctx, events: { endTurn } });
    onTurnEnd(G, ctx);

    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(G.currentTurnType).toBe("activate");
  });

  it("Innovate discards hand, breaks through for an allowed suit, then enters cleanup", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.unrestPile = [];
    G.marketUnrest = { test_action_foundry_shift: ["test_unrest_1"] };
    G.players["0"].hand = ["test_action_archive_survey", "test_action_scholars_circle"];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "uncivilized", source: "market" });

    expect(G.currentTurnType).toBe("innovate");
    expect(G.players["0"].discard).toEqual(["test_action_archive_survey", "test_action_scholars_circle"]);
    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].hand).not.toContain("test_unrest_1");
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupDiscardChoice?.cardIds).toEqual(["test_action_foundry_shift"]);
  });

  it("Innovate from market breaks through for the selected matching card", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].hand = [];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.cardDb.test_action_archive_survey = { ...G.cardDb.test_action_archive_survey, suit: "uncivilized" };

    innovateTurn({ G, ctx, events: { endTurn } }, {
      suit: "uncivilized",
      source: "market",
      cardId: "test_action_archive_survey"
    } as any);

    expect(G.players["0"].hand).toContain("test_action_archive_survey");
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.market).toEqual(["test_action_foundry_shift"]);
  });

  it("Innovate cannot break through for Fame", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_action_archive_survey"];

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "fame", source: "deck" } as any);

    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].discard).not.toContain("test_action_archive_survey");
    expect(endTurn).not.toHaveBeenCalled();
    expect(G.log.at(-1)?.message).toBe("InvalidMove(innovateTurn): invalid_innovate_suit(fame)");
  });

  it("Revolt returns selected Unrest cards from hand to the Unrest pile and enters cleanup", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_unrest_1", "test_action_archive_survey"];

    revoltTurn({ G, ctx, events: { endTurn } }, ["test_unrest_1"]);

    expect(G.currentTurnType).toBe("revolt");
    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.unrestPile).toContain("test_unrest_1");
    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupDiscardChoice?.cardIds).toEqual(["test_action_archive_survey"]);
  });

  it("requires enough materials to acquire and refills from the market pool", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_2"];
    G.marketUnrest = { test_action_foundry_shift: ["test_unrest_1"] };
    G.players["0"].resources.materials = 0;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(acquireCard): insufficient_materials(required=1, available=0)");

    G.players["0"].resources.materials = 1;
    G.marketResources = { test_action_foundry_shift: { knowledge: 2 } };
    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.players["0"].discard).not.toContain("test_action_foundry_shift");
    expect(G.market).toEqual(["test_action_archive_survey"]);
    expect(G.marketRefillPool).toEqual([]);
    expect(G.marketResources.test_action_foundry_shift).toBeUndefined();
    expect(G.marketUnrest.test_action_foundry_shift).toBeUndefined();
    expect(G.marketUnrest.test_action_archive_survey).toEqual(["test_unrest_2"]);
    expect(G.unrestPile).toEqual([]);
  });

  it("uses goods to cover market acquire material costs", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.goods = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.market).toEqual([]);
  });

  it("does not tuck unrest under an unrest replacement card", () => {
    const G = createInitialState();
    G.cardDb.test_unrest_replacement = {
      id: "test_unrest_replacement",
      displayName: "Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_unrest_replacement"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_2"];
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_unrest_replacement"]);
    expect(G.marketUnrest?.test_unrest_replacement).toBeUndefined();
    expect(G.unrestPile).toEqual(["test_unrest_2"]);
  });

  it("triggers collapse when a market refill needs Unrest and the Unrest pile is empty", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.unrestPile = [];
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.unrest = 1;
    G.players["1"].resources.unrest = 2;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_archive_survey"]);
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1, "1": 2 }
    });
  });

  it("refills acquired cards in the first two market slots from the main deck", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift", "test_action_archive_survey", "test_action_scholars_circle"];
    G.marketDecks = {
      mainDeck: ["test_action_risk_audit"],
      regionDeck: [],
      uncivilizedDeck: ["test_action_lineage_record"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_risk_audit", "test_action_archive_survey", "test_action_scholars_circle"]);
    expect(G.marketDecks.mainDeck).toEqual([]);
    expect(G.marketDecks.uncivilizedDeck).toEqual(["test_action_lineage_record"]);
    expect(G.marketUnrest?.test_action_risk_audit).toEqual(["test_unrest_1"]);
  });

  it("triggers normal scoring when market refill empties the main deck", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketDecks = {
      mainDeck: ["test_action_risk_audit"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.marketDecks.mainDeck).toEqual([]);
    expect(G.scoring).toEqual({
      reason: "main_deck_empty",
      triggeredBy: "0",
      phase: "finish_current_round"
    });
    expect(G.gameover).toBeUndefined();
  });

  it("refills later market slots from the matching small deck before falling back to main", () => {
    const G = createInitialState();
    G.market = ["test_action_archive_survey", "test_action_risk_audit", "test_action_foundry_shift"];
    G.marketDecks = {
      mainDeck: ["test_action_civic_assembly"],
      regionDeck: [],
      uncivilizedDeck: ["test_action_lineage_record"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_archive_survey", "test_action_risk_audit", "test_action_lineage_record"]);
    expect(G.marketDecks.uncivilizedDeck).toEqual([]);
    expect(G.marketDecks.mainDeck).toEqual(["test_action_civic_assembly"]);
  });

  it("resolves the selected pending choice", () => {
    const G = createInitialState();
    G.pendingChoice = {
      playerId: "0",
      sourceCardId: "test_action_forum_debate",
      choices: [
        [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
        [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
      ]
    };

    resolveChoice({ G, ctx }, 1);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.log.at(-1)?.message).toBe("ChoiceResolved(test_action_forum_debate/index=1)");
  });

  it("resolves the selected pending Find choice", () => {
    const G = createInitialState();
    G.players["0"].hand = ["test_action_foundry_shift"];
    G.players["0"].discard = ["test_action_archive_survey"];
    G.pendingFindChoice = {
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["test_action_foundry_shift", "test_action_archive_survey"],
      destination: "discard"
    };

    resolveFindChoice({ G, ctx }, "test_action_foundry_shift");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toEqual(["test_action_archive_survey", "test_action_foundry_shift"]);
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(finder/test_action_foundry_shift->discard)");
  });
});
