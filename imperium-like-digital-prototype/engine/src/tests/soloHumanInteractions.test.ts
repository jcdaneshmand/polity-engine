import { describe, expect, it } from "vitest";
import { runEffects } from "../cards/effectRunner";
import { createInitialState } from "../game/initialState";
import { playCard, resolveChoice } from "../game/moves";
import type { Card, GameState } from "../game/state";
import { resolvePendingUnrestAllocationChoice } from "../game/unrest";
import { CURRENT_RULES_VERSION } from "../game/version";
import { defaultGameOptions } from "../options/gameOptions";

function card(id: string, overrides: Partial<Card> = {}): Card {
  return { id, displayName: id, type: "action", cardType: "action", suit: "none", cost: 0, effects: [], tags: [], ...overrides };
}

function soloFixture(): GameState {
  const G = createInitialState({
    usePrivateData: false,
    randomSeed: "solo-human-interactions-public-v3",
    options: { ...defaultGameOptions, playerCount: 1, mode: "solo" }
  });
  const human = G.players["1"];
  human.hand = [];
  human.deck = [];
  human.discard = [];
  human.playArea = [];
  human.history = [];
  human.exile = [];
  human.powerArea = [];
  human.stateArea = [];
  human.developmentArea = [];
  human.nationDeck = [];
  human.resources = { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 };
  G.cardDb = {};
  G.cardStates = {};
  G.unrestPile = [];
  G.log = [];
  G.resourceSupply = undefined;
  G.activeNationRulesets = {};

  const bot = G.solo!.bot;
  bot.botDeck = [];
  bot.botDiscard = [];
  bot.botHistory = [];
  bot.botPlayArea = [];
  bot.botDynastyDeck = [];
  bot.resources = { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 };
  bot.slots = {};
  return G;
}

