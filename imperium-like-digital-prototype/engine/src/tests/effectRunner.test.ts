import { describe, expect, it } from "vitest";
import { runEffects } from "../cards/effectRunner";
import { createInitialState } from "../game/initialState";
import { tuckUnrestUnderMarketCard } from "../game/marketResources";
import { payResourceCosts } from "../game/payments";
import * as moves from "../game/moves";
import { resolveAcquireChoice, resolveChoice, resolveExileChoice, resolveFindChoice, resolveLookOrderChoice, resolveLookTakeChoice, resolveRegionChoice } from "../game/moves";
import { cardHasSuitIconForPlayer } from "../game/suitIcons";
import type { GameState } from "../game/state";
import { resolvePendingUnrestAllocationChoice } from "../game/unrest";
import type { GameOptions } from "../options/gameOptions";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { card, cardDb } from "./commonsTestFixtures";

describe("effectRunner", () => {
  it("tucking Market Unrest mirrors attachments into structured Market slots", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketUnrest = {};
    G.unrestPile = ["test_unrest_1"];
    G.marketSlots = [{ index: 0, cardId: "test_action_foundry_shift", resourceMarkers: {}, attachedUnrestCardIds: [] }];

    tuckUnrestUnderMarketCard(G, "0", "test_action_foundry_shift");

    expect(G.marketUnrest.test_action_foundry_shift).toEqual(["test_unrest_1"]);
    expect(G.marketSlots[0]?.attachedUnrestCardIds).toEqual(["test_unrest_1"]);
  });

  it("does not tuck Market Unrest under imported cards with a Region suit icon", () => {
    const G = createInitialState();
    G.market = ["tagged_region_action"];
    G.marketUnrest = {};
    G.unrestPile = ["test_unrest_1"];
    G.cardDb.tagged_region_action = {
      ...G.cardDb.test_action_foundry_shift,
      id: "tagged_region_action",
      suit: "civilized",
      setupBannerSuit: "civilized",
      tags: ["suit:region"]
    };
    G.marketSlots = [{ index: 0, cardId: "tagged_region_action", resourceMarkers: {}, attachedUnrestCardIds: [] }];

    tuckUnrestUnderMarketCard(G, "0", "tagged_region_action");

    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.marketUnrest.tagged_region_action).toBeUndefined();
    expect(G.marketSlots[0]?.attachedUnrestCardIds).toEqual([]);
  });

  it("does not tuck Market Unrest under imported cards with an Unrest suit icon", () => {
    const G = createInitialState();
    G.market = ["tagged_unrest_action"];
    G.marketUnrest = {};
    G.unrestPile = ["test_unrest_1"];
    G.cardDb.tagged_unrest_action = {
      ...G.cardDb.test_action_foundry_shift,
      id: "tagged_unrest_action",
      suit: "civilized",
      setupBannerSuit: "civilized",
      tags: ["suit:unrest"]
    };
    G.marketSlots = [{ index: 0, cardId: "tagged_unrest_action", resourceMarkers: {}, attachedUnrestCardIds: [] }];

    tuckUnrestUnderMarketCard(G, "0", "tagged_unrest_action");

    expect(G.unrestPile).toEqual(["test_unrest_1"]);
    expect(G.marketUnrest.tagged_unrest_action).toBeUndefined();
    expect(G.marketSlots[0]?.attachedUnrestCardIds).toEqual([]);
  });

  it("draws from deck", () => {
    const G = createInitialState();
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "draw", count: 1 }]);
    expect(G.players["0"].hand.length).toBe(1);
  });

  it("opens an up-to-count Draw choice that can resolve zero, partial, or full counts", () => {
    const zero = createInitialState();
    zero.players["0"].deck = ["draw_a", "draw_b"];
    zero.players["0"].hand = [];
    zero.cardDb.draw_a = { ...zero.cardDb.test_action_foundry_shift, id: "draw_a" };
    zero.cardDb.draw_b = { ...zero.cardDb.test_action_foundry_shift, id: "draw_b" };

    runEffects({ G: zero, playerId: "0", selfCardId: "up_to_draw" }, [
      { trigger: "on_play", op: "draw", count: 2, upTo: true } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);

    expect(zero.pendingChoice?.choices).toEqual([
      [],
      [{ trigger: "on_play", op: "draw", count: 1, source: undefined, targetPlayerIds: undefined, targetPlayerScope: undefined, optionalForTargets: undefined, upTo: undefined }],
      [{ trigger: "on_play", op: "draw", count: 2, source: undefined, targetPlayerIds: undefined, targetPlayerScope: undefined, optionalForTargets: undefined, upTo: undefined }]
    ]);

    resolveChoice({ G: zero, ctx: { currentPlayer: "0" } as any }, 0);

    expect(zero.players["0"].hand).toEqual([]);
    expect(zero.players["0"].resources.materials).toBe(1);

    const partial = createInitialState();
    partial.players["0"].deck = ["draw_a", "draw_b"];
    partial.players["0"].hand = [];
    partial.cardDb.draw_a = { ...partial.cardDb.test_action_foundry_shift, id: "draw_a" };
    partial.cardDb.draw_b = { ...partial.cardDb.test_action_foundry_shift, id: "draw_b" };

    runEffects({ G: partial, playerId: "0", selfCardId: "up_to_draw" }, [
      { trigger: "on_play", op: "draw", count: 2, upTo: true } as any
    ]);
    resolveChoice({ G: partial, ctx: { currentPlayer: "0" } as any }, 1);

    expect(partial.players["0"].hand).toEqual(["draw_a"]);
    expect(partial.players["0"].deck).toEqual(["draw_b"]);
  });

  it("opens an up-to-count Draw-if-able choice without reshuffling", () => {
    const G = createInitialState();
    G.players["0"].deck = ["draw_a", "draw_b"];
    G.players["0"].discard = ["discard_a"];
    G.players["0"].hand = [];
    G.cardDb.draw_a = { ...G.cardDb.test_action_foundry_shift, id: "draw_a" };
    G.cardDb.draw_b = { ...G.cardDb.test_action_foundry_shift, id: "draw_b" };
    G.cardDb.discard_a = { ...G.cardDb.test_action_foundry_shift, id: "discard_a" };

    runEffects({ G, playerId: "0", selfCardId: "up_to_draw_if_able" }, [
      { trigger: "on_play", op: "draw_if_able", count: 3, upTo: true } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);

    expect(G.pendingChoice?.choices).toEqual([
      [],
      [{ trigger: "on_play", op: "draw_if_able", count: 1, upTo: undefined }],
      [{ trigger: "on_play", op: "draw_if_able", count: 2, upTo: undefined }]
    ]);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 2);

    expect(G.players["0"].hand).toEqual(["draw_a", "draw_b"]);
    expect(G.players["0"].deck).toEqual([]);
    expect(G.players["0"].discard).toEqual(["discard_a"]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("opens per-target optional Draw choices for dynamic player scopes", () => {
    const G = createInitialState();
    G.players["0"].deck = [];
    G.players["1"].deck = ["target_draw_card"];
    G.players["1"].hand = [];
    G.cardDb.target_draw_card = {
      ...G.cardDb.test_action_foundry_shift,
      id: "target_draw_card",
      displayName: "Target Draw Card"
    };

    runEffects({ G, playerId: "0", selfCardId: "scope_draw" }, [
      { trigger: "on_play", op: "draw", count: 1, targetPlayerScope: "others", optionalForTargets: true } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);

    expect(G.pendingChoice).toMatchObject({ playerId: "1", sourceCardId: "scope_draw" });
    expect(G.pendingChoice?.choices[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ trigger: "on_play", op: "draw", count: 1, optionalForTargets: false })
    ]));
    expect(G.pendingChoice?.choices[1]).toEqual([]);
    expect(G.players["1"].hand).toEqual([]);

    resolveChoice({ G, ctx: { currentPlayer: "1" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["1"].hand).toEqual(["target_draw_card"]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("lets protected players ignore targeted Attack effects", () => {
    const G = createInitialState();
    G.unrestPile = ["attack_unrest"];
    G.cardDb.attack_unrest = {
      id: "attack_unrest",
      displayName: "Attack Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb.attack_protection_marker = {
      id: "attack_protection_marker",
      displayName: "Attack Protection Marker",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: ["attack_protection"],
      effects: []
    };
    G.players["1"].playArea = ["attack_protection_marker"];

    const result = runEffects({ G, playerId: "0", selfCardId: "targeted_attack_source" }, [
      { trigger: "on_play", op: "take_unrest", targetPlayerIds: ["1"], count: 1, attackTargeted: true } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["1"].hand).toEqual([]);
    expect(G.unrestPile).toEqual(["attack_unrest"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.some((entry) => entry.message === "AttackEffectIgnored(targeted_attack_source/player=1/take_unrest)")).toBe(true);
  });

  it("lets protected players ignore targeted resource-steal Attack effects", () => {
    const G = createInitialState();
    G.cardDb.attack_protection_marker = {
      id: "attack_protection_marker",
      displayName: "Attack Protection Marker",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: ["attack_protection"],
      effects: []
    };
    G.players["1"].playArea = ["attack_protection_marker"];
    G.players["1"].resources.materials = 2;
    G.players["2"] = JSON.parse(JSON.stringify(G.players["1"]));
    G.players["2"].playArea = [];
    G.players["2"].resources.materials = 2;

    const result = runEffects({ G, playerId: "0", selfCardId: "targeted_attack_source" }, [
      { trigger: "on_play", op: "steal_resource", fromPlayerIds: ["1", "2"], resource: "materials", amount: 1, attackTargeted: true } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["1"].resources.materials).toBe(2);
    expect(G.players["2"].resources.materials).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.some((entry) => entry.message === "AttackEffectIgnored(targeted_attack_source/player=1/steal_resource)")).toBe(true);
  });

  it("does not let attack protection cancel non-card nation effects", () => {
    const G = createInitialState();
    G.unrestPile = ["nation_unrest"];
    G.cardDb.nation_unrest = {
      id: "nation_unrest",
      displayName: "Nation Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.players["1"].attackProtected = true;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "take_unrest", targetPlayerIds: ["1"], count: 1, attackTargeted: true } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["1"].hand).toEqual(["nation_unrest"]);
    expect(G.log.some((entry) => entry.message.includes("AttackEffectIgnored"))).toBe(false);
  });

  it("accepts rulebook resource aliases at runtime", () => {
    const G = createInitialState();
    G.resourceSupply = { materials: 0, knowledge: 1, influence: 1, unrest: 0, goods: 0 };

    runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "progress", amount: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "population", amount: 1 } as any
    ]);

    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.resourceSupply.knowledge).toBe(0);
    expect(G.resourceSupply.influence).toBe(0);
    expect((G.players["0"].resources as any).progress).toBeUndefined();
    expect((G.players["0"].resources as any).population).toBeUndefined();
  });

  it("matches reactive Exhaust resource conditions against canonical rulebook aliases", () => {
    const G = createInitialState();
    G.cardDb.alias_reactive_exhaust = {
      id: "alias_reactive_exhaust",
      displayName: "Alias Reactive Exhaust",
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
    G.players["0"].playArea = ["alias_reactive_exhaust"];

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "progress", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["alias_reactive_exhaust"],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
  });

  it("uses rulebook resource aliases for conditional and movement effects", () => {
    const G = createInitialState();
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.influence = 1;
    G.players["1"].resources.knowledge = 1;

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "conditional_resource_at_least",
      resource: "progress",
      atLeast: 1,
      then: [
        { trigger: "on_play", op: "return_resource", resource: "population", amount: 1 },
        { trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "progress", amount: 1 }
      ],
      else: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    } as any]);

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect((G.players["0"].resources as any).population).toBeUndefined();
    expect((G.players["0"].resources as any).progress).toBeUndefined();
    expect((G.players["1"].resources as any).progress).toBeUndefined();
  });

  it("uses canonical effect resources with rulebook-named player resource pools", () => {
    const G = createInitialState();
    G.players["0"].resources = { materials: 0, goods: 0, unrest: 0, progress: 1, population: 1 } as any;
    G.players["1"].resources = { materials: 0, goods: 0, unrest: 0, progress: 1 } as any;

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "conditional_resource_at_least",
      resource: "knowledge",
      atLeast: 1,
      then: [
        { trigger: "on_play", op: "return_resource", resource: "influence", amount: 1 },
        { trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "knowledge", amount: 1 }
      ],
      else: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    } as any]);

    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect((G.players["0"].resources as any).population).toBeUndefined();
    expect((G.players["0"].resources as any).progress).toBeUndefined();
    expect((G.players["1"].resources as any).progress).toBeUndefined();
  });

  it("does not resolve new effects behind a pending Break-through continuation", () => {
    const G = createInitialState();
    G.pendingBreakThroughEffectResolution = {
      playerId: "0",
      gainedCardIds: ["breakthrough_card"],
      resumeEffects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingBreakThroughEffectResolution).toBeDefined();
  });

  it("does not resolve new effects behind a pending Acquire-effect continuation", () => {
    const G = createInitialState();
    G.pendingAcquireEffectResolution = {
      playerId: "0",
      cardId: "acquired_card",
      resumeEffects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingAcquireEffectResolution).toBeDefined();
  });

  it("does not resolve new effects behind a pending Market-move continuation", () => {
    const G = createInitialState();
    G.pendingMarketMoveEffectResolution = {
      playerId: "0",
      resumeEffects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingMarketMoveEffectResolution).toBeDefined();
  });

  it("does not resolve new effects behind a pending Region-choice continuation", () => {
    const G = createInitialState();
    G.pendingRegionChoiceContinuation = {
      playerId: "0",
      sourceCardId: "counted_region_source",
      op: "recall_region",
      cardIds: ["remaining_region"],
      count: 1
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.pendingRegionChoiceContinuation).toBeDefined();
  });

  it("treats one suit icon as another for the current player and removes the original icon", () => {
    const G = createInitialState();
    G.cardDb.treat_target = {
      id: "treat_target",
      displayName: "Treat Target",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["civilized"] }
    ])).toBe(true);

    expect(cardHasSuitIconForPlayer(G, "0", G.cardDb.treat_target, "civilized")).toBe(true);
    expect(cardHasSuitIconForPlayer(G, "0", G.cardDb.treat_target, "uncivilized")).toBe(false);
    expect(cardHasSuitIconForPlayer(G, "1", G.cardDb.treat_target, "uncivilized")).toBe(true);
  });

  it("uses treated suit icons when resolving later effects in the same card text", () => {
    const G = createInitialState();
    G.market = ["treated_market_card"];
    G.marketSlots = [];
    G.marketRefillPool = [];
    G.cardDb.treated_market_card = {
      id: "treated_market_card",
      displayName: "Treated Market Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["civilized"] },
      { trigger: "on_play", op: "acquire_card", count: 1, suit: "civilized", destination: "hand" }
    ])).toBe(true);

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("treated_market_card");
    expect(G.market).not.toContain("treated_market_card");
  });

  it("uses treated suit icons when finding cards by criteria", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].discard = ["treated_find_card"];
    G.cardDb.treated_find_card = {
      id: "treated_find_card",
      displayName: "Treated Find Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["civilized"] },
      { trigger: "on_play", op: "find_card", suit: "civilized", destination: "hand" }
    ])).toBe(true);

    expect(G.pendingFindChoice).toMatchObject({
      playerId: "0",
      cardIds: ["treated_find_card"],
      destination: "hand",
      shuffleZones: ["deck", "nationDeck"]
    });
    resolveFindChoice({ G, ctx: { currentPlayer: "0" } as any, random: { Number: () => 0 } as any }, "treated_find_card");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["treated_find_card"]);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(unknown/treated_find_card->hand)");
  });

  it("uses treated suit icons when exiling cards by criteria", () => {
    const G = createInitialState();
    G.market = ["treated_exile_card"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb.treated_exile_card = {
      id: "treated_exile_card",
      displayName: "Treated Exile Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    expect(runEffects({ G, playerId: "0", selfCardId: "treat_exiler" }, [
      { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["civilized"] },
      { trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" }
    ])).toBe(true);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "treat_exiler",
      source: "market",
      cardIds: ["treated_exile_card"]
    });
    resolveExileChoice({ G, ctx: { currentPlayer: "0" } as any }, "treated_exile_card");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.market).toEqual([]);
    expect(G.players["0"].exile).toEqual(["treated_exile_card"]);
  });

  it("uses treated suit icons when gaining and taking market cards by criteria", () => {
    const G = createInitialState();
    G.market = ["treated_gain_card", "treated_take_card"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb.treated_gain_card = {
      id: "treated_gain_card",
      displayName: "Treated Gain Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.treated_take_card = {
      id: "treated_take_card",
      displayName: "Treated Take Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["civilized"] },
      { trigger: "on_play", op: "gain_card", source: "market", cardId: "treated_gain_card", suit: "civilized", count: 1, destination: "hand" } as any,
      { trigger: "on_play", op: "take_card", source: "market", cardId: "treated_take_card", suit: "civilized", count: 1, destination: "hand" } as any
    ])).toBe(true);

    expect(G.players["0"].hand).toContain("treated_gain_card");
    expect(G.players["0"].hand).toContain("treated_take_card");
    expect(G.market).toEqual([]);
  });

  it("uses treated suit icons when breaking through matching market cards", () => {
    const G = createInitialState();
    G.market = ["treated_break_card"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb.treated_break_card = {
      id: "treated_break_card",
      displayName: "Treated Break Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["civilized"] },
      { trigger: "on_play", op: "break_through", suit: "civilized", source: "market", count: 1 } as any
    ])).toBe(true);

    expect(G.players["0"].hand).toContain("treated_break_card");
    expect(G.market).toEqual([]);
  });

  it("uses treated suit icons when auto-resolving one Swap pair", () => {
    const G = createInitialState();
    G.players["0"].hand = ["treated_swap_hand"];
    G.market = ["treated_swap_market"];
    G.unrestPile = ["new_unrest"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb.treated_swap_hand = {
      id: "treated_swap_hand",
      displayName: "Treated Swap Hand",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.treated_swap_market = {
      id: "treated_swap_market",
      displayName: "Treated Swap Market",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };

    expect(runEffects({ G, playerId: "0", selfCardId: "treated_swap_source" }, [
      { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["civilized"] },
      { trigger: "on_play", op: "swap_card", sourceZone: "hand" } as any
    ])).toBe(true);

    expect(G.pendingSwapChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["treated_swap_market"]);
    expect(G.market).toEqual(["treated_swap_hand"]);
    expect(G.log.at(-1)?.message).toBe("CardSwapped(treated_swap_hand<->treated_swap_market/source=hand)");
  });

  it("uses treated suit icons for same-turn nation hook payload suit checks", () => {
    const G = createInitialState();
    G.market = ["treated_hook_card"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_acquire",
          condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "civilized" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;
    G.cardDb.treated_hook_card = {
      id: "treated_hook_card",
      displayName: "Treated Hook Card",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["civilized"] },
      { trigger: "on_play", op: "acquire_card", count: 1, cardId: "treated_hook_card", suit: "civilized", destination: "hand" } as any
    ])).toBe(true);

    expect(G.players["0"].hand).toContain("treated_hook_card");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(true);
  });

  it("pauses for player-selected discard costs before paying later costs", () => {
    const G = createInitialState();
    G.players["0"].hand = ["discard_a", "discard_b", "keep_card"];
    G.players["0"].resources.knowledge = 1;
    G.players["0"].resources.materials = 0;

    runEffects({ G, playerId: "0", selfCardId: "discard_cost_source" }, [
      { trigger: "on_play", op: "discard_cards", count: 2 } as any,
      { trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);

    expect(G.pendingDiscardChoice).toEqual({
      playerId: "0",
      sourceCardId: "discard_cost_source",
      cardIds: ["discard_a", "discard_b", "keep_card"],
      count: 2,
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "knowledge", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
      ]
    });
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);

    (moves as any).resolveDiscardChoice({ G, ctx: { currentPlayer: "0" } as any }, ["discard_b", "discard_a"]);

    expect(G.pendingDiscardChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["keep_card"]);
    expect(G.players["0"].discard).toEqual(["discard_b", "discard_a"]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("selected discard costs can filter eligible hand cards by suit and card type", () => {
    const G = createInitialState();
    G.players["0"].hand = ["eligible_region", "ineligible_action", "ineligible_region"];
    G.cardDb.eligible_region = { ...G.cardDb.test_action_foundry_shift, id: "eligible_region", suit: "region", cardType: "action" };
    G.cardDb.ineligible_action = { ...G.cardDb.test_action_foundry_shift, id: "ineligible_action", suit: "civilized", cardType: "action" };
    G.cardDb.ineligible_region = { ...G.cardDb.test_action_foundry_shift, id: "ineligible_region", suit: "region", cardType: "in_play" };

    runEffects({ G, playerId: "0", selfCardId: "discard_filter_source" }, [
      { trigger: "on_play", op: "discard_cards", count: 1, suit: "region", cardType: "action" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);

    expect(G.pendingDiscardChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["ineligible_action", "ineligible_region"]);
    expect(G.players["0"].discard).toEqual(["eligible_region"]);
    expect(G.players["0"].resources.materials).toBe(1);
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

  it("flips a one-card State in place when accession is added during reshuffle", () => {
    const G = createInitialState();
    G.players["0"].deck = [];
    G.players["0"].discard = [];
    G.players["0"].nationDeck = ["accession_card"];
    G.players["0"].accessionCardId = "accession_card";
    G.players["0"].stateArea = ["two_sided_state"];
    G.cardDb.two_sided_state = {
      id: "two_sided_state",
      displayName: "State",
      type: "state",
      cardType: "state",
      suit: "uncivilized",
      cost: 0,
      tags: ["barbarian"],
      effects: []
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

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "draw", count: 1 }]);

    expect(G.players["0"].stateArea).toEqual(["two_sided_state"]);
    expect(G.cardStates?.two_sided_state?.activeState).toBe("civilized");
    expect(G.players["0"].discard).toEqual([]);
    expect(G.players["0"].hand).toEqual(["accession_card"]);
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
    G.players["0"].discard = ["discard_a", "discard_b", "discard_c"];
    G.players["0"].hand = [];
    G.players["0"].resources.materials = 0;
    for (const id of ["discard_a", "discard_b", "discard_c"]) {
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
      cardIds: ["discard_a", "discard_c"],
      remainingCount: 1,
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });
    expect(G.players["0"].hand).toEqual(["discard_b"]);
    expect(G.players["0"].resources.materials).toBe(0);

    (moves as any).resolveDrawChoice({ G, ctx: { currentPlayer: "0" } as any }, "discard_a");

    expect(G.pendingDrawChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["discard_b", "discard_a"]);
    expect(G.players["0"].discard).toEqual(["discard_c"]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("keeps face-up Draw as an order choice even when all eligible cards must be drawn", () => {
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

    const result = runEffects({ G, playerId: "0", selfCardId: "discard_drawer" }, [
      { trigger: "on_play", op: "draw", count: 2, source: "discard" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingDrawChoice).toEqual({
      playerId: "0",
      sourceCardId: "discard_drawer",
      source: "discard",
      cardIds: ["discard_a", "discard_b"],
      remainingCount: 2,
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toEqual(["discard_a", "discard_b"]);
    expect(G.players["0"].resources.materials).toBe(0);

    (moves as any).resolveDrawChoice({ G, ctx: { currentPlayer: "0" } as any }, "discard_b");
    (moves as any).resolveDrawChoice({ G, ctx: { currentPlayer: "0" } as any }, "discard_a");

    expect(G.pendingDrawChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["discard_b", "discard_a"]);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("draw from a face-up Exile pile waits for an explicit choice even with one eligible card", () => {
    const G = createInitialState();
    G.players["0"].exile = [];
    G.players["0"].hand = [];
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        visibility: "public",
        scoresAsOwned: false,
        cardIds: ["setup_exiled_card"]
      }
    };
    G.cardDb.setup_exiled_card = {
      id: "setup_exiled_card",
      displayName: "Setup Exiled Card",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "exile_drawer" }, [
      { trigger: "on_play", op: "draw", count: 1, source: "exile" } as any
    ]);

    expect(G.pendingDrawChoice).toEqual({
      playerId: "0",
      sourceCardId: "exile_drawer",
      source: "exile",
      cardIds: ["setup_exiled_card"],
      remainingCount: 1
    });
    expect(G.players["0"].hand).toEqual([]);
    expect(G.globalSpecialZones.exile.cardIds).toEqual(["setup_exiled_card"]);
  });

  it("gain resource", () => {
    const G = createInitialState();
    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("gains resources for dynamic player scopes", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.players["1"].resources.materials = 0;
    G.players["2"] = { ...G.players["1"], id: "2", resources: { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 } } as any;

    runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2, targetPlayerScope: "all" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1, targetPlayerScope: "others" } as any
    ]);

    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["1"].resources.materials).toBe(3);
    expect(G.players["2"].resources.materials).toBe(3);
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

  it("does not resolve new effects behind pending scoring finalization", () => {
    const G = createInitialState();
    G.pendingScoringFinalization = { playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 };
    G.players["0"].resources.materials = 0;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingScoringFinalization).toEqual({ playerIds: ["0", "1"], scores: {}, nextPlayerIndex: 0 });
    expect(G.players["0"].resources.materials).toBe(0);
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

  it("opens a Progress-gain reactive Exhaust window after King of Kings rewards", () => {
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
    G.cardDb.king_progress_exhaust = {
      id: "king_progress_exhaust",
      displayName: "King Progress Exhaust",
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
    G.players["0"].stateArea = ["uncivilized_state"];
    G.players["0"].playArea = ["king_progress_exhaust"];
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_source" }, [
      { trigger: "on_play", op: "gain_fame", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(6);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["king_progress_exhaust"],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "knowledge",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
  });

  it("keeps later resource costs behind resource-gain reactive Exhaust windows", () => {
    const G = createInitialState();
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.influence = 0;
    G.players["0"].playArea = ["resource_gain_cost_window_exhaust"];
    G.players["0"].exhaustTokensAvailable = 1;
    G.cardDb.resource_gain_cost_window_exhaust = {
      id: "resource_gain_cost_window_exhaust",
      displayName: "Resource Gain Cost Window Exhaust",
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

    const result = runEffects({ G, playerId: "0", selfCardId: "resource_gain_source" }, [
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any,
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["resource_gain_cost_window_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "resource_gain_source",
      trigger: "after_gain_resource",
      resource: "knowledge",
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    });
  });

  it("opens a Progress-gain reactive Exhaust window before the civilized King of Kings free Develop", () => {
    const G = createInitialState();
    G.cardDb.civilized_state = {
      id: "civilized_state",
      displayName: "Empire",
      type: "state",
      cardType: "state",
      suit: "civilized",
      cost: 0,
      tags: ["empire"],
      effects: []
    };
    G.cardDb.civilized_king_progress_exhaust = {
      id: "civilized_king_progress_exhaust",
      displayName: "Civilized King Progress Exhaust",
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
    G.players["0"].stateArea = ["civilized_state"];
    G.players["0"].playArea = ["civilized_king_progress_exhaust"];
    G.players["0"].developmentArea = ["first_development", "second_development"];
    for (const id of G.players["0"].developmentArea) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "civilized",
        cost: 0,
        developmentCost: { materials: 99 },
        tags: [],
        effects: []
      };
    }
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_source" }, [
      { trigger: "on_play", op: "gain_fame", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(3);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["civilized_king_progress_exhaust"],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "knowledge",
      resumeEffects: [
        { trigger: "on_play", op: "develop", free: true },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    });

    moves.skipReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any });

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.pendingDevelopmentChoice).toMatchObject({
      playerId: "0",
      sourceCardId: "king_of_kings",
      cardIds: ["first_development", "second_development"],
      free: true
    });
    expect(G.players["0"].resources.knowledge).toBe(3);
  });

  it("gain_fame can cross from ordinary Fame into the special bottom Fame card without moving the special card", () => {
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
      available: ["ordinary_fame"],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_source" }, [
      { trigger: "on_play", op: "gain_fame", count: 2 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].discard).toEqual(["ordinary_fame"]);
    expect(G.players["0"].discard).not.toContain("king_of_kings");
    expect(G.players["0"].resources.knowledge).toBe(6);
    expect(G.fameDeck).toEqual({
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { "0": true }
    });
    expect(G.scoring).toBeUndefined();
    expect(G.log.map((entry) => entry.message)).toContain("FameGained(fame_source/count=2/gained=ordinary_fame,king_of_kings)");
  });

  it("draw from Fame puts ordinary Fame in hand and preserves the bottom-card rule", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.fameDeck = {
      available: ["ordinary_fame"],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_drawer" }, [
      { trigger: "on_play", op: "draw", source: "fameDeck", count: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual(["ordinary_fame"]);
    expect(G.players["0"].discard).not.toContain("ordinary_fame");
    expect(G.fameDeck.available).toEqual([]);
    expect(G.fameDeck.specialBottomCardId).toBe("king_of_kings");
    expect(G.pendingDrawChoice).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("FameDrawn(fame_drawer/count=1/drawn=ordinary_fame)");
  });

  it("draw from Fame resolves King of Kings instead of moving the special card", () => {
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
    G.players["0"].hand = [];
    G.players["0"].stateArea = ["uncivilized_state"];
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_drawer" }, [
      { trigger: "on_play", op: "draw", source: "fameDeck", count: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(6);
    expect(G.players["0"].hand).not.toContain("king_of_kings");
    expect(G.players["0"].discard).not.toContain("king_of_kings");
    expect(G.fameDeck).toEqual({
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "B",
      resolvedSpecialByPlayer: { "0": true }
    });
    expect(G.pendingDrawChoice).toBeUndefined();
    expect(G.log.map((entry) => entry.message)).toContain("FameDrawn(fame_drawer/count=1/drawn=king_of_kings)");
  });

  it("opens a Progress-gain reactive Exhaust window after drawing King of Kings", () => {
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
    G.cardDb.draw_king_progress_exhaust = {
      id: "draw_king_progress_exhaust",
      displayName: "Draw King Progress Exhaust",
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
    G.players["0"].stateArea = ["uncivilized_state"];
    G.players["0"].playArea = ["draw_king_progress_exhaust"];
    G.fameDeck = {
      available: [],
      specialBottomCardId: "king_of_kings",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_drawer" }, [
      { trigger: "on_play", op: "draw", source: "fameDeck", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(6);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["draw_king_progress_exhaust"],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "knowledge",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
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
    expect(G.players["1"].hand).toContain("unrest_a");
    expect(G.players["0"].hand).toContain("unrest_b");
    expect(G.unrestPile).toEqual(["unrest_c"]);
    expect(G.gameover).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("UnrestTaken(players=1,0/count=1/taken=2)");
  });

  it("takes Unrest for dynamic all-other player scopes", () => {
    const G = createInitialState();
    G.players["2"] = { ...G.players["1"], id: "2", hand: [] } as any;
    G.unrestPile = ["unrest_a", "unrest_b", "unrest_c"];

    const result = runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "take_unrest",
      targetPlayerScope: "others",
      count: 1
    } as any]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["1"].hand).toContain("unrest_a");
    expect(G.players["2"].hand).toContain("unrest_b");
    expect(G.unrestPile).toEqual(["unrest_c"]);
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
    G.players["0"].resources.materials = 0;

    const result = runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toContain("unrest_a");
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_gain_unrest #0 resolved.")).toBe(true);
  });

  it("routes injected randomness into after-gain-Unrest passive hooks", () => {
    const G = createInitialState();
    G.players["0"].hand = ["random_keep", "random_discard"];
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
    G.unrestPile = ["unrest_a"];
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_gain_unrest",
          effects: [{ trigger: "on_play", op: "discard_random", count: 1 } as any]
        }]
      }
    } as any;

    const result = runEffects({ G, playerId: "0", randomNumber: () => 0.4 }, [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual(["random_keep", "unrest_a"]);
    expect(G.players["0"].discard).toContain("random_discard");
    expect(G.log.some((entry) => entry.message === "Discarded random_discard at random.")).toBe(true);
  });

  it("routes injected randomness through spend-triggered Unrest penalties", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;
    G.players["0"].hand = ["random_keep", "random_discard"];
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
    G.unrestPile = ["unrest_a"];
    G.activeNationRulesets = {
      "0": {
        stateOverrides: [{ op: "take_unrest_when_spending_resource", resource: "materials" }],
        hookRules: [{
          trigger: "after_gain_unrest",
          effects: [{ trigger: "on_play", op: "discard_random", count: 1 } as any]
        }]
      }
    } as any;

    const result = runEffects({ G, playerId: "0", randomNumber: () => 0.4 }, [
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].hand).toEqual(["random_keep", "unrest_a"]);
    expect(G.players["0"].discard).toContain("random_discard");
    expect(G.log.some((entry) => entry.message === "SpentResourcePenalty(materials/unrest=1)")).toBe(true);
  });

  it("routes injected randomness through allocated Unrest passive hooks", () => {
    const G = createInitialState();
    G.players["0"].hand = ["random_keep", "random_discard"];
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
    G.unrestPile = ["unrest_a"];
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_gain_unrest",
          effects: [{ trigger: "on_play", op: "discard_random", count: 1 } as any]
        }]
      }
    } as any;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "take_unrest", count: 1, targetPlayerIds: ["1", "0"] } as any
    ]);

    expect(result).toBe(true);
    expect(G.pendingUnrestAllocationChoice?.availableUnrestCardIds).toEqual(["unrest_a"]);

    moves.resolveUnrestAllocationChoice({ G, ctx: { currentPlayer: "0" } as any, random: { Number: () => 0.4 } as any }, ["0"]);

    expect(G.pendingUnrestAllocationChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["random_keep", "unrest_a"]);
    expect(G.players["0"].discard).toContain("random_discard");
    expect(G.log.some((entry) => entry.message === "Discarded random_discard at random.")).toBe(true);
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
    expect(G.players["0"].hand).toEqual(["unrest_a"]);
    expect(G.unrestPile).toEqual(["unrest_b"]);
    expect(G.pendingChoice).toBeDefined();
    expect(G.log.some((entry) => entry.message === "UnrestTaken(players=0/count=2/taken=2)")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].hand).toEqual(["unrest_a", "unrest_b"]);
    expect(G.unrestPile).toEqual([]);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.log.some((entry) => entry.message === "UnrestTaken(players=0/count=2/taken=2)")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["unrest_a", "unrest_b"]);
    expect(G.unrestPile).toEqual([]);
    expect(G.players["0"].resources.goods).toBe(2);
    expect(G.log.some((entry) => entry.message === "UnrestTaken(players=0/count=2/taken=2)")).toBe(true);
  });

  it("opens the after-Take-Unrest reactive Exhaust window after a paused Unrest continuation finishes", () => {
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
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].playArea = ["reactive_unrest_exhaust"];
    G.cardDb.reactive_unrest_exhaust = {
      id: "reactive_unrest_exhaust",
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
        reactive: { trigger: "after_take_unrest", target: "self" }
      } as any]
    };

    const result = runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "take_unrest", count: 1 } as any]);

    expect(result).toBe(true);
    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingReactiveExhaustChoice).toBeUndefined();

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["reactive_unrest_exhaust"],
      resolvingPlayerId: "0",
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });

    moves.resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, "reactive_unrest_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.cardStates?.reactive_unrest_exhaust?.exhaustTokens).toBe(1);
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

    expect(G.players["0"].hand).toContain("unrest_a");
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
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].playArea = ["collapse_reactive_unrest_exhaust"];
    G.cardDb.collapse_reactive_unrest_exhaust = {
      id: "collapse_reactive_unrest_exhaust",
      displayName: "Collapse Reactive Unrest Exhaust",
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
    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "take_unrest",
      targetPlayerIds: ["1", "0"],
      count: 1
    } as any]);

    moves.resolveUnrestAllocationChoice({ G, ctx: { currentPlayer: "0" } as any }, ["0"]);

    expect(G.pendingUnrestAllocationChoice).toBeUndefined();
    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].hand).toContain("unrest_a");
    expect(G.gameover).toBeUndefined();
    expect(G.log.some((entry) => entry.message === "UnrestAllocationResolved(players=0/taken=1)")).toBe(false);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
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

  it("does not spend resources stored on cards as ordinary player payments", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.cardStates = { resource_host: { resources: { materials: 2 } } };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(false);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates.resource_host.resources).toEqual({ materials: 2 });
    expect(G.log.at(-1)?.message).toBe("CostUnpaid(materials/required=1/available=0)");
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

  it("pays resource costs from rulebook-named player resource pools", () => {
    const G = createInitialState();
    G.players["0"].resources = { progress: 1 } as any;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_resource", resource: "progress", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect((G.players["0"].resources as any).progress).toBeUndefined();
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
    expect(G.players["0"].hand).toEqual(["alien_unrest_1", "alien_unrest_2"]);
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

  it("pays explicit resource costs before resolving later benefits", () => {
    const G = createInitialState();
    G.resourceSupply = { materials: 0 };
    G.players["0"].resources.materials = 1;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 },
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.resourceSupply.materials).toBe(0);
  });

  it("does not pay costs after an unresolved player choice before that choice resumes", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;

    const result = runEffects({ G, playerId: "0", selfCardId: "choice_then_cost" }, [
      {
        trigger: "on_play",
        op: "choose_one",
        choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]]
      } as any,
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
      { trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "choice_then_cost",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]],
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }
      ]
    });
  });

  it("applies every selected resource in a multi-resource payment", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.knowledge = 1;

    const result = payResourceCosts(
      G,
      "0",
      { materials: 1, knowledge: 1 },
      { materials: 1, knowledge: 1 }
    );

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
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

  it("steals from dynamic player scopes and resolves fallback per target", () => {
    const G = createInitialState();
    G.playOrder = ["0", "1", "2"];
    G.players["2"] = {
      ...structuredClone(G.players["1"]),
      deck: [],
      hand: [],
      discard: [],
      playArea: [],
      history: [],
      exile: [],
      powerArea: [],
      stateArea: [],
      developmentArea: [],
      nationDeck: [],
      resources: { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 }
    };
    G.players["0"].resources.materials = 0;
    G.players["1"].resources.materials = 1;
    G.players["2"].resources.materials = 0;

    const result = runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "steal_resource",
      targetPlayerScope: "others",
      resource: "materials",
      amount: 1,
      ifUnable: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["1"].resources.materials).toBe(0);
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect(G.players["2"].resources.materials).toBe(0);
    expect(G.players["2"].resources.knowledge).toBe(1);
  });

  it("opens a resource-gain reactive Exhaust window after stealing resources", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].playArea = ["reactive_steal_exhaust"];
    G.players["1"].resources.materials = 1;
    G.cardDb.reactive_steal_exhaust = {
      id: "reactive_steal_exhaust",
      displayName: "Reactive Steal Exhaust",
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

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "materials", amount: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["reactive_steal_exhaust"],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "materials",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
  });

  it("keeps later resource costs behind steal-resource reactive Exhaust windows", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].playArea = ["reactive_steal_exhaust"];
    G.players["1"].resources.knowledge = 1;
    G.cardDb.reactive_steal_exhaust = {
      id: "reactive_steal_exhaust",
      displayName: "Reactive Steal Exhaust",
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

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "knowledge", amount: 1 } as any,
      { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["1"].resources.knowledge).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["reactive_steal_exhaust"],
      resolvingPlayerId: "0",
      trigger: "after_gain_resource",
      resource: "knowledge",
      resumeEffects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 },
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
      ]
    });
  });

  it("matches source-suited reactive Exhausts against an in-play card that steals resources", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].playArea = ["stealing_civilized", "source_suited_steal_exhaust"];
    G.players["1"].resources.materials = 1;
    G.cardDb.stealing_civilized = {
      id: "stealing_civilized",
      displayName: "Stealing Civilized",
      type: "in_play",
      cardType: "in_play",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.source_suited_steal_exhaust = {
      id: "source_suited_steal_exhaust",
      displayName: "Source Suited Steal Exhaust",
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

    const result = runEffects({ G, playerId: "0", selfCardId: "stealing_civilized" }, [
      { trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "materials", amount: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["source_suited_steal_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "stealing_civilized",
      trigger: "after_gain_resource",
      resource: "materials",
      eventSourceCardId: "stealing_civilized",
      eventSourceWasInPlay: true,
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
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

  it("moves player resources onto distinct market cards before later effects resolve", () => {
    const G = createInitialState();
    G.market = ["market_a", "market_b", "market_c"];
    G.marketSlots = [
      { cardId: "market_a", sourceDeck: "mainDeck", resourceMarkers: {}, tuckedUnrest: [] },
      { cardId: "market_b", sourceDeck: "mainDeck", resourceMarkers: {}, tuckedUnrest: [] },
      { cardId: "market_c", sourceDeck: "mainDeck", resourceMarkers: {}, tuckedUnrest: [] }
    ];
    G.players["0"].resources.materials = 2;

    const result = runEffects({ G, playerId: "0", selfCardId: "market_resource_source" }, [
      { trigger: "on_play", op: "move_resource_to_market", resource: "materials", amount: 2 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].resources.materials).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pendingMarketResourcePlacementChoice).toEqual({
      playerId: "0",
      sourceCardId: "market_resource_source",
      resource: "materials",
      amount: 2,
      cardIds: ["market_a", "market_b", "market_c"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
  });

  it("gain_action adds usable Action tokens for the current turn", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.actionsRemaining = 0;
    p.actionTokensAvailable = 0;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "gain_action", amount: 2 } as any
    ]);

    expect(result).toBe(true);
    expect(p.actionsRemaining).toBe(2);
    expect(p.actionTokensAvailable).toBe(2);
    expect(G.log.at(-1)?.message).toBe("Gained 2 Action.");
  });

  it("spend_action spends an available Action token before later effects resolve", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.actionsRemaining = 1;
    p.actionTokensAvailable = 1;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_action", amount: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(p.actionsRemaining).toBe(0);
    expect(p.actionTokensAvailable).toBe(0);
    expect(p.resources.knowledge).toBe(1);
    expect(G.log.at(-2)?.message).toBe("Spent 1 Action.");
  });

  it("spend_action fails without an available Action token", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.actionsRemaining = 0;
    p.actionTokensAvailable = 0;

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "spend_action", amount: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(false);
    expect(p.resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("SpendActionFailed(required=1, available=0)");
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

  it("return_unrest treats imported cards with an Unrest suit icon as Unrest", () => {
    const G = createInitialState();
    G.players["0"].discard = ["tagged_unrest"];
    G.unrestPile = [];
    G.cardDb.tagged_unrest = {
      id: "tagged_unrest",
      displayName: "Tagged Unrest",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: ["suit:unrest"],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_unrest", cardId: "tagged_unrest", sourceZones: ["discard"] } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.unrestPile).toEqual(["tagged_unrest"]);
    expect(G.log.at(-1)?.message).toBe("UnrestReturned(tagged_unrest/discard)");
  });

  it("return_unrest ignores printed effects on the returned Unrest card", () => {
    const G = createInitialState();
    G.players["0"].hand = ["effectful_unrest"];
    G.players["0"].resources.knowledge = 0;
    G.unrestPile = [];
    G.cardDb.effectful_unrest = {
      id: "effectful_unrest",
      displayName: "Effectful Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: [
        { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any,
        { trigger: "on_acquire", op: "gain_resource", resource: "knowledge", amount: 1 } as any
      ]
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "returner" }, [
      { trigger: "on_play", op: "return_unrest", cardId: "effectful_unrest" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual([]);
    expect(G.unrestPile).toEqual(["effectful_unrest"]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("UnrestReturned(effectful_unrest/hand)");
  });

  it("return_unrest can move specified Unrest cards from scored deck and History zones", () => {
    const G = createInitialState();
    G.players["0"].deck = ["deck_unrest"];
    G.players["0"].history = ["history_unrest"];
    G.unrestPile = [];
    for (const id of ["deck_unrest", "history_unrest"]) {
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

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_unrest", cardId: "deck_unrest", sourceZones: ["deck"] } as any
    ])).toBe(true);
    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_unrest", cardId: "history_unrest", sourceZones: ["history"] } as any
    ])).toBe(true);

    expect(G.players["0"].deck).toEqual([]);
    expect(G.players["0"].history).toEqual([]);
    expect(G.unrestPile).toEqual(["deck_unrest", "history_unrest"]);
    expect(G.log.map((entry) => entry.message)).toEqual(expect.arrayContaining([
      "UnrestReturned(deck_unrest/deck)",
      "UnrestReturned(history_unrest/history)"
    ]));
  });

  it("return_unrest can move a specified Unrest card from Exile", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_unrest"];
    G.unrestPile = [];
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

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_unrest", cardId: "exiled_unrest", sourceZones: ["exile"] }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.unrestPile).toEqual(["exiled_unrest"]);
    expect(G.log.at(-1)?.message).toBe("UnrestReturned(exiled_unrest/exile)");
  });

  it("return_unrest can move a specified Unrest card from public setup Exile", () => {
    const G = createInitialState();
    G.players["0"].exile = [];
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        visibility: "public",
        scoresAsOwned: false,
        cardIds: ["setup_exiled_unrest"]
      }
    };
    G.unrestPile = [];
    G.cardDb.setup_exiled_unrest = {
      id: "setup_exiled_unrest",
      displayName: "Setup Exiled Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_unrest", cardId: "setup_exiled_unrest", sourceZones: ["exile"] }
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.unrestPile).toEqual(["setup_exiled_unrest"]);
    expect(G.log.at(-1)?.message).toBe("UnrestReturned(setup_exiled_unrest/exile)");
  });

  it("return_unrest can move a garrisoned Unrest card attached to a play-area Region", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["host_region"];
    G.unrestPile = [];
    G.cardDb.host_region = {
      id: "host_region",
      displayName: "Host Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.garrisoned_unrest = {
      id: "garrisoned_unrest",
      displayName: "Garrisoned Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardStates = { host_region: { garrisonedCardIds: ["garrisoned_unrest"] } };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_unrest", cardId: "garrisoned_unrest", sourceZones: ["playArea"] } as any
    ]);

    expect(result).toBe(true);
    expect(G.cardStates?.host_region?.garrisonedCardIds).toEqual([]);
    expect(G.unrestPile).toEqual(["garrisoned_unrest"]);
    expect(G.log.at(-1)?.message).toBe("UnrestReturned(garrisoned_unrest/playArea)");
  });

  it("return_unrest auto-resolves one matching hand card and resumes remaining effects", () => {
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
    expect(G.pendingReturnUnrestChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toEqual(["discard_unrest"]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.unrestPile).toEqual(["hand_unrest"]);
  });

  it("return_fame moves a specified Fame card to the top of the Fame deck", () => {
    const G = createInitialState();
    G.players["0"].discard = ["ordinary_fame"];
    G.fameDeck = { available: ["existing_fame_top"], specialBottomCardId: "special_fame", specialBottomSide: "A", resolvedSpecialByPlayer: {} };
    G.cardDb.ordinary_fame = {
      id: "ordinary_fame",
      displayName: "Ordinary Fame",
      type: "fame",
      cardType: "fame",
      suit: "fame",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_fame", cardId: "ordinary_fame", sourceZones: ["discard"] } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.fameDeck.available).toEqual(["ordinary_fame", "existing_fame_top"]);
    expect(G.fameDeck.specialBottomCardId).toBe("special_fame");
    expect(G.log.at(-1)?.message).toBe("FameReturned(ordinary_fame/discard)");
  });

  it("return_fame treats imported cards with a Fame suit icon as Fame", () => {
    const G = createInitialState();
    G.players["0"].discard = ["tagged_fame"];
    G.fameDeck = { available: ["existing_fame_top"], specialBottomCardId: "special_fame", specialBottomSide: "A", resolvedSpecialByPlayer: {} };
    G.cardDb.tagged_fame = {
      id: "tagged_fame",
      displayName: "Tagged Fame",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: ["suit:fame"],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_fame", cardId: "tagged_fame", sourceZones: ["discard"] } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].discard).toEqual([]);
    expect(G.fameDeck.available).toEqual(["tagged_fame", "existing_fame_top"]);
    expect(G.log.at(-1)?.message).toBe("FameReturned(tagged_fame/discard)");
  });

  it("return_fame can return Fame cards from player and public Exile", () => {
    const G = createInitialState();
    G.players["0"].exile = ["player_exiled_fame"];
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        visibility: "public",
        scoresAsOwned: false,
        cardIds: ["public_exiled_fame"]
      }
    };
    G.fameDeck = { available: ["existing_fame_top"], specialBottomCardId: "special_fame", specialBottomSide: "A", resolvedSpecialByPlayer: {} };
    for (const id of ["player_exiled_fame", "public_exiled_fame"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "fame",
        cardType: "fame",
        suit: "fame",
        cost: 0,
        tags: [],
        effects: []
      };
    }

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_fame", cardId: "public_exiled_fame", sourceZones: ["exile"] } as any
    ])).toBe(true);
    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_fame", cardId: "player_exiled_fame", sourceZones: ["exile"] } as any
    ])).toBe(true);

    expect(G.players["0"].exile).toEqual([]);
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.fameDeck.available).toEqual(["player_exiled_fame", "public_exiled_fame", "existing_fame_top"]);
    expect(G.log.map((entry) => entry.message)).toContain("FameReturned(public_exiled_fame/exile)");
    expect(G.log.at(-1)?.message).toBe("FameReturned(player_exiled_fame/exile)");
  });

  it("return_fame treats a nation History replacement zone as History", () => {
    const G = createInitialState();
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: ["history_fame"] };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
    };
    G.fameDeck = { available: ["existing_fame_top"], specialBottomCardId: "special_fame", specialBottomSide: "A", resolvedSpecialByPlayer: {} };
    G.cardDb.history_fame = {
      id: "history_fame",
      displayName: "History Fame",
      type: "fame",
      cardType: "fame",
      suit: "fame",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_fame", cardId: "history_fame", sourceZones: ["history"] } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].sideAreas?.sunken).toEqual([]);
    expect(G.fameDeck.available).toEqual(["history_fame", "existing_fame_top"]);
    expect(G.log.at(-1)?.message).toBe("FameReturned(history_fame/sunken)");
  });

  it("return_fame can move a garrisoned Fame card attached to a play-area card", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["host_region"];
    G.cardStates = { host_region: { garrisonedCardIds: ["garrisoned_fame"] } };
    G.fameDeck = { available: ["existing_fame_top"], specialBottomCardId: "special_fame", specialBottomSide: "A", resolvedSpecialByPlayer: {} };
    G.cardDb.host_region = {
      id: "host_region",
      displayName: "Host Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.garrisoned_fame = {
      id: "garrisoned_fame",
      displayName: "Garrisoned Fame",
      type: "fame",
      cardType: "fame",
      suit: "fame",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "return_fame", cardId: "garrisoned_fame", sourceZones: ["playArea"] } as any
    ]);

    expect(result).toBe(true);
    expect(G.cardStates?.host_region?.garrisonedCardIds).toEqual([]);
    expect(G.fameDeck.available).toEqual(["garrisoned_fame", "existing_fame_top"]);
    expect(G.log.at(-1)?.message).toBe("FameReturned(garrisoned_fame/playArea)");
  });

  it("return_fame auto-resolves one owned Fame card and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_fame"];
    G.players["0"].discard = ["non_fame"];
    G.fameDeck = { available: ["existing_fame_top"], specialBottomCardId: "special_fame", specialBottomSide: "A", resolvedSpecialByPlayer: {} };
    G.cardDb.hand_fame = {
      id: "hand_fame",
      displayName: "Hand Fame",
      type: "fame",
      cardType: "fame",
      suit: "fame",
      cost: 0,
      tags: [],
      effects: []
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_returner" }, [
      { trigger: "on_play", op: "return_fame", sourceZones: ["hand", "discard"] } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingReturnFameChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].discard).toEqual(["non_fame"]);
    expect(G.fameDeck.available).toEqual(["hand_fame", "existing_fame_top"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-2)?.message).toBe("FameReturned(hand_fame/hand)");
    expect(G.log.at(-1)?.message).toBe("Gained 1 materials.");
  });

  it("return_fame creates a choice from owned Fame cards and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_fame"];
    G.players["0"].discard = ["discard_fame"];
    G.fameDeck = { available: [], specialBottomCardId: "special_fame", specialBottomSide: "A", resolvedSpecialByPlayer: {} };
    for (const id of ["hand_fame", "discard_fame"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "fame",
        cardType: "fame",
        suit: "fame",
        cost: 0,
        tags: [],
        effects: []
      };
    }

    const result = runEffects({ G, playerId: "0", selfCardId: "fame_returner" }, [
      { trigger: "on_play", op: "return_fame", sourceZones: ["hand", "discard"] } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingReturnFameChoice).toEqual({
      playerId: "0",
      sourceCardId: "fame_returner",
      cardIds: ["hand_fame", "discard_fame"],
      sourceZones: ["hand", "discard"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });
    expect(G.players["0"].resources.materials).toBe(0);

    moves.resolveReturnFameChoice({ G, ctx: { currentPlayer: "0" } as any }, "discard_fame");

    expect(G.pendingReturnFameChoice).toBeUndefined();
    expect(G.players["0"].discard).toEqual([]);
    expect(G.fameDeck.available).toEqual(["discard_fame"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-1)?.message).toBe("ReturnFameChoiceResolved(fame_returner/discard_fame)");
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

  it("place_card_on_deck moves a specified card from discard to the top of the draw deck", () => {
    const G = createInitialState();
    G.players["0"].hand = ["kept_card"];
    G.players["0"].discard = ["discard_top", "discard_other"];
    G.players["0"].deck = ["existing_top"];

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "place_card_on_deck", sourceZone: "discard", cardId: "discard_top" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].hand).toEqual(["kept_card"]);
    expect(G.players["0"].discard).toEqual(["discard_other"]);
    expect(G.players["0"].deck).toEqual(["discard_top", "existing_top"]);
    expect(G.log.at(-1)?.message).toBe("CardPlacedOnDeck(discard_top/discard)");
  });

  it("place_card_on_deck auto-resolves one source card and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["only_card"];
    G.players["0"].deck = ["existing_top"];

    const result = runEffects({ G, playerId: "0", selfCardId: "deck_setter" }, [
      { trigger: "on_play", op: "place_card_on_deck" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingPlaceOnDeckChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].deck).toEqual(["only_card", "existing_top"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-2)?.message).toBe("CardPlacedOnDeck(only_card/hand)");
    expect(G.log.at(-1)?.message).toBe("Gained 1 materials.");
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

  it("place_card_on_deck creates a choice from discard and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_card"];
    G.players["0"].discard = ["discard_a", "discard_b"];
    G.players["0"].deck = ["existing_top"];

    const result = runEffects({ G, playerId: "0", selfCardId: "discard_deck_setter" }, [
      { trigger: "on_play", op: "place_card_on_deck", sourceZone: "discard" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingPlaceOnDeckChoice).toEqual({
      playerId: "0",
      sourceCardId: "discard_deck_setter",
      sourceZone: "discard",
      cardIds: ["discard_a", "discard_b"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });

    moves.resolvePlaceOnDeckChoice({ G, ctx: { currentPlayer: "0" } as any }, "discard_b");

    expect(G.pendingPlaceOnDeckChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["hand_card"]);
    expect(G.players["0"].discard).toEqual(["discard_a"]);
    expect(G.players["0"].deck).toEqual(["discard_b", "existing_top"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-1)?.message).toBe("PlaceOnDeckChoiceResolved(discard_deck_setter/discard_b)");
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

  it("give_card auto-resolves one hand card and one legal opponent before resuming remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["gift_card"];
    G.players["1"].hand = ["opponent_card"];
    G.players["0"].resources.knowledge = 0;

    const result = runEffects({ G, playerId: "0", selfCardId: "giver" }, [
      { trigger: "on_play", op: "give_card" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingGiveCardChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["1"].hand).toEqual(["opponent_card", "gift_card"]);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.at(-2)?.message).toBe("CardGiven(gift_card/0->1)");
    expect(G.log.at(-1)?.message).toBe("Gained 1 knowledge.");
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

  it("give_card keeps multiple legal opponents as recipient choices before resuming remaining effects", () => {
    const G = createInitialState();
    G.players["2"] = {
      ...G.players["1"],
      deck: [],
      hand: [],
      discard: [],
      playArea: [],
      history: [],
      exile: [],
      powerArea: [],
      stateArea: [],
      developmentArea: [],
      nationDeck: []
    };
    G.players["0"].hand = ["first_card", "second_card"];
    G.players["0"].resources.knowledge = 0;

    const result = runEffects({ G, playerId: "0", selfCardId: "giver" }, [
      { trigger: "on_play", op: "give_card", targetPlayerIds: ["0", "1", "2"] } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(result).toBe(true);
    expect(G.pendingGiveCardChoice).toEqual({
      playerId: "0",
      sourceCardId: "giver",
      cardIds: ["first_card", "second_card"],
      recipientPlayerIds: ["1", "2"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
    expect(G.players["0"].hand).toEqual(["first_card", "second_card"]);
    expect(G.players["1"].hand).toEqual([]);
    expect(G.players["2"].hand).toEqual([]);
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

  it("swap_card returns the market card to the specified discard or deck source", () => {
    const G = createInitialState();
    G.players["0"].discard = ["discard_civilized", "discard_tail"];
    G.players["0"].deck = ["deck_top", "deck_civilized", "deck_bottom"];
    G.market = ["market_discard_civilized", "market_deck_civilized"];
    G.unrestPile = ["discard_unrest", "deck_unrest"];
    for (const id of ["discard_civilized", "deck_civilized", "market_discard_civilized", "market_deck_civilized"]) {
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

    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "swap_card", cardId: "discard_civilized", marketCardId: "market_discard_civilized", sourceZone: "discard" } as any
    ])).toBe(true);
    expect(runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "swap_card", cardId: "deck_civilized", marketCardId: "market_deck_civilized", sourceZone: "deck" } as any
    ])).toBe(true);

    expect(G.players["0"].discard).toEqual(["discard_tail", "market_discard_civilized"]);
    expect(G.players["0"].deck).toEqual(["deck_top", "market_deck_civilized", "deck_bottom"]);
    expect(G.market).toEqual(["discard_civilized", "deck_civilized"]);
    expect(G.marketUnrest).toEqual({
      discard_civilized: ["discard_unrest"],
      deck_civilized: ["deck_unrest"]
    });
    expect(G.log.map((entry) => entry.message)).toContain("CardSwapped(discard_civilized<->market_discard_civilized/source=discard)");
    expect(G.log.at(-1)?.message).toBe("CardSwapped(deck_civilized<->market_deck_civilized/source=deck)");
  });

  it("swap_card preserves structured Market slot resource markers", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_civilized"];
    G.market = ["market_civilized"];
    G.marketResources = {};
    G.marketSlots = [{ index: 0, cardId: "market_civilized", resourceMarkers: { knowledge: 2 }, attachedUnrestCardIds: [] }];
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
    expect(G.marketSlots).toEqual([{ index: 0, cardId: "hand_civilized", resourceMarkers: { knowledge: 2 }, attachedUnrestCardIds: ["new_unrest"] }]);
  });

  it("swap_card auto-resolves one matching hand and market pair and resumes remaining effects", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_civilized", "hand_region"];
    G.players["0"].resources.materials = 0;
    G.market = ["market_civilized", "market_uncivilized"];
    G.unrestPile = ["new_unrest"];
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
    expect(G.pendingSwapChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["hand_region", "market_civilized"]);
    expect(G.market).toEqual(["hand_civilized", "market_uncivilized"]);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.log.at(-2)?.message).toBe("CardSwapped(hand_civilized<->market_civilized/source=hand)");
    expect(G.log.at(-1)?.message).toBe("Gained 1 materials.");
  });

  it("swap_card creates a choice when multiple hand and market pairs match", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_civilized", "hand_uncivilized"];
    G.players["0"].resources.materials = 0;
    G.market = ["market_civilized", "market_uncivilized"];
    for (const [id, suit] of [
      ["hand_civilized", "civilized"],
      ["hand_uncivilized", "uncivilized"],
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
      choices: [
        { cardId: "hand_civilized", marketCardId: "market_civilized" },
        { cardId: "hand_uncivilized", marketCardId: "market_uncivilized" }
      ],
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
    expect(G.pendingSwapChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["market_civilized"]);
    expect(G.market).toEqual(["multi_icon_hand", "market_fame"]);
  });

  it("acquire_card with one matching filtered market card continues through eligible refills", () => {
    const G = createInitialState();
    G.market = ["market_civilized_a", "market_region"];
    G.marketRefillPool = ["market_civilized_b"];
    G.marketDecks = undefined;
    G.unrestPile = ["refill_unrest"];
    for (const [id, suit, type] of [
      ["market_civilized_a", "civilized", "action"],
      ["market_civilized_b", "civilized", "action"],
      ["market_region", "region", "region"]
    ] as const) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type,
        cardType: type,
        suit,
        cost: 0,
        tags: [],
        effects: []
      };
    }
    G.cardDb.refill_unrest = {
      id: "refill_unrest",
      displayName: "Refill Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "acquire_card", source: "market", suit: "civilized", count: 2 } as any
    ]);

    expect(result).toBe(true);
    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["market_civilized_a", "market_civilized_b", "refill_unrest"]);
    expect(G.market).toEqual(["market_region"]);
    expect(G.gameover).toBeUndefined();
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

  it("acquire_card effect triggers data-driven after_acquire nation hooks", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_acquire",
          condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "test_action_foundry_shift" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "acquire_card", count: 1 }]);

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_acquire #0 resolved.")).toBe(true);
  });

  it("resumes Market acquisition follow-up effects after tucked Unrest creates a Nation choice", () => {
    const G = createInitialState();
    G.market = ["market_action"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketUnrest = { market_action: ["tucked_unrest"] };
    G.unrestPile = ["refill_unrest"];
    G.resourceSupply = { materials: 1, knowledge: 1, influence: 1, unrest: 0, goods: 1 };
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardDb.market_action = {
      id: "market_action",
      displayName: "Market Action",
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
    G.cardDb.tucked_unrest = {
      id: "tucked_unrest",
      displayName: "Tucked Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb.refill_unrest = {
      id: "refill_unrest",
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
        hookRules: [
          {
            trigger: "after_gain_unrest",
            effects: [{
              trigger: "on_play",
              op: "choose_one",
              choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
            } as any]
          },
          {
            trigger: "after_acquire",
            condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "market_action" },
            effects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 } as any]
          }
        ]
      }
    } as any;

    runEffects({ G, playerId: "0", selfCardId: "market_acquire_source" }, [
      { trigger: "on_play", op: "acquire_card", source: "market", cardId: "market_action", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(G.players["0"].hand).toContain("market_action");
    expect(G.players["0"].hand).toContain("tucked_unrest");
    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("runs all tucked-Unrest Nation hooks before resuming Market acquisition follow-up effects", () => {
    const G = createInitialState();
    G.market = ["market_action"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.marketUnrest = { market_action: ["tucked_unrest_a", "tucked_unrest_b"] };
    G.resourceSupply = { materials: 1, knowledge: 1, influence: 0, unrest: 0, goods: 2 };
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardDb.market_action = {
      id: "market_action",
      displayName: "Market Action",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    for (const id of ["tucked_unrest_a", "tucked_unrest_b"]) {
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

    runEffects({ G, playerId: "0", selfCardId: "market_acquire_source" }, [
      { trigger: "on_play", op: "acquire_card", source: "market", cardId: "market_action", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(expect.arrayContaining(["market_action", "tucked_unrest_a", "tucked_unrest_b"]));
    expect(G.players["0"].resources.goods).toBe(2);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("acquire_card from Market without criteria pauses for a player choice when multiple cards are eligible", () => {
    const G = createInitialState();
    G.market = ["market_region", "market_civilized", "market_uncivilized"];
    G.marketDecks = undefined;
    for (const [id, suit] of [
      ["market_region", "region"],
      ["market_civilized", "civilized"],
      ["market_uncivilized", "uncivilized"]
    ] as const) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: suit === "region" ? "region" : "action",
        cardType: suit === "region" ? "region" : "action",
        suit,
        cost: 0,
        tags: [],
        effects: []
      };
    }

    runEffects({ G, playerId: "0", selfCardId: "market_picker" }, [
      { trigger: "on_play", op: "acquire_card", source: "market", count: 1 } as any
    ]);

    expect(G.pendingAcquireChoice).toEqual({
      playerId: "0",
      sourceCardId: "market_picker",
      source: "market",
      cardIds: ["market_region", "market_civilized", "market_uncivilized"],
      destination: "hand"
    });
    expect(G.players["0"].hand).not.toContain("market_region");
    expect(G.market).toEqual(["market_region", "market_civilized", "market_uncivilized"]);
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

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("multi_icon_market");
    expect(G.market).toEqual(["fame_market"]);
  });

  it("acquire_card by suit reads explicit suitIcons metadata", () => {
    const G = createInitialState();
    G.market = ["multi_icon_market"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
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

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("multi_icon_market");
    expect(G.market).toEqual([]);
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
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.unrestPile).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("AcquiredFromExile(exiled_action/destination=hand)");
  });

  it("Exile acquisition required Unrest opens a reactive Exhaust window before later effect text", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_action"];
    G.players["0"].playArea = ["reactive_exile_unrest_exhaust"];
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
    G.cardDb.reactive_exile_unrest_exhaust = {
      id: "reactive_exile_unrest_exhaust",
      displayName: "Reactive Exile Unrest Exhaust",
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

    runEffects({ G, playerId: "0", selfCardId: "exile_acquire_source" }, [
      {
        trigger: "on_play",
        op: "acquire_card",
        source: "exile",
        cardId: "exiled_action",
        count: 1
      } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(G.players["0"].hand).toContain("exiled_action");
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["reactive_exile_unrest_exhaust"],
      resolvingPlayerId: "0",
      sourceCardId: "exile_acquire_source",
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });

    moves.resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, "reactive_exile_unrest_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("resumes Exile acquisition follow-up effects after required Unrest creates a Nation choice", () => {
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
          passiveRules: [
            {
              trigger: "on_gain_unrest",
              effects: [{
                trigger: "on_play",
                op: "choose_one",
                choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
              } as any]
            } as any
          ],
          actionTokensBase: 1,
          exhaustTokensBase: 1,
          requiredExpansions: [],
          implemented: true,
          tested: true
        } as any
      },
      playerNationIds: { "0": "unrest_choice_nation", "1": "unrest_choice_nation" }
    });
    G.activeNationRulesets!["0"].hookRules.push({
      trigger: "after_acquire",
      condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "exiled_action" },
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 } as any]
    } as any);
    G.players["0"].exile = ["exiled_action"];
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.materials = 0;
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
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "materials", amount: 1 } as any]
    };
    G.unrestPile = ["test_unrest_1"];

    runEffects({ G, playerId: "0", selfCardId: "exile_acquire_source" }, [
      {
        trigger: "on_play",
        op: "acquire_card",
        source: "exile",
        cardId: "exiled_action",
        count: 1
      } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(G.players["0"].hand).toContain("exiled_action");
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
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

  it("exile_card cannot exile a market card with card-state resource tokens", () => {
    const G = createInitialState();
    G.market = ["market_civilized"];
    G.marketRefillPool = ["refill_civilized"];
    G.marketDecks = undefined;
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
    G.cardStates = {
      market_civilized: {
        resources: { knowledge: 1 }
      }
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "exile_source" }, [
      { trigger: "on_play", op: "exile_card", source: "market", cardId: "market_civilized" } as any
    ]);

    expect(result).toBe(false);
    expect(G.market).toEqual(["market_civilized"]);
    expect(G.marketRefillPool).toEqual(["refill_civilized"]);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.cardStates?.market_civilized?.resources).toEqual({ knowledge: 1 });
    expect(G.log.at(-2)?.message).toBe("ExileSkipped(market_card_has_tokens/market_civilized)");
    expect(G.log.at(-1)?.message).toBe("ExileFailed(market_civilized)");
  });

  it("exile_card cannot exile a market card with structured slot resource markers", () => {
    const G = createInitialState();
    G.market = ["market_civilized"];
    G.marketSlots = [{ index: 0, cardId: "market_civilized", resourceMarkers: { knowledge: 1 }, attachedUnrestCardIds: [] }];
    G.marketResources = {};
    G.marketRefillPool = ["refill_civilized"];
    G.marketDecks = undefined;
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

    expect(result).toBe(false);
    expect(G.market).toEqual(["market_civilized"]);
    expect(G.marketRefillPool).toEqual(["refill_civilized"]);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.marketSlots).toEqual([{ index: 0, cardId: "market_civilized", resourceMarkers: { knowledge: 1 }, attachedUnrestCardIds: [] }]);
    expect(G.log.at(-2)?.message).toBe("ExileSkipped(market_card_has_tokens/market_civilized)");
    expect(G.log.at(-1)?.message).toBe("ExileFailed(market_civilized)");
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

  it("exile_card from Market without a specified card waits for the explicit choice even with one eligible card", () => {
    const G = createInitialState();
    G.market = ["market_civilized", "market_uncivilized", "market_region"];
    G.players["0"].resources.knowledge = 0;
    G.marketRefillPool = [];
    G.marketDecks = undefined;
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
      { trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "market",
      cardIds: ["market_civilized"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
    expect(G.market).toEqual(["market_civilized", "market_uncivilized", "market_region"]);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].resources.knowledge).toBe(0);
  });

  it("exile_card criteria choices exclude market cards with card-state action tokens", () => {
    const G = createInitialState();
    G.market = ["tokened_civilized", "empty_civilized", "market_region"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    for (const id of G.market) {
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
    G.cardStates = {
      tokened_civilized: {
        actionTokens: 1
      }
    };

    runEffects({ G, playerId: "0", selfCardId: "exile_picker" }, [
      { trigger: "on_play", op: "exile_card", source: "market", suit: "civilized" } as any
    ]);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "market",
      cardIds: ["empty_civilized"]
    });
    expect(G.market).toEqual(["tokened_civilized", "empty_civilized", "market_region"]);
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

  it("exile_card treats a nation History replacement zone as History", () => {
    const G = createInitialState();
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: ["history_civilized"] };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
    };
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

    const result = runEffects({ G, playerId: "0", selfCardId: "history_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "history", cardId: "history_civilized" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].sideAreas?.sunken).toEqual([]);
    expect(G.players["0"].exile).toEqual(["history_civilized"]);
    expect(G.log.at(-1)?.message).toBe("ExiledFromSunken(history_civilized)");
  });

  it("exile_card removes a tokenless play-area host with its garrisoned cards", () => {
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
        garrisonedCardIds: ["garrisoned_card"]
      }
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "play_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "playArea", cardId: "play_region" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].playArea).toEqual([]);
    expect(G.players["0"].exile).toEqual(["play_region", "garrisoned_card"]);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates?.play_region).toBeUndefined();
    expect(G.cardStates?.garrisoned_card).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("ExiledFromPlayArea(play_region/garrisoned=1)");
  });

  it("exile_card cannot exile a player-owned card with resource tokens", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["tokened_region"];
    G.players["0"].resources.knowledge = 0;
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
      tokened_region: {
        resources: { knowledge: 1 }
      }
    };

    const result = runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "exile_card", source: "playArea", cardId: "tokened_region" } as any
    ]);

    expect(result).toBe(false);
    expect(G.players["0"].playArea).toEqual(["tokened_region"]);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates?.tokened_region?.resources).toEqual({ knowledge: 1 });
    expect(G.log.at(-2)?.message).toBe("ExileSkipped(player_card_has_tokens/tokened_region)");
    expect(G.log.at(-1)?.message).toBe("ExileFailed(tokened_region)");
  });

  it("exile_card criteria choices exclude player-owned cards with resource tokens", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["tokened_region", "empty_region"];
    for (const id of ["tokened_region", "empty_region"]) {
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
    G.cardStates = {
      tokened_region: {
        resources: { materials: 1 }
      }
    };

    runEffects({ G, playerId: "0", selfCardId: "exile_picker" }, [
      { trigger: "on_play", op: "exile_card", source: "playArea", suit: "region" } as any
    ]);

    expect(G.pendingExileChoice).toEqual({
      playerId: "0",
      sourceCardId: "exile_picker",
      source: "playArea",
      cardIds: ["empty_region"]
    });
    expect(G.players["0"].playArea).toEqual(["tokened_region", "empty_region"]);
    expect(G.players["0"].exile).toEqual([]);
  });

  it("exile_card can target a tokenless garrisoned card without removing its host", () => {
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
      }
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "garrison_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "garrison", cardId: "garrisoned_card" } as any
    ]);

    expect(result).toBe(true);
    expect(G.players["0"].playArea).toEqual(["play_region"]);
    expect(G.cardStates?.play_region?.garrisonedCardIds).toEqual([]);
    expect(G.players["0"].exile).toEqual(["garrisoned_card"]);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.cardStates?.garrisoned_card).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("ExiledFromGarrison(garrisoned_card/host=play_region)");
  });

  it("exile_card cannot target a garrisoned card with resource tokens", () => {
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

    const result = runEffects({ G, playerId: "0", selfCardId: "play_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "garrison", cardId: "garrisoned_card" } as any
    ]);

    expect(result).toBe(false);
    expect(G.players["0"].playArea).toEqual(["play_region"]);
    expect(G.cardStates?.play_region?.garrisonedCardIds).toEqual(["garrisoned_card"]);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.log.at(-2)?.message).toBe("ExileSkipped(player_card_has_tokens/garrisoned_card)");
    expect(G.log.at(-1)?.message).toBe("ExileFailed(garrisoned_card)");
  });

  it("exile_card cannot exile a host that would carry a tokened garrisoned card", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["play_region"];
    for (const id of ["play_region", "garrisoned_card"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: id === "play_region" ? "region" : "action",
        cardType: id === "play_region" ? "region" : "action",
        suit: id === "play_region" ? "region" : "civilized",
        cost: 0,
        tags: [],
        effects: []
      } as any;
    }
    G.cardStates = {
      play_region: {
        garrisonedCardIds: ["garrisoned_card"]
      },
      garrisoned_card: {
        resources: { knowledge: 1 }
      }
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "play_exiler" }, [
      { trigger: "on_play", op: "exile_card", source: "playArea", cardId: "play_region" } as any
    ]);

    expect(result).toBe(false);
    expect(G.players["0"].playArea).toEqual(["play_region"]);
    expect(G.cardStates?.play_region?.garrisonedCardIds).toEqual(["garrisoned_card"]);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.log.at(-2)?.message).toBe("ExileSkipped(garrisoned_card_has_tokens/play_region/garrisoned_card)");
    expect(G.log.at(-1)?.message).toBe("ExileFailed(play_region)");
  });

  it("exile_card can offer one garrisoned-card match by criteria", () => {
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

  it("acquire_card treats tag-only imported Unrest in Exile as Unrest", () => {
    const G = createInitialState();
    G.players["0"].exile = ["tagged_exiled_unrest"];
    G.unrestPile = [];
    G.cardDb.tagged_exiled_unrest = {
      id: "tagged_exiled_unrest",
      displayName: "Tagged Exiled Unrest",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "acquire_card",
      source: "exile",
      cardId: "tagged_exiled_unrest",
      count: 1
    } as any]);

    expect(G.players["0"].exile).toEqual([]);
    expect(G.players["0"].hand).toContain("tagged_exiled_unrest");
    expect(G.gameover).toBeUndefined();
  });

  it("acquire_card from Exile auto-resolves one matching legal card", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_civilized", "exiled_uncivilized"];
    G.unrestPile = ["required_unrest"];
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

    runEffects({ G, playerId: "0", selfCardId: "exile_picker" }, [{
      trigger: "on_play",
      op: "acquire_card",
      source: "exile",
      suit: "civilized",
      count: 1
    } as any]);

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].exile).toEqual(["exiled_uncivilized"]);
    expect(G.players["0"].hand).toEqual(["exiled_civilized", "required_unrest"]);
    expect(G.unrestPile).toEqual([]);
    expect(G.log.some((entry) => entry.message === "AcquiredFromExile(exiled_civilized/destination=hand)")).toBe(true);
  });

  it("acquire_card Exile choices exclude non-Unrest cards when required Unrest is unavailable", () => {
    const G = createInitialState();
    G.players["0"].exile = ["exiled_action", "exiled_unrest"];
    G.unrestPile = [];
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

    runEffects({ G, playerId: "0", selfCardId: "exile_picker" }, [{
      trigger: "on_play",
      op: "acquire_card",
      source: "exile",
      count: 1
    } as any]);

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.players["0"].exile).toEqual(["exiled_action"]);
    expect(G.players["0"].hand).toContain("exiled_unrest");
    expect(G.gameover).toBeUndefined();
  });

  it("acquire_card from Exile includes public setup Exile cards", () => {
    const G = createInitialState();
    G.players["0"].exile = ["personal_uncivilized"];
    G.unrestPile = ["required_unrest"];
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        visibility: "public",
        scoresAsOwned: false,
        cardIds: ["setup_civilized"]
      }
    };
    G.cardDb.personal_uncivilized = {
      id: "personal_uncivilized",
      displayName: "Personal Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
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

    runEffects({ G, playerId: "0", selfCardId: "exile_picker" }, [{
      trigger: "on_play",
      op: "acquire_card",
      source: "exile",
      suit: "civilized",
      count: 1
    } as any]);

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.players["0"].exile).toEqual(["personal_uncivilized"]);
    expect(G.players["0"].hand).toEqual(["setup_civilized", "required_unrest"]);
  });

  it("acquire_card from Market without a specified card auto-resolves one matching card", () => {
    const G = createInitialState();
    G.market = ["market_region", "market_civilized", "market_uncivilized"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
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

    expect(G.pendingAcquireChoice).toBeUndefined();
    expect(G.market).toEqual(["market_region", "market_uncivilized"]);
    expect(G.players["0"].hand).toContain("market_civilized");
    expect(G.log.at(-1)?.message).toBe("AcquiredFromMarket(market_civilized/destination=hand)");
  });

  it("gain_card moves a matching market card with market resources and tucked Unrest but does not trigger on-acquire text", () => {
    const G = createInitialState();
    G.market = ["market_gain"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketResources = { market_gain: { knowledge: 1 } };
    G.marketUnrest = { market_gain: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];
    G.cardDb.market_gain = {
      id: "market_gain",
      displayName: "Market Gain",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "materials", amount: 3 } as any]
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

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("market_gain");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].hand).toContain("test_unrest_1");
    expect(G.market).toEqual(["market_refill"]);
    expect(G.marketUnrest.market_refill).toEqual(["test_unrest_2"]);
    expect(G.log.some((entry) => entry.message === "CardGainedFromMarket(market_gain/destination=hand)")).toBe(true);
  });

  it("gain_card collects structured Market slot resource markers", () => {
    const G = createInitialState();
    G.market = ["market_gain"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketResources = {};
    G.marketSlots = [{ index: 0, cardId: "market_gain", resourceMarkers: { knowledge: 2 }, attachedUnrestCardIds: [] }];
    G.unrestPile = ["test_unrest_2"];
    G.cardDb.market_gain = {
      id: "market_gain",
      displayName: "Market Gain",
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

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("market_gain");
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.marketResources.market_gain).toBeUndefined();
    expect(G.market).toEqual(["market_refill"]);
    expect(G.marketSlots).toEqual([{ index: 0, cardId: "market_refill", sourceDeck: undefined, resourceMarkers: {}, attachedUnrestCardIds: ["test_unrest_2"] }]);
  });

  it("gain_card takes structured Market slot attached Unrest", () => {
    const G = createInitialState();
    G.market = ["market_gain"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketUnrest = {};
    G.marketSlots = [{ index: 0, cardId: "market_gain", resourceMarkers: {}, attachedUnrestCardIds: ["tucked_unrest"] }];
    G.unrestPile = ["refill_unrest"];
    G.cardDb.market_gain = {
      id: "market_gain",
      displayName: "Market Gain",
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
    G.cardDb.tucked_unrest = {
      id: "tucked_unrest",
      displayName: "Tucked Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb.refill_unrest = {
      id: "refill_unrest",
      displayName: "Refill Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any]);

    expect(G.players["0"].hand).toEqual(expect.arrayContaining(["market_gain", "tucked_unrest"]));
    expect(G.marketUnrest.market_gain).toBeUndefined();
    expect(G.market).toEqual(["market_refill"]);
    expect(G.marketSlots).toEqual([{ index: 0, cardId: "market_refill", sourceDeck: undefined, resourceMarkers: {}, attachedUnrestCardIds: ["refill_unrest"] }]);
    expect(G.log.some((entry) => entry.message === "MarketUnrestTaken(market_gain/count=1)")).toBe(true);
  });

  it("resumes gain_card follow-up effects after tucked Unrest creates a Nation choice", () => {
    const G = createInitialState();
    G.market = ["market_gain"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketResources = { market_gain: { materials: 1 } };
    G.marketUnrest = { market_gain: ["tucked_unrest"] };
    G.unrestPile = ["refill_unrest"];
    G.resourceSupply = { materials: 1, knowledge: 1, influence: 1, unrest: 0, goods: 1 };
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.influence = 0;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].playArea = ["reactive_unrest_exhaust"];
    G.cardDb.market_gain = {
      id: "market_gain",
      displayName: "Market Gain",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "knowledge", amount: 3 } as any]
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
    G.cardDb.tucked_unrest = {
      id: "tucked_unrest",
      displayName: "Tucked Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb.refill_unrest = {
      id: "refill_unrest",
      displayName: "Refill Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb.reactive_unrest_exhaust = {
      id: "reactive_unrest_exhaust",
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

    runEffects({ G, playerId: "0", selfCardId: "gain_source" }, [
      { trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(G.players["0"].hand).toContain("market_gain");
    expect(G.players["0"].hand).toContain("tucked_unrest");
    expect(G.pendingChoice).toBeDefined();
    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(1);
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.influence).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: ["reactive_unrest_exhaust"],
      resolvingPlayerId: "0",
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);

    moves.resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any }, "reactive_unrest_exhaust");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.cardStates?.reactive_unrest_exhaust?.exhaustTokens).toBe(1);
  });

  it("runs all tucked-Unrest Nation hooks before resuming gain_card follow-up effects", () => {
    const G = createInitialState();
    G.market = ["market_gain"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.marketUnrest = { market_gain: ["tucked_unrest_a", "tucked_unrest_b"] };
    G.resourceSupply = { materials: 0, knowledge: 1, influence: 0, unrest: 0, goods: 2 };
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    G.cardDb.market_gain = {
      id: "market_gain",
      displayName: "Market Gain",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "materials", amount: 3 } as any]
    };
    for (const id of ["tucked_unrest_a", "tucked_unrest_b"]) {
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

    runEffects({ G, playerId: "0", selfCardId: "gain_source" }, [
      { trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(expect.arrayContaining(["market_gain", "tucked_unrest_a", "tucked_unrest_b"]));
    expect(G.players["0"].resources.goods).toBe(2);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
  });

  it("collects rulebook-named market resources into canonical player pools", () => {
    const G = createInitialState();
    G.market = ["market_gain"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.marketResources = { market_gain: { progress: 2, population: 1 } as any };
    G.cardDb.market_gain = {
      id: "market_gain",
      displayName: "Market Gain",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any]);

    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(G.players["0"].resources.influence).toBe(1);
    expect((G.players["0"].resources as any).progress).toBeUndefined();
    expect((G.players["0"].resources as any).population).toBeUndefined();
    expect(G.marketResources.market_gain).toBeUndefined();
  });

  it("take_card moves a matching market card but returns tucked Unrest instead of taking it", () => {
    const G = createInitialState();
    G.market = ["market_take"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketResources = { market_take: { knowledge: 1 } };
    G.marketUnrest = { market_take: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];
    G.cardDb.market_take = {
      id: "market_take",
      displayName: "Market Take",
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

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "take_card", source: "market", suit: "civilized", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("market_take");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].discard).not.toContain("test_unrest_1");
    expect(G.unrestPile).toContain("test_unrest_1");
    expect(G.market).toEqual(["market_refill"]);
    expect(G.log.some((entry) => entry.message === "CardTakenFromMarket(market_take/destination=hand)")).toBe(true);
  });

  it("take_card returns structured Market slot attached Unrest", () => {
    const G = createInitialState();
    G.market = ["market_take"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketUnrest = {};
    G.marketSlots = [{ index: 0, cardId: "market_take", resourceMarkers: {}, attachedUnrestCardIds: ["structured_unrest"] }];
    G.unrestPile = ["refill_unrest"];
    G.cardDb.market_take = {
      id: "market_take",
      displayName: "Market Take",
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
    G.cardDb.structured_unrest = {
      id: "structured_unrest",
      displayName: "Structured Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };
    G.cardDb.refill_unrest = {
      id: "refill_unrest",
      displayName: "Refill Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "take_card", source: "market", suit: "civilized", count: 1 } as any]);

    expect(G.players["0"].hand).toEqual(["market_take"]);
    expect(G.players["0"].hand).not.toContain("structured_unrest");
    expect(G.unrestPile).toContain("structured_unrest");
    expect(G.marketUnrest.market_take).toBeUndefined();
    expect(G.market).toEqual(["market_refill"]);
    expect(G.marketSlots).toEqual([{ index: 0, cardId: "market_refill", sourceDeck: undefined, resourceMarkers: {}, attachedUnrestCardIds: ["refill_unrest"] }]);
    expect(G.log.some((entry) => entry.message === "MarketUnrestReturned(market_take/count=1)")).toBe(true);
  });

  it("gain_card pauses for an explicit market choice when multiple cards match", () => {
    const G = createInitialState();
    G.market = ["market_gain_a", "market_gain_b", "market_region"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    for (const id of ["market_gain_a", "market_gain_b"]) {
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

    runEffects({ G, playerId: "0", selfCardId: "gain_source" }, [
      { trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any
    ]);

    expect(G.pendingMarketCardChoice).toEqual({
      playerId: "0",
      sourceCardId: "gain_source",
      op: "gain_card",
      cardIds: ["market_gain_a", "market_gain_b"],
      destination: "hand"
    });
    expect(G.players["0"].hand).not.toContain("market_gain_a");
    expect(G.players["0"].hand).not.toContain("market_gain_b");
    expect(G.market).toEqual(["market_gain_a", "market_gain_b", "market_region"]);
    expect(G.log.at(-1)?.message).toBe("MarketCardChoicePending(gain_source/gain_card/options=2)");
  });

  it("resumes a gain_card market choice after tucked Unrest creates a Nation choice", () => {
    const G = createInitialState();
    G.market = ["market_gain_a", "market_gain_b"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.marketUnrest = { market_gain_b: ["tucked_unrest"] };
    G.players["0"].resources.goods = 0;
    G.players["0"].resources.knowledge = 0;
    for (const id of ["market_gain_a", "market_gain_b"]) {
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
    G.cardDb.tucked_unrest = {
      id: "tucked_unrest",
      displayName: "Tucked Unrest",
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

    runEffects({ G, playerId: "0", selfCardId: "gain_source" }, [
      { trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 } as any
    ]);

    expect(G.pendingMarketCardChoice?.cardIds).toEqual(["market_gain_a", "market_gain_b"]);

    (moves as any).resolveMarketCardChoice({ G, ctx: { currentPlayer: "0" } as any }, "market_gain_b");

    expect(G.pendingMarketCardChoice).toBeUndefined();
    expect(G.pendingChoice).toBeDefined();
    expect(G.players["0"].resources.goods).toBe(0);
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveChoice({ G, ctx: { currentPlayer: "0" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("market_gain_b");
    expect(G.players["0"].hand).toContain("tucked_unrest");
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.players["0"].resources.knowledge).toBe(1);
  });

  it("resumes a gain_card market choice with tucked Unrest windows after market resource windows", () => {
    const G = createInitialState();
    const sourceCardId = "choice_gain_card_resource_then_unrest_source";
    const gainedCardId = "choice_gain_card_resource_then_unrest_market";
    const unrestCardId = "choice_gain_card_resource_then_unrest_unrest";
    const resourceExhaustCardId = "choice_gain_card_resource_then_unrest_resource_exhaust";
    const unrestExhaustCardId = "choice_gain_card_resource_then_unrest_unrest_exhaust";
    G.market = ["choice_gain_card_resource_then_unrest_other", gainedCardId];
    G.marketResources = { [gainedCardId]: { knowledge: 1 } };
    G.marketUnrest = { [gainedCardId]: [unrestCardId] };
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].playArea = [resourceExhaustCardId, unrestExhaustCardId];
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    for (const id of ["choice_gain_card_resource_then_unrest_other", gainedCardId]) {
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
    G.cardDb[unrestCardId] = {
      id: unrestCardId,
      displayName: "Choice Gain Card Resource Then Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb[resourceExhaustCardId] = {
      id: resourceExhaustCardId,
      displayName: "Choice Gain Card Resource Exhaust",
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
      displayName: "Choice Gain Card Unrest Exhaust",
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

    runEffects({ G, playerId: "0", selfCardId: sourceCardId }, [
      { trigger: "on_play", op: "gain_card", source: "market", suit: "civilized", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);
    expect(G.pendingMarketCardChoice?.cardIds).toEqual(["choice_gain_card_resource_then_unrest_other", gainedCardId]);

    (moves as any).resolveMarketCardChoice({ G, ctx: { currentPlayer: "0" } as any }, gainedCardId);

    expect(G.players["0"].hand).toContain(gainedCardId);
    expect(G.players["0"].hand).toContain(unrestCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [resourceExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: gainedCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    moves.skipReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [unrestExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_take_unrest",
      targetPlayerId: "0"
    });
    expect(G.players["0"].resources.materials).toBe(0);
  });

  it("resolves a take_card market choice without taking tucked Unrest and then resumes effects", () => {
    const G = createInitialState();
    G.market = ["market_take_a", "market_take_b"];
    G.marketRefillPool = ["market_refill"];
    G.marketDecks = undefined;
    G.marketResources = { market_take_b: { knowledge: 1 } };
    G.marketUnrest = { market_take_b: ["test_unrest_1"] };
    G.unrestPile = ["test_unrest_2"];
    for (const id of ["market_take_a", "market_take_b", "market_refill"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "civilized",
        cost: 0,
        tags: [],
        effects: [{ trigger: "on_acquire", op: "gain_resource", resource: "materials", amount: 3 } as any]
      };
    }

    runEffects({ G, playerId: "0", selfCardId: "take_source" }, [
      { trigger: "on_play", op: "take_card", source: "market", suit: "civilized", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "influence", amount: 2 } as any
    ]);

    expect(G.pendingMarketCardChoice?.cardIds).toEqual(["market_take_a", "market_take_b"]);
    expect(G.players["0"].resources.influence).toBe(0);

    (moves as any).resolveMarketCardChoice({ G, ctx: { currentPlayer: "0" } as any }, "market_take_b");

    expect(G.pendingMarketCardChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("market_take_b");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["0"].resources.influence).toBe(2);
    expect(G.unrestPile).toContain("test_unrest_1");
    expect(G.players["0"].hand).not.toContain("test_unrest_1");
    expect(G.market).toEqual(["market_take_a", "market_refill"]);
    expect(G.log.some((entry) => entry.message === "MarketCardChoiceResolved(take_source/take_card/market_take_b)")).toBe(true);
  });

  it("continues multi-card take choices so newly refilled matching cards can be taken", () => {
    const G = createInitialState();
    G.market = ["market_take_a", "market_region", "market_take_b"];
    G.marketDecks = {
      mainDeck: ["main_fallback"],
      regionDeck: [],
      uncivilizedDeck: [],
      civilizedDeck: ["market_take_refill"],
      tributaryDeck: []
    };
    G.unrestPile = ["test_unrest_1"];
    for (const id of ["market_take_a", "market_take_b", "market_take_refill", "main_fallback"]) {
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

    runEffects({ G, playerId: "0", selfCardId: "multi_taker" }, [{
      trigger: "on_play",
      op: "take_card",
      source: "market",
      suit: "civilized",
      count: 2
    } as any]);

    expect(G.pendingMarketCardChoice?.cardIds).toEqual(["market_take_a", "market_take_b"]);

    (moves as any).resolveMarketCardChoice({ G, ctx: { currentPlayer: "0" } as any }, "market_take_b");

    expect(G.players["0"].hand).toContain("market_take_b");
    expect(G.market).toEqual(["market_take_a", "market_region", "market_take_refill"]);
    expect(G.pendingMarketCardChoice?.cardIds).toEqual(["market_take_a", "market_take_refill"]);

    (moves as any).resolveMarketCardChoice({ G, ctx: { currentPlayer: "0" } as any }, "market_take_refill");

    expect(G.pendingMarketCardChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(expect.arrayContaining(["market_take_b", "market_take_refill"]));
    expect(G.players["0"].hand).not.toContain("market_take_a");
    expect(G.market).toEqual(["market_take_a", "market_region", "main_fallback"]);
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

  it("break_through effect triggers data-driven after_break_through nation hooks", () => {
    const G = createInitialState();
    G.market = ["test_action_foundry_shift"];
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.cardDb.test_action_foundry_shift = { ...G.cardDb.test_action_foundry_shift, suit: "uncivilized" };
    G.activeNationRulesets = {
      "0": {
        hookRules: [{
          trigger: "after_break_through",
          condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "test_action_foundry_shift" },
          effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        }]
      }
    } as any;

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "market", count: 1 } as any]);

    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "Nation hook after_break_through #0 resolved.")).toBe(true);
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

  it("resumes a market Break through choice after market resource windows before later effects", () => {
    const G = createInitialState();
    const sourceCardId = "choice_break_through_resource_source";
    const selectedCardId = "choice_break_through_resource_market";
    const resourceExhaustCardId = "choice_break_through_resource_exhaust";
    const breakThroughExhaustCardId = "choice_break_through_after_exhaust";
    G.market = ["choice_break_through_resource_other", selectedCardId];
    G.marketResources = { [selectedCardId]: { knowledge: 1 } };
    G.marketRefillPool = [];
    G.marketDecks = undefined;
    G.players["0"].playArea = [resourceExhaustCardId, breakThroughExhaustCardId];
    G.players["0"].exhaustTokensAvailable = 1;
    G.players["0"].resources.knowledge = 0;
    G.players["0"].resources.materials = 0;
    G.players["0"].resources.influence = 0;
    for (const id of ["choice_break_through_resource_other", selectedCardId]) {
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
    G.cardDb[resourceExhaustCardId] = {
      id: resourceExhaustCardId,
      displayName: "Choice Break Through Resource Exhaust",
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
      displayName: "Choice After Break Through Exhaust",
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
        reactive: { trigger: "after_break_through_card", target: "self" }
      } as any]
    };

    runEffects({ G, playerId: "0", selfCardId: sourceCardId }, [
      { trigger: "on_play", op: "break_through", suit: "uncivilized", source: "market", count: 1 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ]);
    expect(G.pendingBreakThroughChoice?.cardIds).toEqual(["choice_break_through_resource_other", selectedCardId]);

    (moves as any).resolveBreakThroughChoice({ G, ctx: { currentPlayer: "0" } as any }, selectedCardId);

    expect(G.players["0"].hand).toContain(selectedCardId);
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [resourceExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: selectedCardId,
      eventSourceWasInPlay: true
    });
    expect(G.players["0"].resources.materials).toBe(0);

    moves.skipReactiveExhaustChoice({ G, ctx: { currentPlayer: "0" } as any });

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "0",
      cardIds: [breakThroughExhaustCardId],
      resolvingPlayerId: "0",
      sourceCardId,
      trigger: "after_break_through_card",
      targetPlayerId: "0"
    });
    expect(G.players["0"].resources.materials).toBe(0);
  });

  it("break_through from deck skips a face-up small-deck bottom card and searches Main", () => {
    const G = createInitialState();
    G.marketDecks = {
      mainDeck: ["main_uncivilized"],
      regionDeck: [],
      uncivilizedDeck: ["visible_tributary_bottom"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.marketDeckBottomCards = { uncivilizedDeck: "visible_tributary_bottom" };
    G.cardDb.visible_tributary_bottom = {
      id: "visible_tributary_bottom",
      displayName: "Visible Tributary Bottom",
      type: "action",
      cardType: "action",
      suit: "tributary",
      setupBannerSuit: "tributary",
      cost: 0,
      tags: [],
      effects: []
    } as any;
    G.cardDb.main_uncivilized = {
      id: "main_uncivilized",
      displayName: "Main Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0" }, [{ trigger: "on_play", op: "break_through", suit: "uncivilized", source: "deck", count: 1 } as any]);

    expect(G.players["0"].hand).toEqual(["main_uncivilized"]);
    expect(G.marketDecks.uncivilizedDeck).toEqual(["visible_tributary_bottom"]);
    expect(G.marketDeckBottomCards.uncivilizedDeck).toBe("visible_tributary_bottom");
    expect(G.marketDecks.mainDeck).toEqual([]);
  });

  it("break_through for Tributary lets the player choose among visible small-deck bottom cards", () => {
    const G = createInitialState();
    G.marketDecks = {
      mainDeck: ["main_tributary"],
      regionDeck: ["visible_region_tributary"],
      uncivilizedDeck: ["visible_uncivilized_tributary"],
      civilizedDeck: [],
      tributaryDeck: []
    };
    G.marketDeckBottomCards = {
      regionDeck: "visible_region_tributary",
      uncivilizedDeck: "visible_uncivilized_tributary"
    };
    for (const id of ["visible_region_tributary", "visible_uncivilized_tributary", "main_tributary"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: "tributary",
        setupBannerSuit: "tributary",
        cost: 0,
        tags: [],
        effects: []
      } as any;
    }

    runEffects({ G, playerId: "0", selfCardId: "tributary_breaker" }, [
      { trigger: "on_play", op: "break_through", suit: "tributary", source: "deck", count: 1 } as any
    ]);

    expect(G.pendingBreakThroughChoice).toEqual({
      playerId: "0",
      sourceCardId: "tributary_breaker",
      source: "deck",
      suit: "tributary",
      cardIds: ["visible_region_tributary", "visible_uncivilized_tributary"]
    });
    expect(G.players["0"].hand).toEqual([]);

    moves.resolveBreakThroughChoice({ G, ctx: { currentPlayer: "0" } as any }, "visible_uncivilized_tributary");

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["visible_uncivilized_tributary"]);
    expect(G.marketDecks.uncivilizedDeck).toEqual([]);
    expect(G.marketDeckBottomCards.uncivilizedDeck).toBeUndefined();
    expect(G.marketDecks.regionDeck).toEqual(["visible_region_tributary"]);
    expect(G.marketDecks.mainDeck).toEqual(["main_tributary"]);
  });

  it("break_through from Market pauses for a new choice when refill creates multiple matches mid-effect", () => {
    const G = createInitialState();
    G.market = ["market_region", "market_uncivilized_b", "market_uncivilized_a"];
    G.marketDecks = {
      mainDeck: ["main_fallback"],
      regionDeck: [],
      uncivilizedDeck: ["market_uncivilized_refill"],
      civilizedDeck: [],
      tributaryDeck: []
    };
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

    runEffects({ G, playerId: "0", selfCardId: "market_breaker" }, [{
      trigger: "on_play",
      op: "break_through",
      suit: "uncivilized",
      source: "market",
      cardId: "market_uncivilized_a",
      count: 2
    } as any]);

    expect(G.players["0"].hand).toEqual(["market_uncivilized_a"]);
    expect(G.market).toEqual(["market_region", "market_uncivilized_b", "market_uncivilized_refill"]);
    expect(G.pendingBreakThroughChoice).toEqual({
      playerId: "0",
      sourceCardId: "market_breaker",
      source: "market",
      suit: "uncivilized",
      cardIds: ["market_uncivilized_b", "market_uncivilized_refill"]
    });
  });

  it("does not log direct market Break-through success when refill triggers Collapse", () => {
    const G = createInitialState();
    G.market = ["market_uncivilized"];
    G.marketRefillPool = ["refill_civilized"];
    G.marketDecks = undefined;
    G.unrestPile = [];
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
    G.cardDb.p0_unrest = { id: "p0_unrest", displayName: "Unrest", type: "unrest", cardType: "unrest", suit: "unrest", cost: 0, tags: ["unrest"], effects: [] };
    G.cardDb.p1_unrest = { id: "p1_unrest", displayName: "Unrest", type: "unrest", cardType: "unrest", suit: "unrest", cost: 0, tags: ["unrest"], effects: [] };
    G.players["0"].discard = ["p0_unrest"];
    G.players["1"].discard = ["p1_unrest"];

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "break_through",
      source: "market",
      suit: "uncivilized",
      cardId: "market_uncivilized",
      count: 1
    } as any]);

    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.log.some((entry) => entry.message === "BreakThroughMarket(market_uncivilized/uncivilized)")).toBe(false);
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

  it("break_through from Exile auto-resolves one matching card", () => {
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

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.players["0"].exile).toEqual(["exiled_uncivilized"]);
    expect(G.players["0"].hand).toEqual(["exiled_civilized"]);
    expect(G.log.some((entry) => entry.message === "BreakThroughExile(exiled_civilized/civilized)")).toBe(true);
  });

  it("break_through from Exile auto-resolves one matching public setup Exile card", () => {
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

    runEffects({ G, playerId: "0", selfCardId: "exile_breaker" }, [{
      trigger: "on_play",
      op: "break_through",
      source: "exile",
      suit: "civilized",
      count: 1
    } as any]);

    expect(G.pendingBreakThroughChoice).toBeUndefined();
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.players["0"].hand).toEqual(["setup_exiled_civilized"]);
    expect(G.log.some((entry) => entry.message === "BreakThroughExile(setup_exiled_civilized/civilized)")).toBe(true);
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

  it("look_take_card chooses one looked Draw deck card and returns the rest before later effects resolve", () => {
    const G = createInitialState();
    G.players["0"].deck = ["test_action_archive_survey", "test_action_foundry_shift", "test_action_scholars_circle"];

    runEffects({ G, playerId: "0" }, [
      { trigger: "on_play", op: "look_take_card", source: "deck", count: 2 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ]);

    expect(G.pendingLookTakeChoice).toEqual({
      playerId: "0",
      source: "deck",
      destination: "hand",
      cardIds: ["test_action_archive_survey", "test_action_foundry_shift"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    });
    expect(G.players["0"].hand).not.toContain("test_action_foundry_shift");
    expect(G.players["0"].resources.knowledge).toBe(0);

    resolveLookTakeChoice({ G, ctx: { currentPlayer: "0" } as any }, "test_action_foundry_shift", ["test_action_archive_survey"]);

    expect(G.pendingLookTakeChoice).toBeUndefined();
    expect(G.players["0"].hand).toContain("test_action_foundry_shift");
    expect(G.players["0"].deck).toEqual(["test_action_archive_survey", "test_action_scholars_circle"]);
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
    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.players["0"].accessionCardId).toBe("accession_card");
  });

  it("look_cards treats no-Accession Nation deck cards as regular hidden cards", () => {
    const G = createInitialState();
    G.players["0"].nationDeck = ["regular_nation", "accession_card"];
    G.players["0"].accessionCardId = undefined;
    G.cardDb.regular_nation = {
      id: "regular_nation",
      displayName: "Regular Nation",
      type: "nation",
      cardType: "nation",
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
      suit: "none",
      cost: 0,
      tags: ["accession"],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_accession"] as any
    };

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "look_cards",
      source: "nationDeck",
      count: 2
    } as any]);

    expect(G.lookedCards?.cardIds).toEqual(["regular_nation", "accession_card"]);
    expect(G.pendingLookOrderChoice?.cardIds).toEqual(["regular_nation", "accession_card"]);
  });

  it("look_cards can reveal a separately tracked Accession when it is the only Nation card left", () => {
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

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "look_cards",
      source: "nationDeck",
      count: 1
    } as any]);

    expect(G.lookedCards?.cardIds).toEqual(["accession_card"]);
  });

  it("look_cards ignores King of Kings while ordinary Fame remains, but reveals it when it is the only face-up Fame card", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: ["fame_top"],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "B",
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

    G.fameDeck.specialBottomSide = "face_down";
    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "look_cards",
      source: "fameDeck",
      count: 2
    } as any]);

    expect(G.lookedCards?.cardIds).toEqual([]);
  });

  it("look_cards lets a player reorder multiple ordinary Fame cards above King of Kings", () => {
    const G = createInitialState();
    G.fameDeck = {
      available: ["fame_top", "fame_second", "fame_third"],
      specialBottomCardId: "fame_bottom",
      specialBottomSide: "A",
      resolvedSpecialByPlayer: {}
    };
    G.players["0"].resources.materials = 0;

    runEffects({ G, playerId: "0", selfCardId: "fame_look_source" }, [
      { trigger: "on_play", op: "look_cards", source: "fameDeck", count: 2 } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ]);

    expect(G.pendingLookOrderChoice).toEqual({
      playerId: "0",
      sourceCardId: "fame_look_source",
      source: "fameDeck",
      cardIds: ["fame_top", "fame_second"],
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });
    expect(G.players["0"].resources.materials).toBe(0);

    resolveLookOrderChoice({ G, ctx: { currentPlayer: "0" } as any }, ["fame_second", "fame_top"]);

    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.lookedCards).toEqual({
      playerId: "0",
      source: "fameDeck",
      cardIds: ["fame_second", "fame_top"]
    });
    expect(G.fameDeck.available).toEqual(["fame_second", "fame_top", "fame_third"]);
    expect(G.fameDeck.specialBottomCardId).toBe("fame_bottom");
    expect(G.players["0"].resources.materials).toBe(1);
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

  it("find_card resolves an exact later-zone hit before shuffling searched hidden decks", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].discard = [];
    G.players["0"].deck = ["test_action_foundry_shift", "test_action_scholars_circle"];
    G.players["0"].nationDeck = ["test_action_archive_survey", "test_action_forum_debate"];

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "test_action_archive_survey",
      destination: "hand"
    } as any]);

    const messages = G.log.map((entry) => entry.message);
    expect(messages.indexOf("FindResolved(test_action_archive_survey/nationDeck->hand)")).toBeLessThan(messages.indexOf("FindShuffled(deck)"));
    expect(messages.indexOf("FindResolved(test_action_archive_survey/nationDeck->hand)")).toBeLessThan(messages.indexOf("FindShuffled(nationDeck)"));
    expect(G.players["0"].hand).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].nationDeck).toEqual(["test_action_forum_debate"]);
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

  it("find_card treats no-Accession Nation deck cards as regular searchable cards", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].discard = [];
    G.players["0"].deck = [];
    G.players["0"].nationDeck = ["regular_nation", "accession_card"];
    G.players["0"].accessionCardId = undefined;
    G.cardDb.regular_nation = {
      id: "regular_nation",
      displayName: "Regular Nation",
      type: "nation",
      cardType: "nation",
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
      suit: "none",
      cost: 0,
      tags: ["accession"],
      effects: []
    };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_accession"] as any
    };

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "accession_card",
      destination: "hand"
    } as any]);

    expect(G.players["0"].hand).toEqual(["accession_card"]);
    expect(G.players["0"].nationDeck).toEqual(["regular_nation"]);
    expect(G.log.map((entry) => entry.message)).toContain("FindResolved(accession_card/nationDeck->hand)");
    expect(G.log.map((entry) => entry.message)).toContain("FindShuffled(nationDeck)");
  });

  it("does not Find a separately tracked accession card from the Nation deck", () => {
    const G = createInitialState();
    G.players["0"].hand = [];
    G.players["0"].discard = [];
    G.players["0"].deck = [];
    G.players["0"].nationDeck = [];
    G.players["0"].accessionCardId = "accession_card";
    G.cardDb.accession_card = {
      id: "accession_card",
      displayName: "Accession",
      type: "accession",
      cardType: "accession",
      suit: "civilized",
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
    expect(G.players["0"].accessionCardId).toBe("accession_card");
    expect(G.log.at(-1)?.message).toBe("FindMissed(accession_card)");

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      suit: "civilized",
      destination: "hand"
    } as any]);

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.players["0"].accessionCardId).toBe("accession_card");
    expect(G.log.at(-1)?.message).toBe("FindMissed(criteria)");
  });

  it("find_card by criteria searches all listed zones before offering eligible choices", () => {
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
      destination: "discard",
      shuffleZones: ["deck", "nationDeck"]
    });
    expect(G.players["0"].deck).toEqual(["test_action_scholars_circle"]);
    expect(G.players["0"].nationDeck).toEqual(["test_action_lineage_record"]);
    expect(G.log.map((entry) => entry.message)).not.toContain("FindShuffled(deck)");
    expect(G.log.map((entry) => entry.message)).not.toContain("FindShuffled(nationDeck)");
    expect(G.log.at(-1)?.message).toBe("FindChoicePending(finder/options=3)");
  });

  it("find_card by criteria waits for an explicit choice even with one eligible card", () => {
    const G = createInitialState();
    G.players["0"].hand = ["hand_civilized"];
    G.players["0"].discard = ["discard_uncivilized"];
    G.players["0"].resources.materials = 0;
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
    G.cardDb.discard_uncivilized = {
      id: "discard_uncivilized",
      displayName: "Discard Uncivilized",
      type: "action",
      cardType: "action",
      suit: "uncivilized",
      cost: 0,
      tags: [],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "finder" }, [
      {
        trigger: "on_play",
        op: "find_card",
        suit: "uncivilized",
        sourceZones: ["hand", "discard"],
        destination: "hand"
      },
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ] as any);

    expect(G.pendingFindChoice).toEqual({
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["discard_uncivilized"],
      destination: "hand",
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
    });
    expect(G.players["0"].discard).toEqual(["discard_uncivilized"]);
    expect(G.players["0"].hand).toEqual(["hand_civilized"]);
    expect(G.players["0"].resources.materials).toBe(0);
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

  it("find_card removes an exact Draw deck hit before shuffling the searched deck", () => {
    const G = createInitialState();
    G.players["0"].deck = ["target_card", "deck_a", "deck_b"];
    for (const id of ["target_card", "deck_a", "deck_b"]) {
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

    runEffects({ G, playerId: "0", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "target_card",
      sourceZones: ["deck"],
      destination: "hand"
    } as any]);

    expect(G.players["0"].hand).toEqual(["target_card"]);
    expect(G.players["0"].deck).toEqual(["deck_b", "deck_a"]);
    const messages = G.log.map((entry) => entry.message);
    expect(messages).toContain("FindShuffled(deck)");
    expect(messages.indexOf("FindResolved(target_card/deck->hand)")).toBeLessThan(messages.indexOf("FindShuffled(deck)"));
  });

  it("find_card by criteria removes the chosen Draw deck card before shuffling the searched deck", () => {
    const G = createInitialState();
    G.players["0"].deck = ["match_a", "match_b", "miss_c"];
    for (const id of ["match_a", "match_b", "miss_c"]) {
      G.cardDb[id] = {
        id,
        displayName: id,
        type: "action",
        cardType: "action",
        suit: id.startsWith("match") ? "uncivilized" : "civilized",
        cost: 0,
        tags: [],
        effects: []
      };
    }

    runEffects({ G, playerId: "0", selfCardId: "finder", randomNumber: () => 0 }, [{
      trigger: "on_play",
      op: "find_card",
      sourceZones: ["deck"],
      suit: "uncivilized",
      destination: "hand"
    } as any]);
    (moves as any).resolveFindChoice({ G, ctx: { currentPlayer: "0" } as any, random: { Number: () => 0 } as any }, "match_a");

    expect(G.players["0"].hand).toEqual(["match_a"]);
    expect(G.players["0"].deck).toEqual(["miss_c", "match_b"]);
    expect(G.log.map((entry) => entry.message)).toContain("FindShuffled(deck)");
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(finder/match_a->hand)");
  });

  it("find_card can move a targeted garrisoned card without moving its host", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["host_region"];
    G.players["0"].discard = [];
    G.players["0"].resources.goods = 0;
    G.cardDb.host_region = {
      id: "host_region",
      displayName: "Host Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardDb.garrisoned_target = {
      id: "garrisoned_target",
      displayName: "Garrisoned Target",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: [],
      effects: []
    };
    G.cardStates = {
      host_region: { garrisonedCardIds: ["garrisoned_target"] },
      garrisoned_target: { resources: { goods: 1 } }
    };

    runEffects({ G, playerId: "0" }, [{
      trigger: "on_play",
      op: "find_card",
      cardId: "garrisoned_target",
      sourceZones: ["garrison"],
      destination: "discard"
    } as any]);

    expect(G.players["0"].playArea).toEqual(["host_region"]);
    expect(G.cardStates?.host_region?.garrisonedCardIds).toEqual([]);
    expect(G.players["0"].discard).toEqual(["garrisoned_target"]);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(G.cardStates?.garrisoned_target).toBeUndefined();
    expect(G.log.at(-1)?.message).toBe("FindResolved(garrisoned_target/garrison->discard)");
  });

  it("find_card by criteria offers one matching garrisoned card", () => {
    const G = createInitialState();
    G.players["0"].playArea = ["host_region"];
    G.cardDb.host_region = {
      id: "host_region",
      displayName: "Host Region",
      type: "region",
      cardType: "region",
      suit: "region",
      cost: 0,
      tags: [],
      effects: []
    };
    for (const [id, suit] of [["garrisoned_civilized", "civilized"], ["garrisoned_uncivilized", "uncivilized"]] as const) {
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
    G.cardStates = {
      host_region: { garrisonedCardIds: ["garrisoned_civilized", "garrisoned_uncivilized"] }
    };

    runEffects({ G, playerId: "0", selfCardId: "finder" }, [{
      trigger: "on_play",
      op: "find_card",
      suit: "civilized",
      sourceZones: ["garrison"],
      destination: "hand"
    } as any]);

    expect(G.pendingFindChoice).toEqual({
      playerId: "0",
      sourceCardId: "finder",
      cardIds: ["garrisoned_civilized"],
      destination: "hand"
    });
    (moves as any).resolveFindChoice({ G, ctx: { currentPlayer: "0" } as any }, "garrisoned_civilized");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].playArea).toEqual(["host_region"]);
    expect(G.cardStates?.host_region?.garrisonedCardIds).toEqual(["garrisoned_uncivilized"]);
    expect(G.players["0"].hand).toEqual(["garrisoned_civilized"]);
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(finder/garrisoned_civilized->hand)");
  });

  it("find_card treats a nation History replacement zone as History", () => {
    const G = createInitialState();
    G.players["0"].history = [];
    G.players["0"].sideAreas = { sunken: ["history_target"] };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "sunken", displayName: "Sunken", cardsScore: true } as any]
    };
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
    expect(G.players["0"].sideAreas?.sunken).toEqual([]);
    expect(G.players["0"].hand).toEqual(["history_target"]);
    expect(G.log.at(-1)?.message).toBe("FindResolved(history_target/sunken->hand)");
  });

  it("find_card by criteria offers one History match from the searched source", () => {
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
    (moves as any).resolveFindChoice({ G, ctx: { currentPlayer: "0" } as any }, "history_civilized");

    expect(G.pendingFindChoice).toBeUndefined();
    expect(G.players["0"].history).toEqual([]);
    expect(G.players["0"].discard).toEqual(["history_civilized"]);
    expect(G.players["0"].hand).toEqual(["hand_civilized"]);
    expect(G.log.at(-1)?.message).toBe("FindChoiceResolved(finder/history_civilized->discard)");
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

  it("excludes cards tagged as not garrisonable from Garrison choices and direct resolution", () => {
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
    G.cardDb.garrison_excluded = {
      id: "garrison_excluded",
      displayName: "Garrison Excluded",
      type: "action",
      cardType: "action",
      suit: "civilized",
      cost: 0,
      tags: ["cannot_be_garrisoned"],
      effects: []
    };
    G.players["0"].playArea = ["test_region"];
    G.players["0"].hand = ["test_action_archive_survey", "test_action_scholars_circle", "garrison_excluded"];

    expect(runEffects({ G, playerId: "0", selfCardId: "garrison_source" }, [
      { trigger: "on_play", op: "garrison_card" }
    ] as any)).toBe(true);

    expect(G.pendingGarrisonChoice?.cardIds).toEqual(["test_action_archive_survey", "test_action_scholars_circle"]);

    const direct = createInitialState();
    direct.cardDb.test_region = G.cardDb.test_region;
    direct.cardDb.garrison_excluded = G.cardDb.garrison_excluded;
    direct.players["0"].playArea = ["test_region"];
    direct.players["0"].hand = ["garrison_excluded"];

    expect(runEffects({ G: direct, playerId: "0", selfCardId: "garrison_source" }, [
      { trigger: "on_play", op: "garrison_card", hostCardId: "test_region", cardId: "garrison_excluded" }
    ] as any)).toBe(false);
    expect(direct.players["0"].hand).toEqual(["garrison_excluded"]);
    expect(direct.cardStates?.test_region?.garrisonedCardIds).toBeUndefined();
  });

  it("auto-resolves one unspecified Garrison host and hand card before resuming effects", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
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
      { trigger: "on_play", op: "garrison_card" },
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ] as any)).toBe(true);

    expect(G.pendingGarrisonChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual([]);
    expect(G.cardStates?.garrison_source?.garrisonedCardIds).toEqual(["test_action_archive_survey"]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("does not offer the source card itself as an unspecified Garrison child", () => {
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
    G.players["0"].playArea = ["garrison_source"];
    G.players["0"].hand = ["garrison_source", "test_action_archive_survey"];

    expect(runEffects({ G, playerId: "0", selfCardId: "garrison_source" }, [
      { trigger: "on_play", op: "garrison_card" }
    ] as any)).toBe(true);

    expect(G.pendingGarrisonChoice).toBeUndefined();
    expect(G.players["0"].hand).toEqual(["garrison_source"]);
    expect(G.cardStates?.garrison_source?.garrisonedCardIds).toEqual(["test_action_archive_survey"]);
  });

  it("auto-resolves unspecified Recall or Abandon when only one Region is eligible", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
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
      { trigger: "on_play", op: "recall_region" },
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ] as any)).toBe(true);

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.players["0"].playArea).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].hand).toEqual(["test_region"]);
    expect(G.players["0"].resources.materials).toBe(1);

    G.players["0"].playArea = ["test_region", "test_action_foundry_shift"];
    G.players["0"].hand = [];
    G.players["0"].discard = [];
    expect(runEffects({ G, playerId: "0", selfCardId: "abandon_source" }, [
      { trigger: "on_play", op: "abandon_region" }
    ] as any)).toBe(true);

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.players["0"].playArea).toEqual(["test_action_foundry_shift"]);
    expect(G.players["0"].discard).toEqual(["test_region"]);
  });

  it("offers garrisoned Regions in unspecified recall or abandon choices", () => {
    const G = createInitialState();
    G.cardDb.host_region = {
      id: "host_region",
      displayName: "Host Region",
      type: "region",
      cardType: "region",
      suit: "region",
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
      tags: [],
      effects: []
    };
    G.players["0"].playArea = ["host_region"];
    G.cardStates = {
      host_region: { garrisonedCardIds: ["garrisoned_region"] }
    };

    expect(runEffects({ G, playerId: "0", selfCardId: "recall_source" }, [
      { trigger: "on_play", op: "recall_region" }
    ] as any)).toBe(true);

    expect((G.pendingRegionChoice as unknown as NonNullable<GameState["pendingRegionChoice"]>).cardIds).toEqual(["host_region", "garrisoned_region"]);

    G.pendingRegionChoice = undefined;
    expect(runEffects({ G, playerId: "0", selfCardId: "abandon_source" }, [
      { trigger: "on_play", op: "abandon_region" }
    ] as any)).toBe(true);

    expect((G.pendingRegionChoice as unknown as NonNullable<GameState["pendingRegionChoice"]>).cardIds).toEqual(["host_region", "garrisoned_region"]);
  });

  it("opens opponent-owned Region choices for dynamic player scopes", () => {
    const G = createInitialState();
    for (const id of ["opponent_region_one", "opponent_region_two"]) {
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
    G.players["0"].resources.materials = 0;
    G.players["1"].playArea = ["opponent_region_one", "opponent_region_two"];

    expect(runEffects({ G, playerId: "0", selfCardId: "scoped_region_source" }, [
      { trigger: "on_play", op: "recall_region", targetPlayerScope: "others" } as any,
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 } as any
    ])).toBe(true);

    expect(G.pendingRegionChoice).toMatchObject({
      playerId: "1",
      resolvingPlayerId: "0",
      sourceCardId: "scoped_region_source",
      op: "recall_region",
      cardIds: ["opponent_region_one", "opponent_region_two"]
    });

    resolveRegionChoice({ G, ctx: { currentPlayer: "1" } as any }, "opponent_region_one");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.players["1"].hand).toEqual(["opponent_region_one"]);
    expect(G.players["1"].playArea).toEqual(["opponent_region_two"]);
    expect(G.players["0"].resources.materials).toBe(1);
  });

  it("preserves counted unspecified Recall or Abandon choices from card text", () => {
    const G = createInitialState();
    for (const id of ["counted_region_one", "counted_region_two", "counted_region_three"]) {
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
    G.players["0"].playArea = ["counted_region_one", "counted_region_two", "counted_region_three"];

    expect(runEffects({ G, playerId: "0", selfCardId: "counted_recall_source" }, [
      { trigger: "on_play", op: "recall_region", count: 2 }
    ] as any)).toBe(true);

    expect(G.pendingRegionChoice).toMatchObject({
      playerId: "0",
      sourceCardId: "counted_recall_source",
      op: "recall_region",
      cardIds: ["counted_region_one", "counted_region_two", "counted_region_three"],
      count: 2
    });

    G.pendingRegionChoice = undefined;

    expect(runEffects({ G, playerId: "0", selfCardId: "counted_abandon_source" }, [
      { trigger: "on_play", op: "abandon_region", count: 2 }
    ] as any)).toBe(true);

    expect(G.pendingRegionChoice).toMatchObject({
      playerId: "0",
      sourceCardId: "counted_abandon_source",
      op: "abandon_region",
      cardIds: ["counted_region_one", "counted_region_two", "counted_region_three"],
      count: 2
    });
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

  it("auto-resolves choose_one when unpaid explicit costs leave one legal option", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;

    runEffects({ G, playerId: "0", selfCardId: "test_action_forum_debate" }, [
      {
        trigger: "on_play",
        op: "choose_one",
        choices: [
          [{ trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }],
          [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
        ]
      },
      { trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }
    ] as any);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(1);
    expect(G.players["0"].resources.influence).toBe(1);
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

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(3);
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(1);
  });

  it("does not offer choose_one resource-gain options when the finite supply is empty", () => {
    const G = createInitialState();
    G.resourceSupply = { materials: 0, knowledge: 0, influence: 1, unrest: 0, goods: 0 };

    runEffects({ G, playerId: "0", selfCardId: "test_action_forum_debate" }, [{
      trigger: "on_play",
      op: "choose_one",
      choices: [
        [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }],
        [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
      ]
    }]);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.knowledge).toBe(0);
    expect(G.players["0"].resources.influence).toBe(1);
    expect(G.resourceSupply.knowledge).toBe(0);
    expect(G.resourceSupply.influence).toBe(0);
  });

  it("does not offer choose_one resource movement options that would move zero tokens", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;
    G.players["1"].resources.goods = 0;

    runEffects({ G, playerId: "0", selfCardId: "test_action_forum_debate" }, [{
      trigger: "on_play",
      op: "choose_one",
      choices: [
        [{ trigger: "on_play", op: "return_resource", resource: "materials", amount: 1 }],
        [{ trigger: "on_play", op: "steal_resource", fromPlayerId: "1", resource: "goods", amount: 1 }],
        [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
      ]
    } as any]);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.players["0"].resources.materials).toBe(0);
    expect(G.players["1"].resources.goods).toBe(0);
    expect(G.players["0"].resources.influence).toBe(1);
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

  it("auto-resolves a one-card Develop effect without requiring a progression token", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.exhaustTokensAvailable = 0;
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const result = runEffects({ G, playerId: "0", selfCardId: "develop_source" }, [
      {
        trigger: "on_play",
        op: "develop"
      },
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ] as any);

    expect(result).toBe(true);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.developmentArea).toEqual([]);
    expect(p.discard).toContain("test_action_scholars_circle");
    expect(p.resources.materials).toBe(0);
    expect(p.resources.knowledge).toBe(1);
    expect(p.exhaustTokensAvailable).toBe(0);
    expect(G.log.some((entry) => entry.message === "DevelopmentResolved(test_action_scholars_circle)")).toBe(true);
  });

  it("keeps a one-card Develop effect pending when payment substitution can vary", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 0;
    p.resources.knowledge = 1;
    p.resources.goods = 1;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const result = runEffects({ G, playerId: "0", selfCardId: "develop_source" }, [
      {
        trigger: "on_play",
        op: "develop"
      },
      { trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }
    ] as any);

    expect(result).toBe(true);
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      sourceCardId: "develop_source",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 0,
      resumeBehavior: "none",
      usesProgressionToken: false,
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
    });
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.discard).not.toContain("test_action_scholars_circle");
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.goods).toBe(1);
    expect(p.resources.influence).toBe(0);
  });

  it("keeps a one-card Develop effect pending when direct payment and substitution can both pay", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    p.resources.knowledge = 1;
    p.resources.goods = 0;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };

    const result = runEffects({ G, playerId: "0", selfCardId: "develop_source" }, [
      {
        trigger: "on_play",
        op: "develop"
      },
      { trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }
    ] as any);

    expect(result).toBe(true);
    expect(G.pendingDevelopmentChoice).toEqual({
      playerId: "0",
      sourceCardId: "develop_source",
      cardIds: ["test_action_scholars_circle"],
      resumeDrawCount: 0,
      resumeBehavior: "none",
      usesProgressionToken: false,
      resumeEffects: [{ trigger: "on_play", op: "gain_resource", resource: "influence", amount: 1 }]
    });
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.discard).not.toContain("test_action_scholars_circle");
    expect(p.resources.materials).toBe(2);
    expect(p.resources.knowledge).toBe(1);
    expect(p.resources.influence).toBe(0);
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

  it("does not resolve a Develop effect for nations whose Development area is replaced", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.developmentArea = ["test_action_scholars_circle"];
    p.resources.materials = 2;
    G.cardDb.test_action_scholars_circle.developmentCost = { materials: 2 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_development_area", "quest_development_replacement"] as any
    };

    const result = runEffects({ G, playerId: "0", selfCardId: "develop_source" }, [
      { trigger: "on_play", op: "develop" },
      { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }
    ] as any);

    expect(result).toBe(false);
    expect(G.pendingDevelopmentChoice).toBeUndefined();
    expect(p.developmentArea).toEqual(["test_action_scholars_circle"]);
    expect(p.resources.knowledge).toBe(0);
    expect(G.log.at(-1)?.message).toBe("DevelopmentSkipped(no_development_area)");
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

  it("offers only the skip path for optional effects with only payable explicit costs", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [
        { trigger: "on_play", op: "spend_resource", resource: "materials", amount: 1 }
      ]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.players["0"].resources.materials).toBe(1);
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

  it("offers only the skip path for optional effects whose non-skip text cannot resolve", () => {
    const G = createInitialState();
    G.players["0"].deck = [];
    G.players["0"].discard = [];
    G.players["0"].nationDeck = [];
    G.players["0"].developmentArea = [];

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "draw", count: 1 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers optional draw when Action-token reshuffle progression can add a Nation card", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = ["test_action_lineage_record"];
    p.developmentArea = [];
    p.actionTokensAvailable = 1;
    p.exhaustTokensAvailable = 0;
    p.progressionTokens = { nationDeck: 0, developmentArea: 0 };

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "draw", count: 1 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [
        [{ trigger: "on_play", op: "draw", count: 1 }],
        []
      ]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=2)");
  });

  it("offers only the skip path for optional draw when no-Nation-deck progression is skipped", () => {
    const G = createInitialState();
    const p = G.players["0"];
    p.deck = [];
    p.discard = [];
    p.nationDeck = ["test_action_lineage_record"];
    p.developmentArea = [];
    p.actionTokensAvailable = 1;
    p.exhaustTokensAvailable = 0;
    p.progressionTokens = { nationDeck: 0, developmentArea: 0 };
    G.activeNationRulesets!["0"] = {
      ...G.activeNationRulesets!["0"],
      rulesetTags: ["no_nation_deck"] as any
    };

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "draw", count: 1 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers only the skip path for optional resource gain when the finite supply is empty", () => {
    const G = createInitialState();
    G.resourceSupply = { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 };

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers only the skip path for optional Break through when no card or finite fallback Materials are available", () => {
    const G = createInitialState();
    G.resourceSupply = { materials: 0 };
    G.marketDecks = { mainDeck: [], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
    G.marketDeckBottomCards = {};

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "break_through", suit: "civilized", source: "deck", count: 1 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers only the skip path for optional Take Unrest when all named recipients are invalid", () => {
    const G = createInitialState();
    G.unrestPile = ["optional_targeted_unrest"];
    G.cardDb.optional_targeted_unrest = {
      id: "optional_targeted_unrest",
      displayName: "Unrest",
      type: "unrest",
      cardType: "unrest",
      suit: "unrest",
      cost: 0,
      tags: ["unrest"],
      effects: []
    };

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "take_unrest", targetPlayerIds: ["9"], count: 1 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers only the skip path for optional resource return when no token can be returned", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 0;

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "return_resource", resource: "materials", amount: 1 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers only the skip path for optional zero-token resource movement", () => {
    const G = createInitialState();
    G.players["0"].resources.materials = 1;

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "return_resource", resource: "materials", amount: 0 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers only the skip path for optional zero-count effects", () => {
    const G = createInitialState();
    G.players["0"].deck = ["test_action_foundry_shift"];

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "draw", count: 0 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });

  it("offers only the skip path for optional Take-card text with a non-market source", () => {
    const G = createInitialState();
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
    G.players["0"].exile = ["exiled_civilized"];
    G.market = ["market_civilized"];

    runEffects({ G, playerId: "0", selfCardId: "test_action_optional" }, [{
      trigger: "on_play",
      op: "optional",
      effects: [{ trigger: "on_play", op: "take_card", source: "exile", suit: "civilized", count: 1 }]
    } as any]);

    expect(G.pendingChoice).toEqual({
      playerId: "0",
      sourceCardId: "test_action_optional",
      choices: [[]]
    });
    expect(G.log.at(-1)?.message).toBe("OptionalPending(test_action_optional/options=1)");
  });
});
