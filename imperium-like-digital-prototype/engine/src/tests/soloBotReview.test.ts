import { describe, expect, it } from "vitest";
import { onTurnEnd } from "../game/turn";
import type { GameOptions } from "../options/gameOptions";
import { runBotCleanup } from "../solo/botCleanup";
import { loadBotStateTables } from "../solo/botStateTableLoader";
import { runBotTurn } from "../solo/botTurn";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { resolveBotCard } from "../solo/botStateTableResolver";

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

describe("solo bot setup from imported cards", () => {
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

    expect(G.solo?.bot.botHistory).toHaveLength(3);
  });

  it("loads fresh bot state table objects for each game setup", () => {
    const first = loadBotStateTables();
    first.placeholder_S.rows[0].id = "mutated";

    const second = loadBotStateTables();

    expect(second.placeholder_S.rows[0].id).toBe("row_unrest");
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
});
