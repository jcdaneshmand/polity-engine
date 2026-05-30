import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { onTurnEnd } from "../game/turn";
import { resolveRegionChoice } from "../game/moves";
import type { GameOptions } from "../options/gameOptions";
import { runBotCleanup } from "../solo/botCleanup";
import { loadBotStateTables } from "../solo/botStateTableLoader";
import { loadBotTradeRoutesTables } from "../solo/botTradeRoutesTableLoader";
import { runBotTurn } from "../solo/botTurn";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { applyBotEffect, resolveBotCard } from "../solo/botStateTableResolver";
import { resolveBotProfitsWhereAble, resolveBotTrade, resolveBotTradeRoutesEndOfTurn, resolveBotTriggerTradeRoute } from "../solo/botTradeRoutesResolver";

const baseCost = { materials: 0, population: 0, progress: 0, goods: 0 };
const options: GameOptions = { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain" };
const nation: any = {
  id: "test_nation_sun_coast",
  displayName: "N",
  powerCardIds: [],
  stateCardIds: [],
  startingDeckCardIds: ["starter"],
  nationDeckCardIds: [],
  developmentCardIds: [],
  setupRules: [],
  passiveRules: [],
  actionTokensBase: 1,
  exhaustTokensBase: 1,
  requiredExpansions: [],
  implemented: false,
  tested: false
};

const card = (overrides: Record<string, unknown>) => ({
  id: "starter",
  displayName: "Starter",
  suit: "none",
  cardType: "action",
  cost: baseCost,
  developmentCost: baseCost,
  vp: { mode: "none", value: null },
  startingLocation: "draw_deck",
  isTradeRouteExpansion: false,
  effects: [],
  tags: [],
  implemented: false,
  tested: false,
  requiredExpansions: [],
  allowedModes: ["multiplayer", "solo", "practice"],
  ...overrides
});

function addHumanScoringUnrest(G: any, count: number) {
  for (let i = 0; i < count; i += 1) {
    const id = `human_collapse_score_unrest_${i}_${Object.keys(G.cardDb).length}`;
    G.cardDb[id] = card({
      id,
      displayName: "Unrest",
      suit: "unrest",
      cardType: "unrest",
      type: "unrest",
      tags: ["unrest"]
    });
    G.players["0"].discard.push(id);
  }
}

function writePrivateBotTableFixtures(prefix: string): { botStateTablePath: string; botTradeRoutesTablePath: string; cleanup: () => void } {
  const botStateTablePath = path.join(os.tmpdir(), `${prefix}-bot-state-${Date.now()}.json`);
  const botTradeRoutesTablePath = path.join(os.tmpdir(), `${prefix}-bot-trade-${Date.now()}.json`);
  fs.writeFileSync(botStateTablePath, JSON.stringify({
    test_nation_sun_coast_S: {
      id: "test_nation_sun_coast",
      botNationId: "test_nation_sun_coast",
      displayName: "Test Nation Bot Table",
      side: "S",
      rows: [{ id: "history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }]
    }
  }));
  fs.writeFileSync(botTradeRoutesTablePath, JSON.stringify({}));
  return {
    botStateTablePath,
    botTradeRoutesTablePath,
    cleanup: () => {
      fs.rmSync(botStateTablePath, { force: true });
      fs.rmSync(botTradeRoutesTablePath, { force: true });
    }
  };
}

describe("solo bot setup from imported cards", () => {
  it("uses only slots 1-4 on Chieftain and Warlord difficulty", () => {
    for (const soloDifficulty of ["chieftain", "warlord"] as const) {
      const G = createInitialGameStateFromPipeline({
        options: { ...options, soloDifficulty },
        cardDb: {
          starter: card({}),
          bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
          bot_2: card({ id: "bot_2", displayName: "Bot 2", startingLocation: "bot_deck" }),
          bot_3: card({ id: "bot_3", displayName: "Bot 3", startingLocation: "bot_deck" }),
          bot_4: card({ id: "bot_4", displayName: "Bot 4", startingLocation: "bot_deck" }),
          bot_5: card({ id: "bot_5", displayName: "Bot 5", startingLocation: "bot_deck" })
        } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" }
      });

      expect(Object.keys(G.solo?.bot.slots ?? {}).map(Number)).toEqual([1, 2, 3, 4]);
      expect(G.solo?.bot.botDeck).toEqual(["bot_5"]);
    }
  });

  it("uses rulebook Bot starting resources by solo difficulty", () => {
    const cases = [
      { soloDifficulty: "chieftain" as const, enabledExpansions: [] as const, resources: {} },
      { soloDifficulty: "warlord" as const, enabledExpansions: [] as const, resources: {} },
      { soloDifficulty: "imperator" as const, enabledExpansions: [] as const, resources: {} },
      { soloDifficulty: "sovereign" as const, enabledExpansions: [] as const, resources: { materials: 3, influence: 2, knowledge: 1 } },
      { soloDifficulty: "overlord" as const, enabledExpansions: [] as const, resources: { materials: 3, influence: 2, knowledge: 1 } },
      { soloDifficulty: "supreme_ruler" as const, enabledExpansions: [] as const, resources: { materials: 3, influence: 2, knowledge: 1 } },
      { soloDifficulty: "sovereign" as const, enabledExpansions: ["trade_routes"] as const, resources: { materials: 3, influence: 2, goods: 1 } }
    ];

    for (const testCase of cases) {
      const G = createInitialGameStateFromPipeline({
        options: { ...options, soloDifficulty: testCase.soloDifficulty, enabledExpansions: [...testCase.enabledExpansions] },
        cardDb: { starter: card({}) } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" }
      });

      expect(G.solo?.bot.resources).toEqual(testCase.resources);
    }
  });

  it("deals bot slots from cards imported with startingLocation bot_deck", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });

    const botCardIds = [
      ...(G.solo?.bot.botDeck ?? []),
      ...Object.values(G.solo?.bot.slots ?? {}).flatMap((slot) => slot.cardId ? [slot.cardId] : [])
    ];
    expect(botCardIds).toContain("bot_region");
  });

  it("preserves imported metadata so table suit triggers can resolve revealed cards", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });

    const result = resolveBotCard({
      G,
      bot: G.solo!.bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "region", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true },
          { id: "fallback", priority: 99, trigger: { kind: "other" }, effects: [{ op: "bot_discard_revealed_card" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("region");
    expect(G.solo?.bot.botHistory).toContain("bot_region");
  });

  it("applies non-destination bot table effects before moving the revealed card", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });

    const result = resolveBotCard({
      G,
      bot: G.solo!.bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "gain_goods", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 1 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("gain_goods");
    expect(G.solo?.bot.resources.goods).toBe(1);
    expect(G.solo?.bot.botDiscard).toContain("bot_region");
  });

  it("adds ordinary Fame gained by the Bot to the top of the Bot deck", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        fame_top: card({ id: "fame_top", displayName: "Fame", suit: "fame", cardType: "fame", startingLocation: "fame_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.fameDeck = { available: ["fame_top"], specialBottomCardId: "king_of_kings", specialBottomSide: "A", resolvedSpecialByPlayer: {} };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "gain_fame", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_gain_fame", count: 1 } as any], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.fameDeck.available).toEqual([]);
    expect(bot.botDeck).toEqual(["fame_top", "existing_top"]);
    expect(bot.botDiscard).toContain("bot_region");
    expect(G.scoring).toBeUndefined();
  });

  it("resolves Bot King of Kings when a Bot Fame gain reaches the special bottom card", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botStateSide = "F";
    bot.botDeck = ["existing_top"];
    bot.botDynastyDeck = ["dynasty_top"];
    G.fameDeck = { available: [], specialBottomCardId: "king_of_kings", specialBottomSide: "B", resolvedSpecialByPlayer: {} };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "F",
        rows: [
          { id: "gain_fame", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_gain_fame", count: 1 } as any], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.knowledge).toBe(3);
    expect(bot.botDeck).toEqual(["dynasty_top", "existing_top"]);
    expect(G.fameDeck.specialBottomCardId).toBeUndefined();
    expect(G.scoring?.reason).toBe("bot_king_of_kings");
  });

  it("resolves the top Bot deck card through the same state table", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_fame: card({ id: "bot_fame", displayName: "Bot Fame", suit: "fame", cardType: "fame", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["bot_fame"];
    bot.botDiscard = [];
    const table = {
      id: "test_table",
      botNationId: "test_nation_sun_coast",
      displayName: "Test Table",
      side: "S",
      rows: [
        { id: "resolve_deck", priority: 1, trigger: { kind: "suit" as const, suit: "region" as const }, effects: [{ op: "bot_resolve_top_bot_deck" as const }], implemented: true, tested: true },
        { id: "fame_goods", priority: 1, trigger: { kind: "suit" as const, suit: "fame" as const }, effects: [{ op: "bot_gain_resource" as const, resource: "goods" as const, count: 2 }], implemented: true, tested: true }
      ]
    };

    const result = resolveBotCard({ G, bot, revealedCardId: "bot_region", source: "slot", table });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.goods).toBe(2);
    expect(bot.botDeck).toEqual([]);
    expect(bot.botDiscard).toEqual(["bot_fame", "bot_region"]);
  });

  it("gains 2 Materials when resolving the top Bot deck but it is empty", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = [];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "resolve_deck", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_resolve_top_bot_deck" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.materials).toBe(2);
    expect(bot.botDiscard).toContain("bot_region");
  });

  it("returns the most recent matching Bot discard card to the Unrest pile", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        older_unrest: card({ id: "older_unrest", displayName: "Older Unrest", suit: "unrest", cardType: "unrest" }),
        action_discard: card({ id: "action_discard", displayName: "Action", suit: "civilized", cardType: "action" }),
        recent_unrest: card({ id: "recent_unrest", displayName: "Recent Unrest", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDiscard = ["older_unrest", "action_discard", "recent_unrest"];
    G.unrestPile = [];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "return_unrest", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_return_from_discard", filter: { suits: ["unrest"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.unrestPile).toEqual(["recent_unrest"]);
    expect(bot.botDiscard).toEqual(["older_unrest", "action_discard", "bot_region"]);
  });

  it("recalls the most recently played matching Bot region to the top of the Bot deck", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        old_region: card({ id: "old_region", displayName: "Old Region", suit: "region", cardType: "region" }),
        recent_region: card({ id: "recent_region", displayName: "Recent Region", suit: "region", cardType: "region" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    bot.botPlayArea = ["old_region", "recent_region"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "recall_region", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_recall_in_play", filter: { suits: ["region"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck).toEqual(["recent_region", "existing_top"]);
    expect(bot.botPlayArea).toEqual(["old_region"]);
    expect(bot.botDiscard).toContain("bot_region");
  });

  it("returns a revealed Bot Unrest card to the Unrest pile instead of discarding it", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_unrest: card({ id: "bot_unrest", displayName: "Bot Unrest", suit: "unrest", cardType: "unrest", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDiscard = [];
    G.unrestPile = [];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_unrest",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "return_unrest", priority: 1, trigger: { kind: "unrest" }, effects: [{ op: "bot_return_revealed_card_to_unrest" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(result.cardDestination).toBe("unrest");
    expect(G.unrestPile).toEqual(["bot_unrest"]);
    expect(bot.botDiscard).toEqual([]);
  });

  it("discards the requested number of cards from the top of the Bot deck", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        top_one: card({ id: "top_one", displayName: "Top One", suit: "civilized", cardType: "action" }),
        top_two: card({ id: "top_two", displayName: "Top Two", suit: "civilized", cardType: "action" }),
        remaining: card({ id: "remaining", displayName: "Remaining", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["top_one", "top_two", "remaining"];
    bot.botDiscard = [];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "discard_top", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_discard_top_bot_deck", count: 2 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck).toEqual(["remaining"]);
    expect(bot.botDiscard).toEqual(["top_one", "top_two", "bot_region"]);
  });

  it("does not reshuffle or gain Materials when discarding from an empty Bot deck", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = [];
    bot.botDiscard = [];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "discard_top", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_discard_top_bot_deck", count: 1 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.materials).toBeUndefined();
    expect(bot.botDiscard).toEqual(["bot_region"]);
  });

  it("falls through to the next matching Bot row when no part of the first row can resolve", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDiscard = [];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "empty_return", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_return_from_discard", filter: { suits: ["unrest"] } }], implemented: true, tested: true },
          { id: "fallback_gain", priority: 2, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("fallback_gain");
    expect(bot.resources.materials).toBe(1);
    expect(bot.botDiscard).toContain("bot_region");
  });

  it("human_gain_resource in a Bot table row gives the human player resources", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "human_gain", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "human_gain_resource", resource: "knowledge", count: 2 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.players["0"].resources.knowledge).toBe(2);
    expect(bot.botDiscard).toContain("bot_region");
  });

  it("human_take_unrest in a Bot table row makes the human take Unrest", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        unrest_one: card({ id: "unrest_one", displayName: "Unrest", suit: "unrest", cardType: "unrest" }),
        unrest_two: card({ id: "unrest_two", displayName: "Unrest", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["0"].discard = [];
    G.unrestPile = ["unrest_one", "unrest_two"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "human_unrest", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "human_take_unrest", count: 2 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.players["0"].discard).toEqual(["unrest_one", "unrest_two"]);
    expect(G.unrestPile).toEqual([]);
    expect(bot.botDiscard).toContain("bot_region");
  });

  it("moves Bot resources onto the current Cultists state card or uses the fallback", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_unrest: card({ id: "bot_unrest", displayName: "Bot Unrest", suit: "unrest", cardType: "unrest", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.influence = 1;
    const table = { id: "cultists_ceremonial_gathering", botNationId: "cultists", displayName: "Cultists", side: "F", rows: [] };

    expect(applyBotEffect(G, bot, table, "state", { op: "bot_move_resource_to_state_card", resource: "influence", count: 1, ifUnable: [{ op: "bot_gain_resource", resource: "influence", count: 1 }] })).toEqual([]);
    expect(bot.resources.influence).toBe(0);
    expect(bot.stateTokens?.cultists_ceremonial_gathering_F?.influence).toBe(1);

    expect(applyBotEffect(G, bot, table, "state", { op: "bot_move_resource_to_state_card", resource: "influence", count: 1, ifUnable: [{ op: "bot_gain_resource", resource: "influence", count: 1 }] })).toEqual([]);
    expect(bot.resources.influence).toBe(1);
    expect(bot.stateTokens?.cultists_ceremonial_gathering_F?.influence).toBe(1);
  });

  it("human_take_chaos moves Chaos from the Cultists pile to the human discard", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        chaos_one: card({ id: "chaos_one", displayName: "Chaos", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    const table = { id: "cultists_ceremonial_gathering", botNationId: "cultists", displayName: "Cultists", side: "F", rows: [] };
    G.specialZones = { "0": { chaos_pile: { id: "chaos_pile", displayName: "Chaos Pile", cardIds: ["chaos_one"], visibility: "public", scoresAsOwned: false } } };

    expect(applyBotEffect(G, bot, table, "state", { op: "human_take_chaos", count: 1 })).toEqual([]);
    expect(G.specialZones["0"].chaos_pile.cardIds).toEqual([]);
    expect(G.players["0"].discard).toContain("chaos_one");
  });

  it("Cultists cleanup flips between the two errata state tables at token thresholds", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        progress_history_card: card({ id: "progress_history_card", displayName: "Progress", suit: "none", cardType: "action", tags: ["progress_history"] }),
        market_one: card({ id: "market_one", displayName: "Market One", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    const ceremonial = { id: "cultists_ceremonial_gathering", botNationId: "cultists", displayName: "Cultists", side: "F", rows: [] };
    const research = { id: "cultists_research_ceremony", botNationId: "cultists", displayName: "Cultists", side: "S", rows: [] };
    G.solo!.botStateTables = {
      cultists_ceremonial_gathering_F: ceremonial,
      cultists_research_ceremony_S: research
    };
    bot.botStateTableId = "cultists_ceremonial_gathering_F";
    bot.botStateSide = "F";
    bot.botHistory = ["progress_history_card"];
    bot.stateTokens = { cultists_ceremonial_gathering_F: { influence: 15 } };

    expect(applyBotEffect(G, bot, ceremonial, "cleanup", { op: "bot_resolve_cultists_state_cleanup" })).toEqual([]);
    expect(bot.botStateTableId).toBe("cultists_research_ceremony_S");
    expect(bot.botDiscard).toContain("progress_history_card");
    expect(bot.stateTokens.cultists_ceremonial_gathering_F.influence).toBe(0);

    bot.stateTokens.cultists_research_ceremony_S = { knowledge: 5 };
    G.market = ["market_one"];
    G.marketResources = { market_one: { goods: 2 } };
    expect(applyBotEffect(G, bot, research, "cleanup", { op: "bot_resolve_cultists_state_cleanup" })).toEqual([]);
    expect(bot.botStateTableId).toBe("cultists_ceremonial_gathering_F");
    expect(G.market).toEqual([]);
    expect(G.marketResources.market_one).toBeUndefined();
  });

  it("bot turn stops resolving slots and cleanup when human_take_unrest triggers Collapse", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_collapse: card({ id: "bot_collapse", displayName: "Bot Collapse", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        bot_refill: card({ id: "bot_refill", displayName: "Bot Refill", suit: "none", cardType: "action", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; slot.face = "down"; slot.blockedByDie = false; });
    bot.slots[1].cardId = "bot_collapse";
    bot.slots[2].cardId = "bot_after";
    bot.botDeck = ["bot_refill"];
    bot.botDiscard = [];
    bot.resources.goods = 0;
    G.unrestPile = [];
    addHumanScoringUnrest(G, 1);
    G.solo!.botStateTables = {
      [bot.botStateTableId]: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "collapse", priority: 1, trigger: { kind: "card_id", cardId: "bot_collapse" }, effects: [{ op: "human_take_unrest", count: 1 }], implemented: true, tested: true },
          { id: "after", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 1 }], implemented: true, tested: true }
        ]
      }
    };

    runBotTurn({ G, rollDie: () => 5 });

    expect(G.gameover).toEqual({
      winner: "bot_0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1 }
    });
    expect(bot.resources.goods).toBe(0);
    expect(bot.botDiscard).toEqual([]);
    expect(bot.slots[1].cardId).toBe("bot_collapse");
    expect(bot.slots[2].cardId).toBe("bot_after");
    expect(bot.botDeck).toEqual(["bot_refill"]);
  });

  it("uses a deterministic die fallback when a Bot turn is called without injected RNG", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_one: card({ id: "bot_one", displayName: "Bot One", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; slot.face = "down"; slot.blockedByDie = false; });
    bot.slots[1].cardId = "bot_one";
    G.solo!.botStateTables = {
      [bot.botStateTableId]: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "fallback", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_discard_revealed_card" }], implemented: true, tested: true }
        ]
      }
    };
    const originalRandom = Math.random;
    Math.random = () => { throw new Error("ambient randomness should not be used"); };
    try {
      runBotTurn({ G });
    } finally {
      Math.random = originalRandom;
    }

    expect(bot.lastDieRoll).toBe(1);
    expect(bot.slots[1].blockedByDie).toBe(false);
    expect(bot.slots[1].cardId).toBe("bot_one");
  });

  it("keeps the last resolved Bot slot card visible for the UI after cleanup", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_used: card({ id: "bot_used", displayName: "Bot Used", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_refill: card({ id: "bot_refill", displayName: "Bot Refill", suit: "civilized", cardType: "action", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; slot.face = "down"; slot.blockedByDie = false; });
    bot.slots[1].cardId = "bot_used";
    bot.botDeck = ["bot_refill"];
    bot.botDiscard = [];
    G.solo!.botStateTables = {
      [bot.botStateTableId]: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
        ]
      }
    };

    runBotTurn({ G, rollDie: () => 5 });

    expect(bot.botHistory).toContain("bot_used");
    expect(bot.slots[1].cardId).toBe("bot_refill");
    expect(bot.slots[1].face).toBe("down");
    expect(bot.revealedSlotCard).toEqual({ slotNumber: 1, cardId: "bot_used" });
  });

  it("human_recall pauses the Bot turn for a human Region choice and resumes after it resolves", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        human_region: card({ id: "human_region", displayName: "Human Region", suit: "region", cardType: "region" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["0"].playArea = ["human_region"];
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "prompt", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "human_recall", filter: { suits: ["region"] } }], implemented: true, tested: true },
          { id: "after", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "test_table";
    bot.botDeck = [];
    bot.botDiscard = [];
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[1].cardId = "bot_prompt";
    bot.slots[2].cardId = "bot_after";

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.pendingRegionChoice).toEqual({
      playerId: "0",
      sourceCardId: "bot_prompt",
      op: "recall_region",
      cardIds: ["human_region"]
    });
    expect(G.solo?.pausedBotTurn).toEqual({ remainingSlotNumbers: [2], effectsRemaining: 3 });
    expect(bot.resources.goods).toBeUndefined();
    expect(bot.slots[2].cardId).toBe("bot_after");

    resolveRegionChoice({ G, ctx: { currentPlayer: "0" } as any }, "human_region");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(G.players["0"].hand).toContain("human_region");
    expect(bot.resources.goods).toBe(2);
    expect(bot.botDiscard).toEqual([]);
    expect([bot.slots[1].cardId, bot.slots[2].cardId].sort()).toEqual(["bot_after", "bot_prompt"]);
  });

  it("human_abandon pauses the Bot turn for a human Region choice", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        human_region: card({ id: "human_region", displayName: "Human Region", suit: "region", cardType: "region" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["0"].playArea = ["human_region"];
    bot.botDiscard = [];
    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_prompt",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "prompt", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "human_abandon", filter: { suits: ["region"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.pendingRegionChoice).toEqual({
      playerId: "0",
      sourceCardId: "bot_prompt",
      op: "abandon_region",
      cardIds: ["human_region"]
    });
  });

  it("Bot Trade Route trigger resolves the route commerce effects", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        trade_route: card({ id: "trade_route", displayName: "Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          { tradeRouteId: "trade_route", publicPlaceholderName: "Route", commerceEffects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], profitEffects: [] }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotTriggerTradeRoute(G, bot, "trade_route");

    expect(bot.resources.goods).toBe(2);
    expect(bot.botLog.some((entry) => entry.message === "bot_trigger_trade_route:trade_route")).toBe(false);
  });

  it("Bot Trade selects an available human Trade Route, adds Goods, gains Progress, and triggers commerce", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        human_route: card({ id: "human_route", displayName: "Human Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["0"].playArea = ["human_route"];
    G.cardStates = { human_route: { resources: { goods: 1 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          { tradeRouteId: "human_route", publicPlaceholderName: "Human Route", commerceEffects: [{ op: "human_gain_resource", resource: "goods", count: 1 }], profitEffects: [] }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotTrade(G, bot);

    expect(G.cardStates.human_route.resources?.goods).toBe(2);
    expect(bot.resources.knowledge).toBe(1);
    expect(G.players["0"].resources.goods).toBe(1);
  });

  it("Bot Trade Route commerce stops remaining effects when human_take_unrest triggers Collapse", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        human_route: card({ id: "human_route", displayName: "Human Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["0"].playArea = ["human_route"];
    addHumanScoringUnrest(G, 1);
    G.unrestPile = [];
    G.cardStates = { human_route: { resources: { goods: 1 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "human_route",
            publicPlaceholderName: "Human Route",
            commerceEffects: [
              { op: "human_take_unrest", count: 1 },
              { op: "bot_gain_resource", resource: "goods", count: 1 }
            ],
            profitEffects: []
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotTrade(G, bot);

    expect(G.gameover).toEqual({
      winner: "bot_0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1 }
    });
    expect(bot.resources.knowledge).toBe(1);
    expect(bot.resources.goods).toBeUndefined();
    expect(G.cardStates.human_route.resources?.goods).toBe(2);
  });

  it("Bot Trade Routes end-of-turn resolves the first row for the current merchant state", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: { starter: card({}) } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.merchantState = "merchants";
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [],
        endOfTurnRows: [
          { merchantState: "merchant_empire", priority: 1, effects: [{ op: "bot_gain_resource", resource: "goods", count: 9 }] },
          { merchantState: "merchants", priority: 2, effects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }] },
          { merchantState: "merchants", priority: 1, effects: [{ op: "bot_gain_resource", resource: "knowledge", count: 3 }] }
        ]
      }
    };

    resolveBotTradeRoutesEndOfTurn(G, bot);

    expect(bot.resources.knowledge).toBe(3);
    expect(bot.resources.materials).toBeUndefined();
    expect(bot.resources.goods).toBeUndefined();
  });

  it("Bot Trade Routes end-of-turn falls through rows that cannot resolve", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: { starter: card({}) } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.merchantState = "merchants";
    bot.botDiscard = [];
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [],
        endOfTurnRows: [
          { merchantState: "merchants", priority: 1, effects: [{ op: "bot_return_from_discard", filter: { suits: ["unrest"] } }] },
          { merchantState: "merchants", priority: 2, effects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }] }
        ]
      }
    };

    resolveBotTradeRoutesEndOfTurn(G, bot);

    expect(bot.resources.goods).toBe(2);
    expect(bot.botLog).toEqual([]);
  });

  it("Bot Trade Routes end-of-turn can pay Goods to gain Fame and flip to Merchant Empire", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        fame_top: card({ id: "fame_top", displayName: "Fame Top", suit: "fame", cardType: "fame" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.merchantState = "merchants";
    bot.resources.goods = 5;
    G.fameDeck = { available: ["fame_top"], resolvedSpecialByPlayer: {} };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [],
        endOfTurnRows: [
          { merchantState: "merchants", priority: 1, effects: [{ op: "bot_acquire", filter: { cardTypes: ["trade_route"] } }] },
          {
            merchantState: "merchants",
            priority: 2,
            effects: [{
              op: "bot_pay_resource_then",
              resource: "goods",
              count: 5,
              effects: [{ op: "bot_gain_fame", count: 1 }, { op: "bot_flip_merchant_state", nextState: "merchant_empire" }]
            }]
          },
          { merchantState: "merchants", priority: 3, effects: [{ op: "bot_gain_resource", resource: "materials", count: 9 }] }
        ]
      }
    };

    resolveBotTradeRoutesEndOfTurn(G, bot);

    expect(bot.resources.goods).toBe(0);
    expect(bot.merchantState).toBe("merchant_empire");
    expect(bot.botDeck[0]).toBe("fame_top");
    expect(bot.resources.materials).toBeUndefined();
  });

  it("smokes the solo Bot lifecycle across slot resolution, pause/resume, Trade Routes, table flip, and cleanup", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"], soloDifficulty: "imperator" },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_flip: card({ id: "bot_flip", displayName: "Bot Flip", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "uncivilized", cardType: "action", startingLocation: "bot_deck" }),
        human_region: card({ id: "human_region", displayName: "Human Region", suit: "region", cardType: "region" }),
        fame_top: card({ id: "fame_top", displayName: "Fame Top", suit: "fame", cardType: "fame" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["0"].playArea = ["human_region"];
    G.fameDeck = { available: ["fame_top"], resolvedSpecialByPlayer: {} };
    G.solo!.botStateTables = {
      smoke_S: {
        id: "smoke",
        botNationId: "test_nation_sun_coast",
        displayName: "Smoke",
        side: "S",
        rows: [
          { id: "pause", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "human_recall", filter: { suits: ["region"] } }], implemented: true, tested: true },
          { id: "flip", priority: 1, trigger: { kind: "card_id", cardId: "bot_flip" }, effects: [{ op: "bot_flip_state_table", nextSide: "F" }], implemented: true, tested: true }
        ]
      },
      smoke_F: {
        id: "smoke",
        botNationId: "test_nation_sun_coast",
        displayName: "Smoke",
        side: "F",
        rows: [
          { id: "goods", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 5 }], implemented: true, tested: true },
          { id: "front", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
        ]
      }
    };
    G.solo!.botTradeRoutesTables = {
      trade_routes: {
        id: "trade_routes",
        rows: [],
        endOfTurnRows: [{
          merchantState: "merchants",
          priority: 1,
          effects: [{
            op: "bot_pay_resource_then",
            resource: "goods",
            count: 5,
            effects: [{ op: "bot_gain_fame", count: 1 }, { op: "bot_flip_merchant_state", nextState: "merchant_empire" }]
          }]
        }]
      }
    };
    bot.botStateTableId = "smoke_S";
    bot.botStateSide = "S";
    bot.botDeck = [];
    bot.botDiscard = [];
    bot.customCleanupEffects = [{ op: "bot_gain_resource", resource: "materials", count: 2 }];
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; slot.face = "down"; slot.blockedByDie = false; });
    bot.slots[1].cardId = "bot_prompt";
    bot.slots[2].cardId = "bot_flip";
    bot.slots[3].cardId = "bot_after";

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.pendingRegionChoice?.cardIds).toEqual(["human_region"]);
    expect(G.solo?.pausedBotTurn?.remainingSlotNumbers).toEqual([2, 3]);

    resolveRegionChoice({ G, ctx: { currentPlayer: "0" } as any }, "human_region");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(bot.botStateTableId).toBe("smoke_F");
    expect(bot.merchantState).toBe("merchant_empire");
    expect([
      ...bot.botDeck,
      ...Object.values(bot.slots).flatMap((slot) => slot.cardId ? [slot.cardId] : [])
    ]).toContain("fame_top");
    expect(bot.resources.goods).toBe(0);
    expect(bot.resources.materials).toBe(2);
  });

  it("Bot Trade Routes Merchant Empire can pay Goods to acquire Tributary or Uncivilized", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        tributary: card({ id: "tributary", displayName: "Tributary", suit: "tributary", cardType: "action" }),
        civilized: card({ id: "civilized", displayName: "Civilized", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.merchantState = "merchant_empire";
    bot.resources.goods = 3;
    G.market = ["civilized", "tributary"];
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [],
        endOfTurnRows: [
          { merchantState: "merchant_empire", priority: 1, effects: [{ op: "bot_acquire", filter: { cardTypes: ["trade_route"] } }] },
          { merchantState: "merchant_empire", priority: 2, effects: [{ op: "bot_resolve_profits_where_able" }] },
          {
            merchantState: "merchant_empire",
            priority: 3,
            effects: [{
              op: "bot_pay_resource_then",
              resource: "goods",
              count: 3,
              effects: [{ op: "bot_acquire", filter: { suits: ["tributary", "uncivilized"] } }]
            }]
          },
          { merchantState: "merchant_empire", priority: 4, effects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }] }
        ]
      }
    };

    resolveBotTradeRoutesEndOfTurn(G, bot);

    expect(bot.resources.goods).toBe(0);
    expect(bot.botDeck[0]).toBe("tributary");
    expect(G.market).not.toContain("tributary");
    expect(bot.resources.materials).toBeUndefined();
  });

  it("Bot Trade Routes Merchant Empire does not pay Goods when no Tributary or Uncivilized can be acquired", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        civilized: card({ id: "civilized", displayName: "Civilized", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.merchantState = "merchant_empire";
    bot.resources.goods = 3;
    G.market = ["civilized"];
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [],
        endOfTurnRows: [
          { merchantState: "merchant_empire", priority: 1, effects: [{ op: "bot_acquire", filter: { cardTypes: ["trade_route"] } }] },
          {
            merchantState: "merchant_empire",
            priority: 3,
            effects: [{
              op: "bot_pay_resource_then",
              resource: "goods",
              count: 3,
              effects: [{ op: "bot_acquire", filter: { suits: ["tributary", "uncivilized"] } }]
            }]
          },
          { merchantState: "merchant_empire", priority: 4, effects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }] }
        ]
      }
    };

    resolveBotTradeRoutesEndOfTurn(G, bot);

    expect(bot.resources.goods).toBe(3);
    expect(bot.resources.materials).toBe(1);
    expect(bot.botDeck).not.toContain("civilized");
  });

  it("bot_trade in a Bot table row resolves Trade Route selection and commerce", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        human_route: card({ id: "human_route", displayName: "Human Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["0"].playArea = ["human_route"];
    G.cardStates = { human_route: { resources: { goods: 1 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          { tradeRouteId: "human_route", publicPlaceholderName: "Human Route", commerceEffects: [{ op: "human_gain_resource", resource: "goods", count: 1 }], profitEffects: [] }
        ],
        endOfTurnRows: []
      }
    };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_prompt",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "trade", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_trade" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.cardStates.human_route.resources?.goods).toBe(2);
    expect(bot.resources.knowledge).toBe(1);
    expect(G.players["0"].resources.goods).toBe(1);
    expect(bot.botDiscard).toContain("bot_prompt");
  });

  it("falls through from bot_trade when the Bot has no route or Goods fallback", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.goods = 0;
    G.solo!.botTradeRoutesTables = { test_routes: { id: "test_routes", rows: [], endOfTurnRows: [] } };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_prompt",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "trade", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_trade" }], implemented: true, tested: true },
          { id: "fallback", priority: 2, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("fallback");
    expect(bot.resources.materials).toBe(1);
    expect(bot.botDiscard).toContain("bot_prompt");
  });

  it("can put a resolved Bot table card on the bottom of the Bot deck", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bottomed: card({ id: "bottomed", displayName: "Bottomed", suit: "region", cardType: "action", startingLocation: "bot_deck" }),
        existing: card({ id: "existing", displayName: "Existing", suit: "region", cardType: "action", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bottomed",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bottom", priority: 1, trigger: { kind: "card_id", cardId: "bottomed" }, effects: [{ op: "bot_put_revealed_card_on_bottom_of_deck" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("bottom");
    expect(result.cardDestination).toBe("bottom_deck");
    expect(bot.botDeck).toEqual(["existing", "bottomed"]);
    expect(bot.botDiscard).not.toContain("bottomed");
  });

  it("bot_resolve_profits_where_able in a Bot table row profits completed Bot Trade Routes", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["bot_route"];
    G.cardStates = { bot_route: { resources: { goods: 3 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          { tradeRouteId: "bot_route", publicPlaceholderName: "Bot Route", commerceEffects: [], profitEffects: [{ op: "bot_gain_resource", resource: "materials", count: 2 }] }
        ],
        endOfTurnRows: []
      }
    };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_prompt",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "profit", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_resolve_profits_where_able" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.goods).toBe(3);
    expect(bot.resources.materials).toBe(2);
    expect(bot.botPlayArea).toEqual([]);
    expect(bot.botHistory).toEqual(["bot_route"]);
    expect(bot.botDiscard).toContain("bot_prompt");
  });

  it("Bot Trade Route Profit can move the top Bot discard card to the top of the Bot deck", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" }),
        discard_bottom: card({ id: "discard_bottom", displayName: "Discard Bottom", suit: "region", cardType: "action" }),
        discard_top: card({ id: "discard_top", displayName: "Discard Top", suit: "region", cardType: "action" }),
        existing_top: card({ id: "existing_top", displayName: "Existing Top", suit: "region", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["bot_route"];
    bot.botDiscard = ["discard_bottom", "discard_top"];
    bot.botDeck = ["existing_top"];
    G.cardStates = { bot_route: { resources: { goods: 3 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          { tradeRouteId: "bot_route", publicPlaceholderName: "Bot Route", commerceEffects: [], profitEffects: [{ op: "bot_move_top_discard_to_deck" }] }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotProfitsWhereAble(G, bot);

    expect(bot.botDeck).toEqual(["discard_top", "existing_top"]);
    expect(bot.botDiscard).toEqual(["discard_bottom"]);
    expect(bot.botHistory).toContain("bot_route");
  });

  it("Bot Trade Route Profit can resolve the top Main deck card through the current Bot table", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" }),
        main_top: card({ id: "main_top", displayName: "Main Top", suit: "region", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["bot_route"];
    bot.botStateTableId = "test_table";
    G.marketDecks = { mainDeck: ["main_top"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
    G.cardStates = { bot_route: { resources: { goods: 3 } } };
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "main_history", priority: 1, trigger: { kind: "card_id", cardId: "main_top" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
        ]
      }
    };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          { tradeRouteId: "bot_route", publicPlaceholderName: "Bot Route", commerceEffects: [], profitEffects: [{ op: "bot_resolve_top_main_deck" }] }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotProfitsWhereAble(G, bot);

    expect(G.marketDecks.mainDeck).toEqual([]);
    expect(bot.botHistory).toEqual(["bot_route", "main_top"]);
    expect(G.scoring).toMatchObject({ reason: "main_deck_empty", triggeredBy: bot.botId });
  });

  it("Bot Trade Route Profit only gains the top-Main VP reward for 0 VP cards", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        zero_route: card({ id: "zero_route", displayName: "Zero Route", suit: "trade_route", cardType: "trade_route" }),
        one_route: card({ id: "one_route", displayName: "One Route", suit: "trade_route", cardType: "trade_route" }),
        zero_vp: card({ id: "zero_vp", displayName: "Zero VP", suit: "region", cardType: "action", vp: { mode: "fixed", value: 0 } }),
        one_vp: card({ id: "one_vp", displayName: "One VP", suit: "region", cardType: "action", vp: { mode: "fixed", value: 1 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["zero_route", "one_route"];
    bot.botStateTableId = "test_table";
    G.marketDecks = { mainDeck: ["zero_vp", "one_vp"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
    G.cardStates = { zero_route: { resources: { goods: 3 } }, one_route: { resources: { goods: 3 } } };
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "history", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
        ]
      }
    };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "zero_route",
            publicPlaceholderName: "Zero Route",
            commerceEffects: [],
            profitEffects: [{ op: "bot_resolve_top_main_deck", ifVp: { value: 0, effects: [{ op: "bot_gain_resource", resource: "knowledge", count: 1 }] } }]
          },
          {
            tradeRouteId: "one_route",
            publicPlaceholderName: "One Route",
            commerceEffects: [],
            profitEffects: [{ op: "bot_resolve_top_main_deck", ifVp: { value: 0, effects: [{ op: "bot_gain_resource", resource: "knowledge", count: 1 }] } }]
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotProfitsWhereAble(G, bot);

    expect(bot.resources.knowledge).toBe(1);
    expect(bot.botHistory).toEqual(["one_route", "zero_vp", "zero_route", "one_vp"]);
  });

  it("Bot Trade Route Commerce can resolve an if-unable fallback when the primary Bot effect cannot resolve", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botStateTableId = "test_table";
    bot.botDiscard = [];
    G.solo!.botStateTables = {
      test_table: { id: "test_table", botNationId: "test_nation_sun_coast", displayName: "Test Table", side: "S", rows: [] }
    };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "bot_route",
            publicPlaceholderName: "Bot Route",
            commerceEffects: [{ op: "bot_return_from_discard", filter: { suits: ["unrest"] }, ifUnable: [{ op: "bot_gain_resource", resource: "knowledge", count: 2 }] }],
            profitEffects: []
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotTriggerTradeRoute(G, bot, "bot_route");

    expect(bot.resources.knowledge).toBe(2);
    expect(bot.botDiscard).toEqual([]);
  });

  it("Bot Trade Route Commerce can use an acquire fallback to discard top Bot deck cards", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" }),
        bot_top: card({ id: "bot_top", displayName: "Bot Top", suit: "region", cardType: "action" }),
        bot_next: card({ id: "bot_next", displayName: "Bot Next", suit: "region", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botStateTableId = "test_table";
    bot.botDeck = ["bot_top", "bot_next"];
    G.market = [];
    G.solo!.botStateTables = {
      test_table: { id: "test_table", botNationId: "test_nation_sun_coast", displayName: "Test Table", side: "S", rows: [] }
    };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "bot_route",
            publicPlaceholderName: "Bot Route",
            commerceEffects: [{ op: "bot_acquire", filter: { suits: ["uncivilized"] }, ifUnable: [{ op: "bot_discard_top_bot_deck", count: 2 }] }],
            profitEffects: []
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotTriggerTradeRoute(G, bot, "bot_route");

    expect(bot.botDeck).toEqual([]);
    expect(bot.botDiscard).toEqual(["bot_top", "bot_next"]);
  });

  it("Bot Trade Route Profit can gain a resource per matching Bot in-play card", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" }),
        region_one: card({ id: "region_one", displayName: "Region One", suit: "region", cardType: "region" }),
        region_two: card({ id: "region_two", displayName: "Region Two", suit: "region", cardType: "region" }),
        civilized: card({ id: "civilized", displayName: "Civilized", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["region_one", "bot_route", "civilized", "region_two"];
    G.cardStates = { bot_route: { resources: { goods: 3 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "bot_route",
            publicPlaceholderName: "Bot Route",
            commerceEffects: [],
            profitEffects: [{ op: "bot_gain_resource_per_in_play", resource: "knowledge", filter: { suits: ["region"] } }]
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotProfitsWhereAble(G, bot);

    expect(bot.resources.knowledge).toBe(2);
    expect(bot.botHistory).toEqual(["bot_route"]);
    expect(bot.botPlayArea).toEqual(["region_one", "civilized", "region_two"]);
  });

  it("bot_add_resource_to_market_slot puts resources on a numbered market card", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_one: card({ id: "market_one", displayName: "Market One", suit: "civilized", cardType: "action" }),
        market_two: card({ id: "market_two", displayName: "Market Two", suit: "uncivilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["market_one", "market_two"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_prompt",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "market_resource", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_add_resource_to_market_slot", resource: "knowledge", slot: 2, count: 2 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.marketResources?.market_two?.knowledge).toBe(2);
    expect(G.marketResources?.market_one).toBeUndefined();
  });

  it("bot_add_resource_to_market_slot uses the die-blocked slot when slot is rolled", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_one: card({ id: "market_one", displayName: "Market One", suit: "civilized", cardType: "action" }),
        market_two: card({ id: "market_two", displayName: "Market Two", suit: "uncivilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.unresolvedSlot = 2;
    G.market = ["market_one", "market_two"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_prompt",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "market_resource", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_add_resource_to_market_slot", resource: "goods", slot: "rolled", count: 1 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.marketResources?.market_two?.goods).toBe(1);
  });

  it("bot Acquire chooses the highest VP eligible market card and puts it on top of the Bot deck", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_low: card({ id: "market_low", displayName: "Low", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 1 } }),
        market_high: card({ id: "market_high", displayName: "High", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 3 } }),
        refill: card({ id: "refill", displayName: "Refill", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_low", "market_high"];
    G.marketRefillPool = ["refill"];
    G.unrestPile = ["refill_unrest"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_acquire", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_acquire", filter: { suits: ["civilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck).toEqual(["market_high", "existing_top"]);
    expect(G.market).toEqual(["market_low", "refill"]);
    expect(bot.botDiscard).toContain("bot_region");
  });

  it("bot Acquire suit filters treat secondary printed suit icons as eligible", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        multi_icon_market: card({ id: "multi_icon_market", displayName: "Multi Icon Market", suit: "multi", cardType: "action", tags: ["suit:civilized"], vp: { mode: "fixed", value: 2 } }),
        fame_market: card({ id: "fame_market", displayName: "Fame Market", suit: "fame", cardType: "fame", vp: { mode: "fixed", value: 5 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["multi_icon_market", "fame_market"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_acquire", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_acquire", filter: { suits: ["civilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck).toEqual(["multi_icon_market", "existing_top"]);
    expect(G.market).toEqual(["fame_market"]);
  });

  it("bot Acquire honors tag filters before VP tie-breaks", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        wrong_high: card({ id: "wrong_high", displayName: "Wrong High", suit: "civilized", cardType: "action", tags: ["wrong"], vp: { mode: "fixed", value: 5 } }),
        tagged_low: card({ id: "tagged_low", displayName: "Tagged Low", suit: "civilized", cardType: "action", tags: ["target"], vp: { mode: "fixed", value: 1 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["wrong_high", "tagged_low"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_acquire", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_acquire", filter: { tags: ["target"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck[0]).toBe("tagged_low");
    expect(G.market).toEqual(["wrong_high"]);
  });

  it("bot Acquire gains market resources and top-decks taken Unrest above the acquired card", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 2 } }),
        unrest_taken: card({ id: "unrest_taken", displayName: "Unrest", suit: "unrest", cardType: "unrest", vp: { mode: "fixed", value: -2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.marketResources = { market_card: { knowledge: 2, goods: 1 } };
    G.marketUnrest = { market_card: ["unrest_taken"] };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_acquire", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_acquire", filter: { suits: ["civilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.knowledge).toBe(2);
    expect(bot.resources.goods).toBe(1);
    expect(bot.botDeck).toEqual(["unrest_taken", "market_card", "existing_top"]);
    expect(G.marketResources.market_card).toBeUndefined();
    expect(G.marketUnrest.market_card).toBeUndefined();
  });

  it("bot Acquire with Exile enabled can choose an exiled card and takes Unrest after it", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 1 } }),
        exile_card: card({ id: "exile_card", displayName: "Exile", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 4 } }),
        unrest_from_pile: card({ id: "unrest_from_pile", displayName: "Unrest", suit: "unrest", cardType: "unrest", vp: { mode: "fixed", value: -2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.players["0"].exile = ["exile_card"];
    G.unrestPile = ["unrest_from_pile"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_acquire", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_acquire", filter: { suits: ["civilized"] }, fromExile: true }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck).toEqual(["unrest_from_pile", "exile_card", "existing_top"]);
    expect(G.players["0"].exile).toEqual([]);
    expect(G.unrestPile).toEqual([]);
    expect(G.market).toEqual(["market_card"]);
  });

  it("bot Acquire from Exile does not finish when required Unrest causes Collapse", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 1 } }),
        exile_card: card({ id: "exile_card", displayName: "Exile", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 4 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.players["0"].exile = ["exile_card"];
    G.unrestPile = [];
    addHumanScoringUnrest(G, 1);

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_acquire", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_acquire", filter: { suits: ["civilized"] }, fromExile: true }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.gameover).toEqual({
      winner: "bot_0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1 }
    });
    expect(bot.botDeck).toEqual(["existing_top"]);
    expect(G.players["0"].exile).toEqual(["exile_card"]);
    expect(G.market).toEqual(["market_card"]);
    expect(G.log.some((entry) => entry.message === "BotAcquiredFromExile(exile_card)")).toBe(false);
  });

  it("bot Acquire tie-breaks by total market tokens, then lowest-numbered slot", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_a: card({ id: "market_a", displayName: "A", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 2 } }),
        market_b: card({ id: "market_b", displayName: "B", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 2 } }),
        market_c: card({ id: "market_c", displayName: "C", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["market_a", "market_b", "market_c"];
    G.marketResources = { market_a: { knowledge: 1 }, market_b: { materials: 1, goods: 2 }, market_c: { knowledge: 2 } };
    G.marketUnrest = { market_a: ["u1"], market_b: [], market_c: [] };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_acquire", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_acquire", filter: { suits: ["civilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck[0]).toBe("market_b");
    expect(G.market).toEqual(["market_a", "market_c"]);
  });

  it("bot Break through chooses the best eligible market card using the same VP/token/slot tie-break", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_a: card({ id: "market_a", displayName: "A", suit: "uncivilized", cardType: "action", vp: { mode: "fixed", value: 4 } }),
        market_b: card({ id: "market_b", displayName: "B", suit: "uncivilized", cardType: "action", vp: { mode: "fixed", value: 2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["market_b", "market_a"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_break", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_break_through", filter: { suits: ["uncivilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck[0]).toBe("market_a");
    expect(G.market).toEqual(["market_b"]);
  });

  it("bot Break through can discard the gained card when the table row says so", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "uncivilized", cardType: "action", vp: { mode: "fixed", value: 4 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    bot.botDiscard = [];
    G.market = ["market_card"];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_break", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_break_through", filter: { suits: ["uncivilized"] }, discardGained: true }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck).toEqual(["existing_top"]);
    expect(bot.botDiscard).toEqual(["market_card", "bot_region"]);
    expect(G.market).toEqual([]);
  });

  it("bot Break through can resolve the gained card through the current Bot table", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "uncivilized", cardType: "action", vp: { mode: "fixed", value: 4 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    bot.botDiscard = [];
    G.market = ["market_card"];
    const table = {
      id: "test_table",
      botNationId: "test_nation_sun_coast",
      displayName: "Test Table",
      side: "S",
      rows: [
        { id: "bot_break", priority: 1, trigger: { kind: "card_id" as const, cardId: "bot_region" }, effects: [{ op: "bot_break_through" as const, filter: { suits: ["uncivilized" as const] }, resolveGained: true }], implemented: true, tested: true },
        { id: "resolve_gained", priority: 1, trigger: { kind: "card_id" as const, cardId: "market_card" }, effects: [{ op: "bot_gain_resource" as const, resource: "goods" as const, count: 3 }], implemented: true, tested: true }
      ]
    };

    const result = resolveBotCard({ G, bot, revealedCardId: "bot_region", source: "slot", table });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.goods).toBe(3);
    expect(bot.botDeck).toEqual(["existing_top"]);
    expect(bot.botDiscard).toEqual(["market_card", "bot_region"]);
    expect(G.market).toEqual([]);
  });

  it("bot Break through gains market resources but returns tucked Unrest", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "uncivilized", cardType: "action", vp: { mode: "fixed", value: 2 } }),
        unrest_returned: card({ id: "unrest_returned", displayName: "Unrest", suit: "unrest", cardType: "unrest", vp: { mode: "fixed", value: -2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.marketResources = { market_card: { materials: 2 } };
    G.marketUnrest = { market_card: ["unrest_returned"] };
    G.unrestPile = [];

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_break", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_break_through", filter: { suits: ["uncivilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.materials).toBe(2);
    expect(bot.botDeck).toEqual(["market_card", "existing_top"]);
    expect(G.unrestPile).toEqual(["unrest_returned"]);
    expect(G.marketUnrest.market_card).toBeUndefined();
  });

  it("bot Break through stops row resolution when market refill triggers Collapse", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "uncivilized", cardType: "action", vp: { mode: "fixed", value: 2 } }),
        refill: card({ id: "refill", displayName: "Refill", suit: "uncivilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    bot.resources.goods = 0;
    G.market = ["market_card"];
    G.marketRefillPool = ["refill"];
    G.marketDecks = undefined;
    G.unrestPile = [];
    addHumanScoringUnrest(G, 1);

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          {
            id: "bot_break",
            priority: 1,
            trigger: { kind: "suit", suit: "region" },
            effects: [
              { op: "bot_break_through", filter: { suits: ["uncivilized"] } },
              { op: "bot_gain_resource", resource: "goods", count: 1 }
            ],
            implemented: true,
            tested: true
          }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.gameover).toEqual({
      winner: "bot_0",
      reason: "collapse:unrest_pile_empty",
      scores: { "0": 1 }
    });
    expect(bot.resources.goods).toBe(0);
    expect(bot.botDeck).toEqual(["market_card", "existing_top"]);
    expect(bot.botDiscard).not.toContain("bot_region");
    expect(G.market).toEqual(["refill"]);
    expect(G.log.some((entry) => entry.message === "BotBrokeThroughFromMarket(market_card)")).toBe(false);
  });

  it("bot Break through takes from the matching small deck when the market has no eligible card", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_wrong: card({ id: "market_wrong", displayName: "Wrong", suit: "civilized", cardType: "action" }),
        small_unc: card({ id: "small_unc", displayName: "Small Unc", suit: "uncivilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["market_wrong"];
    G.marketDecks = { mainDeck: [], regionDeck: [], uncivilizedDeck: ["small_unc"], civilizedDeck: [], tributaryDeck: [] };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_break", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_break_through", filter: { suits: ["uncivilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck[0]).toBe("small_unc");
    expect(G.marketDecks.uncivilizedDeck).toEqual([]);
  });

  it("bot Break through searches the Main deck after the matching small deck is empty", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        miss: card({ id: "miss", displayName: "Miss", suit: "civilized", cardType: "action" }),
        hit: card({ id: "hit", displayName: "Hit", suit: "uncivilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = [];
    G.marketDecks = { mainDeck: ["miss", "hit"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_break", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_break_through", filter: { suits: ["uncivilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDeck[0]).toBe("hit");
    expect(G.marketDecks.mainDeck).toEqual(["miss"]);
  });

  it("bot Break through gains 2 Materials if no matching deck card exists", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        miss: card({ id: "miss", displayName: "Miss", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = [];
    G.marketDecks = { mainDeck: ["miss"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "bot_break", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_break_through", filter: { suits: ["uncivilized"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.materials).toBe(2);
    expect(bot.botDeck).not.toContain("miss");
    expect(G.marketDecks.mainDeck).toEqual(["miss"]);
  });

  it("recycles bot discards when cleanup refills empty slots from an exhausted deck", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = [];
    bot.botDiscard = ["bot_region"];
    bot.slots[1].cardId = undefined;

    runBotCleanup(bot);

    expect(bot.slots[1].cardId).toBe("bot_region");
    expect(bot.botDiscard).toEqual([]);
  });

  it("adds the top Dynasty card before shuffling Bot discard into a new Bot deck during cleanup", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        dynasty_top: card({ id: "dynasty_top", displayName: "Dynasty Top", tags: ["bot_dynasty"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = [];
    bot.botDiscard = ["bot_region"];
    bot.botDynastyDeck = ["dynasty_top"];
    bot.slots[1].cardId = undefined;

    runBotCleanup(bot, { G, randomNumber: () => 0 });

    expect([...Object.values(bot.slots).map((slot) => slot.cardId).filter(Boolean), ...bot.botDeck].sort()).toEqual(["bot_region", "dynasty_top"]);
    expect(bot.botDiscard).toEqual([]);
    expect(bot.botDynastyDeck).toEqual([]);
    expect(G.scoring).toMatchObject({ reason: "bot_dynasty_deck_empty", triggeredBy: bot.botId });
  });

  it("uses injected randomness for Bot cleanup reshuffles reached through the Bot turn", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        dynasty_top: card({ id: "dynasty_top", displayName: "Dynasty Top", tags: ["bot_dynasty"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = [];
    bot.botDiscard = ["bot_region"];
    bot.botDynastyDeck = ["dynasty_top"];
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });

    runBotTurn({ G, rollDie: () => 6, randomNumber: () => 0.99 });

    expect(bot.slots[1].cardId).toBe("bot_region");
    expect(bot.slots[2].cardId).toBe("dynasty_top");
  });

  it("Warlord cleanup discards the top Bot deck card after refilling slots", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, soloDifficulty: "warlord" },
      cardDb: {
        starter: card({}),
        bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
        bot_2: card({ id: "bot_2", displayName: "Bot 2", startingLocation: "bot_deck" }),
        bot_3: card({ id: "bot_3", displayName: "Bot 3", startingLocation: "bot_deck" }),
        bot_4: card({ id: "bot_4", displayName: "Bot 4", startingLocation: "bot_deck" }),
        bot_5: card({ id: "bot_5", displayName: "Bot 5", startingLocation: "bot_deck" }),
        bot_6: card({ id: "bot_6", displayName: "Bot 6", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.slots[2].cardId = undefined;

    runBotCleanup(bot);

    expect(bot.slots[2].cardId).toBe("bot_5");
    expect(bot.botDiscard).toEqual(["bot_6"]);
    expect(bot.botDeck).toEqual([]);
  });

  it("runs Bot custom cleanup effects from the Bot nation ruleset during Bot cleanup", () => {
    const rulesetPath = path.join(os.tmpdir(), `polity-bot-cleanup-${Date.now()}.json`);
    const privateBotTables = writePrivateBotTableFixtures("polity-bot-cleanup");
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId: "test_nation_sun_coast",
        displayName: "Sun Coast Ruleset",
        rulesetTags: ["solo_bot_exception"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [{ op: "bot_custom_cleanup", effect: [{ op: "bot_gain_resource", resource: "materials", count: 2 }] }],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }]));

      const G = createInitialGameStateFromPipeline({
        options,
        cardDb: {
          starter: card({}),
          bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
          bot_2: card({ id: "bot_2", displayName: "Bot 2", startingLocation: "bot_deck" }),
          bot_3: card({ id: "bot_3", displayName: "Bot 3", startingLocation: "bot_deck" }),
          bot_4: card({ id: "bot_4", displayName: "Bot 4", startingLocation: "bot_deck" })
        } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" },
        usePrivateRules: true,
        privateRulesetPath: rulesetPath,
        privateBotStateTablePath: privateBotTables.botStateTablePath,
        privateBotTradeRoutesTablePath: privateBotTables.botTradeRoutesTablePath
      });
      G.solo!.botStateTables = {
        placeholder: {
          id: "placeholder",
          botNationId: "test_nation_sun_coast",
          displayName: "Placeholder",
          side: "S",
          rows: [{ id: "history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }]
        }
      };
      G.solo!.bot.botStateTableId = "placeholder";

      runBotTurn({ G, rollDie: () => 6 });

      expect(G.solo?.bot.resources.materials).toBe(2);
    } finally {
      fs.rmSync(rulesetPath, { force: true });
      privateBotTables.cleanup();
    }
  });

  it("difficulty effect limits allow all unblocked slots to resolve", () => {
    const cases = [
      { soloDifficulty: "chieftain" as const, expectedResolved: 4 },
      { soloDifficulty: "warlord" as const, expectedResolved: 4 },
      { soloDifficulty: "imperator" as const, expectedResolved: 5 },
      { soloDifficulty: "sovereign" as const, expectedResolved: 5 }
    ];

    for (const { soloDifficulty, expectedResolved } of cases) {
      const G = createInitialGameStateFromPipeline({
        options: { ...options, soloDifficulty },
        cardDb: {
          starter: card({}),
          bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
          bot_2: card({ id: "bot_2", displayName: "Bot 2", startingLocation: "bot_deck" }),
          bot_3: card({ id: "bot_3", displayName: "Bot 3", startingLocation: "bot_deck" }),
          bot_4: card({ id: "bot_4", displayName: "Bot 4", startingLocation: "bot_deck" }),
          bot_5: card({ id: "bot_5", displayName: "Bot 5", startingLocation: "bot_deck" })
        } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" }
      });
      G.solo!.botStateTables = {
        placeholder: {
          id: "placeholder",
          botNationId: "test_nation_sun_coast",
          displayName: "Placeholder",
          side: "S",
          rows: [{ id: "history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }]
        }
      };
      G.solo!.bot.botStateTableId = "placeholder";

      runBotTurn({ G, rollDie: () => 6 });

      expect(G.solo?.bot.botHistory.length).toBe(expectedResolved);
    }
  });

  it("Bot cleanup places a Progress token on the market card above the unresolved slot but not on a roll of 6", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, soloDifficulty: "imperator" },
      cardDb: {
        starter: card({}),
        bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
        bot_2: card({ id: "bot_2", displayName: "Bot 2", startingLocation: "bot_deck" }),
        bot_3: card({ id: "bot_3", displayName: "Bot 3", startingLocation: "bot_deck" }),
        bot_4: card({ id: "bot_4", displayName: "Bot 4", startingLocation: "bot_deck" }),
        bot_5: card({ id: "bot_5", displayName: "Bot 5", startingLocation: "bot_deck" }),
        market_1: card({ id: "market_1", displayName: "Market 1" }),
        market_2: card({ id: "market_2", displayName: "Market 2" }),
        market_3: card({ id: "market_3", displayName: "Market 3" }),
        market_4: card({ id: "market_4", displayName: "Market 4" }),
        market_5: card({ id: "market_5", displayName: "Market 5" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    G.market = ["market_1", "market_2", "market_3", "market_4", "market_5"];
    G.solo!.botStateTables = {
      placeholder: {
        id: "placeholder",
        botNationId: "test_nation_sun_coast",
        displayName: "Placeholder",
        side: "S",
        rows: [{ id: "history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }]
      }
    };
    G.solo!.bot.botStateTableId = "placeholder";

    runBotTurn({ G, rollDie: () => 3 });

    expect(G.marketResources?.market_3?.knowledge).toBe(1);

    G.marketResources = {};
    G.solo!.bot.botDeck = ["bot_1", "bot_2", "bot_3", "bot_4", "bot_5"];
    for (const [index, slot] of Object.values(G.solo!.bot.slots).entries()) {
      slot.cardId = `bot_${index + 1}`;
      slot.face = "down";
      slot.blockedByDie = false;
    }

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.marketResources).toEqual({});
  });

  it("flushes bot turn log entries once", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = [];
    bot.botDiscard = [];
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.botLog.push({ round: 1, playerId: bot.botId, message: "buffered bot event" });

    runBotTurn({ G, rollDie: () => 6 });
    runBotTurn({ G, rollDie: () => 6 });

    expect(G.log.filter((entry) => entry.message === "buffered bot event")).toHaveLength(1);
    expect(bot.botLog).toEqual([]);
  });

  it("limits resolved slot cards to the configured bot effects per turn", () => {
    const botCards = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => {
        const id = `bot_region_${index + 1}`;
        return [id, card({ id, displayName: `Bot Region ${index + 1}`, suit: "region", cardType: "attack", startingLocation: "bot_deck" })];
      })
    );
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: { starter: card({}), ...botCards } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    G.solo!.botStateTables[G.solo!.bot.botStateTableId] = {
      id: "test_table",
      botNationId: "test_nation_sun_coast",
      displayName: "Test Table",
      side: "S",
      rows: [
        { id: "all_history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
      ]
    };

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.solo?.bot.botHistory).toHaveLength(4);
  });

  it("loads fresh bot state table objects for each game setup", () => {
    const first = loadBotStateTables();
    first.placeholder_S.rows[0].id = "mutated";

    const second = loadBotStateTables();

    expect(second.placeholder_S.rows[0].id).toBe("row_unrest");
  });

  it("throws when private bot tables are requested but missing", () => {
    const missingStatePath = path.join(os.tmpdir(), `polity-missing-bot-state-${Date.now()}.json`);
    const missingTradePath = path.join(os.tmpdir(), `polity-missing-bot-trade-${Date.now()}.json`);

    expect(() => loadBotStateTables({ privatePath: missingStatePath })).toThrow("Private bot state tables requested but not found");
    expect(() => loadBotTradeRoutesTables({ privatePath: missingTradePath })).toThrow("Private bot Trade Routes tables requested but not found");
  });

  it("loads private bot state tables for solo setup", () => {
    const botTablePath = path.join(os.tmpdir(), `polity-bot-tables-${Date.now()}.json`);
    try {
      fs.writeFileSync(botTablePath, JSON.stringify({
        custom_S: {
          id: "custom",
          botNationId: "test_nation_sun_coast",
          displayName: "Custom Bot Table",
          side: "S",
          rows: [
            { id: "custom_unrest", priority: 1, trigger: { kind: "unrest" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
          ]
        }
      }));

      const G = createInitialGameStateFromPipeline({
        options,
        cardDb: {
          starter: card({}),
          bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
        } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" },
        privateBotStateTablePath: botTablePath
      });

      expect(G.solo?.bot.botStateTableId).toBe("custom_S");
      expect(G.solo?.botStateTables.custom_S.rows[0].id).toBe("custom_unrest");
    } finally {
      fs.rmSync(botTablePath, { force: true });
    }
  });

  it("uses an explicit initial bot state table override when the nation has no default key", () => {
    const rulesetPath = path.join(os.tmpdir(), `polity-initial-bot-table-rules-${Date.now()}.json`);
    const botTablePath = path.join(os.tmpdir(), `polity-initial-bot-table-${Date.now()}.json`);
    const botTradeRoutesPath = path.join(os.tmpdir(), `polity-initial-bot-trade-${Date.now()}.json`);
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId: "test_nation_sun_coast",
        displayName: "Sun Coast Ruleset",
        rulesetTags: ["solo_bot_exception"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [{ op: "initial_bot_state_table", tableId: "ceremony", side: "F" }],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }]));
      fs.writeFileSync(botTablePath, JSON.stringify({
        ceremony_F: {
          id: "ceremony",
          botNationId: "test_nation_sun_coast",
          displayName: "Ceremony",
          side: "F",
          rows: [{ id: "front", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }]
        },
        other_S: {
          id: "other",
          botNationId: "test_nation_sun_coast",
          displayName: "Other",
          side: "S",
          rows: [{ id: "side", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }]
        }
      }));
      fs.writeFileSync(botTradeRoutesPath, JSON.stringify({}));

      const G = createInitialGameStateFromPipeline({
        options,
        cardDb: {
          starter: card({}),
          bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
        } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" },
        usePrivateRules: true,
        privateRulesetPath: rulesetPath,
        privateBotStateTablePath: botTablePath,
        privateBotTradeRoutesTablePath: botTradeRoutesPath
      });

      expect(G.solo?.bot.botStateTableId).toBe("ceremony_F");
      expect(G.solo?.bot.botStateSide).toBe("F");
    } finally {
      fs.rmSync(rulesetPath, { force: true });
      fs.rmSync(botTablePath, { force: true });
      fs.rmSync(botTradeRoutesPath, { force: true });
    }
  });

  it("loads private bot Trade Routes tables for solo setup", () => {
    const botTradeRoutesPath = path.join(os.tmpdir(), `polity-bot-trade-${Date.now()}.json`);
    try {
      fs.writeFileSync(botTradeRoutesPath, JSON.stringify({
        trade_table: {
          id: "trade_table",
          rows: [
            {
              tradeRouteId: "route_1",
              publicPlaceholderName: "Route One",
              commerceEffects: [{ op: "bot_gain_resource", resource: "goods", count: 1 }],
              profitEffects: []
            }
          ],
          endOfTurnRows: [
            { merchantState: "merchants", priority: 1, effects: [{ op: "log", message: "merchant eot" }] }
          ]
        }
      }));

      const G = createInitialGameStateFromPipeline({
        options: { ...options, enabledExpansions: ["trade_routes"] },
        cardDb: {
          starter: card({}),
          route_1: card({ id: "route_1", displayName: "Route One", suit: "trade_route", cardType: "trade_route", startingLocation: "market", isTradeRouteExpansion: true })
        } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" },
        privateBotTradeRoutesTablePath: botTradeRoutesPath
      });

      expect(G.solo?.botTradeRoutesTables?.trade_table.rows[0].tradeRouteId).toBe("route_1");
      expect(G.solo?.botTradeRoutesTables?.trade_table.endOfTurnRows[0].merchantState).toBe("merchants");
    } finally {
      fs.rmSync(botTradeRoutesPath, { force: true });
    }
  });

  it("runs the bot turn from the solo turn end lifecycle", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    G.solo!.botStateTables[G.solo!.bot.botStateTableId] = {
      id: "test_table",
      botNationId: "test_nation_sun_coast",
      displayName: "Test Table",
      side: "S",
      rows: [
        { id: "all_history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
      ]
    };

    onTurnEnd(G, { currentPlayer: "0" } as any, () => 0.99);

    expect(G.solo?.bot.botHistory).toContain("bot_region");
  });

  it("preserves solo state while skipping default solo bot card setup", () => {
    const rulesetPath = path.join(os.tmpdir(), `polity-ruleset-${Date.now()}.json`);
    const privateBotTables = writePrivateBotTableFixtures("polity-ruleset-skip-default");
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId: "test_nation_sun_coast",
        displayName: "Sun Coast Ruleset",
        rulesetTags: ["solo_bot_exception"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [{ op: "skip_default_dynasty_setup" }],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }]));

      const G = createInitialGameStateFromPipeline({
        options,
        cardDb: {
          starter: card({}),
          bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
        } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" },
        usePrivateRules: true,
        privateRulesetPath: rulesetPath,
        privateBotStateTablePath: privateBotTables.botStateTablePath,
        privateBotTradeRoutesTablePath: privateBotTables.botTradeRoutesTablePath
      });

      const botCardIds = [
        ...(G.solo?.bot.botDeck ?? []),
        ...(G.solo?.bot.botDynastyDeck ?? []),
        ...Object.values(G.solo?.bot.slots ?? {}).flatMap((slot) => slot.cardId ? [slot.cardId] : [])
      ];

      expect(G.solo).toBeDefined();
      expect(botCardIds).not.toContain("bot_region");
      expect(G.log.some((entry) => entry.message === "NationRulesetApplied(test_nation_sun_coast/bot/skip_default_dynasty_setup)")).toBe(true);
    } finally {
      fs.rmSync(rulesetPath, { force: true });
    }
  });

  it("applies short-game solo bot Dynasty setup changes", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledVariants: ["short_game"] },
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        dynasty_high: card({ id: "dynasty_high", displayName: "Dynasty High", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 5 } }),
        dynasty_mid: card({ id: "dynasty_mid", displayName: "Dynasty Mid", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 3 } }),
        dynasty_low: card({ id: "dynasty_low", displayName: "Dynasty Low", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 1 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });

    expect(G.solo?.bot.botDiscard).toEqual(["dynasty_high"]);
    expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_mid"]);
    expect([
      ...(G.solo?.bot.botDiscard ?? []),
      ...(G.solo?.bot.botDynastyDeck ?? [])
    ]).not.toContain("dynasty_low");
  });

  it("sorts the default solo Bot Dynasty deck from highest to lowest Bot VP value", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        dynasty_low: card({ id: "dynasty_low", displayName: "Dynasty Low", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 1 } }),
        dynasty_variable: card({ id: "dynasty_variable", displayName: "Dynasty Variable", tags: ["bot_dynasty"], vp: { mode: "variable", value: null } }),
        dynasty_high: card({ id: "dynasty_high", displayName: "Dynasty High", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 7 } }),
        dynasty_mid: card({ id: "dynasty_mid", displayName: "Dynasty Mid", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 3 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });

    expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_high", "dynasty_variable", "dynasty_mid", "dynasty_low"]);
  });

  it("builds the default solo Bot Dynasty deck from nation, accession, and development cards", () => {
    const botNation = {
      ...nation,
      nationDeckCardIds: ["nation_top", "nation_next"],
      accessionCardId: "accession",
      developmentCardIds: ["development_low", "development_high"]
    };
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        nation_top: card({ id: "nation_top", displayName: "Nation Top", cardType: "nation", startingLocation: "nation_deck" }),
        nation_next: card({ id: "nation_next", displayName: "Nation Next", cardType: "nation", startingLocation: "nation_deck" }),
        accession: card({ id: "accession", displayName: "Accession", cardType: "accession", startingLocation: "accession" }),
        development_low: card({ id: "development_low", displayName: "Development Low", cardType: "development", startingLocation: "development_area", vp: { mode: "fixed", value: 2 } }),
        development_high: card({ id: "development_high", displayName: "Development High", cardType: "development", startingLocation: "development_area", vp: { mode: "fixed", value: 8 } })
      } as any,
      nationDb: { test_nation_sun_coast: botNation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });

    expect(G.solo?.bot.botDynastyDeck).toEqual(["nation_top", "nation_next", "accession", "development_high", "development_low"]);
  });

  it("triggers Scoring when the Bot Dynasty deck becomes empty", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", startingLocation: "bot_deck" }),
        dynasty_last: card({ id: "dynasty_last", displayName: "Dynasty Last", tags: ["bot_dynasty"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDynastyDeck = ["dynasty_last"];

    resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_prompt",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "resolve_dynasty", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_resolve_top_dynasty_deck" }], implemented: true, tested: true },
          { id: "history", priority: 1, trigger: { kind: "card_id", cardId: "dynasty_last" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
        ]
      }
    });

    expect(G.scoring).toMatchObject({ reason: "bot_dynasty_deck_empty", triggeredBy: bot.botId });
  });

  it("applies imported custom solo bot stacks before default bot setup", () => {
    const rulesetPath = path.join(os.tmpdir(), `polity-ruleset-${Date.now()}.json`);
    const privateBotTables = writePrivateBotTableFixtures("polity-ruleset-custom-stacks");
    try {
      fs.writeFileSync(rulesetPath, JSON.stringify([{
        nationId: "test_nation_sun_coast",
        displayName: "Sun Coast Ruleset",
        rulesetTags: ["solo_bot_exception", "solo_bot_custom_dynasty", "solo_bot_custom_state"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [
          { op: "custom_bot_state_stack", cardIds: ["stack_1", "stack_2", "stack_3", "stack_4", "stack_5", "stack_6"] },
          { op: "custom_dynasty_setup", config: { cardIds: ["dynasty_custom_1", "dynasty_custom_2"] } }
        ],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      }]));

      const G = createInitialGameStateFromPipeline({
        options,
        cardDb: {
          starter: card({}),
          bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
          bot_dynasty_default: card({ id: "bot_dynasty_default", displayName: "Bot Dynasty Default", suit: "none", cardType: "action", tags: ["bot_dynasty"] }),
          stack_1: card({ id: "stack_1", displayName: "Stack 1" }),
          stack_2: card({ id: "stack_2", displayName: "Stack 2" }),
          stack_3: card({ id: "stack_3", displayName: "Stack 3" }),
          stack_4: card({ id: "stack_4", displayName: "Stack 4" }),
          stack_5: card({ id: "stack_5", displayName: "Stack 5" }),
          stack_6: card({ id: "stack_6", displayName: "Stack 6" }),
          dynasty_custom_1: card({ id: "dynasty_custom_1", displayName: "Dynasty Custom 1" }),
          dynasty_custom_2: card({ id: "dynasty_custom_2", displayName: "Dynasty Custom 2" })
        } as any,
        nationDb: { test_nation_sun_coast: nation },
        playerNationIds: { "0": "test_nation_sun_coast" },
        usePrivateRules: true,
        privateRulesetPath: rulesetPath,
        privateBotStateTablePath: privateBotTables.botStateTablePath,
        privateBotTradeRoutesTablePath: privateBotTables.botTradeRoutesTablePath
      });

      expect(Object.values(G.solo?.bot.slots ?? {}).map((slot) => slot.cardId)).toEqual(["stack_1", "stack_2", "stack_3", "stack_4"]);
      expect(G.solo?.bot.botDeck.slice(0, 2)).toEqual(["stack_5", "stack_6"]);
      expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_custom_1", "dynasty_custom_2"]);
      expect(G.log.some((entry) => entry.message === "NationRulesetApplied(test_nation_sun_coast/bot/custom_bot_state_stack)")).toBe(true);
      expect(G.log.some((entry) => entry.message === "NationRulesetApplied(test_nation_sun_coast/bot/custom_dynasty_setup)")).toBe(true);
    } finally {
      fs.rmSync(rulesetPath, { force: true });
      privateBotTables.cleanup();
    }
  });

  it("switches bot state table keys when a row flips to the matching side", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    G.solo!.botStateTables = {
      placeholder_S: {
        id: "placeholder",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "flip", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_flip_state_table", nextSide: "F" }], implemented: true, tested: true }
        ]
      },
      placeholder_F: {
        id: "placeholder",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "F",
        rows: [
          { id: "front", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
        ]
      }
    };
    G.solo!.bot.botStateTableId = "placeholder_S";

    resolveBotCard({ G, bot: G.solo!.bot, revealedCardId: "bot_region", source: "slot", table: G.solo!.botStateTables.placeholder_S });

    expect(G.solo?.bot.botStateSide).toBe("F");
    expect(G.solo?.bot.botStateTableId).toBe("placeholder_F");
  });

  it("uses the refreshed bot state table for later cards in the same turn", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_flip: card({ id: "bot_flip", displayName: "Bot Flip", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_front: card({ id: "bot_front", displayName: "Bot Front", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "0": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.solo!.botStateTables = {
      placeholder_S: {
        id: "placeholder",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "flip", priority: 1, trigger: { kind: "card_id", cardId: "bot_flip" }, effects: [{ op: "bot_flip_state_table", nextSide: "F" }], implemented: true, tested: true },
          { id: "s_other", priority: 99, trigger: { kind: "other" }, effects: [{ op: "bot_discard_revealed_card" }], implemented: true, tested: true }
        ]
      },
      placeholder_F: {
        id: "placeholder",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "F",
        rows: [
          { id: "front_history", priority: 1, trigger: { kind: "card_id", cardId: "bot_front" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "placeholder_S";
    bot.botDeck = [];
    bot.botDiscard = [];
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[1].cardId = "bot_flip";
    bot.slots[2].cardId = "bot_front";

    runBotTurn({ G, rollDie: () => 6 });

    expect(bot.botStateTableId).toBe("placeholder_F");
    expect(bot.botHistory).toContain("bot_front");
    expect(bot.botHistory).not.toContain("bot_flip");
    expect(bot.botDiscard).not.toContain("bot_front");
  });
});
