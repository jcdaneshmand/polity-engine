import { describe, expect, it, vi } from "vitest";
import { runEffects } from "../cards/effectRunner";
import { PrototypeGame } from "../game/game";
import { createInitialState } from "../game/initialState";
import { acquireCard, endTurnMove, exhaustCard, innovateTurn, playCard, resolveAcquireChoice, resolveBreakThroughChoice, resolveChoice, resolveCleanupDiscard, resolveCleanupMarketResource, resolveDiscardChoice, resolveDrawChoice, resolveExileChoice, resolveFindChoice, resolveGarrisonChoice, resolveGiveCardChoice, resolveLookOrderChoice, resolveMarketCardChoice, resolvePlaceOnDeckChoice, resolveReactiveExhaustChoice, resolveRegionChoice, resolveReturnExhaustTokenChoice, resolveReturnUnrestChoice, resolveSolsticeOrderChoice, resolveSwapChoice, resolveUnrestAllocationChoice, revoltTurn, skipReactiveExhaustChoice } from "../game/moves";
import type { GameState } from "../game/state";
import { currentStateMatches } from "../game/stateMatching";
import { continuePausedSolstice, onTurnBegin, onTurnEnd } from "../game/turn";
import { continuePendingUnrestTake } from "../game/unrest";

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
      "resolveReturnFameChoice",
      "resolveReturnExhaustTokenChoice",
      "resolvePlaceOnDeckChoice",
      "resolveGiveCardChoice",
      "resolveSwapChoice",
      "resolveTradeChoice",
      "skipExileChoice",
      "resolveReactiveExhaustChoice",
      "skipReactiveExhaustChoice",
      "resolveCleanupDiscard"
    ]));
  });

  it("does not expose direct Market Acquire as a public boardgame.io move", () => {
    expect(Object.keys(PrototypeGame.moves ?? {})).not.toContain("acquireCard");
  });

  it("clears Treat As suit icon effects before round-end Solstice", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.hand = [];
    p.deck = [];
    p.discard = [];
    p.handSize = 0;
    G.market = [];
    G.treatedSuitIconsThisTurn = {
      "0": [{ from: "uncivilized", to: ["civilized"] }]
    };

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0"] } as any);

    expect(G.treatedSuitIconsThisTurn["0"]).toEqual([]);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(true);
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

  it("keeps a resolved in-play card in play after its play text resolves", () => {
    const G = createInitialState();
    const card = "persistent_play_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.knowledge = 0;
    G.cardDb[card] = {
      id: card,
      displayName: "Persistent Play Card",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].playArea).toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
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

  it("pauses after a triggering effect sentence for a reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_trigger_card";
    const exhaustCardId = "reactive_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Exhaust",
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

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard
    });
    expect(G.players["0"].playArea).toContain(playedCard);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.[exhaustCardId]?.exhaustTokens).toBe(1);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("matches resource reactive Exhausts by the suited in-play card that produced the resource", () => {
    const G = createInitialState();
    const sourceCardId = "reactive_suited_resource_source";
    const exhaustCardId = "reactive_suited_resource_exhaust";
    G.players["0"].playArea = [sourceCardId, exhaustCardId];
    G.players["0"].exhaustTokensAvailable = 2;
    G.cardDb[sourceCardId] = {
      id: sourceCardId,
      displayName: "Suited Resource Source",
      type: "in_play",
      cardType: "in_play",
      suit: "region",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Suited Resource Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "region" }
      } as any]
    };

    exhaustCard({ G, ctx }, sourceCardId);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.[sourceCardId]?.exhaustTokens).toBe(1);
    expect(G.cardStates?.[exhaustCardId]?.exhaustTokens).toBe(1);
  });

  it("does not match source-suited reactive Exhausts for resources from a different in-play suit", () => {
    const G = createInitialState();
    const sourceCardId = "reactive_wrong_suit_resource_source";
    const exhaustCardId = "reactive_wrong_suit_resource_exhaust";
    G.players["0"].playArea = [sourceCardId, exhaustCardId];
    G.players["0"].exhaustTokensAvailable = 2;
    G.cardDb[sourceCardId] = {
      id: sourceCardId,
      displayName: "Wrong Suit Resource Source",
      type: "in_play",
      cardType: "in_play",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Wrong Suit Resource Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "region" }
      } as any]
    };

    exhaustCard({ G, ctx }, sourceCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
  });

  it("can decline a reactive Exhaust and continue the triggering card", () => {
    const G = createInitialState();
    const playedCard = "reactive_skip_trigger_card";
    const exhaustCardId = "reactive_skip_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Skip Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Skip Exhaust",
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

    playCard({ G, ctx }, playedCard);
    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.cardStates?.[exhaustCardId]?.exhaustTokens ?? 0).toBe(0);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("resolves only the matching reactive Exhaust text on a mixed Exhaust card", () => {
    const G = createInitialState();
    const playedCard = "mixed_reactive_trigger_card";
    const exhaustCardId = "mixed_reactive_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Mixed Reactive Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Mixed Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1 } as any,
        {
          trigger: "on_exhaust",
          op: "gain_resource",
          resource: "influence",
          amount: 1,
          reactive: { trigger: "after_gain_resource", resource: "knowledge" }
        } as any
      ]
    };

    playCard({ G, ctx }, playedCard);
    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.cardStates?.[exhaustCardId]?.exhaustTokens).toBe(1);
  });

  it("offers a reactive Exhaust resource return even when no token can be returned", () => {
    const G = createInitialState();
    const playedCard = "reactive_return_empty_trigger_card";
    const exhaustCardId = "reactive_return_empty_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.materials = 0;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Return Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Empty Return",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "return_resource",
        resource: "materials",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
  });

  it("pauses after playing a card for a reactive Exhaust before discarding the played card", () => {
    const G = createInitialState();
    const playedCard = "reactive_play_trigger_card";
    const exhaustCardId = "reactive_after_play_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Play Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive After Play Exhaust",
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
        reactive: { trigger: "after_play_card", target: "self" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_play_card",
      targetPlayerId: "0"
    });
    expect(G.players["0"].playArea).toContain(playedCard);
    expect(G.players["0"].discard).not.toContain(playedCard);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.[exhaustCardId]?.exhaustTokens).toBe(1);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("can decline an after-play reactive Exhaust and still finish discarding the played card", () => {
    const G = createInitialState();
    const playedCard = "reactive_play_skip_trigger_card";
    const exhaustCardId = "reactive_after_play_skip_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Play Skip Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive After Play Skip Exhaust",
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
        reactive: { trigger: "after_play_card", target: "self" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);
    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.cardStates?.[exhaustCardId]?.exhaustTokens ?? 0).toBe(0);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("pauses after breaking through for a card for a reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_break_through_trigger_card";
    const exhaustCardId = "reactive_after_break_through_exhaust_card";
    const marketCardId = "reactive_break_through_market_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.market = [marketCardId];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Break Through Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "break_through", suit: "uncivilized", source: "market", count: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[marketCardId] = {
      ...G.cardDb.test_action_foundry_shift,
      id: marketCardId,
      displayName: "Reactive Break Through Market Card",
      suit: "uncivilized"
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive After Break Through Exhaust",
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
        reactive: { trigger: "after_break_through_card", target: "self" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(marketCardId);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_break_through_card",
      targetPlayerId: "0"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("runs after-Break-through hooks after the reactive Exhaust window before later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_break_through_hook_trigger_card";
    const exhaustCardId = "reactive_after_break_through_hook_exhaust_card";
    const marketCardId = "reactive_break_through_hook_market_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].resources.materials = 0;
    G.market = [marketCardId];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Break Through Hook Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "break_through", suit: "uncivilized", source: "market", count: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[marketCardId] = {
      ...G.cardDb.test_action_foundry_shift,
      id: marketCardId,
      displayName: "Reactive Break Through Hook Market Card",
      suit: "uncivilized"
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive After Break Through Hook Exhaust",
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
        reactive: { trigger: "after_break_through_card", target: "self" }
      } as any]
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_break_through",
          condition: { op: "payload_card_is", payloadKey: "cardId", cardId: marketCardId },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]
        }]
      }
    } as any;

    playCard({ G, ctx }, playedCard);

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_break_through_card",
      targetPlayerId: "0"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_break_through #0 resolved.")).toBe(true);
  });

  it("continues after-Break-through hooks for later gained cards after a hook choice resolves", () => {
    const G = createInitialState();
    const playedCard = "multi_break_through_hook_choice_trigger";
    const firstGainedCardId = "multi_break_through_hook_choice_first";
    const secondGainedCardId = "multi_break_through_hook_choice_second";
    G.players["0"].hand = [playedCard, "discard_hook_card_a", "discard_hook_card_b"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.marketDecks = {
      mainDeck: [],
      regionDeck: [],
      uncivilizedDeck: [firstGainedCardId, secondGainedCardId],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Multi Break Through Hook Choice Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "break_through", suit: "uncivilized", source: "deck", count: 2 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    for (const id of [firstGainedCardId, secondGainedCardId]) {
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
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_break_through",
            condition: { op: "payload_card_is", payloadKey: "cardId", cardId: firstGainedCardId },
            effects: [
              { trigger: "on_play", op: "discard_cards", count: 1 } as any,
              { trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 } as any
            ]
          },
          {
            trigger: "after_break_through",
            condition: { op: "payload_card_is", payloadKey: "cardId", cardId: secondGainedCardId },
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
          }
        ]
      }
    } as any;

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toEqual(expect.arrayContaining([firstGainedCardId, secondGainedCardId]));
    expect(G.pendingDiscardChoice).toMatchObject({
      playerId: "0",
      sourceCardId: playedCard,
      cardIds: expect.arrayContaining(["discard_hook_card_a", "discard_hook_card_b"]),
      count: 1
    });
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.materials).toBe(0);

    resolveDiscardChoice({ G, ctx }, ["discard_hook_card_a"]);

    expect(G.pendingDiscardChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.filter((entry) => entry.message === "Nation hook after_break_through #0 resolved.")).toHaveLength(1);
    expect(G.log.filter((entry) => entry.message === "Nation hook after_break_through #1 resolved.")).toHaveLength(1);
  });

  it("keeps later resource costs behind a pending discard-card choice", () => {
    const G = createInitialState();
    const playedCard = "discard_then_spend_action";
    G.players["0"].hand = [playedCard, "discard_a", "discard_b", "keep_card"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.materials = 0;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Discard Then Spend Action",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "discard_cards", count: 2 } as any,
        { trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.pendingDiscardChoice).toMatchObject({
      playerId: "0",
      sourceCardId: playedCard,
      cardIds: ["discard_a", "discard_b", "keep_card"],
      count: 2,
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
      ]
    });
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);

    resolveDiscardChoice({ G, ctx }, ["discard_a", "discard_b"]);

    expect(G.pendingDiscardChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["keep_card"]);
    expect(G.players["0"].discard).toEqual(["discard_a", "discard_b", playedCard]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("keeps later resource costs behind resource-gain reactive Exhaust windows", () => {
    const G = createInitialState();
    const playedCard = "resource_gain_then_later_cost_action";
    const exhaustCardId = "resource_gain_later_cost_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.influence = 0;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Resource Gain Then Later Cost Action",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any,
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Resource Gain Later Cost Exhaust",
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

    playCard({ G, ctx }, playedCard);

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge",
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    });
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("keeps later resource costs behind steal-resource reactive Exhaust windows", () => {
    const G = createInitialState();
    const playedCard = "steal_resource_then_later_cost_action";
    const exhaustCardId = "steal_resource_later_cost_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.influence = 0;
    G.players["1"].resources.knowledge = 1;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Steal Resource Then Later Cost Action",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "knowledge", amount: 1 } as any,
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Steal Resource Later Cost Exhaust",
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

    playCard({ G, ctx }, playedCard);

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge",
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    });
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["1"].resources.knowledge).toBe(0);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("opens after-Break-through reactive windows once per gained card before later effects", () => {
    const G = createInitialState();
    const playedCard = "multi_break_through_reactive_trigger";
    const exhaustCardId = "multi_break_through_reactive_exhaust";
    const firstGainedCardId = "multi_break_through_reactive_first";
    const secondGainedCardId = "multi_break_through_reactive_second";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    G.marketDecks = {
      mainDeck: [],
      regionDeck: [],
      uncivilizedDeck: [firstGainedCardId, secondGainedCardId],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Multi Break Through Reactive Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "break_through", suit: "uncivilized", source: "deck", count: 2 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    for (const id of [firstGainedCardId, secondGainedCardId]) {
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
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Multi Break Through Reactive Exhaust",
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
        reactive: { trigger: "after_break_through_card", target: "self" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toEqual(expect.arrayContaining([firstGainedCardId, secondGainedCardId]));
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_break_through_card",
      targetPlayerId: "0"
    });
    expect(G.players["0"].resources.materials).toBe(0);

    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_break_through_card",
      targetPlayerId: "0"
    });
    expect(G.players["0"].resources.materials).toBe(0);
  });

  it("resumes direct market Break through after market resource windows before later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_break_through_resource_trigger_card";
    const resourceExhaustCardId = "reactive_break_through_resource_exhaust_card";
    const breakThroughExhaustCardId = "reactive_break_through_after_exhaust_card";
    const marketCardId = "reactive_break_through_resource_market_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [resourceExhaustCardId, breakThroughExhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    G.market = [marketCardId];
    G.marketResources = { [marketCardId]: { knowledge: 1 } };
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Break Through Resource Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "break_through", suit: "uncivilized", source: "market", count: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[marketCardId] = {
      ...G.cardDb.test_action_foundry_shift,
      id: marketCardId,
      displayName: "Reactive Break Through Resource Market Card",
      suit: "uncivilized"
    };
    G.cardDb[resourceExhaustCardId] = {
      id: resourceExhaustCardId,
      displayName: "Reactive Break Through Resource Exhaust",
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
    G.cardDb[breakThroughExhaustCardId] = {
      id: breakThroughExhaustCardId,
      displayName: "Reactive After Break Through Exhaust",
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
        reactive: { trigger: "after_break_through_card", target: "self" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(marketCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [resourceExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: marketCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [breakThroughExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_break_through_card",
      targetPlayerId: "0"
    });
    expect(G.players["0"].resources.materials).toBe(0);
  });

  it("pauses after failed Break through fallback Materials for a resource reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_break_through_fallback_trigger_card";
    const exhaustCardId = "reactive_after_break_through_fallback_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.marketDecks = undefined;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Break Through Fallback Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "break_through", suit: "civilized", source: "deck", count: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive After Break Through Fallback Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "materials" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "materials"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("pauses after an opponent takes Unrest for a reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_unrest_trigger_card";
    const exhaustCardId = "reactive_unrest_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.unrestPile = ["reactive_unrest_card"];
    G.cardDb.reactive_unrest_card = {
      id: "reactive_unrest_card",
      displayName: "Reactive Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Unrest Trigger",
      type: "attack",
      cardType: "attack",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "take_unrest", targetPlayerIds: ["1"], count: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Unrest Exhaust",
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
        reactive: { trigger: "after_take_unrest", target: "opponent" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["1"].hand).toContain("reactive_unrest_card");
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_take_unrest",
      targetPlayerId: "1"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.[exhaustCardId]?.exhaustTokens).toBe(1);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("opens an Unrest reactive window after a paused first take before taking the next Unrest", () => {
    const G = createInitialState();
    const playedCard = "paused_multi_unrest_trigger_card";
    const exhaustCardId = "paused_multi_unrest_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.unrestPile = ["paused_multi_unrest_a", "paused_multi_unrest_b"];
    for (const id of G.unrestPile) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "unrest",
        cardType: "unrest",
        suit: "unrest",
        cost: 0,
        tags: ["unrest"],
        effects: []
      };
    }
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Paused Multi Unrest Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "take_unrest", count: 2 } as any]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Paused Multi Unrest Exhaust",
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
        reactive: { trigger: "after_take_unrest", target: "self" }
      } as any]
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_gain_unrest",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
          } as any]
        }]
      }
    } as any;

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain("paused_multi_unrest_a");
    expect(G.players["0"].hand).not.toContain("paused_multi_unrest_b");
    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingUnrestTakeContinuation).toMatchObject({
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 2,
      recipientIndex: 0,
      cardIndex: 1,
      reactiveTargetPlayerIds: ["0"]
    });

    resolveChoice({ G, ctx }, 0);

    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].hand).not.toContain("paused_multi_unrest_b");
    expect(G.pendingUnrestTakeContinuation).toMatchObject({
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 2,
      recipientIndex: 0,
      cardIndex: 1,
      reactiveTargetPlayerIds: []
    });
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });
  });

  it("keeps a pending Unrest-take continuation parked behind cleanup discard choices", () => {
    const G = createInitialState();
    G.unrestPile = ["parked_unrest"];
    G.pendingUnrestTakeContinuation = {
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 1,
      recipientIndex: 0,
      cardIndex: 0,
      taken: 0
    };
    G.pendingCleanupDiscardChoice = { playerId: "0", cardIds: ["discard_option"] };

    const result = continuePendingUnrestTake(G, "0");

    expect(result).toBeUndefined();
    expect(G.pendingUnrestTakeContinuation).toEqual({
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 1,
      recipientIndex: 0,
      cardIndex: 0,
      taken: 0
    });
    expect(G.players["0"].hand).not.toContain("parked_unrest");
    expect(G.unrestPile).toEqual(["parked_unrest"]);
  });

  it("keeps a pending Unrest-take continuation parked behind Solstice order choices", () => {
    const G = createInitialState();
    G.unrestPile = ["solstice_order_unrest"];
    G.pendingUnrestTakeContinuation = {
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 1,
      recipientIndex: 0,
      cardIndex: 0,
      taken: 0
    };
    G.pendingSolsticeOrderChoice = { playerId: "0", phase: "on_solstice", cardIds: ["first_solstice_card", "second_solstice_card"] };

    const result = continuePendingUnrestTake(G, "0");

    expect(result).toBeUndefined();
    expect(G.pendingUnrestTakeContinuation).toEqual({
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 1,
      recipientIndex: 0,
      cardIndex: 0,
      taken: 0
    });
    expect(G.players["0"].hand).not.toContain("solstice_order_unrest");
    expect(G.unrestPile).toEqual(["solstice_order_unrest"]);
  });

  it("keeps a pending Unrest-take continuation parked behind paused Solstice continuations", () => {
    const G = createInitialState();
    G.unrestPile = ["paused_solstice_unrest"];
    G.pendingUnrestTakeContinuation = {
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 1,
      recipientIndex: 0,
      cardIndex: 0,
      taken: 0
    };
    G.pendingSolsticeContinuation = {
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["remaining_solstice_card"],
      cursor: {
        playOrder: ["0", "1"],
        playerIndex: 0,
        phase: "on_solstice",
        cardIndex: 1,
        overrideIndex: 0
      }
    };
    G.pausedSolstice = {
      playOrder: ["0", "1"],
      playerIndex: 0,
      phase: "on_solstice",
      cardIndex: 1,
      overrideIndex: 0
    };

    const result = continuePendingUnrestTake(G, "0");

    expect(result).toBeUndefined();
    expect(G.pendingUnrestTakeContinuation).toEqual({
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 1,
      recipientIndex: 0,
      cardIndex: 0,
      taken: 0
    });
    expect(G.players["0"].hand).not.toContain("paused_solstice_unrest");
    expect(G.unrestPile).toEqual(["paused_solstice_unrest"]);
  });

  it("pauses after acquiring a card for a reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_acquire_trigger_card";
    const exhaustCardId = "reactive_acquire_exhaust_card";
    const acquiredCardId = "reactive_market_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.market = [acquiredCardId];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb[acquiredCardId] = {
      id: acquiredCardId,
      displayName: "Reactive Market Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Acquire Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "acquire_card", cardId: acquiredCardId, count: 1, destination: "hand" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Acquire Exhaust",
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
        reactive: { trigger: "after_acquire_card", target: "self" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(acquiredCardId);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_acquire_card",
      targetPlayerId: "0"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.[exhaustCardId]?.exhaustTokens).toBe(1);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("pauses after collecting a market resource during Acquire for a resource reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_market_resource_acquire_trigger_card";
    const exhaustCardId = "reactive_market_resource_acquire_exhaust_card";
    const acquiredCardId = "reactive_market_resource_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.market = [acquiredCardId];
    G.marketResources = { [acquiredCardId]: { knowledge: 1 } };
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb[acquiredCardId] = {
      id: acquiredCardId,
      displayName: "Reactive Market Resource Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Market Resource Acquire Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "acquire_card", cardId: acquiredCardId, count: 1, destination: "hand" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Market Resource Acquire Exhaust",
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

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(acquiredCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("opens direct Market Acquire tucked Unrest reactive windows before market resource windows", () => {
    const G = createInitialState();
    const playedCard = "direct_acquire_unrest_before_resource_trigger";
    const acquiredCardId = "direct_acquire_unrest_before_resource_market";
    const unrestCardId = "direct_acquire_unrest_before_resource_unrest";
    const unrestExhaustCardId = "direct_acquire_unrest_before_resource_unrest_exhaust";
    const resourceExhaustCardId = "direct_acquire_unrest_before_resource_resource_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [unrestExhaustCardId, resourceExhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.market = [acquiredCardId];
    G.marketResources = { [acquiredCardId]: { knowledge: 1 } };
    G.marketUnrest = { [acquiredCardId]: [unrestCardId] };
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb[acquiredCardId] = {
      id: acquiredCardId,
      displayName: "Direct Acquire Market Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[unrestCardId] = {
      id: unrestCardId,
      displayName: "Direct Acquire Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Direct Acquire Unrest Before Resource Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "acquire_card", cardId: acquiredCardId, count: 1, destination: "hand" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[unrestExhaustCardId] = {
      id: unrestExhaustCardId,
      displayName: "Direct Acquire Unrest Exhaust",
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
        reactive: { trigger: "after_take_unrest", target: "self" }
      } as any]
    };
    G.cardDb[resourceExhaustCardId] = {
      id: resourceExhaustCardId,
      displayName: "Direct Acquire Resource Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "goods",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(acquiredCardId);
    expect(G.players["0"].hand).toContain(unrestCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [unrestExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });
    expect(G.players["0"].resources.materials).toBe(0);

    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [resourceExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: acquiredCardId,
      eventSourceWasInPlay: true
    });
  });

  it("matches source-suited reactive Exhausts against the acquired market card that released resources", () => {
    const G = createInitialState();
    const playedCard = "reactive_market_source_suit_trigger_card";
    const exhaustCardId = "reactive_market_source_suit_exhaust_card";
    const acquiredCardId = "reactive_market_source_suit_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.market = [acquiredCardId];
    G.marketResources = { [acquiredCardId]: { knowledge: 1 } };
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb[acquiredCardId] = {
      id: acquiredCardId,
      displayName: "Reactive Market Source Suit Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Market Source Suit Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "acquire_card", cardId: acquiredCardId, count: 1, destination: "hand" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Market Source Suit Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(acquiredCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("resumes paused acquisition continuations with Unrest reactive windows before resource windows", () => {
    const G = createInitialState();
    const sourceCardId = "paused_acquire_source";
    const acquiredCardId = "paused_acquired_market_card";
    const unrestExhaustCardId = "paused_acquire_unrest_exhaust";
    const resourceExhaustCardId = "paused_acquire_resource_exhaust";
    G.players["0"].playArea = [unrestExhaustCardId, resourceExhaustCardId];
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 1;
    G.pendingAcquireEffectResolution = {
      playerId: "0",
      cardId: acquiredCardId,
      sourceCardId,
      takenUnrestPlayerIds: ["0"],
      collectedResources: { knowledge: 1 },
      collectedResourceSources: [{ sourceCardId: acquiredCardId, sourceWasInPlay: true, gains: { knowledge: 1 } }]
    };
    G.pendingReactiveExhaustChoice = {
      playerId: "0",
      cardIds: ["earlier_window"],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_acquire_card",
      targetPlayerId: "0"
    };
    G.cardDb[acquiredCardId] = {
      id: acquiredCardId,
      displayName: "Paused Acquired Market Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[unrestExhaustCardId] = {
      id: unrestExhaustCardId,
      displayName: "Paused Acquire Unrest Exhaust",
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
        reactive: { trigger: "after_take_unrest", target: "self" }
      } as any]
    };
    G.cardDb[resourceExhaustCardId] = {
      id: resourceExhaustCardId,
      displayName: "Paused Acquire Resource Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "materials",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };

    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [unrestExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });

    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [resourceExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: acquiredCardId,
      eventSourceWasInPlay: true
    });
  });

  it("resumes paused market move continuations with resource reactive windows before Unrest windows", () => {
    const G = createInitialState();
    const sourceCardId = "paused_market_move_source";
    const movedCardId = "paused_moved_market_card";
    const resourceExhaustCardId = "paused_market_move_resource_exhaust";
    const unrestExhaustCardId = "paused_market_move_unrest_exhaust";
    G.players["0"].playArea = [resourceExhaustCardId, unrestExhaustCardId];
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 1;
    G.pendingMarketMoveEffectResolution = {
      playerId: "0",
      sourceCardId,
      takenUnrestPlayerIds: ["0"],
      collectedResources: { knowledge: 1 },
      collectedResourceSources: [{ sourceCardId: movedCardId, sourceWasInPlay: true, gains: { knowledge: 1 } }]
    };
    G.pendingReactiveExhaustChoice = {
      playerId: "0",
      cardIds: ["earlier_window"],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_play_card",
      targetPlayerId: "0"
    };
    G.cardDb[movedCardId] = {
      id: movedCardId,
      displayName: "Paused Moved Market Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[resourceExhaustCardId] = {
      id: resourceExhaustCardId,
      displayName: "Paused Market Move Resource Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "materials",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.cardDb[unrestExhaustCardId] = {
      id: unrestExhaustCardId,
      displayName: "Paused Market Move Unrest Exhaust",
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
        reactive: { trigger: "after_take_unrest", target: "self" }
      } as any]
    };

    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [resourceExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: movedCardId,
      eventSourceWasInPlay: true
    });

    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [unrestExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });
  });

  it("resumes direct market gain_card with tucked Unrest windows after market resource windows", () => {
    const G = createInitialState();
    const playedCard = "direct_gain_card_resource_then_unrest_trigger";
    const gainedCardId = "direct_gain_card_resource_then_unrest_market";
    const unrestCardId = "direct_gain_card_resource_then_unrest_unrest";
    const resourceExhaustCardId = "direct_gain_card_resource_then_unrest_resource_exhaust";
    const unrestExhaustCardId = "direct_gain_card_resource_then_unrest_unrest_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [resourceExhaustCardId, unrestExhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    G.market = [gainedCardId];
    G.marketResources = { [gainedCardId]: { knowledge: 1 } };
    G.marketUnrest = { [gainedCardId]: [unrestCardId] };
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Direct Gain Card Resource Then Unrest Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "gain_card", source: "market", cardId: gainedCardId, count: 1, destination: "hand" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[gainedCardId] = {
      id: gainedCardId,
      displayName: "Direct Gain Card Resource Then Unrest Market",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[unrestCardId] = {
      id: unrestCardId,
      displayName: "Direct Gain Card Resource Then Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[resourceExhaustCardId] = {
      id: resourceExhaustCardId,
      displayName: "Direct Gain Card Resource Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "materials",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.cardDb[unrestExhaustCardId] = {
      id: unrestExhaustCardId,
      displayName: "Direct Gain Card Unrest Exhaust",
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
        reactive: { trigger: "after_take_unrest", target: "self" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(gainedCardId);
    expect(G.players["0"].hand).toContain(unrestCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [resourceExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: gainedCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    skipReactiveExhaustChoice({ G, ctx });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [unrestExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });
    expect(G.players["0"].resources.materials).toBe(0);
  });

  it("pauses after collecting resources from a recalled Region for a reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_recall_region_trigger_card";
    const regionCardId = "reactive_recalled_region";
    const exhaustCardId = "reactive_recall_resource_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [regionCardId, exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = { [regionCardId]: { resources: { materials: 2 } } };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Recall Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "recall_region", cardId: regionCardId } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.cardDb[regionCardId] = {
      id: regionCardId,
      displayName: "Reactive Recalled Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Recall Resource Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "materials" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(regionCardId);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "materials"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("matches source-suited reactive Exhausts against garrisoned resources recalled with a Region", () => {
    const G = createInitialState();
    const playedCard = "reactive_recall_child_source_suit_trigger";
    const regionCardId = "reactive_recall_child_source_suit_region";
    const childCardId = "reactive_recall_child_source_suit_child";
    const exhaustCardId = "reactive_recall_child_source_suit_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [regionCardId, exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.cardStates = {
      [regionCardId]: { garrisonedCardIds: [childCardId] },
      [childCardId]: { resources: { knowledge: 1 } }
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Recall Child Source Suit Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "recall_region", cardId: regionCardId } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[regionCardId] = {
      id: regionCardId,
      displayName: "Reactive Recall Child Source Suit Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[childCardId] = {
      id: childCardId,
      displayName: "Reactive Recall Child Source Suit Child",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Recall Child Source Suit Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].hand).toContain(regionCardId);
    expect(G.players["0"].hand).toContain(childCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: childCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("matches source-suited reactive Exhausts against pending Region choices with garrisoned resources", () => {
    const G = createInitialState();
    const playedCard = "reactive_pending_recall_child_source_suit_trigger";
    const targetRegionCardId = "reactive_pending_recall_child_source_suit_region";
    const otherRegionCardId = "reactive_pending_recall_child_source_suit_other_region";
    const childCardId = "reactive_pending_recall_child_source_suit_child";
    const exhaustCardId = "reactive_pending_recall_child_source_suit_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [targetRegionCardId, otherRegionCardId, exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.cardStates = {
      [targetRegionCardId]: { garrisonedCardIds: [childCardId] },
      [childCardId]: { resources: { knowledge: 1 } }
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Pending Recall Child Source Suit Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "recall_region" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[targetRegionCardId] = {
      id: targetRegionCardId,
      displayName: "Reactive Pending Recall Child Source Suit Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[otherRegionCardId] = {
      id: otherRegionCardId,
      displayName: "Reactive Pending Recall Child Source Suit Other Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[childCardId] = {
      id: childCardId,
      displayName: "Reactive Pending Recall Child Source Suit Child",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Pending Recall Child Source Suit Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.pendingRegionChoice).toMatchObject({
      playerId: "0",
      sourceCardId: playedCard,
      op: "recall_region",
      cardIds: [targetRegionCardId, otherRegionCardId]
    });

    resolveRegionChoice({ G, ctx }, targetRegionCardId);

    expect(G.players["0"].hand).toContain(targetRegionCardId);
    expect(G.players["0"].hand).toContain(childCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: childCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("pauses after collecting resources from a History-bound card for a reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_history_resource_trigger_card";
    const exhaustCardId = "reactive_history_resource_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = { [playedCard]: { resources: { materials: 2 } } };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive History Resource Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "move_self_to_history" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive History Resource Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "materials" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].history).toContain(playedCard);
    expect(G.players["0"].discard).not.toContain(playedCard);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "materials"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].history).toContain(playedCard);
    expect(G.players["0"].discard).not.toContain(playedCard);
  });

  it("keeps disabled-History resource collection reactive before later self-History text resumes", () => {
    const G = createInitialState();
    const playedCard = "reactive_disabled_history_resource_trigger_card";
    const exhaustCardId = "reactive_disabled_history_resource_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.activeNationRulesets = {
      "0": {
        nationId: "no_history_resource_nation",
        displayName: "No History Resource Nation",
        rulesetTags: ["no_history", "discard_instead_of_history"],
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
        hookRules: [],
        implemented: true,
        tested: true
      }
    };
    G.cardStates = { [playedCard]: { resources: { materials: 2 } } };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Disabled History Resource Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "move_self_to_history" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Disabled History Resource Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "materials" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].history).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "materials"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("matches source-suited reactive Exhausts against garrisoned resources moved by History text", () => {
    const G = createInitialState();
    const hostCardId = "history_child_source_suit_host";
    const childCardId = "history_child_source_suit_child";
    const exhaustCardId = "history_child_source_suit_exhaust";
    G.players["0"].playArea = [hostCardId, exhaustCardId];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = {
      [hostCardId]: { garrisonedCardIds: [childCardId] },
      [childCardId]: { resources: { knowledge: 1 } }
    };
    G.cardDb[hostCardId] = {
      id: hostCardId,
      displayName: "History Child Source Suit Host",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[childCardId] = {
      id: childCardId,
      displayName: "History Child Source Suit Child",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "History Child Source Suit Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };

    const resolved = runEffects({ G, playerId: "0", selfCardId: hostCardId }, [
      { trigger: "on_play", op: "move_self_to_history" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);

    expect(resolved).toBe(true);
    expect(G.players["0"].history).toEqual([hostCardId, childCardId]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: hostCardId,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: childCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("pauses after exact Find moves a play-area host to History and collects resources", () => {
    const G = createInitialState();
    const playedCard = "reactive_find_history_trigger_card";
    const hostCardId = "reactive_find_history_host";
    const childCardId = "reactive_find_history_child";
    const exhaustCardId = "reactive_find_history_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [hostCardId, exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = {
      [hostCardId]: { resources: { materials: 2 }, garrisonedCardIds: [childCardId] },
      [childCardId]: { resources: { goods: 1 } }
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Find History Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "find_card", sourceZones: ["playArea"], cardId: hostCardId, destination: "history" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.cardDb[hostCardId] = {
      id: hostCardId,
      displayName: "Reactive Find History Host",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[childCardId] = {
      id: childCardId,
      displayName: "Reactive Find History Child",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Find History Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "materials" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].playArea).not.toContain(hostCardId);
    expect(G.players["0"].history).toEqual([hostCardId, childCardId]);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "materials"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].history).toEqual([hostCardId, childCardId]);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("matches source-suited reactive Exhausts against garrisoned resources moved with a host", () => {
    const G = createInitialState();
    const playedCard = "reactive_find_host_child_source_suit_trigger";
    const hostCardId = "reactive_find_host_child_source_suit_host";
    const childCardId = "reactive_find_host_child_source_suit_child";
    const exhaustCardId = "reactive_find_host_child_source_suit_exhaust";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [hostCardId, exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = {
      [hostCardId]: { garrisonedCardIds: [childCardId] },
      [childCardId]: { resources: { knowledge: 1 } }
    };
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Find Host Child Source Suit Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "find_card", sourceZones: ["playArea"], cardId: hostCardId, destination: "history" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[hostCardId] = {
      id: hostCardId,
      displayName: "Reactive Find Host Child Source Suit Host",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[childCardId] = {
      id: childCardId,
      displayName: "Reactive Find Host Child Source Suit Child",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Find Host Child Source Suit Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.players["0"].history).toEqual([hostCardId, childCardId]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: childCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].discard).toContain(playedCard);
  });

  it("pauses after resolving a pending Acquire choice for a reactive Exhaust before resuming later effects", () => {
    const G = createInitialState();
    const playedCard = "reactive_acquire_choice_trigger_card";
    const exhaustCardId = "reactive_acquire_choice_exhaust_card";
    G.players["0"].hand = [playedCard];
    G.players["0"].playArea = [exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.market = ["reactive_market_a", "reactive_market_b"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    for (const cardId of G.market) {
      G.cardDb[cardId] = {
        id: cardId,
        displayName: cardId,
        type: "action",
        cardType: "action",
        suit: "civilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.cardDb[playedCard] = {
      id: playedCard,
      displayName: "Reactive Acquire Choice Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "acquire_card", source: "market", count: 1, destination: "hand" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Reactive Acquire Choice Exhaust",
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
        reactive: { trigger: "after_acquire_card", target: "self" }
      } as any]
    };

    playCard({ G, ctx }, playedCard);

    expect(G.pendingAcquireChoice?.cardIds).toEqual(["reactive_market_a", "reactive_market_b"]);
    expect(G.players["0"].resources.materials).toBe(0);

    resolveAcquireChoice({ G, ctx }, "reactive_market_b");

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("reactive_market_b");
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: playedCard,
      trigger: "after_acquire_card",
      targetPlayerId: "0"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].playArea).not.toContain(playedCard);
    expect(G.players["0"].discard).toContain(playedCard);
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

  it("failed before-play hooks stop the card from being played", () => {
    const G = createInitialState();
    const card = "before_play_failed_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb[card] = {
      id: card,
      displayName: "Before Play Failed Card",
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
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.log.some((entry) => entry.message === "Nation hook before_play_card #0 failed.")).toBe(true);
  });

  it("failed after-play hooks restore the card play state", () => {
    const G = createInitialState();
    const card = "after_play_failed_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb[card] = {
      id: card,
      displayName: "After Play Failed Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_play_card",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingPlayedCardResolution).toBeUndefined();
    expect(G.log.some((entry) => entry.message === "Nation hook after_play_card #0 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): after_play_hook_failed(${card})`);
  });

  it("failed continued after-play hooks restore the card play state", () => {
    const G = createInitialState();
    const card = "continued_after_play_failed_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb[card] = {
      id: card,
      displayName: "Continued After Play Failed Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2 } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [
        {
          trigger: "after_play_card",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
          } as any]
        } as any,
        {
          trigger: "after_play_card",
          effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
        } as any
      ]
    };

    playCard({ G, ctx }, card);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingNationHookContinuation).toBeDefined();
    expect(G.players["0"].resources.materials).toBe(2);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingNationHookContinuation).toBeUndefined();
    expect(G.pendingPlayedCardResolution).toBeUndefined();
    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message === "Nation hook after_play_card #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): after_play_hook_failed(${card})`);
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
    expect(G.cardStates?.[card]).toEqual({ actionTokens: 1 });
  });

  it("opens a source-suited reactive Exhaust window after collecting resources from a resolved action card", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    const reactiveCard = "resolved_card_resource_reactive";
    G.cardDb[card] = { ...G.cardDb[card], suit: "civilized", effects: [] };
    G.cardDb[reactiveCard] = {
      id: reactiveCard,
      displayName: "Resolved Card Resource Reactive",
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
        reactive: { trigger: "after_gain_resource", resource: "materials", sourceSuit: "civilized" }
      } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].playArea = [reactiveCard];
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardStates = { [card]: { resources: { materials: 2 } } };

    playCard({ G, ctx }, card);

    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [reactiveCard],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "materials",
      eventSourceCardId: card,
      eventSourceWasInPlay: true
    });

    resolveReactiveExhaustChoice({ G, ctx }, reactiveCard);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
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
    expect(G.cardStates?.[card]).toEqual({ actionTokens: 1 });
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

  it("keeps the spent Action token marker on a resolved action that moved to discard", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.cardStates?.[card]?.actionTokens).toBe(1);
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

  it("resumes cleanup draw-up after an after-reshuffle reactive Exhaust window", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.hand = [];
    p.deck = [];
    p.discard = ["test_action_archive_survey"];
    p.nationDeck = [];
    p.developmentArea = [];
    p.playArea = ["cleanup_reshuffle_reactive"];
    p.handSize = 1;
    p.resources.knowledge = 0;
    p.resources.materials = 0;
    p.exhaustTokensAvailable = 1;
    G.cardDb.cleanup_reshuffle_reactive = {
      id: "cleanup_reshuffle_reactive",
      displayName: "Cleanup Reshuffle Reactive",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "materials",
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

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0", "1"] } as any, () => 0);

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      resolvingPlayerId: "0",
      cardIds: ["cleanup_reshuffle_reactive"],
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(G.pendingTurnEndCleanup).toMatchObject({
      playerId: "0",
      stage: "after_draw_up"
    });
    expect(p.hand).toEqual([]);

    skipReactiveExhaustChoice({ G, ctx: { currentPlayer: "0", playOrder: ["0", "1"] } as any, random: { Number: () => 0 } });

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.pendingTurnEndCleanup).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.materials).toBe(0);
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

  it("pauses cleanup when a cleanup override opens a reactive Exhaust window", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.hand = [];
    p.deck = ["test_action_archive_survey"];
    p.discard = [];
    p.playArea = ["cleanup_reactive_card"];
    p.handSize = 1;
    p.exhaustTokensAvailable = 1;
    p.resources.knowledge = 0;
    p.resources.materials = 0;
    G.cardDb.cleanup_reactive_card = {
      id: "cleanup_reactive_card",
      displayName: "Cleanup Reactive",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "materials",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.activeNationRulesets = {
      "0": {
        cleanupOverrides: [{
          op: "custom_cleanup_effect",
          effect: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0", "1"] } as any, () => 0);

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      resolvingPlayerId: "0",
      cardIds: ["cleanup_reactive_card"],
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(G.pendingTurnEndCleanup).toMatchObject({
      playerId: "0",
      stage: "before_optional_discard"
    });
    expect(p.hand).toEqual([]);
    expect(G.log.some((entry) => entry.message === "TurnPhase(cleanup): optional_discard_resolved")).toBe(false);

    skipReactiveExhaustChoice({ G, ctx: { currentPlayer: "0", playOrder: ["0", "1"] } as any, random: { Number: () => 0 } });

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.pendingTurnEndCleanup).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.materials).toBe(0);
    expect(p.hand).toEqual(["test_action_archive_survey"]);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(true);
  });

  it("resumes later cleanup overrides after a cleanup override choice resolves", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.hand = [];
    p.deck = ["test_action_archive_survey"];
    p.discard = [];
    p.handSize = 1;
    p.resources.materials = 0;
    p.resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        cleanupOverrides: [
          {
            op: "custom_cleanup_effect",
            effect: [{
              trigger: "on_play",
              op: "choose_one",
              choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
            }]
          },
          {
            op: "custom_cleanup_effect",
            effect: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
          }
        ]
      }
    } as any;

    onTurnEnd(G, { currentPlayer: "0", playOrder: ["0", "1"] } as any, () => 0);

    expect(G.pendingChoice).toBeDefined();
    expect(p.resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0", playOrder: ["0", "1"] } as any, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(p.resources.materials).toBe(1);
    expect(p.resources.knowledge).toBe(1);
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

  it("Free play cards still require printed resource costs", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      tags: ["free_play"],
      effects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 0;
    G.players["0"].actionTokensAvailable = 0;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.freePlayedThisTurn?.["0"]).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
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

  it("allows playing cards whose multi-state requirement includes the visible State card", () => {
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
    G.cardDb.multi_state_action = {
      id: "multi_state_action",
      displayName: "Multi State",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any],
      stateRequirement: "barbarian|empire"
    } as any;
    G.players["0"].hand = ["multi_state_action"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, "multi_state_action");

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain("multi_state_action");
    expect(G.players["0"].resources.knowledge).toBe(1);
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

  it("plays draw text when Action-token reshuffle progression can add a Nation card", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "draw", count: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = [];
    G.players["0"].discard = [];
    G.players["0"].nationDeck = ["test_action_lineage_record"];
    G.players["0"].developmentArea = [];
    G.players["0"].actionsRemaining = 2;
    G.players["0"].actionTokensAvailable = 2;
    G.players["0"].exhaustTokensAvailable = 0;
    G.players["0"].progressionTokens = { nationDeck: 0, developmentArea: 0 };

    playCard({ G, ctx, random: { Number: () => 0 } }, card);

    expect(G.players["0"].hand).toEqual(["test_action_lineage_record"]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].nationDeck).toEqual([]);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.log.some((entry) => entry.message === `InvalidMove(playCard): no_resolvable_on_play_effects(${card})`)).toBe(false);
  });

  it("does not treat no-Nation-deck cards as resolvable draw text", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "draw", count: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = [];
    G.players["0"].discard = [];
    G.players["0"].nationDeck = ["test_action_lineage_record"];
    G.players["0"].developmentArea = [];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].progressionTokens = { nationDeck: 0, developmentArea: 0 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_nation_deck"] as any
    };

    playCard({ G, ctx, random: { Number: () => 0 } }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].nationDeck).toEqual(["test_action_lineage_record"]);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not treat discard Unrest as a resolvable default Return Unrest source", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    const unrestCard = "discard_unrest";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "return_unrest" } as any]
    };
    G.cardDb[unrestCard] = {
      id: unrestCard,
      displayName: "Discard Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].discard = [unrestCard];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = [];

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).toEqual([unrestCard]);
    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.unrestPile).toEqual([]);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("plays default Return Unrest when the only returnable hand card has an imported Unrest suit icon", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    const unrestCard = "imported_suit_icon_card";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "return_unrest" } as any]
    };
    G.cardDb[unrestCard] = {
      id: unrestCard,
      displayName: "Imported Suit Icon",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: ["suit:unrest"],
      effects: []
    };
    G.players["0"].hand = [card, unrestCard];
    G.players["0"].discard = [];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = [];

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.unrestPile).toEqual([unrestCard]);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.log.some((entry) => entry.message === `InvalidMove(playCard): no_resolvable_on_play_effects(${card})`)).toBe(false);
  });

  it("plays Action-token text through the normal move legality path", () => {
    const G = createInitialState();
    const card = "action_token_text_card";
    G.cardDb[card] = {
      id: card,
      displayName: "Action Token Text",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_action", amount: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.some((entry) => entry.message === `InvalidMove(playCard): no_resolvable_on_play_effects(${card})`)).toBe(false);
  });

  it("does not play Give text with an invalid fixed recipient", () => {
    const G = createInitialState();
    const card = "give_invalid_target_card";
    const gift = "gift_card";
    G.cardDb[card] = {
      id: card,
      displayName: "Give Invalid Target",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "give_card", cardId: gift, targetPlayerId: "9" } as any]
    };
    G.cardDb[gift] = {
      id: gift,
      displayName: "Gift",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].hand = [card, gift];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card, gift]);
    expect(G.players["1"].hand).not.toContain(gift);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play Break through-only text when no card or finite fallback Materials are available", () => {
    const G = createInitialState();
    const card = "empty_break_through_card";
    G.cardDb[card] = {
      id: card,
      displayName: "Empty Break Through",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "break_through", suit: "civilized", source: "deck", count: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.materials = 0;
    G.resourceSupply = { materials: 0 };
    G.marketDecks = { mainDeck: [], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
    G.marketDeckBottomCards = {};

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play targeted Market Break-through text when the named card is absent", () => {
    const G = createInitialState();
    const card = "missing_target_break_through_card";
    G.cardDb[card] = {
      id: card,
      displayName: "Missing Target Break Through",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "break_through", suit: "civilized", source: "market", count: 1, cardId: "missing_market_card" } as any]
    };
    G.cardDb.visible_civilized = {
      id: "visible_civilized",
      displayName: "Visible Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.market = ["visible_civilized"];

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.market).toEqual(["visible_civilized"]);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play targeted Deck Break-through text when the named card is absent", () => {
    const G = createInitialState();
    const card = "missing_deck_break_through_card";
    G.cardDb[card] = {
      id: card,
      displayName: "Missing Deck Break Through",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "break_through", suit: "civilized", source: "deck", count: 1, cardId: "missing_deck_card" } as any]
    };
    G.cardDb.deck_civilized = {
      id: "deck_civilized",
      displayName: "Deck Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.marketDecks = { mainDeck: ["deck_civilized"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
    G.resourceSupply = { materials: 5 };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.marketDecks.mainDeck).toEqual(["deck_civilized"]);
    expect(G.players["0"].resources.materials ?? 0).toBe(0);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play Take Unrest text when all named recipients are invalid", () => {
    const G = createInitialState();
    const card = "invalid_take_unrest_target_card";
    const unrestCard = "targeted_unrest";
    G.cardDb[card] = {
      id: card,
      displayName: "Invalid Take Unrest Target",
      type: "attack",
      cardType: "attack",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "take_unrest", targetPlayerIds: ["9"], count: 1 } as any]
    };
    G.cardDb[unrestCard] = {
      id: unrestCard,
      displayName: "Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = [unrestCard];

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.unrestPile).toEqual([unrestCard]);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a Trade-only card when finite Progress supply prevents Goods fallback", () => {
    const G = createInitialState();
    const card = "trade_only_action";
    G.options = { playerCount: 2, mode: "multiplayer", enabledExpansions: ["trade_routes"], enabledVariants: [] };
    G.cardDb[card] = {
      id: card,
      displayName: "Trade Only",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "trade" } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.goods = 1;
    G.players["0"].resources.knowledge = 0;
    G.resourceSupply = { knowledge: 0 };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play a Trade-only card when only an opponent route is blocked by finite supply", () => {
    const G = createInitialState();
    const card = "trade_only_opponent_route_action";
    G.options = { playerCount: 2, mode: "multiplayer", enabledExpansions: ["trade_routes"], enabledVariants: [] };
    G.cardDb[card] = {
      id: card,
      displayName: "Trade Only Opponent Route",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "trade" } as any]
    };
    G.cardDb.opponent_route = {
      id: "opponent_route",
      displayName: "Opponent Route",
      type: "trade_route",
      cardType: "trade_route",
      suit: "trade_route",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].resources.goods = 0;
    G.players["1"].playArea = ["opponent_route"];
    G.resourceSupply = { goods: 0, knowledge: 1 };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.pendingTradeChoice).toBeUndefined();
    expect(G.cardStates?.opponent_route?.resources?.goods).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play Gain-card text with a non-market source", () => {
    const G = createInitialState();
    const card = "invalid_gain_source_card";
    G.cardDb[card] = {
      id: card,
      displayName: "Invalid Gain Source",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_card", source: "exile", suit: "civilized", count: 1 } as any]
    };
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
    G.players["0"].hand = [card];
    G.players["0"].exile = ["exiled_civilized"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.market = [];

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].exile).toEqual(["exiled_civilized"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play Exile-acquire text when required Unrest is unavailable", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "acquire_card", source: "exile", suit: "civilized", count: 1 } as any]
    };
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
    G.players["0"].hand = [card];
    G.players["0"].exile = ["exiled_civilized"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = [];

    playCard({ G, ctx }, card);

    expect(G.gameover).toBeUndefined();
    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].exile).toEqual(["exiled_civilized"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("plays Exile-acquire text when only public setup Exile has a matching card", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "acquire_card", source: "exile", suit: "civilized", count: 1 } as any]
    };
    G.cardDb.setup_civilized = {
      id: "setup_civilized",
      displayName: "Setup Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.required_unrest = {
      id: "required_unrest",
      displayName: "Required Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].exile = [];
    G.unrestPile = ["required_unrest"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        visibility: "public",
        scoresAsOwned: false,
        cardIds: ["setup_civilized"]
      }
    };

    playCard({ G, ctx }, card);

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.players["0"].hand).toContain("setup_civilized");
    expect(G.players["0"].hand).toContain("required_unrest");
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.some((entry) => entry.message === `InvalidMove(playCard): no_resolvable_on_play_effects(${card})`)).toBe(false);
  });

  it("plays return-Unrest text that targets a nation History replacement zone", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    const unrestCard = "sunken_unrest";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "return_unrest", cardId: unrestCard, sourceZones: ["sunken"] } as any]
    };
    G.cardDb[unrestCard] = {
      id: unrestCard,
      displayName: "Sunken Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].sideAreas = { sunken: [unrestCard] };
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = [];

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].sideAreas?.sunken).toEqual([]);
    expect(G.unrestPile).toEqual([unrestCard]);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
  });

  it("treats a nation History replacement zone as History for return-Unrest text", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    const unrestCard = "sunken_unrest";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "return_unrest", cardId: unrestCard, sourceZones: ["history"] } as any]
    };
    G.cardDb[unrestCard] = {
      id: unrestCard,
      displayName: "Sunken Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: [unrestCard] };
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = [];

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].sideAreas?.sunken).toEqual([]);
    expect(G.unrestPile).toEqual([unrestCard]);
  });

  it("creates a Return Unrest choice from a nation History replacement zone when History is the source", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    const unrestCard = "sunken_unrest";
    const secondUnrestCard = "sunken_unrest_b";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "return_unrest", sourceZones: ["history"] } as any]
    };
    G.cardDb[unrestCard] = {
      id: unrestCard,
      displayName: "Sunken Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb[secondUnrestCard] = {
      id: secondUnrestCard,
      displayName: "Second Sunken Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: [unrestCard, secondUnrestCard] };
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = [];

    playCard({ G, ctx }, card);

    expect(G.pendingReturnUnrestChoice).toEqual({
      playerId: "0",
      sourceCardId: card,
      cardIds: [unrestCard, secondUnrestCard],
      sourceZones: ["history"]
    });
    expect(G.players["0"].sideAreas?.sunken).toEqual([unrestCard, secondUnrestCard]);

    resolveReturnUnrestChoice({ G, ctx }, unrestCard);

    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.players["0"].sideAreas?.sunken).toEqual([secondUnrestCard]);
    expect(G.unrestPile).toEqual([unrestCard]);
    expect(G.players["0"].discard).toContain(card);
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

  it("plays a free-Develop card even when no Development card is payable", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "develop", free: true } as any]
    };
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.players["0"].hand = [card];
    G.players["0"].developmentArea = ["test_action_scholars_circle"];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].discard).toContain("test_action_scholars_circle");
    expect(G.players["0"].developmentArea).toEqual([]);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
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

  it("plays a Fame-look-only card when only face-up King of Kings remains", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "look_cards", source: "fameDeck", count: 2 } as any]
    };
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: {}
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.lookedCards).toEqual({
      playerId: "0",
      source: "fameDeck",
      cardIds: ["king_of_kings"]
    });
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

  it("does not require post-choice costs before playing a choice-producing card", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [
        {
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
        },
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ] as any
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].playArea).toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
    expect(G.pendingChoice).toMatchObject({
      playerId: "0",
      sourceCardId: card,
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    });

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].discard).toContain(card);
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

  it("does not play an optional-only card when the optional effect has only payable explicit costs", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{
        trigger: "on_play",
        op: "optional",
        effects: [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }]
      } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play an optional-only resource return when no token can be returned", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{
        trigger: "on_play",
        op: "optional",
        effects: [{ trigger: "on_play", op: "return_resource", resource: "materials", amount: 1 }]
      } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play optional-only zero-token resource movement", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{
        trigger: "on_play",
        op: "optional",
        effects: [{ trigger: "on_play", op: "return_resource", resource: "materials", amount: 0 }]
      } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play spend-action-only zero-amount effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "spend_action", amount: 0 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play direct resource return text when no token can be returned", () => {
    const G = createInitialState();
    const card = "test_action_empty_return";
    G.cardDb[card] = {
      id: card,
      displayName: "Empty Return",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "return_resource", resource: "materials", amount: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play optional-only zero-count effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{
        trigger: "on_play",
        op: "optional",
        effects: [{ trigger: "on_play", op: "draw", count: 0 }]
      } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = ["test_action_foundry_shift"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].deck).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play draw-only zero-count effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "draw", count: 0 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = ["test_action_foundry_shift"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].deck).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play look-only zero-count effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "look_cards", source: "deck", count: 0 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = ["test_action_foundry_shift"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.lookedCards).toBeUndefined();
    expect(G.players["0"].deck).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play draw-if-able-only zero-count effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "draw_if_able", count: 0 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = ["test_action_foundry_shift"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].deck).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play Fame-gain-only zero-count effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "gain_fame", count: 0 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play Take-Unrest-only zero-count effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "take_unrest", count: 0 } as any]
    };
    G.players["0"].hand = [card];
    G.unrestPile = ["unrest_1"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].hand).not.toContain("unrest_1");
    expect(G.unrestPile).toEqual(["unrest_1"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play resource-gain-only zero-amount effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 0 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("does not play resource-spend-only zero-amount effects", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 0 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].resources.materials).toBe(1);
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
    expect(G.players["0"].hand).toContain("alien_unrest");
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.some((entry) => entry.message === "SpentResourcePenalty(knowledge/unrest=1)")).toBe(true);
  });

  it("does not trigger spend penalties when returning Progress instead of paying it", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "return_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.knowledge = 1;
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

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.unrestPile).toEqual(["alien_unrest"]);
    expect(G.players["0"].hand).not.toContain("alien_unrest");
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.some((entry) => entry.message.startsWith("SpentResourcePenalty("))).toBe(false);
  });

  it("does not trigger spend penalties when removing Progress instead of paying it", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "remove_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.knowledge = 1;
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

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.unrestPile).toEqual(["alien_unrest"]);
    expect(G.players["0"].hand).not.toContain("alien_unrest");
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.some((entry) => entry.message.startsWith("SpentResourcePenalty("))).toBe(false);
  });

  it("does not trigger spend penalties when stealing Progress instead of paying it", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "knowledge", amount: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.knowledge = 0;
    G.players["1"].resources.knowledge = 1;
    G.players["0"].stateArea = ["alien_state"];
    G.players["1"].stateArea = ["alien_state"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.unrestPile = ["alien_unrest_0", "alien_unrest_1"];
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
    G.activeNationRulesets!["1"].stateOverrides = [
      { op: "take_unrest_when_spending_resource", resource: "knowledge", state: "alien" } as any
    ];

    playCard({ G, ctx }, card);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect(G.unrestPile).toEqual(["alien_unrest_0", "alien_unrest_1"]);
    expect(G.players["0"].hand).not.toContain("alien_unrest_0");
    expect(G.players["1"].hand).not.toContain("alien_unrest_1");
    expect(G.players["0"].discard).toContain(card);
    expect(G.log.some((entry) => entry.message.startsWith("SpentResourcePenalty("))).toBe(false);
  });

  it("does not play a paid action when selected payment overpays the cost", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 2 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };
    G.players["0"].hand = [card];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card, { knowledge: 1, goods: 1 });

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
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

  it("draw-if-able text draws only available deck cards without reshuffling discard", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "draw_if_able", count: 2 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].deck = ["deck_card"];
    G.players["0"].discard = ["discard_card"];
    G.players["0"].nationDeck = ["nation_card"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb.deck_card = { id: "deck_card", displayName: "Deck Card", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] };
    G.cardDb.discard_card = { id: "discard_card", displayName: "Discard Card", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] };
    G.cardDb.nation_card = { id: "nation_card", displayName: "Nation Card", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual(["deck_card"]);
    expect(G.players["0"].deck).toEqual([]);
    expect(G.players["0"].discard).toEqual(["discard_card", card]);
    expect(G.players["0"].nationDeck).toEqual(["nation_card"]);
    expect(G.pendingReshuffleResolution).toBeUndefined();
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.log.some((entry) => entry.message === "Draw-if-able stopped (deck empty).")).toBe(true);
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

  it("does not play a resource-gain-only card when the finite supply is empty", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.resourceSupply = { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 };
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): no_resolvable_on_play_effects(${card})`);
  });

  it("plays a resource-gain-only card when a finite supply can provide part of the requested gain", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.resourceSupply = { materials: 0, knowledge: 1, influence: 0, unrest: 0, goods: 0 };
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 2 } as any]
    };
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toContain(card);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.resourceSupply.knowledge).toBe(0);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.log.some((entry) => entry.message === "Gained 1/2 knowledge.")).toBe(true);
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

  it("plays a Nation-Look-only card when only a separately tracked Accession remains", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "look_cards", source: "nationDeck", count: 1 } as any]
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
    G.players["0"].nationDeck = [];
    G.players["0"].accessionCardId = "accession_card";
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.lookedCards).toEqual({
      playerId: "0",
      source: "nationDeck",
      cardIds: ["accession_card"]
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

  it("auto-resolves unspecified Recall text when the only eligible Region is garrisoned", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.cardDb[card] = {
      ...G.cardDb[card],
      effects: [{ trigger: "on_play", op: "recall_region" } as any]
    };
    G.cardDb.non_region_host = {
      id: "non_region_host",
      displayName: "Non-region Host",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.garrisoned_region = {
      id: "garrisoned_region",
      displayName: "Garrisoned Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: ["region"],
      effects: []
    };
    G.players["0"].hand = [card];
    G.players["0"].playArea = ["non_region_host"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardStates = { non_region_host: { garrisonedCardIds: ["garrisoned_region"] } };

    playCard({ G, ctx }, card);

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("garrisoned_region");
    expect(G.cardStates?.non_region_host?.garrisonedCardIds ?? []).not.toContain("garrisoned_region");
    expect(G.log.some((entry) => entry.message === `InvalidMove(playCard): no_resolvable_on_play_effects(${card})`)).toBe(false);
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

  it("cleanup market resource choices keep structured market slots in sync", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketSlots = [
      { index: 0, cardId: "test_action_foundry_shift", resourceMarkers: {}, attachedUnrestCardIds: [] },
      { index: 1, cardId: "test_action_archive_survey", resourceMarkers: {}, attachedUnrestCardIds: [] }
    ];
    G.players["0"].hand = [];

    endTurnMove({ G, ctx, events: { endTurn } });
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(G.marketResources?.test_action_archive_survey?.knowledge).toBe(1);
    expect(G.marketSlots[0].resourceMarkers).toEqual({});
    expect(G.marketSlots[1]).toMatchObject({
      cardId: "test_action_archive_survey",
      resourceMarkers: { knowledge: 1 },
      attachedUnrestCardIds: []
    });
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

    expect(G.pendingCleanupMarketResourceChoice).toBeUndefined();
    expect(G.marketResources?.test_action_foundry_shift?.influence).toBe(1);
    expect((G.marketResources?.test_action_foundry_shift as any)?.population).toBeUndefined();
    expect(endTurn).toHaveBeenCalledTimes(1);
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

  it("resets cleanup token markers before the optional cleanup discard choice", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].playArea = ["cleanup_play_card"];
    G.players["0"].powerArea = ["cleanup_power_card"];
    G.players["0"].nationDeck = ["cleanup_nation_card"];
    G.players["0"].developmentArea = ["cleanup_development_card"];
    G.players["0"].discard = ["cleanup_discarded_action"];
    G.players["0"].actionTokensAvailable = 0;
    G.players["0"].exhaustTokensAvailable = 0;
    G.players["0"].progressionTokens = { nationDeck: 1, developmentArea: 1 };
    G.cardStates = {
      cleanup_play_card: { exhausted: true, actionTokens: 1, exhaustTokens: 1 },
      cleanup_power_card: { exhausted: true, exhaustTokens: 1 },
      cleanup_nation_card: { actionTokens: 1 },
      cleanup_development_card: { exhaustTokens: 1 },
      cleanup_discarded_action: { actionTokens: 1 }
    };

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupDiscardChoice?.cardIds).toEqual(["test_action_archive_survey"]);
    expect(G.cardStates.cleanup_play_card).toMatchObject({ exhausted: false, actionTokens: 0, exhaustTokens: 0 });
    expect(G.cardStates.cleanup_power_card).toMatchObject({ exhausted: false, exhaustTokens: 0 });
    expect(G.cardStates.cleanup_nation_card).toMatchObject({ actionTokens: 0 });
    expect(G.cardStates.cleanup_development_card).toMatchObject({ exhaustTokens: 0 });
    expect(G.cardStates.cleanup_discarded_action).toMatchObject({ actionTokens: 0 });
    expect(G.players["0"].progressionTokens).toEqual({ nationDeck: 0, developmentArea: 0 });
    expect(G.players["0"].actionTokensAvailable).toBe(G.players["0"].actionTokensBase);
    expect(G.players["0"].exhaustTokensAvailable).toBe(G.players["0"].exhaustTokensBase);
  });

  it("resets gained Actions above the State card base during cleanup", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    const p = G.players["0"];
    G.market = [];
    p.hand = ["test_action_archive_survey"];
    p.discard = [];
    p.deck = [];
    p.handSize = 0;
    p.actionTokensBase = 3;
    p.actionsRemaining = 3;
    p.actionTokensAvailable = 3;

    runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_action", amount: 2 } as any
    ]);

    expect(p.actionsRemaining).toBe(5);
    expect(p.actionTokensAvailable).toBe(5);

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupDiscardChoice?.cardIds).toEqual(["test_action_archive_survey"]);
    expect(p.actionsRemaining).toBe(3);
    expect(p.actionTokensAvailable).toBe(3);
  });

  it("runs custom cleanup effects before the optional cleanup discard choice", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].resources.knowledge = 0;
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      cleanupOverrides: [{
        op: "custom_cleanup_effect",
        effect: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
      } as any]
    };

    endTurnMove({ G, ctx, events: { endTurn } });

    expect(endTurn).not.toHaveBeenCalled();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_archive_survey"]
    });
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
    expect(G.log.some((entry) => entry.message.startsWith("MarketResourceAdded(test_action_foundry_shift/knowledge"))).toBe(false);
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

  it("uses the default Solstice state flip when imported rulesets omit state overrides", () => {
    const G = createInitialState();
    G.players["0"].stateArea = ["barbarian_state", "empire_state"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.barbarian_state = {
      id: "barbarian_state",
      displayName: "Barbarian State",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["barbarian"],
      effects: []
    };
    G.cardDb.empire_state = {
      id: "empire_state",
      displayName: "Empire State",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["empire"],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      nationId: "minimal_solstice_nation",
      displayName: "Minimal Solstice Nation",
      rulesetTags: [],
      stateOverrides: undefined,
      solsticeOverrides: [{ op: "flip_state" }],
      hookRules: []
    } as any;

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.players["0"].stateArea).toEqual(["empire_state", "barbarian_state"]);
    expect(G.gameover).toBeUndefined();
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

  it("does not open reactive Exhaust windows during Solstice", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["solstice_gain_card", "reactive_solstice_card"];
    p.hand = [];
    G.players["1"].hand = [];
    p.exhaustTokensAvailable = 1;
    p.resources.knowledge = 0;
    p.resources.materials = 0;
    G.cardDb.solstice_gain_card = {
      id: "solstice_gain_card",
      displayName: "Solstice Gain",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    G.cardDb.reactive_solstice_card = {
      id: "reactive_solstice_card",
      displayName: "Reactive Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "materials",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.materials).toBe(0);
    expect(p.exhaustTokensAvailable).toBe(1);
    expect(G.round).toBe(2);
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

  it("does not resolve End-of-Solstice text from a card that left play during Solstice", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["departing_solstice_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.departing_solstice_card = {
      id: "departing_solstice_card",
      displayName: "Departing Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_solstice", op: "move_self_to_history" } as any,
        { trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.players["0"].history).toEqual(["departing_solstice_card"]);
    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("does not resolve End-of-Solstice text from a later source removed by an earlier End-of-Solstice effect", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["end_exile_source", "end_removed_source"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.end_exile_source = {
      id: "end_exile_source",
      displayName: "End Exile Source",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "exile_card", source: "playArea", cardId: "end_removed_source" } as any]
    };
    G.cardDb.end_removed_source = {
      id: "end_removed_source",
      displayName: "End Removed Source",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "end_of_solstice",
      cardIds: ["end_exile_source", "end_removed_source"]
    });

    resolveSolsticeOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["end_exile_source", "end_removed_source"]);

    expect(G.players["0"].playArea).toEqual(["end_exile_source"]);
    expect(G.players["0"].exile).toEqual(["end_removed_source"]);
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("does not resolve Solstice text from a later source removed by an earlier ordered Solstice effect", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["solstice_exile_source", "solstice_removed_source"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.cardDb.solstice_exile_source = {
      id: "solstice_exile_source",
      displayName: "Solstice Exile Source",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "exile_card", source: "playArea", cardId: "solstice_removed_source" } as any]
    };
    G.cardDb.solstice_removed_source = {
      id: "solstice_removed_source",
      displayName: "Solstice Removed Source",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["solstice_exile_source", "solstice_removed_source"]
    });

    resolveSolsticeOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["solstice_exile_source", "solstice_removed_source"]);

    expect(G.players["0"].playArea).toEqual(["solstice_exile_source"]);
    expect(G.players["0"].exile).toEqual(["solstice_removed_source"]);
    expect(G.players["0"].resources.knowledge).toBe(0);
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

  it("removes a separated Accession card with the remaining Nation deck during Reactor-style End-of-Solstice removal", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion"];
    p.nationDeck = ["remaining_nation_1"];
    p.accessionCardId = "accession_card";
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
    expect(p.accessionCardId).toBeUndefined();
    expect(p.exile).toEqual(["reactor_explosion", "remaining_nation_1", "accession_card"]);
    expect(G.log.some((entry) => entry.message === "SolsticeRemovedPlayCardAndNationDeck(reactor_explosion/removed=3)")).toBe(true);
  });

  it("treats rulebook resource names as canonical for Reactor-style Solstice removal checks", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion"];
    p.nationDeck = ["remaining_nation_1"];
    p.resources.knowledge = 1;
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
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      solsticeOverrides: [
        { op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "reactor_explosion", resource: "progress", state: "alien" } as any
      ]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(p.playArea).toEqual(["reactor_explosion"]);
    expect(p.nationDeck).toEqual(["remaining_nation_1"]);
    expect(p.exile).not.toContain("reactor_explosion");
    expect(G.log.some((entry) => entry.message.startsWith("SolsticeRemovedPlayCardAndNationDeck"))).toBe(false);
  });

  it("moves garrisoned cards and collects resources when Reactor-style Solstice removal removes its host", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion"];
    p.nationDeck = ["remaining_nation_1"];
    p.resources.knowledge = 0;
    p.resources.materials = 0;
    p.resources.influence = 0;
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
    G.cardStates = {
      reactor_explosion: { resources: { materials: 2 }, garrisonedCardIds: ["garrisoned_card"] },
      garrisoned_card: { resources: { influence: 1 } },
      alien_state: { activeState: "alien" }
    };
    G.activeNationRulesets!["0"].solsticeOverrides = [
      { op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "reactor_explosion", resource: "knowledge", state: "alien" } as any
    ];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(p.playArea).toEqual([]);
    expect(p.nationDeck).toEqual([]);
    expect(p.exile).toEqual(["reactor_explosion", "garrisoned_card", "remaining_nation_1"]);
    expect(p.resources.materials).toBe(2);
    expect(p.resources.influence).toBe(1);
    expect(G.cardStates?.reactor_explosion).toBeUndefined();
    expect(G.cardStates?.garrisoned_card).toBeUndefined();
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

  it("activates a replacement side on a single State card without inserting a synthetic State id", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion"];
    p.nationDeck = [];
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
      displayName: "Alien State",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: ["alien"],
      effects: []
    };
    G.cardStates = { alien_state: { activeState: "alien" } };
    G.activeNationRulesets!["0"].solsticeOverrides = [
      { op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "reactor_explosion", resource: "knowledge", state: "alien", activateState: "native" } as any
    ];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(p.stateArea).toEqual(["alien_state"]);
    expect(G.cardStates.alien_state?.activeState).toBe("native");
    expect(currentStateMatches(G, "0", "native")).toBe(true);
  });

  it("applies End-of-Solstice nation removals after resolving an ordered End-of-Solstice choice", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion", "end_gain_card", "end_spend_card"];
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
    G.cardDb.end_gain_card = {
      id: "end_gain_card",
      displayName: "End Gain",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.cardDb.end_spend_card = {
      id: "end_spend_card",
      displayName: "End Spend",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "spend_resource", resource: "materials", amount: 1 } as any]
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

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "end_of_solstice",
      cardIds: ["end_gain_card", "end_spend_card"]
    });
    expect(p.playArea).toContain("reactor_explosion");

    resolveSolsticeOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["end_gain_card", "end_spend_card"]);

    expect(G.pendingSolsticeOrderChoice).toBeUndefined();
    expect(p.resources.materials).toBe(0);
    expect(p.playArea).toEqual(["end_gain_card", "end_spend_card"]);
    expect(p.nationDeck).toEqual([]);
    expect(p.exile).toEqual(["reactor_explosion", "remaining_nation_1"]);
    expect(G.log.some((entry) => entry.message === "SolsticeRemovedPlayCardAndNationDeck(reactor_explosion/removed=2)")).toBe(true);
  });

  it("failed after-Solstice hooks stop round advancement after an ordered End-of-Solstice choice", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["end_gain_card", "end_spend_card"];
    p.resources.materials = 0;
    G.cardDb.end_gain_card = {
      id: "end_gain_card",
      displayName: "End Gain",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.cardDb.end_spend_card = {
      id: "end_spend_card",
      displayName: "End Spend",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "spend_resource", resource: "materials", amount: 1 } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_solstice",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      }]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);
    resolveSolsticeOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["end_gain_card", "end_spend_card"]);

    expect(G.pendingSolsticeOrderChoice).toBeUndefined();
    expect(G.round).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_solstice #0 failed.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);
  });

  it("runs End-of-Solstice removals after an interrupted ordered End-of-Solstice sequence resumes", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion", "choice_end_card", "gain_end_card"];
    p.nationDeck = ["remaining_nation_1"];
    p.resources.materials = 0;
    p.resources.knowledge = 0;
    p.stateArea = ["alien_state"];
    G.cardDb.reactor_explosion = {
      id: "reactor_explosion",
      displayName: "Reactor",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.choice_end_card = {
      id: "choice_end_card",
      displayName: "Choice End",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "end_of_solstice",
        op: "choose_one",
        choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
      } as any]
    };
    G.cardDb.gain_end_card = {
      id: "gain_end_card",
      displayName: "Gain End",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "gain_resource", resource: "goods", amount: 1 } as any]
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
    resolveSolsticeOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["choice_end_card", "gain_end_card"]);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingSolsticeContinuation?.cardIds).toEqual(["gain_end_card"]);

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingSolsticeContinuation).toBeUndefined();
    expect(p.resources.materials).toBe(1);
    expect(p.resources.goods).toBe(1);
    expect(p.playArea).toEqual(["choice_end_card", "gain_end_card"]);
    expect(p.nationDeck).toEqual([]);
    expect(p.exile).toEqual(["reactor_explosion", "remaining_nation_1"]);
    expect(G.log.some((entry) => entry.message === "SolsticeRemovedPlayCardAndNationDeck(reactor_explosion/removed=2)")).toBe(true);
  });

  it("runs End-of-Solstice removals after the last ordered End-of-Solstice card is interrupted", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.playArea = ["reactor_explosion", "gain_end_card", "choice_end_card"];
    p.nationDeck = ["remaining_nation_1"];
    p.resources.materials = 0;
    p.resources.goods = 0;
    p.resources.knowledge = 0;
    p.stateArea = ["alien_state"];
    G.cardDb.reactor_explosion = {
      id: "reactor_explosion",
      displayName: "Reactor",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.gain_end_card = {
      id: "gain_end_card",
      displayName: "Gain End",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "end_of_solstice", op: "gain_resource", resource: "goods", amount: 1 } as any]
    };
    G.cardDb.choice_end_card = {
      id: "choice_end_card",
      displayName: "Choice End",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "end_of_solstice",
        op: "choose_one",
        choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]]
      } as any]
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
    resolveSolsticeOrderChoice({ G, ctx, random: { Number: () => 0 } }, ["gain_end_card", "choice_end_card"]);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingSolsticeContinuation?.cardIds).toEqual([]);

    resolveChoice({ G, ctx, random: { Number: () => 0 } }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingSolsticeContinuation).toBeUndefined();
    expect(p.resources.materials).toBe(1);
    expect(p.resources.goods).toBe(1);
    expect(p.playArea).toEqual(["gain_end_card", "choice_end_card"]);
    expect(p.nationDeck).toEqual([]);
    expect(p.exile).toEqual(["reactor_explosion", "remaining_nation_1"]);
    expect(G.log.some((entry) => entry.message === "SolsticeRemovedPlayCardAndNationDeck(reactor_explosion/removed=2)")).toBe(true);
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
    G.market = ["market_civilized", "market_civilized_b"];
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
    G.cardDb.hand_uncivilized = {
      id: "hand_uncivilized",
      displayName: "Hand Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
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

  it("lets a player choose Solstice order when Place on Deck can feed Draw", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["draw_solstice_card", "place_solstice_card"];
    G.players["0"].hand = ["placed_card", "other_hand_card"];
    G.players["0"].deck = ["original_top"];
    G.players["1"].hand = [];
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
    G.cardDb.place_solstice_card = {
      id: "place_solstice_card",
      displayName: "Place Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "place_card_on_deck" } as any]
    };
    G.cardDb.placed_card = { id: "placed_card", displayName: "Placed Card", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] };
    G.cardDb.other_hand_card = { id: "other_hand_card", displayName: "Other Hand Card", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] };
    G.cardDb.original_top = { id: "original_top", displayName: "Original Top", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["draw_solstice_card", "place_solstice_card"]
    });
    expect(G.pendingPlaceOnDeckChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["placed_card", "other_hand_card"]);

    resolveSolsticeOrderChoice({ G, ctx }, ["place_solstice_card", "draw_solstice_card"]);

    expect(G.pendingPlaceOnDeckChoice).toEqual({
      playerId: "0",
      sourceCardId: "place_solstice_card",
      sourceZone: "hand",
      cardIds: ["placed_card", "other_hand_card"]
    });
    expect(G.pendingSolsticeContinuation?.cardIds).toEqual(["draw_solstice_card"]);
    expect(G.players["0"].hand).toEqual(["placed_card", "other_hand_card"]);
    expect(G.players["0"].deck).toEqual(["original_top"]);

    resolvePlaceOnDeckChoice({ G, ctx }, "placed_card");

    expect(G.pendingPlaceOnDeckChoice).toBeUndefined();
    expect(G.pendingSolsticeContinuation).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["other_hand_card", "placed_card"]);
    expect(G.players["0"].deck).toEqual(["original_top"]);
  });

  it("lets a player choose Solstice order before a Return Unrest choice pauses resolution", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["return_unrest_solstice_card", "gain_solstice_card"];
    G.players["0"].hand = ["hand_unrest", "hand_unrest_b"];
    G.players["1"].hand = [];
    G.cardDb.return_unrest_solstice_card = {
      id: "return_unrest_solstice_card",
      displayName: "Return Unrest Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "return_unrest" } as any]
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
    G.cardDb.hand_unrest_b = {
      id: "hand_unrest_b",
      displayName: "Hand Unrest B",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["return_unrest_solstice_card", "gain_solstice_card"]
    });
    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveSolsticeOrderChoice({ G, ctx }, ["return_unrest_solstice_card", "gain_solstice_card"]);

    expect(G.pendingReturnUnrestChoice?.cardIds).toEqual(["hand_unrest", "hand_unrest_b"]);
    expect(G.pendingSolsticeContinuation?.cardIds).toEqual(["gain_solstice_card"]);
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("lets a player choose Solstice order before a Return Fame choice pauses resolution", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["return_fame_solstice_card", "gain_solstice_card"];
    G.players["0"].hand = ["hand_fame"];
    G.players["1"].hand = [];
    G.cardDb.return_fame_solstice_card = {
      id: "return_fame_solstice_card",
      displayName: "Return Fame Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "return_fame" } as any]
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
    G.cardDb.hand_fame = {
      id: "hand_fame",
      displayName: "Hand Fame",
      type: "fame",
      cardType: "fame",
      suit: "fame",
      cost: 0,
      tags: ["fame"],
      effects: []
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["return_fame_solstice_card", "gain_solstice_card"]
    });
    expect(G.pendingReturnFameChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("lets a player choose Solstice order before a Return Exhaust token choice pauses resolution", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["spent_exhaust_card_a", "spent_exhaust_card_b", "return_exhaust_solstice_card", "gain_solstice_card"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.players["0"].exhaustTokensAvailable = 0;
    G.cardStates = {
      spent_exhaust_card_a: { exhaustTokens: 1 },
      spent_exhaust_card_b: { exhaustTokens: 1 }
    };
    G.cardDb.spent_exhaust_card_a = {
      id: "spent_exhaust_card_a",
      displayName: "Spent Exhaust A",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.spent_exhaust_card_b = {
      id: "spent_exhaust_card_b",
      displayName: "Spent Exhaust B",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.return_exhaust_solstice_card = {
      id: "return_exhaust_solstice_card",
      displayName: "Return Exhaust Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "return_exhaust_token" } as any]
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

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["return_exhaust_solstice_card", "gain_solstice_card"]
    });
    expect(G.pendingReturnExhaustTokenChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveSolsticeOrderChoice({ G, ctx }, ["return_exhaust_solstice_card", "gain_solstice_card"]);

    expect(G.pendingReturnExhaustTokenChoice?.cardIds).toEqual(["spent_exhaust_card_a", "spent_exhaust_card_b"]);
    expect(G.pendingSolsticeContinuation?.cardIds).toEqual(["gain_solstice_card"]);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
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

  it("refreshes State card token metadata after the default Solstice state flip", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.stateArea = ["barbarian_state", "empire_state"];
    p.hand = [];
    G.players["1"].hand = [];
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
    G.cardDb.empire_state = {
      id: "empire_state",
      displayName: "Empire State",
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
    G.activeNationRulesets = {
      "0": {
        nationId: "default_solstice_flip",
        displayName: "Default Solstice Flip",
        rulesetTags: ["state_flip_on_solstice"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
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

    expect(p.stateArea).toEqual(["empire_state", "barbarian_state"]);
    expect(p.actionTokensBase).toBe(2);
    expect(p.exhaustTokensBase).toBe(6);
    expect(p.handSize).toBe(6);
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
    G.market = ["market_civilized", "market_civilized_b"];
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

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "solstice_exile_card",
      source: "market",
      cardIds: ["market_civilized", "market_civilized_b"]
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
    G.players["0"].hand = ["hand_unrest", "hand_unrest_b"];
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
      cardIds: ["hand_unrest", "hand_unrest_b"],
      sourceZones: ["hand"]
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

  it("does not resume paused Solstice while an internal Market-Unrest hook continuation is pending", () => {
    const G = createInitialState();
    G.pausedSolstice = {
      playOrder: ["0", "1"],
      playerIndex: 0,
      phase: "on_solstice",
      cardIndex: 0,
      overrideIndex: 0
    };
    G.pendingMarketUnrestHookContinuation = { playerId: "0", cardIds: ["unrest_a"], nextIndex: 0 };

    continuePausedSolstice(G, "0");

    expect(G.pausedSolstice).toEqual({
      playOrder: ["0", "1"],
      playerIndex: 0,
      phase: "on_solstice",
      cardIndex: 0,
      overrideIndex: 0
    });
    expect(G.log.some((entry) => entry.message === "SolsticeResumed")).toBe(false);
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
    G.players["0"].hand = ["hand_civilized", "hand_uncivilized"];
    G.players["1"].hand = [];
    G.market = ["market_civilized", "market_uncivilized"];
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
      choices: [
        { cardId: "hand_civilized", marketCardId: "market_civilized" },
        { cardId: "hand_uncivilized", marketCardId: "market_uncivilized" }
      ]
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
    G.players["0"].playArea = ["solstice_region_choice", "test_region", "second_region"];
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

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);
    resolveRegionChoice({ G, ctx }, "test_region");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.pendingSolsticeContinuation).toBeUndefined();
    expect(G.pausedSolstice).toBeUndefined();
    expect(G.players["0"].hand).toContain("test_region");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.round).toBe(2);
    expect(G.log.some((entry) => entry.message === "SolsticePaused(pending_region_choice)")).toBe(true);
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

  it("lets a player choose Solstice order when one card can trigger Collapse", () => {
    const G = createInitialState();
    G.unrestPile = [];
    G.players["0"].playArea = ["collapse_solstice_card", "gain_before_collapse_solstice_card"];
    G.players["0"].hand = [];
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
    G.cardDb.gain_before_collapse_solstice_card = {
      id: "gain_before_collapse_solstice_card",
      displayName: "Gain Before Collapse",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.pendingSolsticeOrderChoice).toEqual({
      playerId: "0",
      phase: "on_solstice",
      cardIds: ["collapse_solstice_card", "gain_before_collapse_solstice_card"]
    });
    expect(G.gameover).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveSolsticeOrderChoice(
      { G, ctx: { currentPlayer: "0" } as any },
      ["gain_before_collapse_solstice_card", "collapse_solstice_card"]
    );

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.round).toBe(1);
  });

  it("collapse from a before-Solstice hook stops that player's Solstice effects", () => {
    const G = createInitialState();
    G.unrestPile = [];
    G.players["0"].hand = [];
    G.players["0"].playArea = ["later_solstice_card"];
    G.players["1"].hand = [];
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
        trigger: "before_solstice",
        effects: [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]
      }]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.round).toBe(1);
  });

  it("failed before-Solstice hooks stop that player's Solstice effects and round advancement", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].playArea = ["later_solstice_card"];
    G.players["1"].hand = [];
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
        trigger: "before_solstice",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      }]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.round).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook before_solstice #0 failed.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "SolsticeResolved")).toBe(false);
  });

  it("failed after-Solstice hooks stop round advancement", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].playArea = [];
    G.players["1"].hand = [];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_solstice",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      }]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["0", "1"] } as any);

    expect(G.round).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_solstice #0 failed.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "TurnPhase(turn_handoff): end_turn_complete")).toBe(false);
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

  it("blocks normal actions while scoring finalization is waiting to resume", () => {
    const G = createInitialState();
    G.players["0"].hand = ["blocked_action"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.pendingScoringFinalization = { playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 };
    G.cardDb.blocked_action = {
      id: "blocked_action",
      displayName: "Blocked Action",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    playCard({ G, ctx }, "blocked_action");

    expect(G.players["0"].hand).toEqual(["blocked_action"]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(playCard): pending_scoring_finalization");
  });

  it.each([
    {
      name: "play-card resolution",
      reason: "pending_play_card_resolution",
      setPending: (G: GameState) => { G.pendingPlayCardResolution = { playerId: "0", cardId: "blocked_action", freePlay: false }; }
    },
    {
      name: "played-card resolution",
      reason: "pending_played_card_resolution",
      setPending: (G: GameState) => { G.pendingPlayedCardResolution = { playerId: "0", cardId: "blocked_action", freePlay: false }; }
    },
    {
      name: "acquire-card resolution",
      reason: "pending_acquire_card_resolution",
      setPending: (G: GameState) => { G.pendingAcquireCardResolution = { playerId: "0", cardId: "market_action" }; }
    },
    {
      name: "nation-hook continuation",
      reason: "pending_nation_hook_continuation",
      setPending: (G: GameState) => { G.pendingNationHookContinuation = { playerId: "0", trigger: "after_play_card", nextIndex: 1, resolvedHookIndex: 0 }; }
    },
    {
      name: "Unrest-take continuation",
      reason: "pending_unrest_take_continuation",
      setPending: (G: GameState) => { G.pendingUnrestTakeContinuation = { playerId: "0", recipientPlayerIds: ["0"], countPerPlayer: 1, recipientIndex: 0, cardIndex: 0, taken: 0 }; }
    },
    {
      name: "Unrest-allocation resolution",
      reason: "pending_unrest_allocation_resolution",
      setPending: (G: GameState) => { G.pendingUnrestAllocationResolution = { playerId: "0", recipientPlayerIds: ["0"], availableUnrestCardIds: ["unrest_1"], nextIndex: 0 }; }
    },
    {
      name: "post-development resolution",
      reason: "pending_post_development_resolution",
      setPending: (G: GameState) => { G.pendingPostDevelopmentResolution = { playerId: "0", cardId: "development_1", resumeDrawCount: 1 }; }
    },
    {
      name: "reshuffle resolution",
      reason: "pending_reshuffle_resolution",
      setPending: (G: GameState) => { G.pendingReshuffleResolution = { playerId: "0", resumeDrawCount: 1 }; }
    },
    {
      name: "after-reshuffle effects",
      reason: "pending_after_reshuffle_effects",
      setPending: (G: GameState) => { G.pendingAfterReshuffleEffects = { playerId: "0", resumeDrawCount: 1, nextOverrideIndex: 0 }; }
    },
    {
      name: "reshuffle draw continuation",
      reason: "pending_reshuffle_draw",
      setPending: (G: GameState) => { G.pendingReshuffleDraw = { playerId: "0", resumeDrawCount: 1 }; }
    },
    {
      name: "Practice market-exile-before-cleanup continuation",
      reason: "pending_practice_market_exile_before_cleanup",
      setPending: (G: GameState) => { G.pendingPracticeMarketExileBeforeCleanup = { playerId: "0" }; }
    }
  ])("blocks normal actions while a $name is waiting to resume", ({ reason, setPending }) => {
    const G = createInitialState();
    G.players["0"].hand = ["blocked_action"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb.blocked_action = {
      id: "blocked_action",
      displayName: "Blocked Action",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };
    setPending(G);

    playCard({ G, ctx }, "blocked_action");

    expect(G.players["0"].hand).toEqual(["blocked_action"]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): ${reason}`);
  });

  it.each([
    {
      name: "post-development resolution",
      setPending: (G: GameState) => { G.pendingPostDevelopmentResolution = { playerId: "0", cardId: "development_1", resumeDrawCount: 1 }; }
    },
    {
      name: "reshuffle resolution",
      setPending: (G: GameState) => { G.pendingReshuffleResolution = { playerId: "0", resumeDrawCount: 1 }; }
    },
    {
      name: "after-reshuffle effects",
      setPending: (G: GameState) => { G.pendingAfterReshuffleEffects = { playerId: "0", resumeDrawCount: 1, nextOverrideIndex: 0 }; }
    },
    {
      name: "reshuffle draw continuation",
      setPending: (G: GameState) => { G.pendingReshuffleDraw = { playerId: "0", resumeDrawCount: 1 }; }
    }
  ])("keeps paused Solstice behind a $name", ({ setPending }) => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.pausedSolstice = {
      playOrder: ["0", "1"],
      playerIndex: 0,
      phase: "on_solstice",
      cardIndex: 0,
      overrideIndex: 0
    };
    G.currentTurnType = "solstice";
    setPending(G);

    continuePausedSolstice(G, "0");

    expect(G.pausedSolstice).toEqual({
      playOrder: ["0", "1"],
      playerIndex: 0,
      phase: "on_solstice",
      cardIndex: 0,
      overrideIndex: 0
    });
    expect(G.round).toBe(1);
    expect(G.currentTurnType).toBe("solstice");
    expect(G.log.some((entry) => entry.message === "SolsticeResumed")).toBe(false);
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
    expect(G.players["0"].hand).toContain("only_unrest");
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

  it("returns an Exhaust token from a card in the play area", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["return_exhaust_card"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.return_exhaust_card = {
      id: "return_exhaust_card",
      displayName: "Return Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "return_exhaust_token" } as any]
    };

    exhaustCard({ G, ctx }, "return_exhaust_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.cardStates?.return_exhaust_card?.exhaustTokens).toBe(0);
    expect(G.cardStates?.return_exhaust_card?.exhausted).toBe(false);
    expect(G.log.some((entry) => entry.message === "ExhaustTokenReturned(return_exhaust_card)")).toBe(true);
  });

  it("pauses to choose which Exhaust token to return before paying later costs, then resumes effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["return_exhaust_source"];
    G.players["0"].playArea = ["spent_a", "spent_b"];
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].exhaustTokensAvailable = 0;
    G.players["0"].resources.knowledge = 1;
    G.cardStates = {
      spent_a: { exhausted: true, exhaustTokens: 1 },
      spent_b: { exhausted: true, exhaustTokens: 1 }
    };
    G.cardDb.spent_a = {
      id: "spent_a",
      displayName: "Spent A",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.spent_b = {
      id: "spent_b",
      displayName: "Spent B",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.return_exhaust_source = {
      id: "return_exhaust_source",
      displayName: "Return Exhaust Source",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "return_exhaust_token" } as any,
        { trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 1 } as any,
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    playCard({ G, ctx }, "return_exhaust_source");

    expect(G.pendingReturnExhaustTokenChoice).toEqual({
      playerId: "0",
      sourceCardId: "return_exhaust_source",
      cardIds: ["spent_a", "spent_b"],
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    });
    expect(G.players["0"].resources.knowledge).toBe(1);

    resolveReturnExhaustTokenChoice({ G, ctx }, "spent_b");

    expect(G.pendingReturnExhaustTokenChoice).toBeUndefined();
    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.cardStates?.spent_a?.exhaustTokens).toBe(1);
    expect(G.cardStates?.spent_a?.exhausted).toBe(true);
    expect(G.cardStates?.spent_b?.exhaustTokens).toBe(0);
    expect(G.cardStates?.spent_b?.exhausted).toBe(false);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].discard).toContain("return_exhaust_source");
  });

  it("does not play a Return Exhaust token action with no returnable token", () => {
    const G = createInitialState();
    G.players["0"].hand = ["return_exhaust_source"];
    G.players["0"].playArea = [];
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].actionsRemaining = 1;
    G.cardDb.return_exhaust_source = {
      id: "return_exhaust_source",
      displayName: "Return Exhaust Source",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "return_exhaust_token" } as any]
    };

    playCard({ G, ctx }, "return_exhaust_source");

    expect(G.players["0"].hand).toContain("return_exhaust_source");
    expect(G.players["0"].discard).not.toContain("return_exhaust_source");
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(playCard): no_resolvable_on_play_effects(return_exhaust_source)");
  });

  it("does not play a Market Exile action when all matching market cards have card-state tokens", () => {
    const G = createInitialState();
    G.players["0"].hand = ["market_exile_source"];
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].actionsRemaining = 1;
    G.market = ["tokened_market"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb.market_exile_source = {
      id: "market_exile_source",
      displayName: "Market Exile Source",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" } as any]
    };
    G.cardDb.tokened_market = {
      id: "tokened_market",
      displayName: "Tokened Market",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardStates = {
      tokened_market: { exhaustTokens: 1 }
    };

    playCard({ G, ctx }, "market_exile_source");

    expect(G.players["0"].hand).toEqual(["market_exile_source"]);
    expect(G.players["0"].discard).not.toContain("market_exile_source");
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("InvalidMove(playCard): no_resolvable_on_play_effects(market_exile_source)");
  });

  it("does not play a play-area Exile action when all matching player cards have card-state tokens", () => {
    const G = createInitialState();
    G.players["0"].hand = ["player_exile_source"];
    G.players["0"].playArea = ["tokened_region"];
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].actionsRemaining = 1;
    G.cardDb.player_exile_source = {
      id: "player_exile_source",
      displayName: "Player Exile Source",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "exile_card", source: "playArea", suit: "region" } as any]
    };
    G.cardDb.tokened_region = {
      id: "tokened_region",
      displayName: "Tokened Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardStates = {
      tokened_region: { exhaustTokens: 1 }
    };

    playCard({ G, ctx }, "player_exile_source");

    expect(G.players["0"].hand).toEqual(["player_exile_source"]);
    expect(G.players["0"].discard).not.toContain("player_exile_source");
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("InvalidMove(playCard): no_resolvable_on_play_effects(player_exile_source)");
  });

  it("auto-resolves an exhaust garrison ability with one host and one card in hand", () => {
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

    expect(G.pendingGarrisonChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.cardStates?.test_region?.garrisonedCardIds).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
  });

  it("auto-resolves an on-play Garrison Region using itself as the only host", () => {
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

    expect(G.pendingGarrisonChoice).toBeUndefined();
    expect(G.players["0"].playArea).toContain("garrison_region");
    expect(G.players["0"].hand).toEqual([]);
    expect(G.cardStates?.garrison_region?.garrisonedCardIds).toEqual(["test_action_archive_survey"]);
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

  it("does not allow a reactive-only Exhaust ability to be used as an ordinary Exhaust", () => {
    const G = createInitialState();
    G.cardDb.reactive_only_exhaust_card = {
      id: "reactive_only_exhaust_card",
      displayName: "Reactive Only Exhaust",
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
    };
    G.players["0"].playArea = ["reactive_only_exhaust_card"];
    G.players["0"].resources.knowledge = 0;
    G.players["0"].exhaustTokensAvailable = 1;

    exhaustCard({ G, ctx }, "reactive_only_exhaust_card");

    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.cardStates?.reactive_only_exhaust_card?.exhausted).toBeUndefined();
    expect(G.cardStates?.reactive_only_exhaust_card?.exhaustTokens).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): no_exhaust_ability(reactive_only_exhaust_card)");
  });

  it("allows a reactive Exhaust ability to use selected payment", () => {
    const G = createInitialState();
    G.cardDb.resource_trigger_card = {
      id: "resource_trigger_card",
      displayName: "Resource Trigger",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.cardDb.paid_reactive_exhaust_card = {
      id: "paid_reactive_exhaust_card",
      displayName: "Paid Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        {
          trigger: "on_exhaust",
          op: "spend_resource",
          resource: "influence",
          amount: 1,
          reactive: { trigger: "after_gain_resource", resource: "materials" }
        } as any,
        {
          trigger: "on_exhaust",
          op: "gain_resource",
          resource: "influence",
          amount: 1,
          reactive: { trigger: "after_gain_resource", resource: "materials" }
        } as any
      ]
    };
    G.players["0"].hand = ["resource_trigger_card"];
    G.players["0"].playArea = ["paid_reactive_exhaust_card"];
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].resources.goods = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;

    playCard({ G, ctx }, "resource_trigger_card");
    expect(G.pendingReactiveExhaustChoice?.cardIds).toEqual(["paid_reactive_exhaust_card"]);

    resolveReactiveExhaustChoice({ G, ctx }, "paid_reactive_exhaust_card", { goods: 1 } as any);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.paid_reactive_exhaust_card?.exhaustTokens).toBe(1);
    expect(G.log.at(-1)?.message).toBe("ReactiveExhaustResolved(paid_reactive_exhaust_card).");
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
    expect(G.cardStates?.collapse_exhaust_card?.exhausted).toBe(true);
    expect(G.cardStates?.collapse_exhaust_card?.exhaustTokens).toBe(1);
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
    expect(G.players["0"].hand).toContain("alien_unrest");
    expect(G.players["0"].exhaustTokensAvailable).toBe(0);
    expect(G.cardStates?.exhaust_play_card?.exhausted).toBe(true);
    expect(G.log.some((entry) => entry.message === "SpentResourcePenalty(knowledge/unrest=1)")).toBe(true);
  });

  it("does not exhaust a paid ability when selected payment overpays the cost", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["exhaust_play_card"];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 1;
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
        { trigger: "on_exhaust", op: "spend_resource", resource: "materials", amount: 2 } as any,
        { trigger: "on_exhaust", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    exhaustCard({ G, ctx }, "exhaust_play_card", { knowledge: 1, goods: 1 });

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.cardStates?.exhaust_play_card?.exhausted).not.toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): no_resolvable_on_exhaust_effects(exhaust_play_card)");
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

  it("does not use an Exhaust ability printed on a State card", () => {
    const G = createInitialState();
    G.players["0"].stateArea = ["exhaust_state_card"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.exhaust_state_card = {
      id: "exhaust_state_card",
      displayName: "Exhaust State",
      type: "state",
      cardType: "state",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };

    exhaustCard({ G, ctx }, "exhaust_state_card");

    expect(G.players["0"].exhaustTokensAvailable).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.cardStates?.exhaust_state_card?.exhausted).not.toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(exhaustCard): card_not_exhaust_source(exhaust_state_card)");
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

  it("Innovate Break Through does not trigger Acquire-only passives", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].hand = [];
    G.players["0"].resources.knowledge = 0;
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_acquire",
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "uncivilized", source: "market" });

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(false);
  });

  it("Innovate Break Through triggers Break-through passives for the gained card", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].hand = [];
    G.players["0"].resources.knowledge = 0;
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_break_through",
          condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "uncivilized" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "uncivilized", source: "market" });

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_break_through #0 resolved.")).toBe(true);
  });

  it("does not open reactive Exhaust windows during Innovate Break-through gains or hooks", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.marketResources = { test_action_foundry_shift: { knowledge: 1 } };
    G.players["0"].hand = ["test_action_archive_survey"];
    G.players["0"].playArea = ["innovate_reactive_exhaust"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.cardDb.innovate_reactive_exhaust = {
      id: "innovate_reactive_exhaust",
      displayName: "Innovate Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "goods",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_break_through",
          condition: { op: "always" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "uncivilized", source: "market" });

    expect(G.currentTurnType).toBe("innovate");
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.cardStates?.innovate_reactive_exhaust?.exhaustTokens ?? 0).toBe(0);
    expect(G.players["0"].resources.goods ?? 0).toBe(0);
    expect(G.log.some((entry) => entry.message.startsWith("ReactiveExhaustPending"))).toBe(false);
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
    expect(G.pendingCleanupMarketResourceChoice).toBeUndefined();
    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBe(1);
    expect(G.pendingCleanupDiscardChoice?.cardIds).toEqual(["test_action_archive_survey"]);
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

  it("Innovate can break through for Tributary", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.marketDecks = {
      mainDeck: [],
      regionDeck: ["visible_tributary"],
      uncivilizedDeck: [],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.marketDeckBottomCards = { regionDeck: "visible_tributary" } as any;
    G.cardDb.visible_tributary = {
      id: "visible_tributary",
      displayName: "Visible Tributary",
      type: "action",
      cardType: "action",
      suit: "tributary",
      cost: 0,
      tags: [],
      effects: []
    };
    G.players["0"].hand = ["test_action_archive_survey"];

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "tributary", source: "deck" } as any);

    expect(G.players["0"].discard).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].hand).toContain("visible_tributary");
    expect(G.marketDecks.regionDeck).toEqual([]);
    expect(G.marketDeckBottomCards?.regionDeck).toBeUndefined();
    expect(endTurn).not.toHaveBeenCalled();
    expect(G.log.some((entry) => entry.message === "BreakThroughVisibleBottom(visible_tributary/regionDeck)")).toBe(true);
  });

  it("Innovate pauses for an explicit Tributary choice when multiple bottom cards are visible", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.marketDecks = {
      mainDeck: [],
      regionDeck: ["visible_region_tributary"],
      uncivilizedDeck: ["visible_uncivilized_tributary"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.marketDeckBottomCards = {
      regionDeck: "visible_region_tributary",
      uncivilizedDeck: "visible_uncivilized_tributary"
    } as any;
    for (const id of ["visible_region_tributary", "visible_uncivilized_tributary"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "tributary",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.players["0"].hand = ["test_action_archive_survey"];

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "tributary", source: "deck" } as any);

    expect(G.currentTurnType).toBe("innovate");
    expect(G.pendingBreakThroughChoice).toEqual({
      playerId: "0",
      sourceCardId: "innovate_turn",
      source: "deck",
      suit: "tributary",
      cardIds: ["visible_region_tributary", "visible_uncivilized_tributary"]
    });
    expect(G.players["0"].discard).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].hand).toEqual([]);
    expect(endTurn).not.toHaveBeenCalled();
    expect(G.pendingCleanupDiscardChoice).toBeUndefined();
  });

  it("Innovate resumes cleanup after a Break-through passive hook choice resolves", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.marketDecks = {
      mainDeck: [],
      regionDeck: ["visible_region_tributary"],
      uncivilizedDeck: ["visible_uncivilized_tributary"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.marketDeckBottomCards = {
      regionDeck: "visible_region_tributary",
      uncivilizedDeck: "visible_uncivilized_tributary"
    } as any;
    for (const id of ["visible_region_tributary", "visible_uncivilized_tributary"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "tributary",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.players["0"].hand = ["test_action_archive_survey"];
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_break_through",
          condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "visible_uncivilized_tributary" },
          effects: [{
            trigger: "on_play",
            op: "optional",
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
          }]
        }]
      }
    } as any;

    innovateTurn({ G, ctx, events: { endTurn } }, { suit: "tributary", source: "deck" } as any);
    resolveBreakThroughChoice({ G, ctx, events: { endTurn } }, "visible_uncivilized_tributary");

    expect(G.currentTurnType).toBe("innovate");
    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingTurnEndCleanup).toMatchObject({
      playerId: "0",
      stage: "before_optional_discard"
    });

    resolveChoice({ G, ctx, events: { endTurn } }, 0);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingTurnEndCleanup).toBeUndefined();
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "0",
      cardIds: ["visible_uncivilized_tributary"]
    });
    expect(endTurn).not.toHaveBeenCalled();
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

  it("Revolt triggers data-driven passive hooks before cleanup", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_unrest_1", "test_action_archive_survey"];
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_revolt",
          condition: { op: "always" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    revoltTurn({ G, ctx, events: { endTurn } }, ["test_unrest_1"]);

    expect(G.currentTurnType).toBe("revolt");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_revolt #0 resolved.")).toBe(true);
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_archive_survey"]
    });
    expect(endTurn).not.toHaveBeenCalled();
  });

  it("Revolt resumes cleanup after a passive hook choice resolves", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_unrest_1", "test_action_archive_survey"];
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_revolt",
          condition: { op: "always" },
          effects: [{
            trigger: "on_play",
            op: "optional",
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
          }]
        }]
      }
    } as any;

    revoltTurn({ G, ctx, events: { endTurn } }, ["test_unrest_1"]);

    expect(G.pendingChoice?.sourceCardId).toBeUndefined();
    expect(G.pendingTurnEndCleanup).toMatchObject({
      playerId: "0",
      stage: "before_optional_discard"
    });
    expect(G.pendingCleanupDiscardChoice).toBeUndefined();

    resolveChoice({ G, ctx, events: { endTurn } }, 0);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingTurnEndCleanup).toBeUndefined();
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "0",
      cardIds: ["test_action_archive_survey"]
    });
    expect(endTurn).not.toHaveBeenCalled();
  });

  it("does not open reactive Exhaust windows during Revolt passive hooks", () => {
    const endTurn = vi.fn();
    const G = createInitialState();
    G.market = [];
    G.players["0"].hand = ["test_unrest_1", "test_action_archive_survey"];
    G.players["0"].playArea = ["revolt_reactive_exhaust"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.revolt_reactive_exhaust = {
      id: "revolt_reactive_exhaust",
      displayName: "Revolt Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "goods",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_revolt",
          condition: { op: "always" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    revoltTurn({ G, ctx, events: { endTurn } }, ["test_unrest_1"]);

    expect(G.currentTurnType).toBe("revolt");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.cardStates?.revolt_reactive_exhaust?.exhaustTokens ?? 0).toBe(0);
    expect(G.players["0"].resources.goods ?? 0).toBe(0);
    expect(G.log.some((entry) => entry.message.startsWith("ReactiveExhaustPending"))).toBe(false);
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

  it("honors selected Progress substitution when acquiring from the market", () => {
    const G = createInitialState();
    G.cardDb.progress_paid_market_card = {
      id: "progress_paid_market_card",
      displayName: "Progress Paid Market Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 2,
      tags: [],
      effects: []
    };
    G.market = ["progress_paid_market_card"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.goods = 1;

    acquireCard({ G, ctx }, "progress_paid_market_card", { knowledge: 1 });

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].hand).toContain("progress_paid_market_card");
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

  it("does not tuck unrest under a Region setup-banner replacement card", () => {
    const G = createInitialState();
    G.cardDb.multi_region_replacement = {
      id: "multi_region_replacement",
      displayName: "Multi Region Banner",
      type: "action",
      cardType: "action",
      suit: "multi",
      suitIcons: ["region", "civilized"],
      setupBannerSuit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["multi_region_replacement"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_2"];
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["multi_region_replacement"]);
    expect(G.marketUnrest?.multi_region_replacement).toBeUndefined();
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

  it("failed after-acquire hooks restore the acquisition state", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.unrestPile = ["test_unrest_1"];
    G.players["0"].resources.materials = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_acquire",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.marketRefillPool).toEqual(["test_action_archive_survey"]);
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(acquireCard): after_acquire_hook_failed(test_action_foundry_shift)");
  });

  it("failed tucked-Unrest hooks restore the direct Market acquisition state", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.marketUnrest = { test_action_foundry_shift: ["test_unrest_1"] };
    G.players["0"].resources.materials = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_gain_unrest",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.marketRefillPool).toEqual(["test_action_archive_survey"]);
    expect(G.marketUnrest).toEqual({ test_action_foundry_shift: ["test_unrest_1"] });
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.players["0"].hand).not.toContain("test_unrest_1");
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #0 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(acquireCard): after_gain_unrest_hook_failed(test_action_foundry_shift)");
  });

  it("failed tucked-Unrest hooks during card-effect Market acquisition restore the card play state", () => {
    const G = createInitialState();
    const card = "failed_effect_market_acquire_unrest_hook_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.marketUnrest = { test_action_foundry_shift: ["test_unrest_1"] };
    G.cardDb[card] = {
      id: card,
      displayName: "Failed Effect Market Acquire Unrest Hook Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_play",
        op: "acquire_card",
        source: "market",
        cardId: "test_action_foundry_shift",
        count: 1
      } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_gain_unrest",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.marketRefillPool).toEqual(["test_action_archive_survey"]);
    expect(G.marketUnrest).toEqual({ test_action_foundry_shift: ["test_unrest_1"] });
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.players["0"].hand).not.toContain("test_unrest_1");
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #0 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): on_play_effect_failed(${card})`);
  });

  it("failed resumed tucked-Unrest hooks during card-effect Market acquisition restore the card play state", () => {
    const G = createInitialState();
    const card = "failed_resumed_effect_market_acquire_unrest_hook_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = ["test_action_archive_survey"];
    G.marketDecks = undefined;
    G.marketUnrest = { test_action_foundry_shift: ["test_unrest_1", "test_unrest_2"] };
    G.unrestPile = ["spare_test_unrest"];
    G.cardDb.spare_test_unrest = {
      id: "spare_test_unrest",
      displayName: "Spare Test Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb[card] = {
      id: card,
      displayName: "Failed Resumed Effect Market Acquire Unrest Hook Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_play",
        op: "acquire_card",
        source: "market",
        cardId: "test_action_foundry_shift",
        count: 1
      } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_gain_unrest",
        condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "test_unrest_1" },
        effects: [{
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
        } as any]
      } as any]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [
        ...G.activeNationRulesets!["0"].hookRules,
        {
        trigger: "after_gain_unrest",
        condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "test_unrest_2" },
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
        } as any
      ]
    };

    playCard({ G, ctx }, card);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingMarketUnrestHookContinuation).toEqual({
      playerId: "0",
      cardIds: ["test_unrest_1", "test_unrest_2"],
      nextIndex: 1
    });

    resolveChoice({ G, ctx }, 0);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.marketRefillPool).toEqual(["test_action_archive_survey"]);
    expect(G.marketUnrest).toEqual({ test_action_foundry_shift: ["test_unrest_1", "test_unrest_2"] });
    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingMarketUnrestHookContinuation).toBeUndefined();
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.players["0"].hand).not.toContain("test_unrest_1");
    expect(G.players["0"].hand).not.toContain("test_unrest_2");
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): on_play_effect_failed(${card})`);
  });

  it("matches nation hook payload suit conditions against multi-suit icons", () => {
    const G = createInitialState();
    G.market = ["multi_suit_market"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb.multi_suit_market = {
      ...G.cardDb.test_action_foundry_shift,
      id: "multi_suit_market",
      displayName: "Multi Suit Market",
      suit: "civilized",
      suitIcons: ["civilized", "fame"],
      cost: 0
    };
    G.players["0"].resources.knowledge = 0;
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_acquire",
          condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "fame" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
        }]
      }
    } as any;

    acquireCard({ G, ctx }, "multi_suit_market");

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(true);
  });

  it("runs lower-priority nation hooks before later array entries and resumes the rest", () => {
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
            priority: 5,
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
          },
          {
            trigger: "after_acquire",
            priority: 1,
            effects: [{ trigger: "on_play", op: "choose_one", choices: [[{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]] } as any]
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

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #1 resolved.")).toBe(true);
  });

  it("pauses later nation hooks when an earlier hook creates a discard choice", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].hand = ["discard_hook_card_a", "discard_hook_card_b"];
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.knowledge = 0;
    G.cardDb.discard_hook_card_a = {
      id: "discard_hook_card_a",
      displayName: "Discard Hook A",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.discard_hook_card_b = {
      id: "discard_hook_card_b",
      displayName: "Discard Hook B",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [
          {
            trigger: "after_acquire",
            effects: [{ trigger: "on_play", op: "discard_cards", count: 1 } as any]
          },
          {
            trigger: "after_acquire",
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
          }
        ]
      }
    } as any;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.pendingDiscardChoice).toMatchObject({
      playerId: "0",
      cardIds: ["discard_hook_card_a", "discard_hook_card_b", "test_action_foundry_shift"],
      count: 1
    });
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveDiscardChoice({ G, ctx }, ["discard_hook_card_a"]);

    expect(G.pendingDiscardChoice).toBeUndefined();
    expect(G.players["0"].discard).toContain("discard_hook_card_a");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(true);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #1 resolved.")).toBe(true);
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
          G.market = ["test_action_foundry_shift", "market_civilized", "market_civilized_b"];
          G.cardDb.market_civilized = { ...G.cardDb.test_action_archive_survey, id: "market_civilized", displayName: "Market Civilized", suit: "civilized" };
          G.cardDb.market_civilized_b = { ...G.cardDb.test_action_archive_survey, id: "market_civilized_b", displayName: "Market Civilized B", suit: "civilized" };
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
          G.players["0"].hand = ["hand_unrest", "hand_unrest_b"];
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
          G.cardDb.hand_unrest_b = {
            id: "hand_unrest_b",
            displayName: "Hand Unrest B",
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
          G.market = ["test_action_foundry_shift", "market_civilized", "market_uncivilized"];
          G.players["0"].hand = ["hand_civilized", "hand_uncivilized"];
          G.unrestPile = ["test_unrest_1"];
          G.cardDb.hand_civilized = { ...G.cardDb.test_action_archive_survey, id: "hand_civilized", displayName: "Hand Civilized", suit: "civilized" };
          G.cardDb.market_civilized = { ...G.cardDb.test_action_scholars_circle, id: "market_civilized", displayName: "Market Civilized", suit: "civilized" };
          G.cardDb.hand_uncivilized = { ...G.cardDb.test_action_archive_survey, id: "hand_uncivilized", displayName: "Hand Uncivilized", suit: "uncivilized" };
          G.cardDb.market_uncivilized = { ...G.cardDb.test_action_scholars_circle, id: "market_uncivilized", displayName: "Market Uncivilized", suit: "uncivilized" };
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

  it("failed before-acquire hooks stop acquisition before state changes", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].resources.materials = 1;
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "before_acquire",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook before_acquire #0 failed.")).toBe(true);
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
      uncivilizedDeck: ["test_action_lineage_record", "visible_tributary_bottom"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.marketDeckBottomCards = { uncivilizedDeck: "visible_tributary_bottom" };
    G.unrestPile = ["test_unrest_1"];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_archive_survey", "test_action_risk_audit", "test_action_lineage_record"]);
    expect(G.marketDecks.uncivilizedDeck).toEqual(["visible_tributary_bottom"]);
    expect(G.marketDeckBottomCards.uncivilizedDeck).toBe("visible_tributary_bottom");
    expect(G.marketDecks.mainDeck).toEqual(["test_action_civic_assembly"]);
  });

  it("refills later market slots from main when the matching small deck only has its face-up bottom card", () => {
    const G = createInitialState();
    G.market = ["test_action_archive_survey", "test_action_risk_audit", "test_action_foundry_shift"];
    G.marketDecks = {
      mainDeck: ["test_action_civic_assembly"],
      regionDeck: [],
      uncivilizedDeck: ["visible_tributary_bottom"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.marketDeckBottomCards = { uncivilizedDeck: "visible_tributary_bottom" };
    G.unrestPile = ["test_unrest_1"];
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.cardDb.visible_tributary_bottom = {
      ...G.cardDb.test_action_archive_survey,
      id: "visible_tributary_bottom",
      displayName: "Visible Tributary Bottom",
      suit: "tributary",
      setupBannerSuit: "tributary"
    } as any;
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "test_action_foundry_shift");

    expect(G.market).toEqual(["test_action_archive_survey", "test_action_risk_audit", "test_action_civic_assembly"]);
    expect(G.marketDecks.uncivilizedDeck).toEqual(["visible_tributary_bottom"]);
    expect(G.marketDeckBottomCards.uncivilizedDeck).toBe("visible_tributary_bottom");
    expect(G.marketDecks.mainDeck).toEqual([]);
  });

  it("uses setup banner suit instead of primary suit when refilling later market slots", () => {
    const G = createInitialState();
    G.market = ["test_action_archive_survey", "test_action_risk_audit", "multi_banner_market"];
    G.marketDecks = {
      mainDeck: ["main_fallback"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: ["civilized_refill"],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    G.cardDb.multi_banner_market = {
      id: "multi_banner_market",
      displayName: "Multi Banner Market",
      type: "action",
      cardType: "action",
      suit: "multi",
      setupBannerSuit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    } as any;
    G.cardDb.civilized_refill = { ...G.cardDb.test_action_archive_survey, id: "civilized_refill", displayName: "Civilized Refill" };
    G.cardDb.main_fallback = { ...G.cardDb.test_action_foundry_shift, id: "main_fallback", displayName: "Main Fallback" };
    G.players["0"].resources.materials = 1;

    acquireCard({ G, ctx }, "multi_banner_market");

    expect(G.market).toEqual(["test_action_archive_survey", "test_action_risk_audit", "civilized_refill"]);
    expect(G.marketDecks.civilizedDeck).toEqual([]);
    expect(G.marketDecks.mainDeck).toEqual(["main_fallback"]);
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
    expect(G.players["0"].hand).toContain("alien_unrest");
    expect(G.log.some((entry) => entry.message === "SpentResourcePenalty(knowledge/unrest=1)")).toBe(true);
  });

  it("pays automatic choice costs before resolving benefits", () => {
    const G = createInitialState();
    G.resourceSupply = { materials: 0 };
    G.players["0"].resources.materials = 1;
    G.pendingChoice = {
      playerId: "0",
      sourceCardId: "paid_choice",
      choices: [[
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }
      ] as any]
    };

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.resourceSupply.materials).toBe(0);
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

  it("blocks unrelated moves while a pending Region continuation is unresolved", () => {
    const G = createInitialState();
    const card = "test_action_archive_survey";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].resources.materials = 1;
    G.market = ["test_action_foundry_shift"];
    G.pendingRegionChoiceContinuation = {
      playerId: "0",
      sourceCardId: "counted_region_source",
      op: "recall_region",
      cardIds: ["test_region"],
      count: 1
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
      "InvalidMove(playCard): pending_region_choice_continuation",
      "InvalidMove(acquireCard): pending_region_choice_continuation",
      "InvalidMove(endTurn): pending_region_choice_continuation"
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

  it("restores a pending Draw choice if its resume effects fail", () => {
    const G = createInitialState();
    G.players["0"].discard = ["test_action_foundry_shift"];
    G.players["0"].hand = [];
    G.pendingDrawChoice = {
      playerId: "0",
      sourceCardId: "drawer",
      source: "discard",
      cardIds: ["test_action_foundry_shift"],
      remainingCount: 1,
      resumeEffects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
    };

    resolveDrawChoice({ G, ctx }, "test_action_foundry_shift");

    expect(G.pendingDrawChoice).toEqual({
      playerId: "0",
      sourceCardId: "drawer",
      source: "discard",
      cardIds: ["test_action_foundry_shift"],
      remainingCount: 1,
      resumeEffects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
    });
    expect(G.players["0"].discard).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].hand).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveDrawChoice): resume_effect_failed(test_action_foundry_shift)");
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

  it("routes pending Find choices with a History destination through no-History discard replacement", () => {
    const G = createInitialState();
    G.players["0"].hand = ["found_card"];
    G.cardDb.found_card = {
      id: "found_card",
      displayName: "Found Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_history", "discard_instead_of_history"] as any,
      zoneOverrides: [{ op: "disable_history", replacementBehavior: "discard" } as any]
    };
    G.pendingFindChoice = {
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["found_card"],
      destination: "history"
    };

    resolveFindChoice({ G, ctx }, "found_card");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].discard).toEqual(["found_card"]);
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(finder/found_card->discard)");
  });

  it("infers no-History discard replacement from imported ruleset tags", () => {
    const G = createInitialState();
    G.players["0"].hand = ["found_card"];
    G.cardDb.found_card = {
      id: "found_card",
      displayName: "Found Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_history", "discard_instead_of_history"] as any,
      zoneOverrides: []
    };
    G.pendingFindChoice = {
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["found_card"],
      destination: "history"
    };

    resolveFindChoice({ G, ctx }, "found_card");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].discard).toEqual(["found_card"]);
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(finder/found_card->discard)");
  });

  it("resolves pending Find choices selected from a nation History replacement zone", () => {
    const G = createInitialState();
    G.players["0"].sideAreas = { sunken: ["found_card"] };
    G.cardDb.found_card = {
      id: "found_card",
      displayName: "Found Card",
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
      cardIds: ["found_card"],
      destination: "discard"
    };

    resolveFindChoice({ G, ctx }, "found_card");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].sideAreas?.sunken).toEqual([]);
    expect(G.players["0"].discard).toEqual(["found_card"]);
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(finder/found_card->discard)");
  });

  it("plays Find text that sources History from a nation History replacement zone", () => {
    const G = createInitialState();
    const finder = "test_action_archive_survey";
    G.players["0"].hand = [finder];
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: ["found_card"] };
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb[finder] = {
      ...G.cardDb[finder],
      effects: [{ trigger: "on_play", op: "find_card", sourceZones: ["history"], cardId: "found_card", destination: "discard" } as any]
    };
    G.cardDb.found_card = {
      id: "found_card",
      displayName: "Found Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
    };

    playCard({ G, ctx }, finder);

    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].sideAreas?.sunken).toEqual([]);
    expect(G.players["0"].discard).toEqual(["found_card", finder]);
    expect(G.players["0"].actionsRemaining).toBe(0);
    expect(G.players["0"].actionTokensAvailable).toBe(0);
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

  it("moves a pending Find host to History with garrisoned cards and resource reactive timing", () => {
    const G = createInitialState();
    const hostCardId = "find_history_host";
    const childCardId = "find_history_child";
    const exhaustCardId = "find_history_resource_exhaust";
    G.players["0"].playArea = [hostCardId, exhaustCardId];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = {
      [hostCardId]: { resources: { materials: 2 }, garrisonedCardIds: [childCardId] },
      [childCardId]: { resources: { goods: 1 } }
    };
    G.cardDb[hostCardId] = {
      id: hostCardId,
      displayName: "Find History Host",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[childCardId] = {
      id: childCardId,
      displayName: "Find History Child",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Find History Resource Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "materials" }
      } as any]
    };
    G.pendingFindChoice = {
      playerId: "0",
      sourceCardId: "find_history_picker",
      cardIds: [hostCardId],
      destination: "history",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any;

    resolveFindChoice({ G, ctx }, hostCardId);

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].playArea).not.toContain(hostCardId);
    expect(G.players["0"].history).toEqual([hostCardId, childCardId]);
    expect(G.cardStates?.[hostCardId]?.garrisonedCardIds ?? []).toEqual([]);
    expect(G.cardStates?.[childCardId]).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: "find_history_picker",
      trigger: "after_gain_resource",
      resource: "materials"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].history).toEqual([hostCardId, childCardId]);
  });

  it("matches source-suited reactive Exhausts against pending Find child resources moved with a host", () => {
    const G = createInitialState();
    const hostCardId = "pending_find_child_source_suit_host";
    const childCardId = "pending_find_child_source_suit_child";
    const exhaustCardId = "pending_find_child_source_suit_exhaust";
    G.players["0"].playArea = [hostCardId, exhaustCardId];
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = {
      [hostCardId]: { garrisonedCardIds: [childCardId] },
      [childCardId]: { resources: { knowledge: 1 } }
    };
    G.cardDb[hostCardId] = {
      id: hostCardId,
      displayName: "Pending Find Child Source Suit Host",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[childCardId] = {
      id: childCardId,
      displayName: "Pending Find Child Source Suit Child",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Pending Find Child Source Suit Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };
    G.pendingFindChoice = {
      playerId: "0",
      sourceCardId: "pending_find_source",
      cardIds: [hostCardId],
      destination: "history",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    } as any;

    resolveFindChoice({ G, ctx }, hostCardId);

    expect(G.players["0"].history).toEqual([hostCardId, childCardId]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: "pending_find_source",
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: childCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("matches source-suited reactive Exhausts against a garrisoned card that released resources", () => {
    const G = createInitialState();
    const finderCardId = "find_garrison_source_suit_picker";
    const hostCardId = "find_garrison_source_suit_host";
    const childCardId = "find_garrison_source_suit_child";
    const exhaustCardId = "find_garrison_source_suit_exhaust";
    G.players["0"].hand = [finderCardId];
    G.players["0"].playArea = [hostCardId, exhaustCardId];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = {
      [hostCardId]: { garrisonedCardIds: [childCardId] },
      [childCardId]: { resources: { knowledge: 1 } }
    };
    G.cardDb[finderCardId] = {
      id: finderCardId,
      displayName: "Find Garrison Source Suit Picker",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [
        { trigger: "on_play", op: "find_card", sourceZones: ["garrison"], cardId: childCardId, destination: "discard" } as any,
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
      ]
    };
    G.cardDb[hostCardId] = {
      id: hostCardId,
      displayName: "Find Garrison Source Suit Host",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[childCardId] = {
      id: childCardId,
      displayName: "Find Garrison Source Suit Child",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Find Garrison Source Suit Exhaust",
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
        reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "civilized" }
      } as any]
    };

    playCard({ G, ctx }, finderCardId);

    expect(G.players["0"].discard).toContain(childCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId: finderCardId,
      trigger: "after_gain_resource",
      resource: "knowledge"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].discard).toContain(finderCardId);
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
    G.players["0"].playArea = ["reactive_exile_choice_unrest_exhaust"];
    G.players["0"].resources.influence = 0;
    G.players["0"].resources.knowledge = 0;
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
    G.cardDb.reactive_exile_choice_unrest_exhaust = {
      id: "reactive_exile_choice_unrest_exhaust",
      displayName: "Reactive Exile Choice Unrest Exhaust",
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
        reactive: { trigger: "after_take_unrest", target: "self" }
      } as any]
    };
    G.unrestPile = ["test_unrest_1"];
    G.pendingAcquireChoice = {
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "exile",
      cardIds: ["exiled_action"],
      destination: "hand",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    resolveAcquireChoice({ G, ctx }, "exiled_action");

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].hand).toContain("exiled_action");
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["reactive_exile_choice_unrest_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "exile_picker",
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });

    resolveReactiveExhaustChoice({ G, ctx }, "reactive_exile_choice_unrest_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("resumes a pending Exile acquisition choice after required Unrest creates a Nation choice", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_action"];
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.resourceSupply = { materials: 1, knowledge: 1, influence: 0, unrest: 0, goods: 1 };
    G.cardDb.exiled_action = {
      id: "exiled_action",
      displayName: "Exiled Action",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_gain_unrest",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
          } as any]
        }]
      }
    } as any;
    G.unrestPile = ["test_unrest_1"];
    G.pendingAcquireChoice = {
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "exile",
      cardIds: ["exiled_action"],
      destination: "hand",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    resolveAcquireChoice({ G, ctx }, "exiled_action");

    expect(G.players["0"].hand).toContain("exiled_action");
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("failed required-Unrest hooks during Exile acquisition restore the card play state", () => {
    const G = createInitialState();
    const card = "failed_exile_unrest_hook_card";
    G.players["0"].hand = [card];
    G.players["0"].exile = ["exiled_action"];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb[card] = {
      id: card,
      displayName: "Failed Exile Unrest Hook Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_play",
        op: "acquire_card",
        source: "exile",
        cardId: "exiled_action",
        count: 1
      } as any]
    };
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
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_gain_unrest",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].exile).toEqual(["exiled_action"]);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #0 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): on_play_effect_failed(${card})`);
  });

  it("failed after-gain-Unrest hooks during Take Unrest restore the card play state", () => {
    const G = createInitialState();
    const card = "failed_take_unrest_hook_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb[card] = {
      id: card,
      displayName: "Failed Take Unrest Hook Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]
    };
    G.unrestPile = ["test_unrest_1"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_gain_unrest",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    playCard({ G, ctx }, card);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #0 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): on_play_effect_failed(${card})`);
  });

  it("failed resumed after-gain-Unrest hooks during Take Unrest restore the card play state", () => {
    const G = createInitialState();
    const card = "failed_resumed_take_unrest_hook_card";
    G.players["0"].hand = [card];
    G.players["0"].actionsRemaining = 1;
    G.players["0"].actionTokensAvailable = 1;
    G.cardDb[card] = {
      id: card,
      displayName: "Failed Resumed Take Unrest Hook Card",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_play", op: "take_unrest", count: 2 } as any]
    };
    G.unrestPile = ["test_unrest_1", "test_unrest_2"];
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [
        {
          trigger: "after_gain_unrest",
          condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "test_unrest_1" },
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
          } as any]
        } as any,
        {
          trigger: "after_gain_unrest",
          condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "test_unrest_2" },
          effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
        } as any
      ]
    };

    playCard({ G, ctx }, card);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingUnrestTakeContinuation).toMatchObject({
      playerId: "0",
      recipientPlayerIds: ["0"],
      countPerPlayer: 2,
      recipientIndex: 0,
      cardIndex: 1,
      taken: 1
    });

    resolveChoice({ G, ctx }, 0);

    expect(G.players["0"].hand).toEqual([card]);
    expect(G.players["0"].playArea).not.toContain(card);
    expect(G.players["0"].discard).not.toContain(card);
    expect(G.players["0"].actionsRemaining).toBe(1);
    expect(G.players["0"].actionTokensAvailable).toBe(1);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.unrestPile).toEqual(["test_unrest_1", "test_unrest_2"]);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingUnrestTakeContinuation).toBeUndefined();
    expect(G.players["0"].hand).not.toContain("test_unrest_1");
    expect(G.players["0"].hand).not.toContain("test_unrest_2");
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #1 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe(`InvalidMove(playCard): on_play_effect_failed(${card})`);
  });

  it("failed after-gain-Unrest hooks during short-pile allocation restore the allocation choice", () => {
    const G = createInitialState();
    G.unrestPile = ["test_unrest_1"];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.pendingUnrestAllocationChoice = {
      playerId: "0",
      recipientPlayerIds: ["0", "1"],
      countPerPlayer: 1,
      availableUnrestCardIds: ["test_unrest_1"]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_gain_unrest",
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    resolveUnrestAllocationChoice({ G, ctx }, ["0"]);

    expect(G.pendingUnrestAllocationChoice).toEqual({
      playerId: "0",
      recipientPlayerIds: ["0", "1"],
      countPerPlayer: 1,
      availableUnrestCardIds: ["test_unrest_1"]
    });
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["1"].hand).toEqual([]);
    expect(G.pendingUnrestAllocationResolution).toBeUndefined();
    expect(G.gameover).toBeUndefined();
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #0 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveUnrestAllocationChoice): unrest_allocation_failed");
  });

  it("failed resumed after-gain-Unrest hooks during short-pile allocation restore the allocation choice", () => {
    const G = createInitialState();
    G.unrestPile = [];
    G.players["0"].hand = [];
    G.players["1"].hand = [];
    G.pendingUnrestAllocationChoice = {
      playerId: "0",
      recipientPlayerIds: ["0", "1"],
      countPerPlayer: 1,
      availableUnrestCardIds: ["test_unrest_1", "test_unrest_2"]
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      hookRules: [{
        trigger: "after_gain_unrest",
        condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "test_unrest_1" },
        effects: [{
          trigger: "on_play",
          op: "choose_one",
          choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
        } as any]
      } as any]
    };
    G.activeNationRulesets!["1"] = {
      ...G.activeNationRulesets!["1"],
      hookRules: [{
        trigger: "after_gain_unrest",
        condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "test_unrest_2" },
        effects: [{ trigger: "on_play", op: "unsupported_private_effect" } as any]
      } as any]
    };

    resolveUnrestAllocationChoice({ G, ctx }, ["0", "1"]);

    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingUnrestAllocationResolution).toMatchObject({
      playerId: "0",
      recipientPlayerIds: ["0", "1"],
      availableUnrestCardIds: ["test_unrest_1", "test_unrest_2"],
      nextIndex: 1
    });
    resolveChoice({ G, ctx }, 0);

    expect(G.pendingUnrestAllocationChoice).toEqual({
      playerId: "0",
      recipientPlayerIds: ["0", "1"],
      countPerPlayer: 1,
      availableUnrestCardIds: ["test_unrest_1", "test_unrest_2"]
    });
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["1"].hand).toEqual([]);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingUnrestAllocationResolution).toBeUndefined();
    expect(G.gameover).toBeUndefined();
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #0 failed.")).toBe(true);
    expect(G.log.at(-1)?.message).toBe("InvalidMove(resolveUnrestAllocationChoice): unrest_allocation_failed");
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

  it("pauses a selected Market gain for resource reactive Exhausts before resume effects", () => {
    const G = createInitialState();
    G.market = ["market_region", "market_civilized"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketResources = { market_civilized: { knowledge: 1 } };
    G.unrestPile = ["test_unrest_1"];
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
    G.cardDb.market_choice_reactive_exhaust = {
      id: "market_choice_reactive_exhaust",
      displayName: "Market Choice Reactive Exhaust",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{
        trigger: "on_exhaust",
        op: "gain_resource",
        resource: "materials",
        amount: 1,
        reactive: { trigger: "after_gain_resource", resource: "knowledge" }
      } as any]
    };
    G.players["0"].playArea = ["market_choice_reactive_exhaust"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    G.pendingMarketCardChoice = {
      playerId: "0",
      sourceCardId: "market_gain_source",
      op: "gain_card",
      cardIds: ["market_region", "market_civilized"],
      destination: "discard",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 } as any]
    };

    resolveMarketCardChoice({ G, ctx }, "market_civilized");

    expect(G.players["0"].discard).toContain("market_civilized");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["market_choice_reactive_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "market_gain_source",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(G.pendingMarketMoveEffectResolution).toMatchObject({
      playerId: "0",
      sourceCardId: "market_gain_source",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
    });

    resolveReactiveExhaustChoice({ G, ctx }, "market_choice_reactive_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.pendingMarketMoveEffectResolution).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.influence).toBe(1);
  });

  it("resumes a pending Market acquisition choice after tucked Unrest creates a Nation choice", () => {
    const G = createInitialState();
    G.market = ["market_civilized", "market_uncivilized"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketUnrest = { market_civilized: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];
    G.resourceSupply = { materials: 1, knowledge: 1, influence: 0, unrest: 0, goods: 1 };
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardDb.market_civilized = {
      id: "market_civilized",
      displayName: "Market Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "materials", amount: 1 } as any]
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
    G.cardDb.test_unrest_1 = {
      id: "test_unrest_1",
      displayName: "Tucked Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb.test_unrest_2 = {
      id: "test_unrest_2",
      displayName: "Refill Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_gain_unrest",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
          } as any]
        }]
      }
    } as any;
    G.pendingAcquireChoice = {
      playerId: "0",
      sourceCardId: "market_picker",
      source: "market",
      cardIds: ["market_civilized"],
      destination: "hand",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    resolveAcquireChoice({ G, ctx }, "market_civilized");

    expect(G.players["0"].hand).toContain("market_civilized");
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
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

  it("resolves a pending History Exile choice from a nation History replacement zone", () => {
    const G = createInitialState();
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: ["history_card"] };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
    };
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
    expect(G.players["0"].sideAreas?.sunken).toEqual([]);
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
    G.market = ["market_civilized", "market_civilized_b"];
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

  it("stops pending Exile acquisition cleanly when required Unrest causes Collapse", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_civilized"];
    G.unrestPile = [];
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
    G.pendingAcquireChoice = {
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "exile",
      cardIds: ["exiled_civilized"],
      destination: "hand",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any;

    resolveAcquireChoice({ G, ctx }, "exiled_civilized");

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].exile).toEqual(["exiled_civilized"]);
    expect(G.players["0"].hand).not.toContain("exiled_civilized");
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message === "InvalidMove(resolveAcquireChoice): acquire_choice_failed(exiled_civilized)")).toBe(false);
    expect(G.log.some((entry) => entry.message === "AcquireChoiceResolved(exile_picker/exiled_civilized)")).toBe(false);
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

  it("refills imported market suit icons from the matching small deck", () => {
    const G = createInitialState();
    G.market = ["main_slot_a", "main_slot_b", "imported_civilized"];
    G.marketDecks = {
      mainDeck: ["main_refill"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: ["civilized_refill"],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    G.players["0"].resources.materials = 1;
    for (const id of ["main_slot_a", "main_slot_b", "main_refill", "civilized_refill"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "none",
        cost: 1,
        tags: [],
        effects: []
      };
    }
    G.cardDb.imported_civilized = {
      id: "imported_civilized",
      displayName: "Imported Civilized",
      type: "action",
      cardType: "action",
      suit: "none",
      setupBannerSuit: "none",
      cost: 1,
      tags: ["suit:civilized"],
      effects: []
    };

    acquireCard({ G, ctx }, "imported_civilized");

    expect(G.market).toEqual(["main_slot_a", "main_slot_b", "civilized_refill"]);
    expect(G.marketDecks.civilizedDeck).toEqual([]);
    expect(G.marketDecks.mainDeck).toEqual(["main_refill"]);
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

  it("resolves the selected pending public setup Exile Break Through choice", () => {
    const G = createInitialState();
    G.cardDb.setup_exiled_civilized = {
      id: "setup_exiled_civilized",
      displayName: "Setup Exiled Civilized",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        cardIds: ["setup_exiled_civilized"],
        visibility: "public",
        scoresAsOwned: false
      }
    };
    G.unrestPile = ["test_unrest_1"];
    G.pendingBreakThroughChoice = {
      playerId: "0",
      sourceCardId: "exile_breaker",
      source: "exile",
      suit: "civilized",
      cardIds: ["setup_exiled_civilized"]
    };

    resolveBreakThroughChoice({ G, ctx }, "setup_exiled_civilized");

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.players["0"].hand).toContain("setup_exiled_civilized");
    expect(G.players["0"].discard).not.toContain("test_unrest_1");
    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.log.at(-1)?.message).toBe("BreakThroughChoiceResolved(exile_breaker/setup_exiled_civilized)");
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

  it("pauses counted pending Region choices for reactive Exhaust windows before the next Region selection", () => {
    const G = createInitialState();
    const firstRegion = "counted_reactive_region_one";
    const secondRegion = "counted_reactive_region_two";
    const exhaustCardId = "counted_reactive_region_exhaust";
    G.players["0"].playArea = [firstRegion, secondRegion, exhaustCardId];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardStates = { [firstRegion]: { resources: { materials: 1 } } };
    for (const id of [firstRegion, secondRegion]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "region",
        cardType: "region",
        suit: "region",
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.cardDb[exhaustCardId] = {
      id: exhaustCardId,
      displayName: "Counted Reactive Region Exhaust",
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
    };
    G.pendingRegionChoice = {
      playerId: "0",
      sourceCardId: "counted_recall_source",
      op: "recall_region",
      cardIds: [firstRegion, secondRegion],
      count: 2,
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 } as any]
    };

    resolveRegionChoice({ G, ctx }, firstRegion);

    expect(G.players["0"].hand).toContain(firstRegion);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [exhaustCardId],
      sourceCardId: "counted_recall_source",
      trigger: "after_gain_resource",
      resource: "materials"
    });

    resolveReactiveExhaustChoice({ G, ctx }, exhaustCardId);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.pendingRegionChoice).toMatchObject({
      playerId: "0",
      sourceCardId: "counted_recall_source",
      op: "recall_region",
      cardIds: [secondRegion],
      count: 1
    });

    resolveRegionChoice({ G, ctx }, secondRegion);

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(expect.arrayContaining([firstRegion, secondRegion]));
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.log.at(-1)?.message).toBe(`RegionChoiceResolved(counted_recall_source/recall_region/${secondRegion})`);
  });
});
