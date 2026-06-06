import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { onTurnEnd } from "../game/turn";
import { resolveChoice, resolveLookOrderChoice, resolveReactiveExhaustChoice, resolveRegionChoice, resolveReturnExhaustTokenChoice } from "../game/moves";
import type { GameOptions } from "../options/gameOptions";
import { runBotCleanup } from "../solo/botCleanup";
import { loadBotStateTables } from "../solo/botStateTableLoader";
import { loadBotTradeRoutesTables } from "../solo/botTradeRoutesTableLoader";
import { continuePausedBotTurn, runBotTurn } from "../solo/botTurn";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { applyBotEffect, resolveBotCard } from "../solo/botStateTableResolver";
import { setupSoloBot } from "../solo/botSetup";
import { resolveBotProfitsWhereAble, resolveBotTrade, resolveBotTradeRoutesEndOfTurn, resolveBotTriggerTradeRoute } from "../solo/botTradeRoutesResolver";
import { parseCsvFile } from "../../../tools/card-import/csvParser";
import { normalizeBotStateTables } from "../../../tools/card-import/normalizeBotStateTable";

const baseCost = { materials: 0, population: 0, progress: 0, goods: 0 };
const options: GameOptions = { playerCount: 1, mode: "solo", enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain" };
const privateBotStateTablesCsvPath = path.resolve(import.meta.dirname, "../../../private-card-data/imperium_bot_state_tables_private.csv");
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
    G.players["1"].discard.push(id);
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
        playerNationIds: { "1": "test_nation_sun_coast" }
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
        playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });

    const botCardIds = [
      ...(G.solo?.bot.botDeck ?? []),
      ...Object.values(G.solo?.bot.slots ?? {}).flatMap((slot) => slot.cardId ? [slot.cardId] : [])
    ];
    expect(botCardIds).toContain("bot_region");
  });

  it("flips the Bot state table when accession leaves the Dynasty deck during cleanup", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        accession_card: card({ id: "accession_card", displayName: "Accession", cardType: "accession", startingLocation: "box" })
      } as any,
      nationDb: { test_nation_sun_coast: { ...nation, accessionCardId: "accession_card" } },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.solo!.botStateTables = {
      test_nation_sun_coast_S: {
        id: "test_nation_sun_coast",
        botNationId: "test_nation_sun_coast",
        displayName: "Start",
        side: "S",
        rows: []
      },
      test_nation_sun_coast_F: {
        id: "test_nation_sun_coast",
        botNationId: "test_nation_sun_coast",
        displayName: "Flipped",
        side: "F",
        rows: []
      }
    };
    bot.botStateTableId = "test_nation_sun_coast_S";
    bot.botStateSide = "S";
    bot.botDeck = [];
    bot.botDiscard = [];
    bot.botDynastyDeck = ["accession_card"];
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; slot.face = "down"; });

    runBotCleanup(bot, { G, randomNumber: () => 0 });

    expect(bot.botStateTableId).toBe("test_nation_sun_coast_F");
    expect(bot.botStateSide).toBe("F");
    expect(G.log.some((entry) => entry.message === "BotStateTableFlipped(test_nation_sun_coast_F/accession_card)")).toBe(true);
  });

  it("can skip the Bot accession state-table flip for nation-specific solo exceptions", () => {
    const bot = setupSoloBot({
      botNation: { ...nation, accessionCardId: "accession_card" },
      botRuleset: {
        nationId: "test_nation_sun_coast",
        displayName: "Exception Bot",
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
        botOverrides: [{ op: "skip_bot_accession_state_flip" }],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      } as any,
      cardDb: {
        starter: card({}),
        accession_card: card({ id: "accession_card", displayName: "Accession", cardType: "accession", startingLocation: "box" })
      } as any,
      botStateTables: {
        test_nation_sun_coast_S: { id: "test_nation_sun_coast", botNationId: "test_nation_sun_coast", displayName: "Start", side: "S", rows: [] },
        test_nation_sun_coast_F: { id: "test_nation_sun_coast", botNationId: "test_nation_sun_coast", displayName: "Flipped", side: "F", rows: [] }
      },
      options,
      shuffle: (items) => [...items]
    });
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        accession_card: card({ id: "accession_card", displayName: "Accession", cardType: "accession", startingLocation: "box" })
      } as any,
      nationDb: { test_nation_sun_coast: { ...nation, accessionCardId: "accession_card" } },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    G.solo!.bot = bot;
    G.solo!.botStateTables = {
      test_nation_sun_coast_S: { id: "test_nation_sun_coast", botNationId: "test_nation_sun_coast", displayName: "Start", side: "S", rows: [] },
      test_nation_sun_coast_F: { id: "test_nation_sun_coast", botNationId: "test_nation_sun_coast", displayName: "Flipped", side: "F", rows: [] }
    };
    bot.botDeck = [];
    bot.botDiscard = [];
    bot.botDynastyDeck = ["accession_card"];
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; slot.face = "down"; });

    runBotCleanup(bot, { G, randomNumber: () => 0 });

    expect(bot.botStateTableId).toBe("test_nation_sun_coast_S");
    expect(bot.botStateSide).toBe("S");
    expect(G.log.some((entry) => entry.message === "BotStateTableFlipSkipped(accession_card)")).toBe(true);
  });

  it("preserves imported metadata so table suit triggers can resolve revealed cards", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("treats destination-only Bot table rows as resolved instead of falling through", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        destination_only: card({ id: "destination_only", displayName: "Destination Only", suit: "region", cardType: "action", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });

    const result = resolveBotCard({
      G,
      bot: G.solo!.bot,
      revealedCardId: "destination_only",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "history_only", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true },
          { id: "fallback_gain", priority: 99, trigger: { kind: "other" }, effects: [{ op: "bot_gain_resource", resource: "materials", count: 2 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result).toMatchObject({ resolvedRowId: "history_only", cardDestination: "history", resolvedAny: true });
    expect(G.solo?.bot.botHistory).toEqual(["destination_only"]);
    expect(G.solo?.bot.botDiscard).not.toContain("destination_only");
    expect(G.solo?.bot.resources.materials).toBeUndefined();
  });

  it("matches Bot table card-type triggers against normalized cardType metadata", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_attack: card({ id: "bot_attack", displayName: "Bot Attack", suit: "none", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    delete (G.cardDb.bot_attack as any).type;

    const result = resolveBotCard({
      G,
      bot: G.solo!.bot,
      revealedCardId: "bot_attack",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "attack", priority: 1, trigger: { kind: "card_type", cardType: "attack" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true },
          { id: "fallback", priority: 99, trigger: { kind: "other" }, effects: [{ op: "bot_discard_revealed_card" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("attack");
    expect(G.solo?.bot.botHistory).toContain("bot_attack");
  });

  it("ignores Bot table tag triggers when imported cards have no tags", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        untagged_bot: card({ id: "untagged_bot", displayName: "Untagged Bot", suit: "civilized", cardType: "action", tags: undefined, startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });

    const result = resolveBotCard({
      G,
      bot: G.solo!.bot,
      revealedCardId: "untagged_bot",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "tagged", priority: 1, trigger: { kind: "tag", tag: "target" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true },
          { id: "fallback", priority: 99, trigger: { kind: "other" }, effects: [{ op: "bot_discard_revealed_card" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("fallback");
    expect(G.solo?.bot.botDiscard).toContain("untagged_bot");
    expect(G.solo?.bot.botHistory).not.toContain("untagged_bot");
  });

  it("matches Bot table Unrest triggers against normalized cardType metadata", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        typed_unrest: card({ id: "typed_unrest", displayName: "Typed Unrest", suit: "none", cardType: "unrest", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    delete (G.cardDb.typed_unrest as any).type;

    const result = resolveBotCard({
      G,
      bot: G.solo!.bot,
      revealedCardId: "typed_unrest",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "unrest", priority: 1, trigger: { kind: "unrest" }, effects: [{ op: "bot_return_revealed_card_to_unrest" }], implemented: true, tested: true },
          { id: "fallback", priority: 99, trigger: { kind: "other" }, effects: [{ op: "bot_discard_revealed_card" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("unrest");
    expect(result.cardDestination).toBe("unrest");
    expect(G.unrestPile).toContain("typed_unrest");
  });

  it("matches Bot table Unrest triggers against imported Unrest suit icons", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        imported_unrest: card({ id: "imported_unrest", displayName: "Imported Unrest", suit: "civilized", cardType: "action", tags: ["suit:unrest"], startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });

    const result = resolveBotCard({
      G,
      bot: G.solo!.bot,
      revealedCardId: "imported_unrest",
      source: "slot",
      table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "unrest", priority: 1, trigger: { kind: "unrest" }, effects: [{ op: "bot_return_revealed_card_to_unrest" }], implemented: true, tested: true },
          { id: "fallback", priority: 99, trigger: { kind: "other" }, effects: [{ op: "bot_discard_revealed_card" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("unrest");
    expect(result.cardDestination).toBe("unrest");
    expect(G.unrestPile).toContain("imported_unrest");
    expect(G.solo?.bot.botDiscard).not.toContain("imported_unrest");
  });

  it("applies non-destination bot table effects before moving the revealed card", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("falls through from a Bot Fame row when no Fame card can be gained", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.fameDeck = { available: [], specialBottomCardId: "king_of_kings", specialBottomSide: "face_down", resolvedSpecialByPlayer: { bot: true } };

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
          { id: "gain_fame", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_gain_fame", count: 1 } as any], implemented: true, tested: true },
          { id: "fallback", priority: 2, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("fallback");
    expect(bot.resources.materials).toBe(1);
    expect(bot.botDiscard).toContain("bot_region");
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("gains 2 Materials when resolving the top Dynasty deck but it is empty", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDynastyDeck = [];

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
          { id: "resolve_dynasty", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_resolve_top_dynasty_deck" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.resources.materials).toBe(2);
    expect(bot.botDynastyDeck).toEqual([]);
    expect(bot.botDiscard).toContain("bot_region");
    expect(G.log).toContainEqual(expect.objectContaining({ message: "BotResolveTopCardFallback(dynasty_deck/gained=2 materials)" }));
  });

  it("does not trigger Scoring when a Bot discard-Dynasty effect finds the Dynasty deck already empty", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDynastyDeck = [];

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
          { id: "discard_dynasty", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_discard_top_dynasty_deck" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDynastyDeck).toEqual([]);
    expect(G.scoring).toBeUndefined();
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("Supreme Ruler Bot gains Progress when it returns an Unrest from discard", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, soloDifficulty: "supreme_ruler" },
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        discarded_unrest: card({ id: "discarded_unrest", displayName: "Discarded Unrest", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.knowledge = 0;
    bot.botDiscard = ["discarded_unrest"];
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
    expect(G.unrestPile).toEqual(["discarded_unrest"]);
    expect(bot.resources.knowledge).toBe(1);
  });

  it("Supreme Ruler Bot returns the most recent imported Unrest suit-icon discard card", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, soloDifficulty: "supreme_ruler" },
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        older_imported_unrest: card({ id: "older_imported_unrest", displayName: "Older Imported Unrest", suit: "civilized", cardType: "action", tags: ["suit:unrest"] }),
        action_discard: card({ id: "action_discard", displayName: "Action", suit: "civilized", cardType: "action" }),
        recent_imported_unrest: card({ id: "recent_imported_unrest", displayName: "Recent Imported Unrest", suit: "civilized", cardType: "action", tags: ["suit:unrest"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.knowledge = 0;
    bot.botDiscard = ["older_imported_unrest", "action_discard", "recent_imported_unrest"];
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
    expect(G.unrestPile).toEqual(["recent_imported_unrest"]);
    expect(bot.botDiscard).toEqual(["older_imported_unrest", "action_discard", "bot_region"]);
    expect(bot.resources.knowledge).toBe(1);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("abandons the most recently played matching Bot region to the Bot discard", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        old_region: card({ id: "old_region", displayName: "Old Region", suit: "region", cardType: "region" }),
        recent_region: card({ id: "recent_region", displayName: "Recent Region", suit: "region", cardType: "region" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
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
          { id: "abandon_region", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_abandon_in_play", filter: { suits: ["region"] } } as any], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botPlayArea).toEqual(["old_region"]);
    expect(bot.botDiscard).toEqual(["recent_region", "bot_region"]);
    expect(G.log.some((entry) => entry.message === "BotAbandonedInPlay(recent_region)")).toBe(true);
  });

  it("swaps a matching Bot in-play card with the highest-valued matching Market card without gaining Market tokens", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_gadget: card({ id: "bot_gadget", displayName: "Bot Gadget", suit: "civilized", cardType: "action", tags: ["gadget"] }),
        lower_market: card({ id: "lower_market", displayName: "Lower", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 4 } }),
        token_boosted_market: card({ id: "token_boosted_market", displayName: "Token Boosted", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 3 } }),
        tucked_unrest: card({ id: "tucked_unrest", displayName: "Tucked Unrest", suit: "unrest", cardType: "unrest" }),
        new_unrest: card({ id: "new_unrest", displayName: "New Unrest", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.knowledge = 0;
    bot.botPlayArea = ["bot_gadget"];
    G.market = ["lower_market", "token_boosted_market"];
    G.marketResources = { token_boosted_market: { knowledge: 2 } };
    G.marketUnrest = { token_boosted_market: ["tucked_unrest"] };
    G.unrestPile = ["new_unrest"];

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
          { id: "swap_gadget", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_swap_market", filter: { tags: ["gadget"] } }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botPlayArea).toEqual([]);
    expect(bot.botDiscard).toEqual(["token_boosted_market", "bot_region"]);
    expect(bot.resources.knowledge).toBe(0);
    expect(G.market).toEqual(["lower_market", "bot_gadget"]);
    expect(G.marketResources).toEqual({ bot_gadget: { knowledge: 2 } });
    expect(G.marketUnrest).toEqual({ bot_gadget: ["new_unrest"] });
    expect(G.unrestPile).toEqual(["tucked_unrest"]);
    expect(G.log.some((entry) => entry.message === "BotSwappedWithMarket(bot_gadget<->token_boosted_market)")).toBe(true);
  });

  it("applies Bot Swap market resource filters before choosing the highest-valued Market card", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_gadget: card({ id: "bot_gadget", displayName: "Bot Gadget", suit: "civilized", cardType: "action", tags: ["gadget"] }),
        high_plain_market: card({ id: "high_plain_market", displayName: "High Plain", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 9 } }),
        resource_market: card({ id: "resource_market", displayName: "Resource Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 1 } }),
        new_unrest: card({ id: "new_unrest", displayName: "New Unrest", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["bot_gadget"];
    G.market = ["high_plain_market", "resource_market"];
    G.marketResources = { resource_market: { knowledge: 1 } };
    G.unrestPile = ["new_unrest"];

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
            id: "swap_resource_market",
            priority: 1,
            trigger: { kind: "suit", suit: "region" },
            effects: [{ op: "bot_swap_market", filter: { tags: ["gadget"] }, marketFilter: { hasMarketResource: "knowledge" } }],
            implemented: true,
            tested: true
          }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDiscard).toEqual(["resource_market", "bot_region"]);
    expect(G.market).toEqual(["high_plain_market", "bot_gadget"]);
    expect(G.marketResources).toEqual({ bot_gadget: { knowledge: 1 } });
    expect(G.marketUnrest).toEqual({ bot_gadget: ["new_unrest"] });
    expect(G.log.some((entry) => entry.message === "BotSwappedWithMarket(bot_gadget<->resource_market)")).toBe(true);
  });

  it("applies Bot Swap market resource filters and transfer from structured Market slot markers", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_gadget: card({ id: "bot_gadget", displayName: "Bot Gadget", suit: "civilized", cardType: "action", tags: ["gadget"] }),
        high_plain_market: card({ id: "high_plain_market", displayName: "High Plain", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 9 } }),
        structured_resource_market: card({ id: "structured_resource_market", displayName: "Structured Resource Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 1 } }),
        new_unrest: card({ id: "new_unrest", displayName: "New Unrest", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["bot_gadget"];
    G.market = ["high_plain_market", "structured_resource_market"];
    G.marketResources = {};
    G.marketSlots = [
      { index: 0, cardId: "high_plain_market", resourceMarkers: {}, attachedUnrestCardIds: [] },
      { index: 1, cardId: "structured_resource_market", resourceMarkers: { knowledge: 1 }, attachedUnrestCardIds: [] }
    ];
    G.unrestPile = ["new_unrest"];

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
            id: "swap_structured_resource_market",
            priority: 1,
            trigger: { kind: "suit", suit: "region" },
            effects: [{ op: "bot_swap_market", filter: { tags: ["gadget"] }, marketFilter: { hasMarketResource: "knowledge" } }],
            implemented: true,
            tested: true
          }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(bot.botDiscard).toEqual(["structured_resource_market", "bot_region"]);
    expect(G.market).toEqual(["high_plain_market", "bot_gadget"]);
    expect(G.marketResources).toEqual({ bot_gadget: { knowledge: 1 } });
    expect(G.marketSlots.find((slot) => slot.cardId === "bot_gadget")?.resourceMarkers).toEqual({ knowledge: 1 });
    expect(G.marketUnrest).toEqual({ bot_gadget: ["new_unrest"] });
    expect(G.log.some((entry) => entry.message === "BotSwappedWithMarket(bot_gadget<->structured_resource_market)")).toBe(true);
  });

  it("returns a revealed Bot Unrest card to the Unrest pile instead of discarding it", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_unrest: card({ id: "bot_unrest", displayName: "Bot Unrest", suit: "unrest", cardType: "unrest", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("Supreme Ruler Bot gains Progress when it returns the revealed Unrest card", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, soloDifficulty: "supreme_ruler" },
      cardDb: {
        starter: card({}),
        bot_unrest: card({ id: "bot_unrest", displayName: "Bot Unrest", suit: "unrest", cardType: "unrest", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.knowledge = 0;
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
    expect(bot.resources.knowledge).toBe(1);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].resources.knowledge = 0;

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
    expect(G.players["1"].resources.knowledge).toBe(2);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].discard = [];
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
    expect(G.players["1"].hand).toContain("unrest_one");
    expect(G.players["1"].hand).toContain("unrest_two");
    expect(G.unrestPile).toEqual([]);
    expect(bot.botDiscard).toContain("bot_region");
  });

  it("pauses a Bot row after human_take_unrest opens a reactive Exhaust window", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "knowledge",
            amount: 1,
            reactive: { trigger: "after_take_unrest", target: "self" }
          }]
        }),
        unrest_one: card({ id: "unrest_one", displayName: "Unrest", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.currentTurnType = "activate";
    G.players["1"].playArea = ["human_reactive"];
    G.players["1"].hand = [];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].exhaustTokensAvailable = 1;
    G.unrestPile = ["unrest_one"];
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [{
          id: "human_unrest",
          priority: 1,
          trigger: { kind: "card_id", cardId: "bot_region" },
          effects: [
            { op: "human_take_unrest", count: 1 },
            { op: "bot_gain_resource", resource: "goods", count: 2 }
          ],
          implemented: true,
          tested: true
        }]
      }
    };
    bot.botStateTableId = "test_table";
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[1].cardId = "bot_region";

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.players["1"].hand).toEqual(["unrest_one"]);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "bot_region",
      trigger: "after_take_unrest",
      targetPlayerId: "1"
    });
    expect(bot.resources.goods).toBeUndefined();

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(bot.resources.goods).toBe(2);
  });

  it("moves Bot resources onto the current Cultists state card or uses the fallback", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_unrest: card({ id: "bot_unrest", displayName: "Bot Unrest", suit: "unrest", cardType: "unrest", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("resolves Bot resource effects using rulebook resource names", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: { starter: card({}) } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    const table = { id: "cultists_ceremonial_gathering", botNationId: "cultists", displayName: "Cultists", side: "F", rows: [] };

    expect(applyBotEffect(G, bot, table, "state", { op: "bot_gain_resource", resource: "progress" as any, count: 2 })).toEqual([]);
    expect(bot.resources.knowledge).toBe(2);
    expect((bot.resources as any).progress).toBeUndefined();

    expect(applyBotEffect(G, bot, table, "state", {
      op: "bot_pay_resource_then",
      resource: "progress" as any,
      count: 1,
      effects: [{ op: "bot_gain_resource", resource: "population" as any, count: 1 }]
    })).toEqual([]);
    expect(bot.resources.knowledge).toBe(1);
    expect(bot.resources.influence).toBe(1);
    expect((bot.resources as any).population).toBeUndefined();

    expect(applyBotEffect(G, bot, table, "state", {
      op: "bot_spend_resource_to_state_card",
      spendResource: "population" as any,
      spendCount: 1,
      placeResource: "progress" as any,
      placeCount: 1
    })).toEqual([]);
    expect(bot.resources.influence).toBe(0);
    expect(bot.stateTokens?.cultists_ceremonial_gathering_F?.knowledge).toBe(1);
  });

  it("covers the private Cultists ceremonial Unrest row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_ceremonial_gathering_F;
    const row = table.rows.find((candidate) => candidate.id === "unrest");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_unrest: card({ id: "cultist_unrest", displayName: "Unrest", suit: "unrest", cardType: "unrest", tags: ["unrest"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.influence = 1;

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_unrest", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "unrest", cardDestination: "unrest", resolvedAny: true, warnings: [] });
    expect(G.unrestPile).toContain("cultist_unrest");
    expect(bot.botDiscard).not.toContain("cultist_unrest");
    expect(bot.resources.influence).toBe(0);
    expect(bot.stateTokens?.cultists_ceremonial_gathering_F?.influence).toBe(1);
  });

  it("covers the private Cultists ceremonial Trade Route row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_ceremonial_gathering_F;
    const row = table.rows.find((candidate) => candidate.id === "trade_route");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        cultist_route: card({ id: "cultist_route", displayName: "Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.solo!.botTradeRoutesTables = {
      cultists_routes: {
        id: "cultists_routes",
        rows: [
          { tradeRouteId: "cultist_route", publicPlaceholderName: "Route", commerceEffects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], profitEffects: [] }
        ],
        endOfTurnRows: []
      }
    };

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_route", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "trade_route", cardDestination: "play", resolvedAny: true, warnings: [] });
    expect(bot.botPlayArea).toContain("cultist_route");
    expect(bot.resources.goods).toBe(2);
    expect(bot.botDiscard).not.toContain("cultist_route");
  });

  it("covers the private Cultists ceremonial Progress/history row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_ceremonial_gathering_F;
    const row = table.rows.find((candidate) => candidate.id === "progress_history");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_progress: card({ id: "cultist_progress", displayName: "Progress", suit: "none", cardType: "action", tags: ["progress_history"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.knowledge = 0;

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_progress", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "progress_history", cardDestination: "history", resolvedAny: true, warnings: [] });
    expect(bot.resources.knowledge).toBe(1);
    expect(bot.botHistory).toContain("cultist_progress");
    expect(bot.botDiscard).not.toContain("cultist_progress");
  });

  it("covers the private Cultists ceremonial fallback row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_ceremonial_gathering_F;
    const row = table.rows.find((candidate) => candidate.id === "other");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_other: card({ id: "cultist_other", displayName: "Other", suit: "civilized", cardType: "action" }),
        deck_card: card({ id: "deck_card", displayName: "Deck Card", suit: "uncivilized", cardType: "action" }),
        discarded_unrest: card({ id: "discarded_unrest", displayName: "Unrest", suit: "unrest", cardType: "unrest", tags: ["unrest"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["deck_card"];
    bot.botDiscard = ["discarded_unrest"];
    bot.resources.influence = 0;

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_other", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "other", cardDestination: "history", resolvedAny: true, warnings: [] });
    expect(bot.botDeck).toEqual([]);
    expect(bot.botDiscard).toEqual(["deck_card"]);
    expect(G.unrestPile).toContain("discarded_unrest");
    expect(bot.resources.influence).toBe(1);
    expect(bot.botHistory).toContain("cultist_other");
  });

  it("covers the private Cultists research Unrest row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_research_ceremony_S;
    const row = table.rows.find((candidate) => candidate.id === "unrest");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_unrest: card({ id: "cultist_unrest", displayName: "Unrest", suit: "unrest", cardType: "unrest", tags: ["unrest"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.influence = 0;

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_unrest", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "unrest", cardDestination: "unrest", resolvedAny: true, warnings: [] });
    expect(G.unrestPile).toContain("cultist_unrest");
    expect(bot.resources.influence).toBe(1);
    expect(bot.botDiscard).not.toContain("cultist_unrest");
  });

  it("covers the private Cultists research Trade Route row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_research_ceremony_S;
    const row = table.rows.find((candidate) => candidate.id === "trade_route");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        cultist_route: card({ id: "cultist_route", displayName: "Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.solo!.botTradeRoutesTables = {
      cultists_routes: {
        id: "cultists_routes",
        rows: [
          { tradeRouteId: "cultist_route", publicPlaceholderName: "Route", commerceEffects: [{ op: "bot_gain_resource", resource: "materials", count: 2 }], profitEffects: [] }
        ],
        endOfTurnRows: []
      }
    };

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_route", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "trade_route", cardDestination: "play", resolvedAny: true, warnings: [] });
    expect(bot.botPlayArea).toContain("cultist_route");
    expect(bot.resources.materials).toBe(2);
    expect(bot.botDiscard).not.toContain("cultist_route");
  });

  it("covers the private Cultists research Progress/history row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_research_ceremony_S;
    const row = table.rows.find((candidate) => candidate.id === "progress_history");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_progress: card({ id: "cultist_progress", displayName: "Progress", suit: "none", cardType: "action", tags: ["progress_history"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.knowledge = 0;

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_progress", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "progress_history", cardDestination: "history", resolvedAny: true, warnings: [] });
    expect(bot.resources.knowledge).toBe(1);
    expect(bot.botHistory).toContain("cultist_progress");
    expect(bot.botDiscard).not.toContain("cultist_progress");
  });

  it("covers the private Cultists research fallback row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_research_ceremony_S;
    const row = table.rows.find((candidate) => candidate.id === "other");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_other: card({ id: "cultist_other", displayName: "Other", suit: "civilized", cardType: "action" }),
        deck_one: card({ id: "deck_one", displayName: "Deck One", suit: "uncivilized", cardType: "action" }),
        deck_two: card({ id: "deck_two", displayName: "Deck Two", suit: "civilized", cardType: "action" }),
        discarded_unrest: card({ id: "discarded_unrest", displayName: "Unrest", suit: "unrest", cardType: "unrest", tags: ["unrest"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["deck_one", "deck_two"];
    bot.botDiscard = ["discarded_unrest"];
    bot.resources.influence = 0;

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_other", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "other", cardDestination: "history", resolvedAny: true, warnings: [] });
    expect(G.unrestPile).toContain("discarded_unrest");
    expect(bot.botDeck).toEqual([]);
    expect(bot.botDiscard).toEqual(["deck_one", "deck_two"]);
    expect(bot.resources.influence).toBe(1);
    expect(bot.botHistory).toContain("cultist_other");
  });

  it("covers the private Cultists ceremonial hammer state-token row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_ceremonial_gathering_F;
    const row = table.rows.find((candidate) => candidate.id === "hammer_state_token");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_power: card({ id: "cultist_power", displayName: "Power", suit: "civilized", cardType: "power", type: "power" }),
        chaos_one: card({ id: "chaos_one", displayName: "Chaos", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.influence = 1;
    G.players["1"].resources.goods = 0;
    G.specialZones = { "1": { chaos_pile: { id: "chaos_pile", displayName: "Chaos Pile", cardIds: ["chaos_one"], visibility: "public", scoresAsOwned: false } } };

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_power", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "hammer_state_token", cardDestination: "discard", resolvedAny: true, warnings: [] });
    expect(bot.resources.influence).toBe(0);
    expect(bot.stateTokens?.cultists_ceremonial_gathering_F?.influence).toBe(1);
    expect(G.players["1"].resources.goods).toBe(2);
    expect(G.specialZones["1"].chaos_pile.cardIds).toEqual([]);
    expect(G.players["1"].discard).toContain("chaos_one");
    expect(bot.botDiscard).toContain("cultist_power");
  });

  it("covers the private Cultists ceremonial Region state-token row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_ceremonial_gathering_F;
    const row = table.rows.find((candidate) => candidate.id === "region_state_token");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_region: card({ id: "cultist_region", displayName: "Region", suit: "region", cardType: "region", tags: ["region"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.influence = 1;

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_region", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "region_state_token", cardDestination: "play", resolvedAny: true, warnings: [] });
    expect(bot.botPlayArea).toContain("cultist_region");
    expect(bot.resources.influence).toBe(0);
    expect(bot.stateTokens?.cultists_ceremonial_gathering_F?.influence).toBe(1);
    expect(bot.botDiscard).not.toContain("cultist_region");
  });

  it("covers the private Cultists research state-progress row through the Bot table resolver", () => {
    const tables = normalizeBotStateTables(parseCsvFile(privateBotStateTablesCsvPath) as any);
    const table = tables.cultists_research_ceremony_S;
    const row = table.rows.find((candidate) => candidate.id === "cultist_state_progress");
    expect(row?.implemented).toBe(true);
    expect(row?.tested).toBe(true);

    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        cultist_state_card: card({ id: "cultist_state_card", displayName: "Cultist", suit: "civilized", cardType: "state" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.influence = 2;

    const result = resolveBotCard({ G, bot, revealedCardId: "cultist_state_card", source: "slot", table });

    expect(result).toMatchObject({ resolvedRowId: "cultist_state_progress", cardDestination: "discard", resolvedAny: true, warnings: [] });
    expect(bot.resources.influence).toBe(0);
    expect(bot.stateTokens?.cultists_research_ceremony_S?.knowledge).toBe(1);
    expect(bot.botDiscard).toContain("cultist_state_card");
  });

  it("human_take_chaos moves Chaos from the Cultists pile to the human discard", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        chaos_one: card({ id: "chaos_one", displayName: "Chaos", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    const table = { id: "cultists_ceremonial_gathering", botNationId: "cultists", displayName: "Cultists", side: "F", rows: [] };
    G.specialZones = { "1": { chaos_pile: { id: "chaos_pile", displayName: "Chaos Pile", cardIds: ["chaos_one"], visibility: "public", scoresAsOwned: false } } };

    expect(applyBotEffect(G, bot, table, "state", { op: "human_take_chaos", count: 1 })).toEqual([]);
    expect(G.specialZones["1"].chaos_pile.cardIds).toEqual([]);
    expect(G.players["1"].discard).toContain("chaos_one");
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("Cultists cleanup exiles most-tokened Market cards from structured slot markers", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        market_plain: card({ id: "market_plain", displayName: "Market Plain", suit: "civilized", cardType: "action" }),
        market_structured: card({ id: "market_structured", displayName: "Market Structured", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    const ceremonial = { id: "cultists_ceremonial_gathering", botNationId: "cultists", displayName: "Cultists", side: "F", rows: [] };
    const research = { id: "cultists_research_ceremony", botNationId: "cultists", displayName: "Cultists", side: "S", rows: [] };
    G.solo!.botStateTables = {
      cultists_ceremonial_gathering_F: ceremonial,
      cultists_research_ceremony_S: research
    };
    bot.botStateTableId = "cultists_research_ceremony_S";
    bot.botStateSide = "S";
    bot.stateTokens = { cultists_research_ceremony_S: { knowledge: 5 } };
    G.market = ["market_plain", "market_structured"];
    G.marketResources = {};
    G.marketSlots = [
      { index: 0, cardId: "market_plain", resourceMarkers: {}, attachedUnrestCardIds: [] },
      { index: 1, cardId: "market_structured", resourceMarkers: { goods: 2 }, attachedUnrestCardIds: [] }
    ];

    expect(applyBotEffect(G, bot, research, "cleanup", { op: "bot_resolve_cultists_state_cleanup" })).toEqual([]);

    expect(bot.botStateTableId).toBe("cultists_ceremonial_gathering_F");
    expect(G.market).toEqual(["market_plain"]);
    expect(G.sharedDiscard).toContain("market_structured");
    expect(G.marketSlots).toEqual([{ index: 0, cardId: "market_plain", resourceMarkers: {}, attachedUnrestCardIds: [] }]);
    expect(G.log.some((entry) => entry.message === "BotCultistsExiledMostTokenedMarketCards(count=1)")).toBe(true);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      scores: { "1": 1 }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_region"];
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
      playerId: "1",
      sourceCardId: "bot_prompt",
      op: "recall_region",
      cardIds: ["human_region"]
    });
    expect(G.solo?.pausedBotTurn).toEqual({ remainingSlotNumbers: [2], effectsRemaining: 3 });
    expect(bot.resources.goods).toBeUndefined();
    expect(bot.slots[2].cardId).toBe("bot_after");

    resolveRegionChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_region");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(G.players["1"].hand).toContain("human_region");
    expect(bot.resources.goods).toBe(2);
    expect(bot.botDiscard).toEqual([]);
    expect([bot.slots[1].cardId, bot.slots[2].cardId].sort()).toEqual(["bot_after", "bot_prompt"]);
  });

  it("resumes the Bot turn after a Bot-driven human Recall opens a reactive Exhaust window", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        human_region: card({ id: "human_region", displayName: "Human Region", suit: "region", cardType: "region" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "knowledge",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "materials", sourceSuit: "region" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_region", "human_reactive"];
    G.players["1"].exhaustTokensAvailable = 1;
    G.players["1"].resources.materials = 0;
    G.players["1"].resources.knowledge = 0;
    G.cardStates = { human_region: { resources: { materials: 1 } } };
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
    resolveRegionChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_region");

    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: "1",
      sourceCardId: "bot_prompt",
      trigger: "after_gain_resource",
      resource: "materials"
    });
    expect(G.players["1"].hand).toContain("human_region");
    expect(G.players["1"].resources.materials).toBe(1);
    expect(bot.resources.goods).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toEqual({ remainingSlotNumbers: [2], effectsRemaining: 3 });

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(bot.resources.goods).toBe(2);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_region"];
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
      playerId: "1",
      sourceCardId: "bot_prompt",
      op: "abandon_region",
      cardIds: ["human_region"]
    });
  });

  it("human_abandon honors count before resuming the Bot turn", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        human_region_1: card({ id: "human_region_1", displayName: "Human Region 1", suit: "region", cardType: "region" }),
        human_region_2: card({ id: "human_region_2", displayName: "Human Region 2", suit: "region", cardType: "region" }),
        human_region_3: card({ id: "human_region_3", displayName: "Human Region 3", suit: "region", cardType: "region" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_region_1", "human_region_2", "human_region_3"];
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "prompt", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "human_abandon", filter: { suits: ["region"] }, count: 2 }], implemented: true, tested: true },
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

    expect(G.pendingRegionChoice).toMatchObject({
      playerId: "1",
      sourceCardId: "bot_prompt",
      op: "abandon_region",
      cardIds: ["human_region_1", "human_region_2", "human_region_3"],
      count: 2
    });

    resolveRegionChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_region_1");

    expect(G.pendingRegionChoice).toMatchObject({
      playerId: "1",
      sourceCardId: "bot_prompt",
      op: "abandon_region",
      cardIds: ["human_region_2", "human_region_3"],
      count: 1
    });
    expect(G.players["1"].discard).toEqual(["human_region_1"]);
    expect(bot.resources.goods).toBeUndefined();

    resolveRegionChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_region_2");

    expect(G.pendingRegionChoice).toBeUndefined();
    expect(G.players["1"].discard).toEqual(["human_region_1", "human_region_2"]);
    expect(G.players["1"].playArea).toEqual(["human_region_3"]);
    expect(bot.resources.goods).toBe(2);
  });

  it("Bot Trade Route trigger resolves the route commerce effects", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        trade_route: card({ id: "trade_route", displayName: "Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_route"];
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
    expect(G.players["1"].resources.goods).toBe(2);
  });

  it("Bot Trade treats imported human cards with a Trade Route suit icon as Trade Routes", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        imported_human_route: card({
          id: "imported_human_route",
          displayName: "Imported Human Route",
          suit: "civilized",
          cardType: "action",
          tags: ["suit:trade_route"]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.goods = 0;
    G.players["1"].playArea = ["imported_human_route"];
    G.cardStates = { imported_human_route: { resources: { goods: 1 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          { tradeRouteId: "imported_human_route", publicPlaceholderName: "Imported Human Route", commerceEffects: [{ op: "human_gain_resource", resource: "goods", count: 1 }], profitEffects: [] }
        ],
        endOfTurnRows: []
      }
    };

    const resolved = resolveBotTrade(G, bot);

    expect(resolved).toBe(true);
    expect(G.cardStates.imported_human_route.resources?.goods).toBe(2);
    expect(bot.resources.knowledge).toBe(1);
    expect(G.players["1"].resources.goods).toBe(2);
  });

  it("Bot Trade does not trigger a human Trade Route when supply cannot place the Goods token", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        human_route: card({ id: "human_route", displayName: "Human Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_route"];
    G.players["1"].resources.goods = 0;
    bot.resources.knowledge = 0;
    G.resourceSupply = { goods: 0, knowledge: 1 };
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

    const resolved = resolveBotTrade(G, bot);

    expect(resolved).toBe(false);
    expect(G.cardStates.human_route.resources?.goods).toBe(1);
    expect(bot.resources.knowledge).toBe(0);
    expect(G.players["1"].resources.goods).toBe(0);
  });

  it("Bot Trade adds supply Goods to its own route without spending Bot Goods", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["bot_route"];
    bot.resources.goods = 0;
    bot.resources.materials = 0;
    G.cardStates = { bot_route: { resources: { goods: 1 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          { tradeRouteId: "bot_route", publicPlaceholderName: "Bot Route", commerceEffects: [{ op: "bot_gain_resource", resource: "materials", count: 2 }], profitEffects: [] }
        ],
        endOfTurnRows: []
      }
    };

    const resolved = resolveBotTrade(G, bot);

    expect(resolved).toBe(true);
    expect(G.cardStates.bot_route.resources?.goods).toBe(2);
    expect(bot.resources.goods).toBe(0);
    expect(bot.resources.materials).toBe(2);
  });

  it("Bot Trade Route commerce stops remaining effects when human_take_unrest triggers Collapse", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        human_route: card({ id: "human_route", displayName: "Human Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_route"];
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
      scores: { "1": 1 }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("does not resume a paused Bot turn while a Return Exhaust token choice is pending", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        spent_card: card({ id: "spent_card", displayName: "Spent Card", suit: "region", cardType: "region" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "after", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "test_table";
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[2].cardId = "bot_after";
    G.solo!.pausedBotTurn = { remainingSlotNumbers: [2], effectsRemaining: 3 };
    G.pendingReturnExhaustTokenChoice = { playerId: "1", sourceCardId: "human_prompt", cardIds: ["spent_card"] };

    continuePausedBotTurn(G);

    expect(G.solo?.pausedBotTurn).toEqual({ remainingSlotNumbers: [2], effectsRemaining: 3 });
    expect(bot.resources.goods).toBeUndefined();
    expect(bot.slots[2].cardId).toBe("bot_after");
  });

  it("does not resume a paused Bot turn while a Look order choice is pending", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        looked_a: card({ id: "looked_a", displayName: "Looked A", suit: "region", cardType: "action" }),
        looked_b: card({ id: "looked_b", displayName: "Looked B", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "after", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "test_table";
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[2].cardId = "bot_after";
    G.solo!.pausedBotTurn = { remainingSlotNumbers: [2], effectsRemaining: 3 };
    G.pendingLookOrderChoice = { playerId: "1", sourceCardId: "human_prompt", source: "deck", cardIds: ["looked_a", "looked_b"] };

    continuePausedBotTurn(G);

    expect(G.solo?.pausedBotTurn).toEqual({ remainingSlotNumbers: [2], effectsRemaining: 3 });
    expect(bot.resources.goods).toBeUndefined();
    expect(bot.slots[2].cardId).toBe("bot_after");
  });

  it("resumes a paused Bot turn after a Return Exhaust token choice resolves", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        spent_card: card({ id: "spent_card", displayName: "Spent Card", suit: "region", cardType: "region" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["spent_card"];
    G.players["1"].exhaustTokensAvailable = 0;
    G.cardStates = { spent_card: { exhausted: true, exhaustTokens: 1 } };
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "after", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "test_table";
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[2].cardId = "bot_after";
    G.solo!.pausedBotTurn = { remainingSlotNumbers: [2], effectsRemaining: 3 };
    G.pendingReturnExhaustTokenChoice = { playerId: "1", sourceCardId: "human_prompt", cardIds: ["spent_card"] };

    resolveReturnExhaustTokenChoice({ G, ctx: { currentPlayer: "1" } as any }, "spent_card");

    expect(G.pendingReturnExhaustTokenChoice).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(bot.resources.goods).toBe(2);
    expect(bot.slots[2].cardId).toBeUndefined();
  });

  it("resumes a paused Bot turn after a Look order choice resolves", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        looked_a: card({ id: "looked_a", displayName: "Looked A", suit: "region", cardType: "action" }),
        looked_b: card({ id: "looked_b", displayName: "Looked B", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].deck = ["looked_a", "looked_b"];
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "after", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "test_table";
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[2].cardId = "bot_after";
    G.solo!.pausedBotTurn = { remainingSlotNumbers: [2], effectsRemaining: 3 };
    G.pendingLookOrderChoice = { playerId: "1", sourceCardId: "human_prompt", source: "deck", cardIds: ["looked_a", "looked_b"] };

    resolveLookOrderChoice({ G, ctx: { currentPlayer: "1" } as any }, ["looked_b", "looked_a"]);

    expect(G.pendingLookOrderChoice).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(bot.resources.goods).toBe(2);
    expect(G.players["1"].deck).toEqual(["looked_b", "looked_a"]);
    expect(bot.slots[2].cardId).toBeUndefined();
  });

  it("does not resume a paused Bot turn before a Bot-triggered Unrest take continuation finishes", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        unrest_a: card({ id: "unrest_a", displayName: "Unrest A", suit: "unrest", cardType: "unrest", startingLocation: "unrest_pile" }),
        unrest_b: card({ id: "unrest_b", displayName: "Unrest B", suit: "unrest", cardType: "unrest", startingLocation: "unrest_pile" }),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.activeNationRulesets = {
      "1": {
        nationId: "test_nation_sun_coast",
        displayName: "Unrest Choice Nation",
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
          trigger: "after_gain_unrest",
          effects: [{
            trigger: "on_play",
            op: "choose_one",
            choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 }]]
          } as any]
        }],
        implemented: true,
        tested: true
      }
    };
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "after", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "test_table";
    G.unrestPile = ["unrest_b"];
    G.players["1"].hand = ["unrest_a"];
    G.pendingChoice = {
      playerId: "1",
      choices: [[{ trigger: "on_play", op: "gain_resource", resource: "goods", amount: 1 } as any]]
    };
    G.pendingUnrestTakeContinuation = {
      playerId: bot.botId,
      recipientPlayerIds: ["1"],
      countPerPlayer: 2,
      recipientIndex: 0,
      cardIndex: 1,
      taken: 1
    };
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[2].cardId = "bot_after";
    G.solo!.pausedBotTurn = { remainingSlotNumbers: [2], effectsRemaining: 3 };

    resolveChoice({ G, ctx: { currentPlayer: "1" } as any }, 0);

    expect(G.players["1"].resources.goods).toBe(1);
    expect(G.players["1"].hand).toEqual(["unrest_a", "unrest_b"]);
    expect(G.pendingChoice).toBeDefined();
    expect(G.solo?.pausedBotTurn).toEqual({ remainingSlotNumbers: [2], effectsRemaining: 3 });
    expect(bot.resources.goods).toBeUndefined();
    expect(bot.slots[2].cardId).toBe("bot_after");

    resolveChoice({ G, ctx: { currentPlayer: "1" } as any }, 0);

    expect(G.pendingChoice).toBeUndefined();
    expect(G.pendingUnrestTakeContinuation).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(bot.resources.goods).toBe(2);
    expect(bot.slots[2].cardId).toBeUndefined();
  });

  it("pauses a Bot turn for human reactive Exhaust after Bot-given resources", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "action", startingLocation: "bot_deck" }),
        bot_after: card({ id: "bot_after", displayName: "Bot After", suit: "civilized", cardType: "action", startingLocation: "bot_deck" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "goods",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "knowledge" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_reactive"];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].resources.goods = 0;
    G.players["1"].exhaustTokensAvailable = 1;
    G.currentTurnType = "activate";
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "prompt", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "human_gain_resource", resource: "knowledge", count: 1 }], implemented: true, tested: true },
          { id: "after", priority: 1, trigger: { kind: "card_id", cardId: "bot_after" }, effects: [{ op: "bot_gain_resource", resource: "goods", count: 2 }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "test_table";
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[1].cardId = "bot_prompt";
    bot.slots[2].cardId = "bot_after";

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "bot_prompt",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(G.solo?.pausedBotTurn).toEqual({ remainingSlotNumbers: [2], effectsRemaining: 3 });
    expect(bot.resources.goods).toBeUndefined();
    expect(bot.slots[2].cardId).toBe("bot_after");

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(G.players["1"].resources.goods).toBe(1);
    expect(bot.resources.goods).toBe(2);
  });

  it("does not resolve later Bot row effects while a human reactive Exhaust is pending", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "action", startingLocation: "bot_deck" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "goods",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "knowledge" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_reactive"];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].resources.goods = 0;
    G.players["1"].exhaustTokensAvailable = 1;
    G.currentTurnType = "activate";
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [{
          id: "prompt",
          priority: 1,
          trigger: { kind: "card_id", cardId: "bot_prompt" },
          effects: [
            { op: "human_gain_resource", resource: "knowledge", count: 1 },
            { op: "bot_gain_resource", resource: "goods", count: 2 }
          ],
          implemented: true,
          tested: true
        }]
      }
    };
    bot.botStateTableId = "test_table";
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.slots[1].cardId = "bot_prompt";

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "bot_prompt",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(bot.resources.goods).toBeUndefined();

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.solo?.pendingBotRowContinuation).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(G.players["1"].resources.goods).toBe(1);
    expect(bot.resources.goods).toBe(2);
  });

  it("Bot Trade Routes end-of-turn falls through rows that cannot resolve", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: { starter: card({}) } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_region"];
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

    resolveRegionChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_region");

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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("refunds paid Bot Trade Routes costs and rolls back partial follow-up effects when a later paid effect cannot resolve", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        civilized: card({ id: "civilized", displayName: "Civilized", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.merchantState = "merchant_empire";
    bot.resources.goods = 3;
    bot.resources.materials = 0;
    bot.resources.knowledge = 0;
    G.market = ["civilized"];
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [],
        endOfTurnRows: [
          {
            merchantState: "merchant_empire",
            priority: 1,
            effects: [{
              op: "bot_pay_resource_then",
              resource: "goods",
              count: 3,
              effects: [
                { op: "bot_gain_resource", resource: "materials", count: 1 },
                { op: "bot_acquire", filter: { suits: ["tributary", "uncivilized"] } }
              ]
            }]
          },
          { merchantState: "merchant_empire", priority: 2, effects: [{ op: "bot_gain_resource", resource: "knowledge", count: 1 }] }
        ]
      }
    };

    resolveBotTradeRoutesEndOfTurn(G, bot);

    expect(bot.resources.goods).toBe(3);
    expect(bot.resources.materials).toBe(0);
    expect(bot.resources.knowledge).toBe(1);
    expect(bot.botDeck).not.toContain("civilized");
    expect(G.market).toEqual(["civilized"]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.players["1"].playArea = ["human_route"];
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
    expect(G.players["1"].resources.goods).toBe(2);
    expect(bot.botDiscard).toContain("bot_prompt");
  });

  it("pauses Bot Trade Route commerce before later effects while a human reactive Exhaust is pending", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        human_route: card({ id: "human_route", displayName: "Human Route", suit: "trade_route", cardType: "trade_route" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "goods",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "knowledge" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.currentTurnType = "activate";
    G.players["1"].playArea = ["human_route", "human_reactive"];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].resources.goods = 0;
    G.players["1"].exhaustTokensAvailable = 1;
    G.cardStates = { human_route: { resources: { goods: 1 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "human_route",
            publicPlaceholderName: "Human Route",
            commerceEffects: [
              { op: "human_gain_resource", resource: "knowledge", count: 1 },
              { op: "bot_gain_resource", resource: "goods", count: 2 }
            ],
            profitEffects: []
          }
        ],
        endOfTurnRows: []
      }
    };
    G.solo!.botStateTables = {
      test_table: {
        id: "test_table",
        botNationId: "test_nation_sun_coast",
        displayName: "Test Table",
        side: "S",
        rows: [
          { id: "trade", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_trade" }], implemented: true, tested: true }
        ]
      }
    };
    bot.botStateTableId = "test_table";
    Object.values(bot.slots).forEach((slot) => {
      slot.cardId = undefined;
    });
    bot.slots[1].cardId = "bot_prompt";

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.cardStates.human_route.resources?.goods).toBe(2);
    expect(bot.resources.knowledge).toBe(1);
    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "human_route",
      trigger: "after_gain_resource",
      resource: "knowledge",
      eventSourceCardId: "human_route",
      eventSourceWasInPlay: true
    });
    expect(bot.resources.goods).toBeUndefined();

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.solo?.pendingBotTradeRouteContinuation).toBeUndefined();
    expect(G.solo?.pendingBotRowContinuation).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(G.players["1"].resources.goods).toBe(1);
    expect(bot.resources.goods).toBe(2);
  });

  it("matches source-suited human reactive Exhausts against the Bot-triggered Trade Route source", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        human_route: card({ id: "human_route", displayName: "Human Route", suit: "trade_route", cardType: "trade_route" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "goods",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "knowledge", sourceSuit: "trade_route" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.currentTurnType = "activate";
    G.players["1"].playArea = ["human_route", "human_reactive"];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].resources.goods = 0;
    G.players["1"].exhaustTokensAvailable = 1;
    G.cardStates = { human_route: { resources: { goods: 1 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "human_route",
            publicPlaceholderName: "Human Route",
            commerceEffects: [
              { op: "human_gain_resource", resource: "knowledge", count: 1 },
              { op: "bot_gain_resource", resource: "goods", count: 2 }
            ],
            profitEffects: []
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotTriggerTradeRoute(G, bot, "human_route");

    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "human_route",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(bot.resources.goods).toBeUndefined();
  });

  it("pauses Bot Trade Routes end-of-turn cleanup while a human reactive Exhaust is pending", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_cleanup_fill: card({ id: "bot_cleanup_fill", displayName: "Bot Cleanup Fill", suit: "region", cardType: "action", startingLocation: "bot_deck" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "goods",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "knowledge" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.currentTurnType = "activate";
    G.players["1"].playArea = ["human_reactive"];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].resources.goods = 0;
    G.players["1"].exhaustTokensAvailable = 1;
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [],
        endOfTurnRows: [{
          merchantState: "merchants",
          priority: 1,
          effects: [
            { op: "human_gain_resource", resource: "knowledge", count: 1 },
            { op: "bot_gain_resource", resource: "goods", count: 2 }
          ]
        }]
      }
    };
    Object.values(bot.slots).forEach((slot) => {
      slot.cardId = undefined;
    });
    bot.botDeck = ["bot_cleanup_fill"];

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "trade_routes_eot:merchants",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(bot.resources.goods).toBeUndefined();
    expect(bot.slots[1].cardId).toBeUndefined();

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.solo?.pendingBotTradeRouteContinuation).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(G.players["1"].resources.goods).toBe(1);
    expect(bot.resources.goods).toBe(2);
    expect(bot.slots[1].cardId).toBe("bot_cleanup_fill");
  });

  it("does not resume a paused Bot turn while an internal Market-Unrest hook continuation is pending", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_resume: card({ id: "bot_resume", displayName: "Bot Resume", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    Object.values(bot.slots).forEach((slot) => {
      slot.cardId = undefined;
      slot.blockedByDie = false;
    });
    bot.slots[2].cardId = "bot_resume";
    G.solo!.pausedBotTurn = { remainingSlotNumbers: [2], effectsRemaining: 1 };
    G.pendingMarketUnrestHookContinuation = { playerId: "1", cardIds: ["unrest_a"], nextIndex: 0 };

    continuePausedBotTurn(G);

    expect(G.solo?.pausedBotTurn).toEqual({ remainingSlotNumbers: [2], effectsRemaining: 1 });
    expect(bot.slots[2].cardId).toBe("bot_resume");
  });

  it("falls through from bot_trade when the Bot has no route or Goods fallback", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("falls through from bot_trade without spending Goods when Progress supply is unavailable", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.goods = 1;
    bot.resources.knowledge = 0;
    G.resourceSupply = { knowledge: 0, materials: 1 };
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
    expect(bot.resources.goods).toBe(1);
    expect(bot.resources.knowledge).toBe(0);
    expect(bot.resources.materials).toBe(1);
  });

  it("falls through from bot_trade when Trade Routes is disabled", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        human_route: card({ id: "human_route", displayName: "Human Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.resources.goods = 1;
    G.players["1"].playArea = ["human_route"];
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
          { id: "trade", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_trade" }], implemented: true, tested: true },
          { id: "fallback", priority: 2, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("fallback");
    expect(G.cardStates.human_route.resources?.goods).toBe(1);
    expect(bot.resources.goods).toBe(1);
    expect(bot.resources.knowledge ?? 0).toBe(0);
    expect(G.players["1"].resources.goods ?? 0).toBe(0);
    expect(bot.resources.materials).toBe(1);
  });

  it("falls through from bot_trigger_trade_route when no route row can resolve", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
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
          { id: "trigger_route", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_trigger_trade_route", cardId: "missing_route" }], implemented: true, tested: true },
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("falls through from bot_resolve_profits_where_able when Trade Routes is disabled", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_prompt: card({ id: "bot_prompt", displayName: "Bot Prompt", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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
          { id: "profit", priority: 1, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_resolve_profits_where_able" }], implemented: true, tested: true },
          { id: "fallback", priority: 2, trigger: { kind: "card_id", cardId: "bot_prompt" }, effects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedRowId).toBe("fallback");
    expect(bot.resources.goods ?? 0).toBe(0);
    expect(bot.resources.materials).toBe(1);
    expect(bot.botPlayArea).toEqual(["bot_route"]);
    expect(bot.botHistory).toEqual([]);
    expect(G.cardStates.bot_route.resources?.goods).toBe(3);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("Bot top-Main VP rewards use Bot VP valuation for conditional cards", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" }),
        conditional_vp: card({ id: "conditional_vp", displayName: "Conditional VP", suit: "region", cardType: "action", vp: { mode: "conditional", value: 2, trueValue: 9, falseValue: 1 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["bot_route"];
    bot.botStateTableId = "test_table";
    G.marketDecks = { mainDeck: ["conditional_vp"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
    G.cardStates = { bot_route: { resources: { goods: 3 } } };
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
            tradeRouteId: "bot_route",
            publicPlaceholderName: "Bot Route",
            commerceEffects: [],
            profitEffects: [{ op: "bot_resolve_top_main_deck", ifVp: { value: 9, effects: [{ op: "bot_gain_resource", resource: "knowledge", count: 1 }] } }]
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotProfitsWhereAble(G, bot);

    expect(bot.resources.knowledge).toBe(1);
    expect(bot.botHistory).toEqual(["bot_route", "conditional_vp"]);
  });

  it("Bot Trade Route Commerce can resolve an if-unable fallback when the primary Bot effect cannot resolve", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("pauses an if-unable Bot Trade Route fallback chain behind human reactive Exhaust choices", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "goods",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "knowledge" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botStateTableId = "test_table";
    bot.botDiscard = [];
    G.currentTurnType = "activate";
    G.players["1"].playArea = ["human_reactive"];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].resources.goods = 0;
    G.players["1"].exhaustTokensAvailable = 1;
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
            commerceEffects: [
              {
                op: "bot_return_from_discard",
                filter: { suits: ["unrest"] },
                ifUnable: [
                  { op: "human_gain_resource", resource: "knowledge", count: 1 },
                  { op: "bot_gain_resource", resource: "goods", count: 2 }
                ]
              },
              { op: "bot_gain_resource", resource: "materials", count: 1 }
            ],
            profitEffects: []
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotTriggerTradeRoute(G, bot, "bot_route");

    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "bot_route",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(bot.resources.goods).toBeUndefined();
    expect(bot.resources.materials).toBeUndefined();

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.solo?.pendingBotTradeRouteContinuation).toBeUndefined();
    expect(G.players["1"].resources.goods).toBe(1);
    expect(bot.resources.goods).toBe(2);
    expect(bot.resources.materials).toBe(1);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("Bot Trade Route Profit does not count Trade Routes as matching Bot in-play cards", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        bot_route: card({ id: "bot_route", displayName: "Bot Route", suit: "trade_route", cardType: "trade_route" }),
        untagged_region: card({ id: "untagged_region", displayName: "Untagged Region", suit: "region", cardType: "region", tags: undefined }),
        region_one: card({ id: "region_one", displayName: "Region One", suit: "region", cardType: "region", tags: ["region"] }),
        tagged_route: card({ id: "tagged_route", displayName: "Tagged Route", suit: "trade_route", cardType: "trade_route", tags: ["region"] }),
        imported_tagged_route: card({ id: "imported_tagged_route", displayName: "Imported Tagged Route", suit: "civilized", cardType: "action", tags: ["region", "suit:trade_route"] })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botPlayArea = ["untagged_region", "region_one", "bot_route", "tagged_route", "imported_tagged_route"];
    G.cardStates = { bot_route: { resources: { goods: 3 } } };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "bot_route",
            publicPlaceholderName: "Bot Route",
            commerceEffects: [],
            profitEffects: [{ op: "bot_gain_resource_per_in_play", resource: "knowledge", filter: { tags: ["region"] } }]
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotProfitsWhereAble(G, bot);

    expect(bot.resources.knowledge).toBe(1);
    expect(bot.botHistory).toEqual(["bot_route"]);
    expect(bot.botPlayArea).toEqual(["untagged_region", "region_one", "tagged_route", "imported_tagged_route"]);
  });

  it("pauses Bot Trade Route Profit before later completed routes while a human reactive Exhaust is pending", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        route_later: card({ id: "route_later", displayName: "Later Route", suit: "trade_route", cardType: "trade_route" }),
        route_pause: card({ id: "route_pause", displayName: "Pause Route", suit: "trade_route", cardType: "trade_route" }),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "goods",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "knowledge" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.currentTurnType = "activate";
    G.players["1"].playArea = ["human_reactive"];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].resources.goods = 0;
    G.players["1"].exhaustTokensAvailable = 1;
    bot.botPlayArea = ["route_later", "route_pause"];
    G.cardStates = {
      route_later: { resources: { goods: 3 } },
      route_pause: { resources: { goods: 3 } }
    };
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [
          {
            tradeRouteId: "route_later",
            publicPlaceholderName: "Later Route",
            commerceEffects: [],
            profitEffects: [{ op: "bot_gain_resource", resource: "materials", count: 1 }]
          },
          {
            tradeRouteId: "route_pause",
            publicPlaceholderName: "Pause Route",
            commerceEffects: [],
            profitEffects: [
              { op: "human_gain_resource", resource: "knowledge", count: 1 },
              { op: "bot_gain_resource", resource: "goods", count: 2 }
            ]
          }
        ],
        endOfTurnRows: []
      }
    };

    resolveBotProfitsWhereAble(G, bot);

    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "route_pause",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(bot.resources.goods).toBe(3);
    expect(bot.resources.materials).toBeUndefined();
    expect(bot.botHistory).toEqual(["route_pause"]);
    expect(bot.botPlayArea).toEqual(["route_later"]);

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.solo?.pendingBotTradeRouteContinuation).toBeUndefined();
    expect(G.players["1"].resources.goods).toBe(1);
    expect(bot.resources.goods).toBe(8);
    expect(bot.resources.materials).toBe(1);
    expect(bot.botHistory).toEqual(["route_pause", "route_later"]);
    expect(bot.botPlayArea).toEqual([]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
        untagged_import: card({ id: "untagged_import", displayName: "Untagged Import", suit: "civilized", cardType: "action", tags: undefined, vp: { mode: "fixed", value: 9 } }),
        wrong_high: card({ id: "wrong_high", displayName: "Wrong High", suit: "civilized", cardType: "action", tags: ["wrong"], vp: { mode: "fixed", value: 5 } }),
        tagged_low: card({ id: "tagged_low", displayName: "Tagged Low", suit: "civilized", cardType: "action", tags: ["target"], vp: { mode: "fixed", value: 1 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["untagged_import", "wrong_high", "tagged_low"];

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
    expect(G.market).toEqual(["untagged_import", "wrong_high"]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("bot Acquire values and collects structured Market slot resource markers", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        base_high: card({ id: "base_high", displayName: "Base High", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 4 } }),
        structured_token: card({ id: "structured_token", displayName: "Structured Token", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 3 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["base_high", "structured_token"];
    G.marketResources = {};
    G.marketSlots = [
      { index: 0, cardId: "base_high", resourceMarkers: {}, attachedUnrestCardIds: [] },
      { index: 1, cardId: "structured_token", resourceMarkers: { knowledge: 2 }, attachedUnrestCardIds: [] }
    ];

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
    expect(bot.botDeck).toEqual(["structured_token", "existing_top"]);
    expect(bot.resources.knowledge).toBe(2);
    expect(G.market).toEqual(["base_high"]);
    expect(G.marketSlots.find((slot) => slot.cardId === "structured_token")).toBeUndefined();
  });

  it("bot Acquire top-decks structured Market slot attached Unrest", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        structured_unrest_market: card({ id: "structured_unrest_market", displayName: "Structured Unrest Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 2 } }),
        structured_unrest: card({ id: "structured_unrest", displayName: "Structured Unrest", suit: "unrest", cardType: "unrest", vp: { mode: "fixed", value: -2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["structured_unrest_market"];
    G.marketUnrest = {};
    G.marketSlots = [
      { index: 0, cardId: "structured_unrest_market", resourceMarkers: {}, attachedUnrestCardIds: ["structured_unrest"] }
    ];

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
    expect(bot.botDeck).toEqual(["structured_unrest", "structured_unrest_market", "existing_top"]);
    expect(G.marketUnrest.structured_unrest_market).toBeUndefined();
    expect(G.marketSlots.find((slot) => slot.cardId === "structured_unrest_market")).toBeUndefined();
  });

  it("bot Acquire collects rulebook-named market resources into canonical pools", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.marketResources = { market_card: { progress: 2, population: 1 } as any };

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
    expect(bot.resources.influence).toBe(1);
    expect((bot.resources as any).progress).toBeUndefined();
    expect((bot.resources as any).population).toBeUndefined();
    expect(G.marketResources.market_card).toBeUndefined();
  });

  it("bot Acquire with Exile enabled does not choose a human-owned Exile card", () => {
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.players["1"].exile = ["exile_card"];
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
    expect(bot.botDeck).toEqual(["market_card", "existing_top"]);
    expect(G.players["1"].exile).toEqual(["exile_card"]);
    expect(G.unrestPile).toEqual(["unrest_from_pile"]);
    expect(G.market).toEqual([]);
    expect(G.log.some((entry) => entry.message === "BotAcquiredFromExile(exile_card)")).toBe(false);
  });

  it("bot Acquire with Exile enabled can choose a public setup Exile card", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 1 } }),
        setup_exile_card: card({ id: "setup_exile_card", displayName: "Setup Exile", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 4 } }),
        unrest_from_pile: card({ id: "unrest_from_pile", displayName: "Unrest", suit: "unrest", cardType: "unrest", vp: { mode: "fixed", value: -2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        cardIds: ["setup_exile_card"],
        visibility: "public",
        scoresAsOwned: false
      }
    };
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
    expect(bot.botDeck).toEqual(["unrest_from_pile", "setup_exile_card", "existing_top"]);
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.unrestPile).toEqual([]);
    expect(G.market).toEqual(["market_card"]);
  });

  it("bot Acquire from Exile treats imported cards with an Unrest suit icon as Unrest", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 1 } }),
        setup_exile_unrest: card({ id: "setup_exile_unrest", displayName: "Setup Exile Unrest", suit: "multi", cardType: "action", tags: ["suit:unrest", "suit:civilized"], vp: { mode: "fixed", value: 4 } }),
        unrest_from_pile: card({ id: "unrest_from_pile", displayName: "Unrest", suit: "unrest", cardType: "unrest", vp: { mode: "fixed", value: -2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        cardIds: ["setup_exile_unrest"],
        visibility: "public",
        scoresAsOwned: false
      }
    };
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
    expect(bot.botDeck).toEqual(["setup_exile_unrest", "existing_top"]);
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.unrestPile).toEqual(["unrest_from_pile"]);
    expect(G.market).toEqual(["market_card"]);
  });

  it("bot Acquire from Exile treats tag-only imported Unrest as Unrest", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_card: card({ id: "market_card", displayName: "Market", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 1 } }),
        setup_exile_unrest: card({ id: "setup_exile_unrest", displayName: "Setup Exile Unrest", suit: "civilized", cardType: "action", tags: ["unrest"], vp: { mode: "fixed", value: 4 } }),
        unrest_from_pile: card({ id: "unrest_from_pile", displayName: "Unrest", suit: "unrest", cardType: "unrest", vp: { mode: "fixed", value: -2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        cardIds: ["setup_exile_unrest"],
        visibility: "public",
        scoresAsOwned: false
      }
    };
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
    expect(bot.botDeck).toEqual(["setup_exile_unrest", "existing_top"]);
    expect(G.globalSpecialZones.exile.cardIds).toEqual([]);
    expect(G.unrestPile).toEqual(["unrest_from_pile"]);
    expect(G.market).toEqual(["market_card"]);
  });

  it("bot Exile moves the lowest-numbered tokenless Market card to public Exile and refills the slot", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        tokened: card({ id: "tokened", displayName: "Tokened", suit: "civilized", cardType: "action" }),
        target: card({ id: "target", displayName: "Target", suit: "civilized", cardType: "action" }),
        later: card({ id: "later", displayName: "Later", suit: "civilized", cardType: "action" }),
        refill: card({ id: "refill", displayName: "Refill", suit: "civilized", cardType: "action" }),
        tucked_unrest: card({ id: "tucked_unrest", displayName: "Tucked Unrest", suit: "unrest", cardType: "unrest" }),
        new_unrest: card({ id: "new_unrest", displayName: "New Unrest", suit: "unrest", cardType: "unrest" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["tokened", "target", "later"];
    G.marketResources = { tokened: { materials: 1 } };
    G.marketUnrest = { target: ["tucked_unrest"] };
    G.unrestPile = ["new_unrest"];
    G.marketDecks = { mainDeck: [], regionDeck: [], uncivilizedDeck: [], civilizedDeck: ["refill"], tributaryDeck: [] };

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
          { id: "bot_exile", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_exile_market" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.globalSpecialZones?.exile?.cardIds).toEqual(["target"]);
    expect(G.market).toEqual(["tokened", "refill", "later"]);
    expect(G.unrestPile).toEqual(["tucked_unrest"]);
    expect(G.marketUnrest?.refill).toEqual(["new_unrest"]);
  });

  it("bot Exile skips the Market when every card has a resource token", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_a: card({ id: "market_a", displayName: "A", suit: "civilized", cardType: "action" }),
        market_b: card({ id: "market_b", displayName: "B", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["market_a", "market_b"];
    G.marketResources = { market_a: { materials: 1 }, market_b: { goods: 1 } };

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
          { id: "bot_exile", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_exile_market" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.resolvedAny).toBe(false);
    expect(G.globalSpecialZones?.exile?.cardIds).toBeUndefined();
    expect(G.market).toEqual(["market_a", "market_b"]);
  });

  it("bot Exile skips Market cards with generic card-state tokens", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        action_tokened: card({ id: "action_tokened", displayName: "Action Tokened", suit: "civilized", cardType: "action" }),
        resource_tokened: card({ id: "resource_tokened", displayName: "Resource Tokened", suit: "civilized", cardType: "action" }),
        target: card({ id: "target", displayName: "Target", suit: "civilized", cardType: "action" }),
        refill: card({ id: "refill", displayName: "Refill", suit: "civilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["action_tokened", "resource_tokened", "target"];
    G.cardStates = {
      action_tokened: { actionTokens: 1 },
      resource_tokened: { resources: { goods: 1 } }
    };
    G.marketDecks = { mainDeck: [], regionDeck: [], uncivilizedDeck: [], civilizedDeck: ["refill"], tributaryDeck: [] };

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
          { id: "bot_exile", priority: 1, trigger: { kind: "suit", suit: "region" }, effects: [{ op: "bot_exile_market" }], implemented: true, tested: true }
        ]
      }
    });

    expect(result.warnings).toEqual([]);
    expect(G.globalSpecialZones?.exile?.cardIds).toEqual(["target"]);
    expect(G.market).toEqual(["action_tokened", "resource_tokened", "refill"]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    bot.botDeck = ["existing_top"];
    G.market = ["market_card"];
    G.globalSpecialZones = {
      exile: {
        id: "exile",
        displayName: "Exile",
        cardIds: ["exile_card"],
        visibility: "public",
        scoresAsOwned: false
      }
    };
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
      scores: { "1": 1 }
    });
    expect(bot.botDeck).toEqual(["existing_top"]);
    expect(G.globalSpecialZones.exile.cardIds).toEqual(["exile_card"]);
    expect(G.market).toEqual(["market_card"]);
    expect(G.log.some((entry) => entry.message === "BotAcquiredFromExile(exile_card)")).toBe(false);
  });

  it("bot Acquire tie-breaks by total market resource tokens, then lowest-numbered slot", () => {
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("bot Acquire does not count tucked Unrest as market tokens for tie-breaks", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        market_a: card({ id: "market_a", displayName: "A", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 2 } }),
        market_b: card({ id: "market_b", displayName: "B", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 2 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["market_a", "market_b"];
    G.marketResources = { market_a: { knowledge: 1 }, market_b: { materials: 2 } };
    G.marketUnrest = { market_a: ["u1", "u2", "u3"], market_b: [] };

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
    expect(G.market).toEqual(["market_a"]);
  });

  it("bot Acquire adds market resource tokens to Bot VP value before tie-breaks", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        base_high: card({ id: "base_high", displayName: "Base High", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 4 } }),
        token_high: card({ id: "token_high", displayName: "Token High", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 3 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["base_high", "token_high"];
    G.marketResources = { token_high: { materials: 2 } };

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
    expect(bot.botDeck[0]).toBe("token_high");
    expect(G.market).toEqual(["base_high"]);
  });

  it("bot Acquire caps printed market VP at 10 before adding market resource tokens", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        raw_twelve: card({ id: "raw_twelve", displayName: "Raw Twelve", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 12 } }),
        capped_plus_token: card({ id: "capped_plus_token", displayName: "Capped Plus Token", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 10 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["raw_twelve", "capped_plus_token"];
    G.marketResources = { capped_plus_token: { materials: 1 } };

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
    expect(bot.botDeck[0]).toBe("capped_plus_token");
    expect(G.market).toEqual(["raw_twelve"]);
  });

  it("bot Acquire values conditional VP by the best branch when choosing market cards", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" }),
        fixed_vp: card({ id: "fixed_vp", displayName: "Fixed VP", suit: "civilized", cardType: "action", vp: { mode: "fixed", value: 7 } }),
        conditional_vp: card({ id: "conditional_vp", displayName: "Conditional VP", suit: "civilized", cardType: "action", vp: { mode: "conditional", value: 2, trueValue: 9, falseValue: 1 } })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = ["fixed_vp", "conditional_vp"];

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
    expect(bot.botDeck[0]).toBe("conditional_vp");
    expect(G.market).toEqual(["fixed_vp"]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      scores: { "1": 1 }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
        miss_a: card({ id: "miss_a", displayName: "Miss A", suit: "civilized", cardType: "action" }),
        miss_b: card({ id: "miss_b", displayName: "Miss B", suit: "civilized", cardType: "action" }),
        tail: card({ id: "tail", displayName: "Tail", suit: "civilized", cardType: "action" }),
        hit: card({ id: "hit", displayName: "Hit", suit: "uncivilized", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = [];
    G.marketDecks = { mainDeck: ["miss_a", "miss_b", "hit", "tail"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };

    const result = resolveBotCard({
      G,
      bot,
      revealedCardId: "bot_region",
      source: "slot",
      randomNumber: () => 0,
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
    expect(G.marketDecks.mainDeck).toEqual(["miss_a", "miss_b", "tail"]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("uses injected randomness for Bot Trade Routes effects reached through the Bot turn", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, enabledExpansions: ["trade_routes"] },
      cardDb: {
        starter: card({}),
        miss_a: card({ id: "miss_a", displayName: "Miss A", suit: "region", cardType: "action" }),
        hit: card({ id: "hit", displayName: "Hit", suit: "uncivilized", cardType: "action" }),
        tail_a: card({ id: "tail_a", displayName: "Tail A", suit: "civilized", cardType: "action" }),
        tail_b: card({ id: "tail_b", displayName: "Tail B", suit: "region", cardType: "action" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.market = [];
    G.marketDecks = { mainDeck: ["miss_a", "hit", "tail_a", "tail_b"], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; });
    bot.botDeck = [];
    G.solo!.botTradeRoutesTables = {
      test_routes: {
        id: "test_routes",
        rows: [],
        endOfTurnRows: [{
          merchantState: "merchants",
          priority: 1,
          effects: [{ op: "bot_break_through", filter: { suits: ["uncivilized"] } }]
        }]
      }
    };

    runBotTurn({ G, rollDie: () => 6, randomNumber: () => 0.99 });

    expect(G.marketDecks.mainDeck).toEqual(["tail_a", "tail_b", "miss_a"]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
        playerNationIds: { "1": "test_nation_sun_coast" },
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

  it("pauses Bot custom cleanup effects while a human reactive Exhaust is pending", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        human_reactive: card({
          id: "human_reactive",
          displayName: "Human Reactive",
          suit: "none",
          cardType: "in_play",
          effects: [{
            trigger: "on_exhaust",
            op: "gain_resource",
            resource: "goods",
            amount: 1,
            reactive: { trigger: "after_gain_resource", resource: "knowledge" }
          }]
        })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    const bot = G.solo!.bot;
    G.currentTurnType = "activate";
    G.players["1"].playArea = ["human_reactive"];
    G.players["1"].resources.knowledge = 0;
    G.players["1"].resources.goods = 0;
    G.players["1"].exhaustTokensAvailable = 1;
    G.solo!.botStateTables = {
      placeholder: {
        id: "placeholder",
        botNationId: "test_nation_sun_coast",
        displayName: "Placeholder",
        side: "S",
        rows: [{ id: "history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }]
      }
    };
    bot.botStateTableId = "placeholder";
    bot.customCleanupEffects = [
      { op: "human_gain_resource", resource: "knowledge", count: 1 } as any,
      { op: "bot_gain_resource", resource: "goods", count: 2 } as any
    ];
    Object.values(bot.slots).forEach((slot) => {
      slot.cardId = undefined;
    });
    bot.botDeck = [];

    runBotTurn({ G, rollDie: () => 6 });

    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.pendingReactiveExhaustChoice).toMatchObject({
      playerId: "1",
      cardIds: ["human_reactive"],
      resolvingPlayerId: bot.botId,
      sourceCardId: "bot_cleanup",
      trigger: "after_gain_resource",
      resource: "knowledge"
    });
    expect(bot.resources.goods).toBeUndefined();

    resolveReactiveExhaustChoice({ G, ctx: { currentPlayer: "1" } as any }, "human_reactive");

    expect(G.pendingReactiveExhaustChoice).toBeUndefined();
    expect(G.solo?.pendingBotCustomCleanupContinuation).toBeUndefined();
    expect(G.solo?.pausedBotTurn).toBeUndefined();
    expect(G.players["1"].resources.goods).toBe(1);
    expect(bot.resources.goods).toBe(2);
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
        playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("resolves one fewer Bot card when the die blocks a populated slot", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, soloDifficulty: "chieftain" },
      cardDb: {
        starter: card({}),
        bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
        bot_2: card({ id: "bot_2", displayName: "Bot 2", startingLocation: "bot_deck" }),
        bot_3: card({ id: "bot_3", displayName: "Bot 3", startingLocation: "bot_deck" }),
        bot_4: card({ id: "bot_4", displayName: "Bot 4", startingLocation: "bot_deck" }),
        market_1: card({ id: "market_1", displayName: "Market 1" }),
        market_2: card({ id: "market_2", displayName: "Market 2" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    G.market = ["market_1", "market_2"];
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

    runBotTurn({ G, rollDie: () => 2 });

    expect(G.solo?.bot.botHistory).toEqual(["bot_1", "bot_3", "bot_4"]);
    expect(G.solo?.bot.slots[1].cardId).toBe("bot_2");
    expect(G.solo?.bot.slots[2].cardId).toBeUndefined();
    expect(G.marketResources?.market_2?.knowledge).toBe(1);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

  it("Bot cleanup does not log a Progress placement when the finite supply is empty", () => {
    const G = createInitialGameStateFromPipeline({
      options: { ...options, soloDifficulty: "imperator" },
      cardDb: {
        starter: card({}),
        bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
        market_1: card({ id: "market_1", displayName: "Market 1" }),
        market_2: card({ id: "market_2", displayName: "Market 2" }),
        market_3: card({ id: "market_3", displayName: "Market 3" }),
        market_4: card({ id: "market_4", displayName: "Market 4" }),
        market_5: card({ id: "market_5", displayName: "Market 5" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    G.market = ["market_1", "market_2", "market_3", "market_4", "market_5"];
    G.resourceSupply = { knowledge: 0 };
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

    expect(G.marketResources).toEqual({});
    expect(G.resourceSupply.knowledge).toBe(0);
    expect(G.log.some((entry) => entry.message.startsWith("MarketResourceAdded(market_3/knowledge"))).toBe(false);
  });

  it("Bot cleanup can replace the default blocked-slot Market token for nation exceptions", () => {
    const bot = setupSoloBot({
      botNation: nation,
      botRuleset: {
        nationId: "test_nation_sun_coast",
        displayName: "Cleanup Resource Bot",
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
        botOverrides: [{ op: "bot_cleanup_market_resource", resource: "goods", count: 2 }],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      } as any,
      cardDb: {
        starter: card({}),
        bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
        market_1: card({ id: "market_1", displayName: "Market 1" })
      } as any,
      botStateTables: {},
      options: { ...options, soloDifficulty: "chieftain" },
      shuffle: (items) => [...items]
    });
    const G = createInitialGameStateFromPipeline({
      options: { ...options, soloDifficulty: "chieftain" },
      cardDb: {
        starter: card({}),
        bot_1: card({ id: "bot_1", displayName: "Bot 1", startingLocation: "bot_deck" }),
        market_1: card({ id: "market_1", displayName: "Market 1" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });
    G.solo!.bot = bot;
    G.market = ["market_1"];
    G.solo!.botStateTables = {
      placeholder: {
        id: "placeholder",
        botNationId: "test_nation_sun_coast",
        displayName: "Placeholder",
        side: "S",
        rows: [{ id: "history", priority: 1, trigger: { kind: "other" }, effects: [{ op: "bot_put_revealed_card_into_history" }], implemented: true, tested: true }]
      }
    };
    bot.botStateTableId = "placeholder";
    bot.botDeck = [];
    bot.botDiscard = [];
    Object.values(bot.slots).forEach((slot) => { slot.cardId = undefined; slot.face = "down"; slot.blockedByDie = false; });
    bot.slots[1].cardId = "bot_1";

    runBotTurn({ G, rollDie: () => 1 });

    expect(G.marketResources?.market_1).toEqual({ goods: 2 });
  });

  it("flushes bot turn log entries once", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        bot_region: card({ id: "bot_region", displayName: "Bot Region", suit: "region", cardType: "attack", startingLocation: "bot_deck" })
      } as any,
      nationDb: { test_nation_sun_coast: nation },
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
        playerNationIds: { "1": "test_nation_sun_coast" },
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
        playerNationIds: { "1": "test_nation_sun_coast" },
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
        playerNationIds: { "1": "test_nation_sun_coast" },
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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

    onTurnEnd(G, { currentPlayer: "1" } as any, () => 0.99);

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
        playerNationIds: { "1": "test_nation_sun_coast" },
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });

    expect(G.solo?.bot.botDiscard).toEqual(["dynasty_high"]);
    expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_mid"]);
    expect([
      ...(G.solo?.bot.botDiscard ?? []),
      ...(G.solo?.bot.botDynastyDeck ?? [])
    ]).not.toContain("dynasty_low");
  });

  it("short-game solo bot setup removes the bottom Dynasty card before discarding the top card", () => {
    const bot = setupSoloBot({
      botNation: { ...nation, nationDeckCardIds: [], developmentCardIds: [], startingDeckCardIds: [] },
      botRuleset: {
        nationId: "test_nation_sun_coast",
        displayName: "Custom Short Bot",
        rulesetTags: ["solo_bot_custom_dynasty"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [{ op: "custom_dynasty_setup", config: { cardIds: ["dynasty_low", "dynasty_high", "dynasty_bottom"] } }],
        shortGameOverrides: [],
        hookRules: [],
        implemented: true,
        tested: true
      } as any,
      cardDb: {
        dynasty_low: card({ id: "dynasty_low", displayName: "Dynasty Low", vp: { mode: "fixed", value: 1 } }),
        dynasty_high: card({ id: "dynasty_high", displayName: "Dynasty High", vp: { mode: "fixed", value: 7 } }),
        dynasty_bottom: card({ id: "dynasty_bottom", displayName: "Dynasty Bottom", vp: { mode: "fixed", value: 3 } })
      } as any,
      botStateTables: {},
      options: { ...options, enabledVariants: ["short_game"] },
      shuffle: (items) => [...items]
    });

    expect(bot.botDiscard).toEqual(["dynasty_low"]);
    expect(bot.botDynastyDeck).toEqual(["dynasty_high"]);
  });

  it("applies short-game solo bot extra Dynasty discard overrides after the default setup movement", () => {
    const bot = setupSoloBot({
      botNation: { ...nation, nationDeckCardIds: [], developmentCardIds: [], startingDeckCardIds: [] },
      botRuleset: {
        nationId: "test_nation_sun_coast",
        displayName: "Custom Short Bot",
        rulesetTags: ["solo_bot_custom_dynasty", "short_game_exception"],
        requiredExpansions: [],
        setupOverrides: [],
        zoneOverrides: [],
        stateOverrides: [],
        reshuffleOverrides: [],
        cleanupOverrides: [],
        solsticeOverrides: [],
        scoringOverrides: [],
        collapseOverrides: [],
        botOverrides: [{ op: "custom_dynasty_setup", config: { cardIds: ["dynasty_top", "dynasty_extra_a", "dynasty_extra_b", "dynasty_remaining", "dynasty_bottom"] } }],
        shortGameOverrides: [{ op: "add_nation_cards_to_discard", count: 2 }],
        hookRules: [],
        implemented: true,
        tested: true
      } as any,
      cardDb: {
        dynasty_top: card({ id: "dynasty_top", displayName: "Dynasty Top", vp: { mode: "fixed", value: 7 } }),
        dynasty_extra_a: card({ id: "dynasty_extra_a", displayName: "Dynasty Extra A", vp: { mode: "fixed", value: 6 } }),
        dynasty_extra_b: card({ id: "dynasty_extra_b", displayName: "Dynasty Extra B", vp: { mode: "fixed", value: 5 } }),
        dynasty_remaining: card({ id: "dynasty_remaining", displayName: "Dynasty Remaining", vp: { mode: "fixed", value: 4 } }),
        dynasty_bottom: card({ id: "dynasty_bottom", displayName: "Dynasty Bottom", vp: { mode: "fixed", value: 1 } })
      } as any,
      botStateTables: {},
      options: { ...options, enabledVariants: ["short_game"] },
      shuffle: (items) => [...items]
    });

    expect(bot.botDiscard).toEqual(["dynasty_top", "dynasty_extra_a", "dynasty_extra_b"]);
    expect(bot.botDynastyDeck).toEqual(["dynasty_remaining"]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
    });

    expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_high", "dynasty_variable", "dynasty_mid", "dynasty_low"]);
  });

  it("uses the best conditional VP branch when sorting default solo Bot Dynasty cards", () => {
    const G = createInitialGameStateFromPipeline({
      options,
      cardDb: {
        starter: card({}),
        dynasty_fixed: card({ id: "dynasty_fixed", displayName: "Dynasty Fixed", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 7 } }),
        dynasty_conditional: card({ id: "dynasty_conditional", displayName: "Dynasty Conditional", tags: ["bot_dynasty"], vp: { mode: "conditional", value: 2, trueValue: 9, falseValue: 1 } })
      } as any,
      nationDb: { test_nation_sun_coast: { ...nation, nationDeckCardIds: [], developmentCardIds: [], startingDeckCardIds: ["starter"] } },
      playerNationIds: { "1": "test_nation_sun_coast" }
    });

    expect(G.solo?.bot.botDynastyDeck).toEqual(["dynasty_conditional", "dynasty_fixed"]);
  });

  it("uses shuffled order to break equal-VP default solo Bot Dynasty ties", () => {
    const bot = setupSoloBot({
      botNation: {
        ...nation,
        nationDeckCardIds: [],
        developmentCardIds: []
      },
      cardDb: {
        starter: card({}),
        dynasty_alpha: card({ id: "dynasty_alpha", displayName: "Dynasty Alpha", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 5 } }),
        dynasty_beta: card({ id: "dynasty_beta", displayName: "Dynasty Beta", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 5 } }),
        dynasty_gamma: card({ id: "dynasty_gamma", displayName: "Dynasty Gamma", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 1 } })
      } as any,
      botStateTables: {},
      options,
      shuffle: (items) => [...items].reverse()
    });

    expect(bot.botDynastyDeck).toEqual(["dynasty_beta", "dynasty_alpha", "dynasty_gamma"]);
  });

  it("caps positive VP at 10 when sorting default solo Bot Dynasty cards", () => {
    const bot = setupSoloBot({
      botNation: {
        ...nation,
        nationDeckCardIds: [],
        developmentCardIds: []
      },
      cardDb: {
        starter: card({}),
        raw_twelve: card({ id: "raw_twelve", displayName: "Raw Twelve", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 12 } }),
        capped_ten: card({ id: "capped_ten", displayName: "Capped Ten", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 10 } }),
        lower: card({ id: "lower", displayName: "Lower", tags: ["bot_dynasty"], vp: { mode: "fixed", value: 4 } })
      } as any,
      botStateTables: {},
      options,
      shuffle: (items) => [...items].reverse()
    });

    expect(bot.botDynastyDeck).toEqual(["capped_ten", "raw_twelve", "lower"]);
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
        playerNationIds: { "1": "test_nation_sun_coast" },
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
      playerNationIds: { "1": "test_nation_sun_coast" }
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
