import { describe, expect, it, vi } from "vitest";
import { runEffects } from "../cards/effectRunner";
import { PrototypeGame } from "../game/game";
import { createInitialState } from "../game/initialState";
import { acquireCard, endTurnMove, exhaustCard, innovateTurn, playCard, resolveAcquireChoice, resolveBreakThroughChoice, resolveChoice, resolveCleanupDiscard, resolveCleanupMarketResource, resolveExileChoice, resolveFindChoice, resolveGarrisonChoice, resolveGiveCardChoice, resolveLookOrderChoice, resolvePlaceOnDeckChoice, resolveRegionChoice, resolveReturnUnrestChoice, resolveSolsticeOrderChoice, resolveSwapChoice, resolveUnrestAllocationChoice, revoltTurn } from "../game/moves";
import { currentStateMatches } from "../game/stateMatching";
import { onTurnBegin, onTurnEnd } from "../game/turn";

const ctx = { currentPlayer: "0" } as any;

function addScoringUnrest(G: any, counts: Record<string, number>) {
  for (const [playerId, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i += 1) {
      const id = `collapse_score_unrest_${playerId}_${i}_${Object.keys(G.cardDb).length}`;
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

describe("turn loop", () => {
  it("exposes every pending choice resolver through the boardgame.io move map", () => {
    expect(Object.keys(PrototypeGame.moves ?? {}).sort()).toEqual(expect.arrayContaining([
      "resolveReturnUnrestChoice",
      "resolvePlaceOnDeckChoice",
      "resolveGiveCardChoice",
      "resolveSwapChoice",
      "resolveTradeChoice",
      "skipExileChoice",
      "resolveCleanupDiscard"
    ]));
  });

  it("does not expose direct Market Acquire as a public boardgame.io move", () => {
    expect(Object.keys(PrototypeGame.moves ?? {})).not.toContain("acquireCard");
  });

  it("stops cleanup immediately when a cleanup override triggers Collapse", () => {
    const G = createInitialState();
    G.unrestPile = [];
    addScoringUnrest(G, { "1": 1 });
    G.players["0"].hand = [];
    G.players["0"].deck = ["test_action_archive_survey"];
    G.players["0"].discard = [];
    G.players["0"].actionTokensAvailable = 0;
    G.players["0"].exhaustTokensAvailable = 0;
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      cleanupOverrides: [
        {
          op: "custom_cleanup_effect",
          effect: [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]
        } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0", "1"] } as any);

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].deck).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.log.some((entry) => entry.message.startsWith("TurnPhase(cleanup): draw_up"))).toBe(false);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);
  });

  it("moves a resolved action card to discard after play", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.players["0"].hand = [card];
    playCard({ G, ctx }, card);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).toContain(card);
  });

  it("defers after-play hooks and discard until a played card's pending choice resolves", () => {
    const G = createInitialState();
    const card = "pending_play_card";
    G.players["0"].hand = [card];
    G.cardDb[card] = {
      id: card,
      displayName: "Pending Play Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        {
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
        } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 } as any
      ]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_play_card",
        effects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 3 } as any]
      } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].playArea).toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.log.some((entry) => entry.message === "Nation hook after_play_card #0 resolved.")).toBe(false);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.influence).toBe(3);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.some((entry) => entry.message === "Nation hook after_play_card #0 resolved.")).toBe(true);
  });

  it("does not rerun after-play hooks when an after-play hook creates the pending choice", () => {
    const G = createInitialState();
    const card = "after_play_choice_card";
    G.players["0"].hand = [card];
    G.cardDb[card] = {
      id: card,
      displayName: "After Play Choice Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_play_card",
        effects: [{
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
        } as any]
      } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].playArea).toContain(card);
    expect(G.players["0"].resources.materials).toBe(1);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).toContain(card);
  });

  it("pauses playing a card when a before-play hook creates a pending choice", () => {
    const G = createInitialState();
    const card = "before_play_choice_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb[card] = {
      id: card,
      displayName: "Before Play Choice Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_play_card",
        effects: [{
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
        } as any]
      } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("moves resources on a resolved action card to the player when it goes to discard", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = { ...G.cardDb[card], effects: [] };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.cardStates = { [card]: { resources: { materials: 2 } } };

    playCard({ G, ctx }, card);

    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.cardStates?.[card]).toBeUndefined();
  });

  it("moves garrisoned cards with a resolved action card when it goes to discard", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    const garrisonedCard = "test_action_foundry_shift";
    G.cardDb[card] = { ...G.cardDb[card], effects: [] };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = {
      [card]: { resources: { materials: 2 }, garrisonedCardIds: [garrisonedCard] },
      [garrisonedCard]: { resources: { knowledge: 1 } }
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].discard).toEqual([card, garrisonedCard]);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.[card]).toBeUndefined();
    expect(G.cardStates?.[garrisonedCard]).toBeUndefined();
  });

  it("spends an Action token from the State card when playing a normal action", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 3;
    G.players["0"].actionTokensAvailable = 3;

    playCard({ G, ctx }, card);

    expect(G.players["0"].actionsRemaining).toBe(2);
    expect(G.players["0"].actionTokensAvailable).toBe(2);
  });

  it("does not play a normal action without an available Action token", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 0;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(playCard): no_action_tokens_available");
  });

  it("places a spent Action token marker on a persistent played card", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = { ...G.cardDb[card], type: "in_play", cardType: "in_play" };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].playArea).toContain(card);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.cardStates?.[card]?.actionTokens).toBe(1);
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

  it("pauses cleanup turn handoff when draw-up reshuffle creates a pending choice", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.hand = [];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.handSize = 1;
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

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0", "1"] } as any, () => 0);

    expect(G.pendingChoice).toBeDefined();
    expect(p.deck).toEqual(["test_action_archive_survey"]);
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message.startsWith("TurnPhase(cleanup): draw_up"))).toBe(false);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0", playOrder: ["0", "1"] } as any, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "TurnPhase(cleanup): draw_up(hand=1)")).toBe(true);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(true);
  });

  it("pauses cleanup after a cleanup override creates a pending choice", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.hand = [];
    p.deck = ["test_action_archive_survey"];
    p.discard = [];
    p.playArea = ["persistent_card"];
    p.handSize = 1;
    p.resources.knowledge = 0;
    G.cardStates = { persistent_card: { actionTokens: 1, exhausted: true } };
    G.cardDb.persistent_card = {
      id: "persistent_card",
      displayName: "Persistent",
      type: "in_play",
      cardType: "in_play",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        cleanupOverrides: [{
          op: "custom_cleanup_effect",
          effect: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
          }]
        }]
      }
    } as any;

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0", "1"] } as any, () => 0);

    expect(G.pendingChoice).toBeDefined();
    expect(G.cardStates?.persistent_card?.actionTokens).toBe(1);
    expect(G.cardStates?.persistent_card?.exhausted).toBe(true);
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message === "TurnPhase(cleanup): optional_discard_resolved")).toBe(false);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0", playOrder: ["0", "1"] } as any, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(G.cardStates?.persistent_card?.actionTokens).toBe(0);
    expect(G.cardStates?.persistent_card?.exhausted).toBe(false);
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(true);
  });

  it("pauses cleanup turn handoff when a collapse override creates a pending choice", () => {
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = [];
    G.players["0"].deck = [];
    G.players["0"].discard = [];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
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

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0", "1"] } as any);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingTurnEndCleanup).toEqual({ playerId: "0", playOrder: ["0", "1"], stage: "after_draw_up" });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingTurnEndCleanup).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(true);
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

  it("does not play a card when none of its on-play text can resolve", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "draw", count: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = [];
    G.players["0"].discard = [];
    G.players["0"].nationDeck = [];
    G.players["0"].developmentArea = [];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a develop-only card when no Development card is payable", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "develop" } as any]
    };
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.players["0"].hand = [card];
    G.players["0"].developmentArea = ["test_action_scholars_circle"];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a fame-only card when no Fame card can be gained", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "gain_fame", count: 1 } as any]
    };
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { "0": true }
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a choose-one card when every choice has an unaffordable cost", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{
        trigger: "on_play",
        op: "choose_one",
        choices: [
          [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }],
          [{ trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 1 }]
        ]
      } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play an optional-only card when the optional effect cannot be chosen", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{
        trigger: "on_play",
        op: "optional",
        effects: [
          { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
          { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
        ]
      } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a paid action when the explicit cost cannot be paid", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("honors selected Progress/Goods substitution when playing a paid action", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 1;
    G.players["0"].stateArea = ["alien_state"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = ["alien_unrest"];
    G.cardDb.alien_state = {
      id: "alien_state",
      displayName: "Alien",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["alien"],
      effects: []
    };
    G.cardStates = { alien_state: { activeState: "alien" } };
    G.activeNationRulesets!["0"].stateOverrides = [
      { op: "take_unrest_when_spending_resource", resource: "knowledge", state: "alien" } as any
    ];

    playCard({ G, ctx }, card, { knowledge: 1 });

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].discard).toContain("alien_unrest");
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.some((entry) => entry.message === "SpentResourcePenalty(knowledge/unrest=1)")).toBe(true);
  });

  it("does not treat discard reshuffle as resolvable for draw-if-able text", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "draw_if_able", count: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = [];
    G.players["0"].discard = ["test_action_foundry_shift"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not treat an unpayable Development reshuffle as resolvable draw text", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "draw", count: 1 } as any]
    };
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.players["0"].hand = [card];
    G.players["0"].deck = [];
    G.players["0"].discard = [];
    G.players["0"].nationDeck = [];
    G.players["0"].accessionCardId = undefined;
    G.players["0"].developmentArea = ["test_action_scholars_circle"];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("plays a look-only card when its source deck has cards to inspect", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "look_cards", source: "deck", count: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = ["test_action_foundry_shift"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.lookedCards).toEqual({
      playerId: "0",
      source: "deck",
      cardIds: ["test_action_foundry_shift"]
    });
    expect(G.players["0"].discard).toContain(card);
  });

  it("does not play a trade-only card when no Trade Route or Goods fallback can resolve", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.options = { playerCount: 2, mode: "multiplayer", enabledExpansions: ["trade_routes"], enabledVariants: [] };
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "trade" } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.goods = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("rolls back a played card when its on-play effects fail", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any,
        { trigger: "on_play", op: "unsupported_private_effect" } as any
      ]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.materials = 0;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): on_play_effect_failed(${card})`);
  });

  it("runs after-play hooks before the resolved card leaves play", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.activeNationRulesets = {
      "0": {
        ...G.activeNationRulesets!["0"],
        hookRules: [{
          trigger: "after_play_card",
          condition: { op: "card_in_zone", cardId: card, zoneId: "playArea" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.some((entry) => entry.message === "Nation hook after_play_card #0 resolved.")).toBe(true);
  });

  it("runs after-play hooks that match the triggering card suit from payload", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      suit: "civilized",
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.activeNationRulesets = {
      "0": {
        ...G.activeNationRulesets!["0"],
        hookRules: [{
          trigger: "after_play_card",
          condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "civilized" } as any,
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_play_card #0 resolved.")).toBe(true);
  });

  it("runs state-gated nation hooks using State suit aliases", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
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
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.players["0"].stateArea = ["civilized_state"];
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.activeNationRulesets = {
      "0": {
        ...G.activeNationRulesets!["0"],
        hookRules: [{
          trigger: "after_play_card",
          condition: { op: "state_is", state: "empire" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_play_card #0 resolved.")).toBe(true);
  });

  it("allows play when only the aliased state-gated branch can resolve", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
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
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{
        trigger: "on_play",
        op: "conditional_state_is",
        state: "empire",
        then: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
        else: [{ trigger: "on_play", op: "draw_if_able", count: 1 } as any]
      } as any]
    };
    G.players["0"].stateArea = ["civilized_state"];
    G.players["0"].hand = [card];
    G.players["0"].deck = [];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.at(-1)?.message).not.toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a Find-only card when the only matching Nation deck card is accession", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "find_card", cardId: "accession_card", destination: "hand" } as any]
    };
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
    G.players["0"].hand = [card];
    G.players["0"].nationDeck = ["accession_card"];
    G.players["0"].accessionCardId = "accession_card";
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].nationDeck).toEqual(["accession_card"]);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a Find-only card when the only matching Nation deck card is accession-typed", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "find_card", cardId: "accession_card", destination: "hand" } as any]
    };
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
    G.players["0"].hand = [card];
    G.players["0"].nationDeck = ["accession_card"];
    G.players["0"].accessionCardId = undefined;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].nationDeck).toEqual(["accession_card"]);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not treat unsupported on-play effect ops as resolvable", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a recall-only card when the explicit target is not a Region", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "recall_region", cardId: "not_region" } as any]
    };
    G.cardDb.not_region = {
      id: "not_region",
      displayName: "Not Region",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].playArea = ["not_region"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).toEqual(["not_region"]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
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

  it("cleanup market resource choices honor nation cleanup resource overrides", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.players["0"].hand = [];
    G.activeNationRulesets = {
      "0": {
        nationId: "resource_override",
        displayName: "Resource Override",
        rulesetTags: ["clean_up_market_resource_override"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [{ op: "market_resource_added", resource: "goods", count: 1 } as any],
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

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupMarketResourceChoice).toEqual({
      playerId: "0",
      resource: "goods",
      amount: 1,
      cardIds: ["test_action_foundry_shift", "test_action_archive_survey"]
    });

    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");

    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(G.marketResources?.test_action_foundry_shift?.goods).toBe(1);
    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBeUndefined();
  });

  it("normalizes cleanup Population overrides to the engine population resource", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.players["0"].hand = [];
    G.activeNationRulesets = {
      "0": {
        nationId: "population_override",
        displayName: "Population Override",
        rulesetTags: ["clean_up_market_resource_override"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [{ op: "market_resource_added", resource: "population", count: 1 } as any],
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

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(G.pendingCleanupMarketResourceChoice?.resource).toBe("influence");
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");

    expect(G.marketResources?.test_action_foundry_shift?.influence).toBe(1);
    expect((G.marketResources?.test_action_foundry_shift as any)?.population).toBeUndefined();
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

  it("skips optional cleanup discard when a nation cleanup override prevents it", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_action_archive_survey"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      cleanupOverrides: [{ op: "prevent_voluntary_discard" }]
    };

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(G.pendingCleanupDiscardChoice).toBeUndefined();
    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
  });

  it("precious cards variant prevents voluntary cleanup discard", () => {
    const endTurn = vi.fn();
    const G = createInitialState({ options: { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: ["precious_cards"] } });
    G.market = [];
    G.players["0"].hand = ["test_action_archive_survey", "test_action_foundry_shift"];

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(G.pendingCleanupDiscardChoice).toBeUndefined();
    expect(endTurn).toHaveBeenCalledTimes(1);
    expect(G.players["0"].hand).toEqual(["test_action_archive_survey", "test_action_foundry_shift"]);
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

  it("cleanup draws up to a modified hand size", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].deck = [
      "test_action_archive_survey",
      "test_action_foundry_shift",
      "test_action_scholars_circle",
      "test_action_risk_audit",
      "test_action_lineage_record",
      "test_action_civic_assembly",
      "test_action_market_pull"
    ];
    G.players["0"].discard = [];
    (G.players["0"] as any).handSize = 7;

    onTurnEnd(G, ctx, () => 0);

    expect(G.players["0"].hand).toHaveLength(7);
  });

  it("cleanup adds a market resource when called directly", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.players["0"].hand = [];

    onTurnEnd(G, ctx);

    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBe(1);
  });

  it("cleanup market resource placement is capped by component supply", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.players["0"].hand = [];
    G.resourceSupply = { knowledge: 0 };

    onTurnEnd(G, ctx);

    expect(G.marketResources?.test_action_foundry_shift?.knowledge ?? 0).toBe(0);
    expect(G.log.some((entry) => entry.message === "MarketResourceAdded(test_action_foundry_shift/knowledge/0/1)")).toBe(true);
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

  it("auto-resolves independent simultaneous Solstice resource gains without an order prompt", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["gain_materials_solstice", "gain_knowledge_solstice"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.gain_materials_solstice = {
      id: "gain_materials_solstice",
      displayName: "Gain Materials",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.cardDb.gain_knowledge_solstice = {
      id: "gain_knowledge_solstice",
      displayName: "Gain Knowledge",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.round).toBe(2);
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

  it("removes a configured Reactor-style play card and remaining Nation deck at End of Solstice when its resource is empty", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion"];
    p.nationDeck = ["remaining_nation_1", "remaining_nation_2"];
    p.resources.knowledge = 0;
    p.stateArea = ["alien_state"];
    G.cardDb.reactor_explosion = {
      id: "reactor_explosion",
      displayName: "Reactor Explosion",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
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
    G.activeNationRulesets!["0"].solsticeOverrides = [
      { op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "reactor_explosion", resource: "knowledge", state: "alien" } as any
    ];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(p.playArea).toEqual([]);
    expect(p.nationDeck).toEqual([]);
    expect(p.exile).toEqual(["reactor_explosion", "remaining_nation_1", "remaining_nation_2"]);
    expect(G.log.some((entry) => entry.message === "SolsticeRemovedPlayCardAndNationDeck(reactor_explosion/removed=3)")).toBe(true);
  });

  it("activates a configured Go Native state after Reactor-style Solstice removal succeeds", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion"];
    p.nationDeck = ["remaining_nation_1"];
    p.resources.knowledge = 0;
    p.stateArea = ["alien_state"];
    G.cardDb.reactor_explosion = {
      id: "reactor_explosion",
      displayName: "Reactor Explosion",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
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
    G.activeNationRulesets!["0"].solsticeOverrides = [
      { op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "reactor_explosion", resource: "knowledge", state: "alien", activateState: "native" } as any
    ];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(p.playArea).toEqual([]);
    expect(p.nationDeck).toEqual([]);
    expect(p.exile).toEqual(["reactor_explosion", "remaining_nation_1"]);
    expect(G.cardStates.alien_state?.activeState).toBe("native");
    expect(currentStateMatches(G, "0", "native")).toBe(true);
    expect(currentStateMatches(G, "0", "alien")).toBe(false);
    expect(G.log.some((entry) => entry.message === "StateActivatedOnSolsticeRemoval(reactor_explosion/native)")).toBe(true);
  });

  it("does not reapply start-as-state overrides after Go Native has activated", () => {
    const G = createInitialState();
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
    G.cardStates = { alien_state: { activeState: "native" } };
    G.activeNationRulesets!["0"].stateOverrides = [
      { op: "start_as_state", state: "alien" } as any
    ];

    onTurnBegin(G, ctx);

    expect(G.cardStates.alien_state?.activeState).toBe("native");
    expect(currentStateMatches(G, "0", "native")).toBe(true);
    expect(currentStateMatches(G, "0", "alien")).toBe(false);
  });

  it("checks Reactor-style End-of-Solstice removal after End-of-Solstice card effects resolve", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion", "late_progress"];
    p.nationDeck = ["remaining_nation_1"];
    p.resources.knowledge = 0;
    p.stateArea = ["alien_state"];
    G.cardDb.reactor_explosion = {
      id: "reactor_explosion",
      displayName: "Reactor Explosion",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.late_progress = {
      id: "late_progress",
      displayName: "Late Progress",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
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
    G.activeNationRulesets!["0"].solsticeOverrides = [
      { op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "reactor_explosion", resource: "knowledge", state: "alien" } as any
    ];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(p.resources.knowledge).toBe(1);
    expect(p.playArea).toEqual(["reactor_explosion", "late_progress"]);
    expect(p.nationDeck).toEqual(["remaining_nation_1"]);
    expect(p.exile).toEqual([]);
    expect(G.cardStates.alien_state?.activeState).toBe("alien");
  });

  it("lets a player choose the order of their simultaneous Solstice card effects", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["spend_solstice_card", "gain_solstice_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.spend_solstice_card = {
      id: "spend_solstice_card",
      displayName: "Spend Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "spend_resource", resource: "materials", amount: 1 } as any]
    };
    G.cardDb.gain_solstice_card = {
      id: "gain_solstice_card",
      displayName: "Gain Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["spend_solstice_card", "gain_solstice_card"]
    });
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.round).toBe(1);

    resolveSolsticeOrderChoice({ G, ctx }, ["gain_solstice_card", "spend_solstice_card"]);

    expect(G.pendingSolsticeOrderChoice).toBeUndefined();
    expect(G.pausedSolstice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.round).toBe(2);
  });

  it("lets a player choose Solstice order when one simultaneous effect can Exile a market card", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["exile_solstice_card", "gain_solstice_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.market = ["market_civilized"];
    G.cleanupMarketResourcePlaced = { playerId: "1", round: G.round };
    G.cardDb.exile_solstice_card = {
      id: "exile_solstice_card",
      displayName: "Exile Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "exile_card", source: "market", suit: "civilized" } as any]
    };
    G.cardDb.gain_solstice_card = {
      id: "gain_solstice_card",
      displayName: "Gain Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
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

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["exile_solstice_card", "gain_solstice_card"]
    });
    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("lets a player choose Solstice order when Look can reorder cards before Draw", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["look_solstice_card", "draw_solstice_card"];
    G.players["0"].hand = [];
    G.players["0"].deck = ["draw_first", "draw_second"];
    G.players["1"].hand = [];
    G.cardDb.look_solstice_card = {
      id: "look_solstice_card",
      displayName: "Look Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "look_cards", source: "deck", count: 2 } as any]
    };
    G.cardDb.draw_solstice_card = {
      id: "draw_solstice_card",
      displayName: "Draw Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "draw", count: 1 } as any]
    };
    G.cardDb.draw_first = { id: "draw_first", displayName: "Draw First", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] };
    G.cardDb.draw_second = { id: "draw_second", displayName: "Draw Second", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["look_solstice_card", "draw_solstice_card"]
    });
    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);

    resolveSolsticeOrderChoice({ G, ctx }, ["look_solstice_card", "draw_solstice_card"]);

    expect(G.pendingLookOrderChoice?.cardIds).toEqual(["draw_first", "draw_second"]);
    expect(G.pendingSolsticeContinuation?.cardIds).toEqual(["draw_solstice_card"]);
    expect(G.players["0"].hand).toEqual([]);

    resolveLookOrderChoice({ G, ctx }, ["draw_second", "draw_first"]);

    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.pendingSolsticeContinuation).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["draw_second"]);
    expect(G.players["0"].deck).toEqual(["draw_first"]);
  });

  it("resumes the remaining chosen Solstice order after a card in that order creates a pending choice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["choice_solstice_card", "gain_solstice_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.choice_solstice_card = {
      id: "choice_solstice_card",
      displayName: "Choice Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_solstice",
        op: "choose_one",
        choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
      } as any]
    };
    G.cardDb.gain_solstice_card = {
      id: "gain_solstice_card",
      displayName: "Gain Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);
    resolveSolsticeOrderChoice({ G, ctx }, ["choice_solstice_card", "gain_solstice_card"]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "choice_solstice_card",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
    });
    expect(G.pendingSolsticeContinuation).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["gain_solstice_card"],
      cursor: {
        playOrder: ["0", "1"],
        playerIndex: 0,
        phase: "overrides",
        cardIndex: 0,
        overrideIndex: 0
      }
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.round).toBe(1);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.round).toBe(2);
  });

  it("resumes remaining chosen Solstice cards with their own card identity after a pending choice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["choice_solstice_card", "history_solstice_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.choice_solstice_card = {
      id: "choice_solstice_card",
      displayName: "Choice Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_solstice",
        op: "choose_one",
        choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
      } as any]
    };
    G.cardDb.history_solstice_card = {
      id: "history_solstice_card",
      displayName: "History Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "move_self_to_history" } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);
    resolveSolsticeOrderChoice({ G, ctx }, ["choice_solstice_card", "history_solstice_card"]);
    resolveChoice({ G, ctx }, 0);

    expect(G.players["0"].history).toEqual(["history_solstice_card"]);
    expect(G.players["0"].playArea).toEqual(["choice_solstice_card"]);
    expect(G.round).toBe(2);
  });

  it("uses a configured Solstice state sequence when flipping state", () => {
    const G = createInitialState();
    G.players["0"].stateArea = ["winter_state", "summer_state"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.winter_state = {
      id: "winter_state",
      displayName: "Winter",
      type: "state",
      cardType: "state",
      suit: "uncivilized",
      cost: 0,
      tags: ["winter"],
      effects: []
    };
    G.cardDb.summer_state = {
      id: "summer_state",
      displayName: "Summer",
      type: "state",
      cardType: "state",
      suit: "civilized",
      cost: 0,
      tags: ["summer"],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        nationId: "seasonal_state",
        displayName: "Seasonal State",
        rulesetTags: ["state_flip_on_solstice"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [{ op: "flip_state_on_solstice", sequence: ["winter", "summer"], loop: true } as any],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [{ op: "flip_state" }],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.players["0"].stateArea).toEqual(["summer_state", "winter_state"]);
  });

  it("uses a configured Solstice state sequence on a single two-sided State card", () => {
    const G = createInitialState();
    G.players["0"].stateArea = ["seasonal_state_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.seasonal_state_card = {
      id: "seasonal_state_card",
      displayName: "Seasonal State",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["winter", "summer"],
      effects: []
    };
    G.cardStates = { seasonal_state_card: { activeState: "winter" } };
    G.activeNationRulesets = {
      "0": {
        nationId: "seasonal_state",
        displayName: "Seasonal State",
        rulesetTags: ["state_flip_on_solstice"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [{ op: "flip_state_on_solstice", sequence: ["winter", "summer"], loop: true } as any],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [{ op: "flip_state" }],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }
    };

    expect(currentStateMatches(G, "0", "winter")).toBe(true);
    expect(currentStateMatches(G, "0", "summer")).toBe(false);

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.players["0"].stateArea).toEqual(["seasonal_state_card"]);
    expect(G.cardStates?.seasonal_state_card?.activeState).toBe("summer");
    expect(currentStateMatches(G, "0", "winter")).toBe(false);
    expect(currentStateMatches(G, "0", "summer")).toBe(true);
  });

  it("pauses Solstice when an ordinary Solstice effect creates a pending choice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_choice_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.solstice_choice_card = {
      id: "solstice_choice_card",
      displayName: "Solstice Choice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        {
          trigger: "on_solstice",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
        } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "solstice_choice_card",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.round).toBe(1);
    expect(G.log.some((entry) => entry.message === "SolsticePaused(pending_choice)")).toBe(true);
  });

  it("pauses Solstice when an ordinary Solstice effect creates a pending Exile choice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_exile_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.market = ["market_civilized"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.cleanupMarketResourcePlaced = { playerId: "1", round: G.round };
    G.unrestPile = ["test_unrest_1"];
    G.cardDb.solstice_exile_card = {
      id: "solstice_exile_card",
      displayName: "Solstice Exile",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "exile_card", source: "market", suit: "civilized" } as any]
    };
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

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "solstice_exile_card",
      source: "market",
      cardIds: ["market_civilized"]
    });
    expect(G.pausedSolstice).toEqual({
      playOrder: ["0", "1"],
      playerIndex: 0,
      phase: "on_solstice",
      cardIndex: 1,
      overrideIndex: 0
    });
    expect(G.log.some((entry) => entry.message === "SolsticePaused(pending_exile_choice)")).toBe(true);
  });

  it("pauses Solstice when an ordinary Solstice effect creates a pending Return Unrest choice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_return_unrest_card"];
    G.players["0"].hand = ["hand_unrest"];
    G.players["0"].discard = ["discard_unrest"];
    G.players["1"].hand = [];
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
    G.cardDb.solstice_return_unrest_card = {
      id: "solstice_return_unrest_card",
      displayName: "Solstice Return",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_solstice", op: "return_unrest" } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingReturnUnrestChoice).toEqual({
      playerId: "0",
      sourceCardId: "solstice_return_unrest_card",
      cardIds: ["hand_unrest", "discard_unrest"],
      sourceZones: ["hand", "discard"]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pausedSolstice).toEqual({
      playOrder: ["0", "1"],
      playerIndex: 0,
      phase: "on_solstice",
      cardIndex: 1,
      overrideIndex: 0
    });
    expect(G.round).toBe(1);
    expect(G.log.some((entry) => entry.message === "SolsticePaused(pending_return_unrest_choice)")).toBe(true);
  });

  it("pauses Solstice when an ordinary Solstice effect creates a pending Place on Deck choice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_place_card"];
    G.players["0"].hand = ["first_card", "second_card"];
    G.players["1"].hand = [];
    G.cardDb.solstice_place_card = {
      id: "solstice_place_card",
      displayName: "Solstice Place",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_solstice", op: "place_card_on_deck" } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingPlaceOnDeckChoice).toEqual({
      playerId: "0",
      sourceCardId: "solstice_place_card",
      sourceZone: "hand",
      cardIds: ["first_card", "second_card"]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pausedSolstice).toMatchObject({ playerIndex: 0, phase: "on_solstice", cardIndex: 1 });
    expect(G.log.some((entry) => entry.message === "SolsticePaused(pending_place_on_deck_choice)")).toBe(true);
  });

  it("pauses Solstice when an ordinary Solstice effect creates a pending Give Card choice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_give_card"];
    G.players["0"].hand = ["first_card", "second_card"];
    G.players["1"].hand = [];
    G.cardDb.solstice_give_card = {
      id: "solstice_give_card",
      displayName: "Solstice Give",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_solstice", op: "give_card" } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingGiveCardChoice).toEqual({
      playerId: "0",
      sourceCardId: "solstice_give_card",
      cardIds: ["first_card", "second_card"],
      recipientPlayerIds: ["1"]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pausedSolstice).toMatchObject({ playerIndex: 0, phase: "on_solstice", cardIndex: 1 });
    expect(G.log.some((entry) => entry.message === "SolsticePaused(pending_give_card_choice)")).toBe(true);
  });

  it("pauses Solstice when an ordinary Solstice effect creates a pending Swap choice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_swap_card"];
    G.players["0"].hand = ["hand_civilized"];
    G.players["1"].hand = [];
    G.market = ["market_civilized"];
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
    G.cardDb.solstice_swap_card = {
      id: "solstice_swap_card",
      displayName: "Solstice Swap",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_solstice", op: "swap_card", sourceZone: "hand" } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSwapChoice).toEqual({
      playerId: "0",
      sourceCardId: "solstice_swap_card",
      sourceZone: "hand",
      choices: [{ cardId: "hand_civilized", marketCardId: "market_civilized" }]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pausedSolstice).toMatchObject({ playerIndex: 0, phase: "on_solstice", cardIndex: 1 });
    expect(G.log.some((entry) => entry.message === "SolsticePaused(pending_swap_choice)")).toBe(true);
  });

  it("resumes paused Solstice after the pending choice resolves", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_choice_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.solstice_choice_card = {
      id: "solstice_choice_card",
      displayName: "Solstice Choice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        {
          trigger: "on_solstice",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
        } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);
    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pausedSolstice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.round).toBe(2);
    expect(G.log.some((entry) => entry.message === "SolsticeResumed")).toBe(true);
  });

  it("resumes paused Solstice after a pending Region choice resolves", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_region_choice", "test_region"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.solstice_region_choice = {
      id: "solstice_region_choice",
      displayName: "Solstice Region Choice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_solstice", op: "recall_region" } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
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

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);
    resolveRegionChoice({ G, ctx }, "test_region");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.pausedSolstice).toBeUndefined();
    expect(G.players["0"].hand).toContain("test_region");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.round).toBe(2);
    expect(G.log.some((entry) => entry.message === "SolsticeResumed")).toBe(true);
  });

  it("pauses and resumes Solstice when an after-Solstice nation hook creates a pending choice", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.players["1"].playArea = ["later_solstice_card"];
    G.cardDb.later_solstice_card = {
      id: "later_solstice_card",
      displayName: "Later Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_solstice",
        effects: [{
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
        }]
      }]
    };
    G.activeNationRulesets!["1"] = { ...G.activeNationRulesets!["1"], hookRules: [] };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: undefined,
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
    });
    expect(G.pausedSolstice).toEqual({
      playOrder: ["0", "1"],
      playerIndex: 1,
      phase: "on_solstice",
      cardIndex: 0,
      overrideIndex: 0
    });
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect(G.round).toBe(1);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pausedSolstice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.round).toBe(2);
    expect(G.log.some((entry) => entry.message === "SolsticeResumed")).toBe(true);
  });

  it("collapse during Solstice stops later Solstice effects and round advancement", () => {
    const G = createInitialState();
    G.unrestPile = [];
    G.players["0"].playArea = ["collapse_solstice_card"];
    G.players["0"].hand = [];
    G.players["1"].playArea = ["later_solstice_card"];
    G.players["1"].hand = [];
    G.cardDb.collapse_solstice_card = {
      id: "collapse_solstice_card",
      displayName: "Collapse Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "take_unrest", count: 1 } as any]
    };
    G.cardDb.later_solstice_card = {
      id: "later_solstice_card",
      displayName: "Later Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect(G.round).toBe(1);
  });

  it("pauses round handoff when a post-Solstice collapse override creates a pending choice", () => {
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
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

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingSolsticeRoundEnd).toEqual({ playerId: "1" });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.round).toBe(2);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingSolsticeRoundEnd).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.round).toBe(2);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(true);
  });

  it("does not complete a turn handoff after final scoring resolves at the Solstice boundary", () => {
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.players["0"].deck = [];
    G.players["1"].deck = [];
    G.players["0"].discard = [];
    G.players["1"].discard = [];
    G.players["0"].resources.knowledge = 5;
    G.players["1"].resources.knowledge = 1;
    G.scoring = { reason: "main_deck_empty", triggeredBy: "0", phase: "final_round", finalRound: 1 };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:main_deck_empty",
      scores: { "0": 5, "1": 1 }
    });
    expect(G.round).toBe(2);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);
  });

  it("pauses Solstice round handoff when final scoring creates a pending choice", () => {
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.players["0"].deck = [];
    G.players["1"].deck = [];
    G.players["0"].discard = [];
    G.players["1"].discard = [];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 5;
    G.players["1"].resources.knowledge = 1;
    G.scoring = { reason: "main_deck_empty", triggeredBy: "0", phase: "final_round", finalRound: 1 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_scoring",
        effects: [{
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
        }]
      } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingScoringFinalization).toEqual({ playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 });
    expect(G.gameover).toBeUndefined();
    expect(G.round).toBe(2);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "normal_scoring:main_deck_empty",
      scores: { "0": 5, "1": 1 }
    });
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);
  });

  it("keeps Collapse from an on-play effect instead of rolling the action back", () => {
    const G = createInitialState();
    G.unrestPile = [];
    G.players["0"].hand = ["collapse_action"];
    addScoringUnrest(G, { "0": 1, "1": 2 });
    G.cardDb.collapse_action = {
      id: "collapse_action",
      displayName: "Collapse Action",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "take_unrest", count: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    playCard({ G, ctx }, "collapse_action");

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1, "1": 2 }
    });
    expect(G.players["0"].hand).not.toContain("collapse_action");
    expect(G.players["0"].playArea).toContain("collapse_action");
    expect(G.players["0"].discard).not.toContain("collapse_action");
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("allows a mandatory take-Unrest card to be played when the empty pile will Collapse", () => {
    const G = createInitialState();
    G.unrestPile = [];
    G.players["0"].hand = ["collapse_only_action"];
    addScoringUnrest(G, { "0": 1, "1": 2 });
    G.cardDb.collapse_only_action = {
      id: "collapse_only_action",
      displayName: "Collapse Only Action",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]
    };

    playCard({ G, ctx }, "collapse_only_action");

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.log.some((entry) => entry.message === "InvalidMove(playCard): no_resolvable_on_play_effects(collapse_only_action)")).toBe(false);
    expect(G.players["0"].playArea).toContain("collapse_only_action");
  });

  it("pauses Solstice for triggering-player allocation when multi-player Unrest runs short", () => {
    const G = createInitialState();
    G.unrestPile = ["only_unrest"];
    G.players["0"].playArea = ["short_unrest_solstice_card"];
    G.players["0"].hand = [];
    G.players["1"].playArea = ["later_solstice_card"];
    G.players["1"].hand = [];
    G.cardDb.short_unrest_solstice_card = {
      id: "short_unrest_solstice_card",
      displayName: "Short Unrest Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "take_unrest", targetPlayerIds: ["1", "0"], count: 1 } as any]
    };
    G.cardDb.later_solstice_card = {
      id: "later_solstice_card",
      displayName: "Later Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingUnrestAllocationChoice).toEqual({
      playerId: "0",
      recipientPlayerIds: ["1", "0"],
      countPerPlayer: 1,
      availableUnrestCardIds: ["only_unrest"]
    });
    expect(G.pausedSolstice).toEqual({
      playOrder: ["0", "1"],
      playerIndex: 0,
      phase: "on_solstice",
      cardIndex: 1,
      overrideIndex: 0
    });
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect(G.round).toBe(1);

    resolveUnrestAllocationChoice({ G, ctx }, ["0"]);

    expect(G.pendingUnrestAllocationChoice).toBeUndefined();
    expect(G.players["0"].discard).toContain("only_unrest");
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.players["1"].resources.knowledge).toBe(0);
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
    expect(G.cardStates?.exhaust_play_card?.exhausted).toBe(true);
    expect(G.cardStates?.exhaust_play_card?.exhaustTokens).toBe(1);
  });

  it("allows an exhaust garrison ability with one card in hand", () => {
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
    G.cardDb.exhaust_garrison_card = {
      id: "exhaust_garrison_card",
      displayName: "Exhaust Garrison",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "garrison_card" } as any]
    };
    G.players["0"].playArea = ["test_region", "exhaust_garrison_card"];
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].exhaustTokensAvailable = 1;

    exhaustCard({ G, ctx }, "exhaust_garrison_card");

    expect(G.pendingGarrisonChoice).toEqual({
      playerId: "0",
      sourceCardId: "exhaust_garrison_card",
      hostCardIds: ["test_region"],
      cardIds: ["test_action_archive_survey"]
    });
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
  });

  it("allows an on-play Garrison Region to use itself as the host with one other hand card", () => {
    const G = createInitialState();
    G.cardDb.garrison_region = {
      id: "garrison_region",
      displayName: "Garrison Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "garrison_card" } as any]
    };
    G.players["0"].hand = ["garrison_region", "test_action_archive_survey"];
    G.players["0"].playArea = [];

    playCard({ G, ctx }, "garrison_region");

    expect(G.pendingGarrisonChoice).toEqual({
      playerId: "0",
      sourceCardId: "garrison_region",
      hostCardIds: ["garrison_region"],
      cardIds: ["test_action_archive_survey"]
    });
    expect(G.players["0"].playArea).toContain("garrison_region");
    expect(G.log.some((entry) => entry.message === "InvalidMove(playCard): no_resolvable_on_play_effects(garrison_region)")).toBe(false);
  });

  it("does not exhaust a garrison ability when the explicit host is not a Region", () => {
    const G = createInitialState();
    G.cardDb.not_region = {
      id: "not_region",
      displayName: "Not Region",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
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
    G.cardDb.exhaust_garrison_card = {
      id: "exhaust_garrison_card",
      displayName: "Exhaust Garrison",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "garrison_card",
        hostCardId: "not_region",
        cardId: "test_action_archive_survey"
      } as any]
    };
    G.players["0"].playArea = ["test_region", "not_region", "exhaust_garrison_card"];
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].exhaustTokensAvailable = 1;

    exhaustCard({ G, ctx }, "exhaust_garrison_card");

    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.pendingGarrisonChoice).toBeUndefined();
    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): no_resolvable_on_exhaust_effects(exhaust_garrison_card)");
  });

  it("allows an exhaust discard-random ability with one card in hand", () => {
    const G = createInitialState();
    G.cardDb.exhaust_discard_card = {
      id: "exhaust_discard_card",
      displayName: "Exhaust Discard",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "discard_random", count: 1 } as any]
    };
    G.players["0"].playArea = ["exhaust_discard_card"];
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].exhaustTokensAvailable = 1;

    exhaustCard({ G, ctx, random: { Number: () => 0 } }, "exhaust_discard_card");

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain("test_action_archive_survey");
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.exhaust_discard_card?.exhausted).toBe(true);
  });

  it("allows an exhaust remove-resource ability to resolve as much as possible with none available", () => {
    const G = createInitialState();
    G.cardDb.exhaust_remove_card = {
      id: "exhaust_remove_card",
      displayName: "Exhaust Remove",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "remove_resource", resource: "materials", amount: 1 } as any]
    };
    G.players["0"].playArea = ["exhaust_remove_card"];
    G.players["0"].resources.materials = 0;
    G.players["0"].exhaustTokensAvailable = 1;

    exhaustCard({ G, ctx }, "exhaust_remove_card");

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.exhaust_remove_card?.exhausted).toBe(true);
    expect(G.log.some((entry) => entry.message === "Removed 0/1 materials.")).toBe(true);
  });

  it("blocks exhausting the same card twice before cleanup", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["exhaust_play_card"];
    G.players["0"].exhaustTokensAvailable = 2;
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
    exhaustCard({ G, ctx }, "exhaust_play_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): card_already_exhausted(exhaust_play_card)");
  });

  it("rolls back an exhaust ability when its effects fail", () => {
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
      effects: [
        { trigger: "on_exhaust", op: "gain_resource", resource: "knowledge", amount: 1 } as any,
        { trigger: "on_exhaust", op: "unsupported_private_effect" } as any
      ]
    };

    exhaustCard({ G, ctx }, "exhaust_play_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates?.exhaust_play_card?.exhausted).not.toBe(true);
    expect(G.cardStates?.exhaust_play_card?.exhaustTokens ?? 0).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): exhaust_effect_failed(exhaust_play_card)");
  });

  it("keeps Collapse from an exhaust effect instead of rolling the exhaust back", () => {
    const G = createInitialState();
    G.unrestPile = [];
    G.players["0"].playArea = ["collapse_exhaust_card"];
    G.players["0"].exhaustTokensAvailable = 1;
    addScoringUnrest(G, { "0": 1, "1": 2 });
    G.cardDb.collapse_exhaust_card = {
      id: "collapse_exhaust_card",
      displayName: "Collapse Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_exhaust", op: "take_unrest", count: 1 } as any,
        { trigger: "on_exhaust", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    exhaustCard({ G, ctx }, "collapse_exhaust_card");

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1, "1": 2 }
    });
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.collapse_exhaust_card?.exhausted).not.toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("does not exhaust a card when none of its exhaust text can resolve", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["exhaust_play_card"];
    G.players["0"].deck = [];
    G.players["0"].discard = [];
    G.players["0"].nationDeck = [];
    G.players["0"].developmentArea = [];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.exhaust_play_card = {
      id: "exhaust_play_card",
      displayName: "Exhaust Play",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "draw", count: 1 } as any]
    };

    exhaustCard({ G, ctx }, "exhaust_play_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.cardStates?.exhaust_play_card?.exhausted).not.toBe(true);
    expect(G.cardStates?.exhaust_play_card?.exhaustTokens ?? 0).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): no_resolvable_on_exhaust_effects(exhaust_play_card)");
  });

  it("does not exhaust a paid ability when the explicit cost cannot be paid", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["exhaust_play_card"];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.exhaust_play_card = {
      id: "exhaust_play_card",
      displayName: "Exhaust Play",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_exhaust", op: "spend_resource", resource: "materials", amount: 1 } as any,
        { trigger: "on_exhaust", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    exhaustCard({ G, ctx }, "exhaust_play_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates?.exhaust_play_card?.exhausted).not.toBe(true);
    expect(G.cardStates?.exhaust_play_card?.exhaustTokens ?? 0).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): no_resolvable_on_exhaust_effects(exhaust_play_card)");
  });

  it("honors selected Progress/Goods substitution when resolving a paid exhaust ability", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["exhaust_play_card"];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 1;
    G.players["0"].stateArea = ["alien_state"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.unrestPile = ["alien_unrest"];
    G.cardDb.alien_state = {
      id: "alien_state",
      displayName: "Alien",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["alien"],
      effects: []
    };
    G.cardDb.exhaust_play_card = {
      id: "exhaust_play_card",
      displayName: "Exhaust Play",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_exhaust", op: "spend_resource", resource: "materials", amount: 2 } as any,
        { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardStates = { alien_state: { activeState: "alien" } };
    G.activeNationRulesets!["0"].stateOverrides = [
      { op: "take_unrest_when_spending_resource", resource: "knowledge", state: "alien" } as any
    ];

    exhaustCard({ G, ctx }, "exhaust_play_card", { knowledge: 1 });

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].discard).toContain("alien_unrest");
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.exhaust_play_card?.exhausted).toBe(true);
    expect(G.log.some((entry) => entry.message === "SpentResourcePenalty(knowledge/unrest=1)")).toBe(true);
  });

  it("cleanup clears exhausted card markers", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["exhaust_play_card"];
    G.players["0"].hand = [];
    G.players["0"].exhaustTokensAvailable = 0;
    G.cardStates = { exhaust_play_card: { exhausted: true, exhaustTokens: 1 } };

    onTurnEnd(G, ctx);

    expect(G.cardStates.exhaust_play_card.exhausted).toBe(false);
    expect(G.cardStates.exhaust_play_card.exhaustTokens).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(G.players["0"].exhaustTokensBase);
  });

  it("cleanup clears only the current player's token markers across cleanup zones", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["p0_play"];
    G.players["0"].powerArea = ["p0_power"];
    G.players["0"].stateArea = ["p0_state"];
    G.players["0"].nationDeck = ["p0_nation"];
    G.players["0"].developmentArea = ["p0_development"];
    G.players["0"].hand = [];
    G.players["1"].playArea = ["p1_play"];
    G.players["1"].hand = [];
    G.cardStates = {
      p0_play: { exhausted: true, exhaustTokens: 1 },
      p0_power: { exhausted: true, exhaustTokens: 1 },
      p0_state: { actionTokens: 1, exhaustTokens: 1 },
      p0_nation: { actionTokens: 1 },
      p0_development: { exhaustTokens: 1 },
      p1_play: { exhausted: true, exhaustTokens: 1 }
    };

    onTurnEnd(G, ctx);

    expect(G.cardStates.p0_play).toMatchObject({ exhausted: false, exhaustTokens: 0 });
    expect(G.cardStates.p0_power).toMatchObject({ exhausted: false, exhaustTokens: 0 });
    expect(G.cardStates.p0_state).toMatchObject({ actionTokens: 0, exhaustTokens: 0 });
    expect(G.cardStates.p0_nation).toMatchObject({ actionTokens: 0 });
    expect(G.cardStates.p0_development).toMatchObject({ exhaustTokens: 0 });
    expect(G.cardStates.p1_play).toMatchObject({ exhausted: true, exhaustTokens: 1 });
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

  it("Innovate pauses for an explicit Break Through choice when multiple market cards match", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].hand = ["test_action_scholars_circle"];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.cardDb.test_action_archive_survey = { ...G.cardDb.test_action_archive_survey, suit: "uncivilized" };

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "uncivilized", source: "market" });

    expect(G.currentTurnType).toBe("innovate");
    expect(G.pendingBreakThroughChoice).toEqual({
      playerId: "0",
      sourceCardId: "innovate_turn",
      source: "market",
      suit: "uncivilized",
      cardIds: ["test_action_foundry_shift", "test_action_archive_survey"]
    });
    expect(G.players["0"].discard).toEqual(["test_action_scholars_circle"]);
    expect(G.players["0"].hand).toEqual([]);
    expect(G.market).toEqual(["test_action_foundry_shift", "test_action_archive_survey"]);
    expect(G.pendingCleanupDiscardChoice).toBeUndefined();
    expect(endTurn).not.toHaveBeenCalled();

    resolveBreakThroughChoice({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("test_action_archive_survey");
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.pendingCleanupMarketResourceChoice?.cardIds).toEqual(["test_action_foundry_shift"]);
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
    expect(G.players["0"].discard).toEqual([]);
    expect(G.unrestPile).toContain("test_unrest_1");
    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_archive_survey"]
    });
  });

  it("Revolt leaves non-returned hand cards for the normal cleanup discard choice", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_unrest_1", "test_action_archive_survey", "test_action_scholars_circle"];

    revoltTurn({ G, ctx, events: { endTurn } }, ["test_unrest_1"]);

    expect(G.currentTurnType).toBe("revolt");
    expect(G.unrestPile).toContain("test_unrest_1");
    expect(G.players["0"].hand).toEqual(["test_action_archive_survey", "test_action_scholars_circle"]);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_archive_survey", "test_action_scholars_circle"]
    });
    expect(endTurn).not.toHaveBeenCalled();
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

  it("requires and spends an Action token for direct market acquisition", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 1;
    G.players["0"].actionsRemaining = 0;
    G.players["0"].actionTokensAvailable = 0;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(acquireCard): no_actions_remaining");

    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
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

  it("requires direct Progress and Goods for structured market acquire costs", () => {
    const G = createInitialState();
    G.cardDb.structured_cost_card = {
      id: "structured_cost_card",
      displayName: "Structured Cost",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: { materials: 1, knowledge: 1, goods: 1 } as any,
      tags: [],
      effects: []
    };
    G.market = ["structured_cost_card"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.goods = 1;

    acquireCard({ G, ctx }, "structured_cost_card");

    expect(G.players["0"].hand).not.toContain("structured_cost_card");
    expect(G.market).toEqual(["structured_cost_card"]);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(acquireCard): insufficient_resources(required=materials=1,knowledge=1,goods=1)");

    G.players["0"].resources.knowledge = 1;

    acquireCard({ G, ctx }, "structured_cost_card");

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].hand).toContain("structured_cost_card");
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

  it("does not tuck unrest under a Region replacement card", () => {
    const G = createInitialState();
    G.cardDb.test_region_replacement = {
      id: "test_region_replacement",
      displayName: "Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_region_replacement"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_2"];
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_region_replacement"]);
    expect(G.marketUnrest?.test_region_replacement).toBeUndefined();
    expect(G.unrestPile).toEqual(["test_unrest_2"]);
  });

  it("triggers collapse when a market refill needs Unrest and the Unrest pile is empty", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketSlots = [{ index: 0, cardId: "test_action_foundry_shift", attachedUnrestCardIds: [], resourceMarkers: {} }];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.unrestPile = [];
    G.players["0"].resources.materials = 1;
    addScoringUnrest(G, { "0": 1, "1": 2 });

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_archive_survey"]);
    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1, "1": 2 }
    });
    expect(G.marketSlots).toEqual([]);
    expect(G.log.some((entry) => entry.message === "MarketRefilled(test_action_archive_survey)")).toBe(false);
  });

  it("stops direct Acquire follow-up logging and hooks when refill triggers Collapse", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.unrestPile = [];
    G.players["0"].resources.materials = 1;
    addScoringUnrest(G, { "0": 1, "1": 2 });
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_acquire",
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message.startsWith("MarketRefillStatus("))).toBe(false);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(false);
  });

  it("pauses later nation hooks when an earlier hook creates a pending choice", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 1;
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_acquire",
            effects: [{ trigger: "on_play", op: "choose_one", choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]] } as any]
          },
          {
            trigger: "after_acquire",
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
          }
        ]
      }
    } as any;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
    });
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #1 resolved.")).toBe(false);
  });

  it("resumes later nation hooks after a hook-created pending choice resolves", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_acquire",
            effects: [{ trigger: "on_play", op: "choose_one", choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]] } as any]
          },
          {
            trigger: "after_acquire",
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
          }
        ]
      }
    } as any;

    acquireCard({ G, ctx }, "test_action_foundry_shift");
    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #1 resolved.")).toBe(true);
  });

  it("pauses and resumes later nation hooks for hook-created keyword choices", () => {
    const scenarios = [
      {
        expectedKey: "pendingExileChoice",
        effect: { trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" },
        setup(G: ReturnType<typeof createInitialState>) {
          G.market = ["test_action_foundry_shift", "market_civilized"];
          G.cardDb.market_civilized = { ...G.cardDb.test_action_archive_survey, id: "market_civilized", displayName: "Market Civilized", suit: "civilized" };
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolveExileChoice({ G, ctx }, "market_civilized");
        }
      },
      {
        expectedKey: "pendingReturnUnrestChoice",
        effect: { trigger: "on_play", op: "return_unrest", sourceZones: ["hand"] },
        setup(G: ReturnType<typeof createInitialState>) {
          G.market = ["test_action_foundry_shift"];
          G.players["0"].hand = ["hand_unrest"];
          G.cardDb.hand_unrest = {
            id: "hand_unrest",
            displayName: "Hand Unrest",
            type: "unrest",
            cardType: "unrest",
            suit: "unrest",
            cost: 0,
            tags: ["unrest"],
            effects: []
          };
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolveReturnUnrestChoice({ G, ctx }, "hand_unrest");
        }
      },
      {
        expectedKey: "pendingPlaceOnDeckChoice",
        effect: { trigger: "on_play", op: "place_card_on_deck" },
        setup(G: ReturnType<typeof createInitialState>) {
          G.market = ["test_action_foundry_shift"];
          G.players["0"].hand = ["place_target"];
          G.cardDb.place_target = { ...G.cardDb.test_action_archive_survey, id: "place_target", displayName: "Place Target" };
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolvePlaceOnDeckChoice({ G, ctx }, "place_target");
        }
      },
      {
        expectedKey: "pendingGiveCardChoice",
        effect: { trigger: "on_play", op: "give_card" },
        setup(G: ReturnType<typeof createInitialState>) {
          G.market = ["test_action_foundry_shift"];
          G.players["0"].hand = ["give_target"];
          G.cardDb.give_target = { ...G.cardDb.test_action_archive_survey, id: "give_target", displayName: "Give Target" };
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolveGiveCardChoice({ G, ctx }, "give_target", "1");
        }
      },
      {
        expectedKey: "pendingSwapChoice",
        effect: { trigger: "on_play", op: "swap_card", sourceZone: "hand" },
        setup(G: ReturnType<typeof createInitialState>) {
          G.market = ["test_action_foundry_shift", "market_civilized"];
          G.players["0"].hand = ["hand_civilized"];
          G.unrestPile = ["test_unrest_1"];
          G.cardDb.hand_civilized = { ...G.cardDb.test_action_archive_survey, id: "hand_civilized", displayName: "Hand Civilized", suit: "civilized" };
          G.cardDb.market_civilized = { ...G.cardDb.test_action_scholars_circle, id: "market_civilized", displayName: "Market Civilized", suit: "civilized" };
        },
        resolve(G: ReturnType<typeof createInitialState>) {
          resolveSwapChoice({ G, ctx }, "hand_civilized", "market_civilized");
        }
      }
    ] as const;

    for (const scenario of scenarios) {
      const G = createInitialState();
      G.marketRefillPool = [];
      G.marketDecks = undefined;
      G.players["0"].resources.materials = 1;
      G.players["0"].resources.knowledge = 0;
      scenario.setup(G);
      G.activeNationRulesets = {
        "0": {
          hookRules: [
            {
              trigger: "after_acquire",
              effects: [scenario.effect as any]
            },
            {
              trigger: "after_acquire",
              effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
            }
          ]
        }
      } as any;

      acquireCard({ G, ctx }, "test_action_foundry_shift");

      expect((G as any)[scenario.expectedKey], scenario.expectedKey).toBeDefined();
      expect(G.pendingNationHookContinuation).toEqual({
        playerId: "0",
        trigger: "after_acquire",
        payload: { cardId: "test_action_foundry_shift" },
        nextIndex: 1,
        resolvedHookIndex: 0
      });
      expect(G.players["0"].resources.knowledge).toBe(0);
      expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #1 resolved.")).toBe(false);

      scenario.resolve(G);

      expect((G as any)[scenario.expectedKey]).toBeUndefined();
      expect(G.pendingNationHookContinuation).toBeUndefined();
      expect(G.players["0"].resources.knowledge).toBe(1);
      expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(true);
      expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #1 resolved.")).toBe(true);
    }
  });

  it("pauses acquisition when a before-acquire hook creates a pending choice", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "before_acquire",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
          } as any]
        }]
      }
    } as any;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.pendingChoice).toBeDefined();
    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.materials).toBe(1);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.market).toEqual([]);
    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
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

  it("resumes remaining effects after resolving a pending choice", () => {
    const G = createInitialState();
    G.pendingChoice = {
      playerId: "0",
      sourceCardId: "test_action_forum_debate",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }]
    } as any;

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(2);
  });

  it("keeps Collapse from resumed pending-choice effects instead of rolling the choice back", () => {
    const G = createInitialState();
    G.unrestPile = [];
    addScoringUnrest(G, { "0": 1, "1": 2 });
    G.pendingChoice = {
      playerId: "0",
      sourceCardId: "choice_source",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]],
      resumeEffects: [
        { trigger: "on_play", op: "take_unrest", count: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    } as any;

    resolveChoice({ G, ctx }, 0);

    expect(G.gameover).toEqual({
      winner: "0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1, "1": 2 }
    });
    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("keeps the pending choice when the selected option cannot pay its cost", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.pendingChoice = {
      playerId: "0",
      sourceCardId: "test_action_forum_debate",
      choices: [[{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 }]]
    };

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_forum_debate",
      choices: [[{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 }]]
    });
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveChoice): choice_effect_failed(index=0)");
  });

  it("honors selected Progress/Goods substitution when resolving a paid choice option", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 1;
    G.players["0"].stateArea = ["alien_state"];
    G.unrestPile = ["alien_unrest"];
    G.cardDb.alien_state = {
      id: "alien_state",
      displayName: "Alien",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["alien"],
      effects: []
    };
    G.cardStates = { alien_state: { activeState: "alien" } };
    G.activeNationRulesets!["0"].stateOverrides = [
      { op: "take_unrest_when_spending_resource", resource: "knowledge", state: "alien" } as any
    ];
    G.pendingChoice = {
      playerId: "0",
      sourceCardId: "paid_choice",
      choices: [[
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 },
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
      ] as any]
    };

    resolveChoice({ G, ctx }, 0, { knowledge: 1 });

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].discard).toContain("alien_unrest");
    expect(G.log.some((entry) => entry.message === "SpentResourcePenalty(knowledge/unrest=1)")).toBe(true);
  });

  it("blocks unrelated moves while a pending choice is unresolved", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].resources.materials = 1;
    G.market = ["test_action_foundry_shift"];
    G.pendingChoice = {
      playerId: "0",
      sourceCardId: "test_action_forum_debate",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
    };
    const endTurn = vi.fn();

    playCard({ G, ctx }, card);
    acquireCard({ G, ctx }, "test_action_foundry_shift");
    endTurnMove({ G, ctx, events: { endTurn } });

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupMarketResourceChoice).toBeUndefined();
    expect(G.log.slice(-3).map((entry) => entry.message)).toEqual([
      "InvalidMove(playCard): pending_choice",
      "InvalidMove(acquireCard): pending_choice",
      "InvalidMove(endTurn): pending_choice"
    ]);
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

  it("resolves the selected pending Find choice from History", () => {
    const G = createInitialState();
    G.players["0"].history = ["history_civilized"];
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
    G.pendingFindChoice = {
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["history_civilized"],
      destination: "discard"
    };

    resolveFindChoice({ G, ctx }, "history_civilized");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].discard).toEqual(["history_civilized"]);
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(finder/history_civilized->discard)");
  });

  it("resumes remaining effects after resolving a pending Find choice", () => {
    const G = createInitialState();
    G.players["0"].hand = ["test_action_foundry_shift"];
    G.players["0"].resources.materials = 0;
    G.pendingFindChoice = {
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["test_action_foundry_shift"],
      destination: "discard",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 }]
    } as any;

    resolveFindChoice({ G, ctx }, "test_action_foundry_shift");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].discard).toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.materials).toBe(2);
  });

  it("resolves the selected pending Return Unrest choice", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_unrest"];
    G.players["0"].discard = ["discard_unrest"];
    G.players["0"].resources.knowledge = 0;
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
    G.pendingReturnUnrestChoice = {
      playerId: "0",
      sourceCardId: "returner",
      cardIds: ["hand_unrest", "discard_unrest"],
      sourceZones: ["hand", "discard"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any;

    resolveReturnUnrestChoice({ G, ctx }, "discard_unrest");

    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["hand_unrest"]);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.unrestPile).toEqual(["discard_unrest"]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.at(-1)?.message).toBe("ReturnUnrestChoiceResolved(returner/discard_unrest)");
  });

  it("resolves the selected pending Place-on-deck choice", () => {
    const G = createInitialState();
    G.players["0"].hand = ["first_card", "second_card"];
    G.players["0"].deck = ["existing_top"];
    G.players["0"].resources.materials = 0;
    G.pendingPlaceOnDeckChoice = {
      playerId: "0",
      sourceCardId: "deck_setter",
      sourceZone: "hand",
      cardIds: ["first_card", "second_card"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    } as any;

    resolvePlaceOnDeckChoice({ G, ctx }, "second_card");

    expect(G.pendingPlaceOnDeckChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["first_card"]);
    expect(G.players["0"].deck).toEqual(["second_card", "existing_top"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-1)?.message).toBe("PlaceOnDeckChoiceResolved(deck_setter/second_card)");
  });

  it("resolves the selected pending Give-card choice", () => {
    const G = createInitialState();
    G.players["0"].hand = ["first_card", "second_card"];
    G.players["1"].hand = ["opponent_card"];
    G.players["0"].resources.knowledge = 0;
    G.pendingGiveCardChoice = {
      playerId: "0",
      sourceCardId: "giver",
      cardIds: ["first_card", "second_card"],
      recipientPlayerIds: ["1"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any;

    resolveGiveCardChoice({ G, ctx }, "second_card", "1");

    expect(G.pendingGiveCardChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["first_card"]);
    expect(G.players["1"].hand).toEqual(["opponent_card", "second_card"]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.at(-1)?.message).toBe("GiveCardChoiceResolved(giver/second_card->1)");
  });

  it("resolves the selected pending Swap choice", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_civilized"];
    G.players["0"].resources.materials = 0;
    G.market = ["market_civilized"];
    G.marketResources = { market_civilized: { knowledge: 1 } };
    G.marketUnrest = { market_civilized: ["old_unrest"] };
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
    G.pendingSwapChoice = {
      playerId: "0",
      sourceCardId: "swapper",
      sourceZone: "hand",
      choices: [{ cardId: "hand_civilized", marketCardId: "market_civilized" }],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    } as any;

    resolveSwapChoice({ G, ctx }, "hand_civilized", "market_civilized");

    expect(G.pendingSwapChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["market_civilized"]);
    expect(G.market).toEqual(["hand_civilized"]);
    expect(G.marketResources).toEqual({ hand_civilized: { knowledge: 1 } });
    expect(G.marketUnrest).toEqual({ hand_civilized: ["new_unrest"] });
    expect(G.unrestPile).toEqual(["old_unrest"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-1)?.message).toBe("SwapChoiceResolved(swapper/hand_civilized<->market_civilized)");
  });

  it("resolves the selected pending Exile acquisition choice", () => {
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
    G.pendingAcquireChoice = {
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "exile",
      cardIds: ["exiled_action"],
      destination: "hand"
    };

    resolveAcquireChoice({ G, ctx }, "exiled_action");

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].hand).toContain("exiled_action");
    expect(G.players["0"].discard).toContain("test_unrest_1");
    expect(G.log.at(-1)?.message).toBe("AcquireChoiceResolved(exile_picker/exiled_action)");
  });

  it("resolves the selected pending Market acquisition choice", () => {
    const G = createInitialState();
    G.market = ["market_region", "market_civilized"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketResources = { market_civilized: { knowledge: 2 } };
    G.marketUnrest = { market_civilized: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];
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
    G.cardDb.market_refill = {
      id: "market_refill",
      displayName: "Market Refill",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.pendingAcquireChoice = {
      playerId: "0",
      sourceCardId: "market_picker",
      source: "market",
      cardIds: ["market_civilized"],
      destination: "hand"
    };

    resolveAcquireChoice({ G, ctx }, "market_civilized");

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.market).toEqual(["market_region", "market_refill"]);
    expect(G.players["0"].hand).toContain("market_civilized");
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.marketResources.market_civilized).toBeUndefined();
    expect(G.marketUnrest.market_civilized).toBeUndefined();
    expect(G.marketUnrest.market_refill).toEqual(["test_unrest_2"]);
    expect(G.log.at(-1)?.message).toBe("AcquireChoiceResolved(market_picker/market_civilized)");
  });

  it("resolves the selected pending market Exile choice", () => {
    const G = createInitialState();
    G.market = ["market_civilized", "market_uncivilized"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketUnrest = { market_civilized: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];
    for (const id of ["market_civilized", "market_uncivilized", "market_refill"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: id === "market_uncivilized" ? "uncivilized" : "civilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.pendingExileChoice = {
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "market",
      cardIds: ["market_civilized"]
    };

    resolveExileChoice({ G, ctx }, "market_civilized");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.market).toEqual(["market_refill", "market_uncivilized"]);
    expect(G.players["0"].exile).toContain("market_civilized");
    expect(G.unrestPile).toContain("test_unrest_1");
    expect(G.marketUnrest.market_civilized).toBeUndefined();
    expect(G.marketUnrest.market_refill).toEqual(["test_unrest_2"]);
    expect(G.log.at(-1)?.message).toBe("ExileChoiceResolved(exile_picker/market_civilized)");
  });

  it("resolves the selected pending History Exile choice", () => {
    const G = createInitialState();
    G.players["0"].history = ["history_card"];
    G.cardDb.history_card = {
      id: "history_card",
      displayName: "History Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.pendingExileChoice = {
      playerId: "0",
      sourceCardId: "history_exiler",
      source: "history",
      cardIds: ["history_card"]
    } as any;

    resolveExileChoice({ G, ctx }, "history_card");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].exile).toEqual(["history_card"]);
    expect(G.log.at(-1)?.message).toBe("ExileChoiceResolved(history_exiler/history_card)");
  });

  it("resolves the selected pending discard Exile choice", () => {
    const G = createInitialState();
    G.players["0"].discard = ["discard_card"];
    G.cardDb.discard_card = {
      id: "discard_card",
      displayName: "Discard Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.pendingExileChoice = {
      playerId: "0",
      sourceCardId: "discard_exiler",
      source: "discard",
      cardIds: ["discard_card"]
    } as any;

    resolveExileChoice({ G, ctx }, "discard_card");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.players["0"].discard).toEqual([]);
    expect(G.players["0"].exile).toEqual(["discard_card"]);
    expect(G.log.at(-1)?.message).toBe("ExileChoiceResolved(discard_exiler/discard_card)");
  });

  it("stops pending market Acquire resume effects and logs when refill triggers Collapse", () => {
    const G = createInitialState();
    G.market = ["market_civilized"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.unrestPile = [];
    addScoringUnrest(G, { "0": 1, "1": 2 });
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
    G.pendingAcquireChoice = {
      playerId: "0",
      sourceCardId: "market_picker",
      source: "market",
      cardIds: ["market_civilized"],
      destination: "hand",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any;

    resolveAcquireChoice({ G, ctx }, "market_civilized");

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message === "AcquiredFromMarket(market_civilized/destination=hand)")).toBe(false);
    expect(G.log.some((entry) => entry.message === "AcquireChoiceResolved(market_picker/market_civilized)")).toBe(false);
  });

  it("continues multi-card acquire choices so newly refilled matching cards can be acquired", () => {
    const G = createInitialState();
    G.market = ["market_civilized_a", "market_region", "market_civilized_b"];
    G.marketDecks = {
      mainDeck: ["main_fallback"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: ["market_civilized_refill"],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    for (const id of ["market_civilized_a", "market_civilized_b", "market_civilized_refill", "main_fallback"]) {
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

    runEffects({ G, playerId: "0", selfCardId: "multi_acquirer" }, [{
      trigger: "on_play",
      op: "acquire_card",
      source: "market",
      suit: "civilized",
      count: 2,
      destination: "hand"
    } as any]);

    expect(G.pendingAcquireChoice?.cardIds).toEqual(["market_civilized_a", "market_civilized_b"]);

    resolveAcquireChoice({ G, ctx }, "market_civilized_b");

    expect(G.players["0"].hand).toContain("market_civilized_b");
    expect(G.market).toEqual(["market_civilized_a", "market_region", "market_civilized_refill"]);
    expect(G.pendingAcquireChoice?.cardIds).toEqual(["market_civilized_a", "market_civilized_refill"]);

    resolveAcquireChoice({ G, ctx }, "market_civilized_refill");

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(expect.arrayContaining(["market_civilized_b", "market_civilized_refill"]));
    expect(G.players["0"].hand).not.toContain("market_civilized_a");
    expect(G.market).toEqual(["market_civilized_a", "market_region", "main_fallback"]);
  });

  it("does not trigger main deck scoring when a market slot refills from a matching small deck", () => {
    const G = createInitialState();
    G.market = ["main_slot_a", "main_slot_b", "market_civilized"];
    G.marketDecks = {
      mainDeck: [],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: ["civilized_refill"],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    G.players["0"].resources.materials = 1;
    for (const id of ["main_slot_a", "main_slot_b", "market_civilized", "civilized_refill"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "civilized",
        cost: 1,
        tags: [],
        effects: []
      };
    }

    acquireCard({ G, ctx }, "market_civilized");

    expect(G.market).toEqual(["main_slot_a", "main_slot_b", "civilized_refill"]);
    expect(G.scoring).toBeUndefined();
    expect(G.log.some((entry) => entry.message === "ScoringTriggered(main_deck_empty)")).toBe(false);
  });

  it("resolves the selected pending Exile Break Through choice", () => {
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
    G.pendingBreakThroughChoice = {
      playerId: "0",
      sourceCardId: "exile_breaker",
      source: "exile",
      suit: "civilized",
      cardIds: ["exiled_civilized"]
    };

    resolveBreakThroughChoice({ G, ctx }, "exiled_civilized");

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].hand).toContain("exiled_civilized");
    expect(G.players["0"].discard).not.toContain("test_unrest_1");
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.log.at(-1)?.message).toBe("BreakThroughChoiceResolved(exile_breaker/exiled_civilized)");
  });

  it("resolves the selected pending Market Break Through choice", () => {
    const G = createInitialState();
    G.market = ["market_uncivilized_a", "market_uncivilized_b"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketResources = { market_uncivilized_b: { knowledge: 1 } };
    G.marketUnrest = { market_uncivilized_b: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];
    for (const id of ["market_uncivilized_a", "market_uncivilized_b", "market_refill"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "uncivilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.pendingBreakThroughChoice = {
      playerId: "0",
      sourceCardId: "market_breaker",
      source: "market",
      suit: "uncivilized",
      cardIds: ["market_uncivilized_a", "market_uncivilized_b"]
    };

    resolveBreakThroughChoice({ G, ctx }, "market_uncivilized_b");

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.market).toEqual(["market_uncivilized_a", "market_refill"]);
    expect(G.players["0"].hand).toContain("market_uncivilized_b");
    expect(G.players["0"].hand).not.toContain("test_unrest_1");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.unrestPile).toContain("test_unrest_1");
    expect(G.marketUnrest.market_refill).toEqual(["test_unrest_2"]);
    expect(G.log.at(-1)?.message).toBe("BreakThroughChoiceResolved(market_breaker/market_uncivilized_b)");
  });

  it("stops pending market Break Through resume effects and logs when refill triggers Collapse", () => {
    const G = createInitialState();
    G.market = ["market_uncivilized"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.unrestPile = [];
    addScoringUnrest(G, { "0": 1, "1": 2 });
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
    G.pendingBreakThroughChoice = {
      playerId: "0",
      sourceCardId: "market_breaker",
      source: "market",
      suit: "uncivilized",
      cardIds: ["market_uncivilized"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any;

    resolveBreakThroughChoice({ G, ctx }, "market_uncivilized");

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message === "BreakThroughChoiceResolved(market_breaker/market_uncivilized)")).toBe(false);
  });

  it("continues multi-card market Break Through choices after refilling matching cards", () => {
    const G = createInitialState();
    G.market = ["market_uncivilized_a", "market_region", "market_uncivilized_b"];
    G.marketDecks = {
      mainDeck: ["main_fallback"],
      regionDeck: [],
      uncivilizedDeck: ["market_uncivilized_refill"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    for (const id of ["market_uncivilized_a", "market_uncivilized_b", "market_uncivilized_refill", "main_fallback"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "uncivilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }

    runEffects({ G, playerId: "0", selfCardId: "multi_breaker" }, [{
      trigger: "on_play",
      op: "break_through",
      source: "market",
      suit: "uncivilized",
      count: 2
    } as any]);

    expect(G.pendingBreakThroughChoice?.cardIds).toEqual(["market_uncivilized_a", "market_uncivilized_b"]);

    resolveBreakThroughChoice({ G, ctx }, "market_uncivilized_b");

    expect(G.players["0"].hand).toContain("market_uncivilized_b");
    expect(G.market).toEqual(["market_uncivilized_a", "market_region", "market_uncivilized_refill"]);
    expect(G.pendingBreakThroughChoice?.cardIds).toEqual(["market_uncivilized_a", "market_uncivilized_refill"]);

    resolveBreakThroughChoice({ G, ctx }, "market_uncivilized_refill");

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(expect.arrayContaining(["market_uncivilized_b", "market_uncivilized_refill"]));
    expect(G.players["0"].hand).not.toContain("market_uncivilized_a");
    expect(G.market).toEqual(["market_uncivilized_a", "market_region", "main_fallback"]);
  });

  it("resolves the selected pending garrison choice", () => {
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
    G.players["0"].playArea = ["test_region"];
    G.players["0"].hand = ["test_action_archive_survey"];
    G.pendingGarrisonChoice = {
      playerId: "0",
      sourceCardId: "garrison_source",
      hostCardIds: ["test_region"],
      cardIds: ["test_action_archive_survey"]
    };

    resolveGarrisonChoice({ G, ctx }, "test_region", "test_action_archive_survey");

    expect(G.pendingGarrisonChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.cardStates?.test_region?.garrisonedCardIds).toEqual(["test_action_archive_survey"]);
    expect(G.log.at(-1)?.message).toBe("GarrisonChoiceResolved(garrison_source/test_action_archive_survey->test_region)");
  });

  it("resolves the selected pending region choice", () => {
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
    G.players["0"].playArea = ["test_region"];
    G.pendingRegionChoice = {
      playerId: "0",
      sourceCardId: "recall_source",
      op: "recall_region",
      cardIds: ["test_region"]
    };

    resolveRegionChoice({ G, ctx }, "test_region");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].hand).toEqual(["test_region"]);
    expect(G.log.at(-1)?.message).toBe("RegionChoiceResolved(recall_source/recall_region/test_region)");
  });
});