describe("Horizons pp. 30-31, 39: human effects involving the solo Bot", () => {
  it("stamps new games with the engine-owned rules version", () => {
    expect(soloFixture().rulesVersion).toBe(CURRENT_RULES_VERSION);
  });

  it.each([
    { available: 0, requested: 3, stolen: 0 },
    { available: 1, requested: 3, stolen: 1 },
    { available: 3, requested: 3, stolen: 3 },
    { available: 5, requested: 3, stolen: 3 }
  ])("steals as much as possible from the Bot resource pool ($available/$requested)", ({ available, requested, stolen }) => {
    const G = soloFixture();
    G.solo!.bot.resources.materials = available;

    expect(runEffects({ G, playerId: "1", selfCardId: "human_steal" }, [{
      trigger: "on_play",
      op: "steal_resource",
      targetPlayerScope: "others",
      resource: "materials",
      amount: requested
    }])).toBe(true);

    expect(G.players["1"].resources.materials).toBe(stolen);
    expect(G.solo!.bot.resources.materials).toBe(available - stolen);
    expect(G.log.some((entry) => entry.message === "SoloRecipientUnsupported(steal_resource)")).toBe(false);
  });

  it.each([
    {
      id: "play_steal",
      effect: { trigger: "on_play", op: "steal_resource", targetPlayerScope: "others", resource: "materials", amount: 1 },
      arrange: (G: GameState) => { G.solo!.bot.resources.materials = 1; },
      verify: (G: GameState) => expect([G.players["1"].resources.materials, G.solo!.bot.resources.materials]).toEqual([1, 0])
    },
    {
      id: "play_draw",
      effect: { trigger: "on_play", op: "draw", targetPlayerScope: "others", source: "deck", count: 1 },
      arrange: (G: GameState) => {
        G.cardDb.bot_drawn = card("bot_drawn");
        G.solo!.bot.botDeck = ["bot_drawn"];
      },
      verify: (G: GameState) => expect(G.solo!.bot.botDiscard).toEqual(["bot_drawn"])
    },
    {
      id: "play_unrest",
      effect: { trigger: "on_play", op: "take_unrest", targetPlayerScope: "others", count: 1 },
      arrange: (G: GameState) => {
        G.cardDb.unrest_a = card("unrest_a", { type: "unrest", cardType: "unrest", suit: "unrest" });
        G.cardDb.unrest_b = card("unrest_b", { type: "unrest", cardType: "unrest", suit: "unrest" });
        G.unrestPile = ["unrest_a", "unrest_b"];
      },
      verify: (G: GameState) => expect(G.solo!.bot.botDeck).toContain("unrest_a")
    }
  ])("lets production playCard execute a supported Bot interaction ($id)", ({ id, effect, arrange, verify }) => {
    const G = soloFixture();
    G.cardDb[id] = card(id, { effects: [effect] as any });
    G.players["1"].hand = [id];
    G.players["1"].actionsRemaining = 1;
    G.players["1"].actionTokensAvailable = 1;
    arrange(G);

    playCard({ G, ctx: { currentPlayer: "1" } as any }, id);

    expect(G.players["1"].discard).toContain(id);
    expect(G.log.some((entry) => entry.message === `InvalidMove(playCard): no_resolvable_on_play_effects(${id})`)).toBe(false);
    verify(G);
  });

  it("resolves an explicit if-unable branch for the Bot without stealing a partial amount", () => {
    const G = soloFixture();
    G.solo!.bot.resources.materials = 1;

    expect(runEffects({ G, playerId: "1", selfCardId: "human_steal_fallback" }, [{
      trigger: "on_play",
      op: "steal_resource",
      targetPlayerScope: "others",
      resource: "materials",
      amount: 2,
      ifUnable: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }]
    }])).toBe(true);

    expect(G.players["1"].resources.materials).toBe(0);
    expect(G.solo!.bot.resources.materials).toBe(1);
    expect(G.solo!.bot.resources.knowledge).toBe(1);
  });

  it.each([
    { source: "deck" as const, flags: {} },
    { source: "discard" as const, flags: {} },
    { source: "exile" as const, flags: { optionalForTargets: true } },
    { source: "fameDeck" as const, flags: { upTo: true } }
  ])("maps a permitted Bot draw from $source to its Bot deck", ({ source, flags }) => {
    const G = soloFixture();
    G.cardDb.bot_a = card("bot_a");
    G.cardDb.bot_b = card("bot_b");
    G.solo!.bot.botDeck = ["bot_a", "bot_b"];

    expect(runEffects({ G, playerId: "1", selfCardId: "human_draw" }, [{
      trigger: "on_play",
      op: "draw",
      count: 2,
      source,
      targetPlayerScope: "others",
      ...flags
    }])).toBe(true);

    expect(G.solo!.bot.botDeck).toEqual([]);
    expect(G.solo!.bot.botDiscard).toEqual(["bot_a", "bot_b"]);
    expect(G.pendingChoice).toBeUndefined();
    expect(JSON.stringify(G.log)).not.toContain("bot_a");
    expect(JSON.stringify(G.log)).not.toContain("bot_b");
  });

  it("does not reshuffle the Bot discard when a human effect permits a draw from an empty deck", () => {
    const G = soloFixture();
    G.cardDb.old_discard = card("old_discard");
    G.solo!.bot.botDiscard = ["old_discard"];

    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play",
      op: "draw",
      count: 2,
      targetPlayerScope: "others",
      optionalForTargets: true
    }])).toBe(true);

    expect(G.solo!.bot.botDeck).toEqual([]);
    expect(G.solo!.bot.botDiscard).toEqual(["old_discard"]);
  });

  it("puts Bot-taken Unrest on top of its deck in gained order", () => {
    const G = soloFixture();
    G.cardDb.unrest_a = card("unrest_a", { type: "unrest", cardType: "unrest", suit: "unrest" });
    G.cardDb.unrest_b = card("unrest_b", { type: "unrest", cardType: "unrest", suit: "unrest" });
    G.cardDb.unrest_spare = card("unrest_spare", { type: "unrest", cardType: "unrest", suit: "unrest" });
    G.cardDb.bot_existing = card("bot_existing");
    G.unrestPile = ["unrest_a", "unrest_b", "unrest_spare"];
    G.solo!.bot.botDeck = ["bot_existing"];

    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play",
      op: "take_unrest",
      count: 2,
      targetPlayerScope: "others"
    }])).toBe(true);

    expect(G.solo!.bot.botDeck).toEqual(["unrest_b", "unrest_a", "bot_existing"]);
    expect(G.unrestPile).toEqual(["unrest_spare"]);
  });

  it("collapses immediately when the Bot must take Unrest from an empty pile", () => {
    const G = soloFixture();

    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play",
      op: "take_unrest",
      count: 1,
      targetPlayerScope: "others"
    }])).toBe(false);

    expect(G.solo!.bot.botDeck).toEqual([]);
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
  });

  it("triggers immediate Collapse when the Bot takes the final Unrest and stops later effects", () => {
    const G = soloFixture();
    G.cardDb.last_unrest = card("last_unrest", { type: "unrest", cardType: "unrest", suit: "unrest" });
    G.unrestPile = ["last_unrest"];

    expect(runEffects({ G, playerId: "1" }, [
      { trigger: "on_play", op: "take_unrest", count: 1, targetPlayerScope: "others" },
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 3 }
    ])).toBe(false);

    expect(G.solo!.bot.botDeck).toEqual(["last_unrest"]);
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
    expect(G.players["1"].resources.materials).toBe(0);
  });

  it("allows a short mixed-recipient Unrest allocation to select the Bot", () => {
    const G = soloFixture();
    const botId = G.solo!.bot.botId;
    G.cardDb.last_unrest = card("last_unrest", { type: "unrest", cardType: "unrest", suit: "unrest" });
    G.unrestPile = ["last_unrest"];

    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play",
      op: "take_unrest",
      count: 1,
      targetPlayerScope: "all"
    }])).toBe(true);
    expect(G.pendingUnrestAllocationChoice?.recipientPlayerIds).toEqual(["1", botId]);

    expect(resolvePendingUnrestAllocationChoice(G, "1", [botId])).toBe(true);
    expect(G.solo!.bot.botDeck).toEqual(["last_unrest"]);
    expect(G.players["1"].hand).toEqual([]);
    expect(G.gameover?.reason).toBe("collapse:unrest_pile_empty");
  });

  it("recalls and abandons the Bot's most recently played eligible Regions", () => {
    const G = soloFixture();
    G.cardDb.region_old = card("region_old", { type: "region", cardType: "region", suit: "region" });
    G.cardDb.action_middle = card("action_middle");
    G.cardDb.region_new = card("region_new", { type: "region", cardType: "region", suit: "region" });
    G.solo!.bot.botPlayArea = ["region_old", "action_middle", "region_new"];

    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play", op: "recall_region", targetPlayerScope: "others"
    }])).toBe(true);
    expect(G.solo!.bot.botDeck).toEqual(["region_new"]);
    expect(G.solo!.bot.botPlayArea).toEqual(["region_old", "action_middle"]);

    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play", op: "abandon_region", targetPlayerScope: "others"
    }])).toBe(true);
    expect(G.solo!.bot.botDiscard).toEqual(["region_old"]);
    expect(G.solo!.bot.botPlayArea).toEqual(["action_middle"]);
  });

  it("treats zero Bot Region candidates as a legal no-op and honors one explicit candidate", () => {
    const G = soloFixture();

    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play", op: "recall_region", targetPlayerScope: "others"
    }])).toBe(true);
    expect(G.solo!.bot.botDeck).toEqual([]);

    G.cardDb.only_region = card("only_region", { type: "region", cardType: "region", suit: "region" });
    G.solo!.bot.botPlayArea = ["only_region"];
    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play", op: "abandon_region", cardId: "only_region", targetPlayerScope: "others"
    }])).toBe(true);
    expect(G.solo!.bot.botPlayArea).toEqual([]);
    expect(G.solo!.bot.botDiscard).toEqual(["only_region"]);
  });

  it("rejects an explicit non-Region Bot target without changing Bot zones", () => {
    const G = soloFixture();
    G.cardDb.bot_action = card("bot_action");
    G.solo!.bot.botPlayArea = ["bot_action"];

    expect(runEffects({ G, playerId: "1" }, [{
      trigger: "on_play", op: "recall_region", cardId: "bot_action", targetPlayerScope: "others"
    }])).toBe(false);
    expect(G.solo!.bot.botPlayArea).toEqual(["bot_action"]);
    expect(G.solo!.bot.botDeck).toEqual([]);
  });

  it("ignores an effect that would allow the Bot to return Unrest", () => {
    const G = soloFixture();
    const botId = G.solo!.bot.botId;
    G.cardDb.bot_unrest = card("bot_unrest", { type: "unrest", cardType: "unrest", suit: "unrest" });
    G.solo!.bot.botDeck = ["bot_unrest"];

    expect(runEffects({ G, playerId: botId }, [{
      trigger: "on_play", op: "return_unrest"
    }])).toBe(true);

    expect(G.solo!.bot.botDeck).toEqual(["bot_unrest"]);
    expect(G.unrestPile).toEqual([]);
    expect(G.log.at(-1)?.message).toBe("BotReturnUnrestIgnored");
  });

  it("preserves the human chooser and source while a nested optional Bot draw resumes later text", () => {
    const G = soloFixture();
    G.cardDb.bot_draw = card("bot_draw");
    G.solo!.bot.botDeck = ["bot_draw"];

    expect(runEffects({ G, playerId: "1", selfCardId: "human_optional_source" }, [
      {
        trigger: "on_play",
        op: "optional",
        effects: [{ trigger: "on_play", op: "draw", count: 1, targetPlayerScope: "others", optionalForTargets: true }]
      },
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ])).toBe(true);

    expect(G.pendingChoice).toMatchObject({ playerId: "1", sourceCardId: "human_optional_source" });
    const resumed = structuredClone(G);
    resolveChoice({ G: resumed, ctx: { currentPlayer: "1" } as any }, 0);

    expect(resumed.pendingChoice).toBeUndefined();
    expect(resumed.solo!.bot.botDiscard).toEqual(["bot_draw"]);
    expect(resumed.players["1"].resources.materials).toBe(1);
    expect(resumed.log.some((entry) => entry.message === "SoloRecipientUnsupported(draw_up_to)")).toBe(false);
  });

  it("applies all-recipient resource gains once to the human and once to the Bot", () => {
    const G = soloFixture();

    expect(runEffects({ G, playerId: "1", selfCardId: "human_all_gain" }, [{
      trigger: "on_play", op: "gain_resource", resource: "materials", amount: 2, targetPlayerScope: "all"
    }])).toBe(true);

    expect(G.players["1"].resources.materials).toBe(2);
    expect(G.solo!.bot.resources.materials).toBe(2);
  });

  it("leaves ordinary two-human opponent targeting unchanged", () => {
    const G = createInitialState({
      usePrivateData: false,
      randomSeed: "solo-human-interactions-multiplayer-control",
      options: { ...defaultGameOptions, playerCount: 2, mode: "multiplayer" }
    });
    G.players["1"].resources.materials = 0;
    G.players["2"].resources.materials = 2;

    expect(runEffects({ G, playerId: "1", selfCardId: "human_control" }, [{
      trigger: "on_play", op: "steal_resource", resource: "materials", amount: 1, targetPlayerScope: "others"
    }])).toBe(true);

    expect(G.players["1"].resources.materials).toBe(1);
    expect(G.players["2"].resources.materials).toBe(1);
    expect(G.solo).toBeUndefined();
  });
});
