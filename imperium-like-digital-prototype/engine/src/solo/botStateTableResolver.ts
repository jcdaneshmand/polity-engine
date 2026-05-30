import type { Card, GameState, ResourceName } from "../game/state";
import { gainFameCardsForBot } from "../game/fame";
import { placeMarketResource } from "../game/marketResources";
import { isRegionCard } from "../game/regions";
import { gainPlayerResource, returnResourceToSupply, takeResourceFromSupply } from "../game/resources";
import { triggerScoring } from "../game/scoring";
import { triggerScoringIfMainDeckEmpty } from "../game/scoringTriggers";
import { cardHasSuitIcon, cardHasAnySuitIcon } from "../game/suitIcons";
import { takeUnrest } from "../game/unrest";
import { botAcquireFromMarket, botBreakThrough } from "./botMarket";
import { resolveBotProfitsWhereAble, resolveBotTrade, resolveBotTriggerTradeRoute } from "./botTradeRoutesResolver";
import type { BotStateTable } from "./botStateTableTypes";
import type { BotState } from "./botTypes";
import type { BotAcquireFilter, BotEffectOp } from "./botEffectOps";

export type BotCardResolutionResult = { resolvedRowId?: string; cardDestination: "discard"|"history"|"play"|"unrest"|"bottom_deck"; resolvedAny: boolean; warnings: string[] };
type BotEffectResolution = { resolved: boolean; warnings: string[] };

const match = (row: BotStateTable["rows"][number], card: Card) => row.trigger.kind === "card_id" ? row.trigger.cardId === card.id : row.trigger.kind === "card_name_private" ? card.displayName.trim().toLowerCase() === row.trigger.value.trim().toLowerCase() : row.trigger.kind === "suit" ? cardHasSuitIcon(card, row.trigger.suit as any) : row.trigger.kind === "card_type" ? row.trigger.cardType === card.type : row.trigger.kind === "tag" ? card.tags.includes(row.trigger.tag) : row.trigger.kind === "unrest" ? card.tags.includes("unrest") || card.suit === "unrest" : row.trigger.kind === "other";

function cardMatchesFilter(G: GameState, cardId: string, filter?: BotAcquireFilter): boolean {
  const card = G.cardDb[cardId];
  if (!card) return false;
  if (filter?.suits?.length && !cardHasAnySuitIcon(card, filter.suits as any)) return false;
  if (filter?.cardTypes?.length && !filter.cardTypes.includes((card.cardType ?? card.type) as any)) return false;
  if (filter?.tags?.length && !filter.tags.some((tag) => card.tags.includes(tag))) return false;
  return true;
}

function findSideTableId(G: GameState, bot: BotState, nextSide: string): string | undefined {
  const tables = G.solo?.botStateTables;
  if (!tables) return undefined;
  const currentTable = tables[bot.botStateTableId];
  const tableBaseId = currentTable?.id ?? bot.botStateTableId.replace(/_[^_]+$/, "");
  const expectedKey = `${tableBaseId}_${nextSide}`;
  if (tables[expectedKey]) return expectedKey;
  return Object.entries(tables).find(([, table]) => table.id === tableBaseId && table.side === nextSide)?.[0];
}

function humanPlayerId(G: GameState, bot: BotState): string | undefined {
  return Object.keys(G.players).sort().find((playerId) => playerId !== bot.botId);
}

function resolveTopBotCard(G: GameState, bot: BotState, table: BotStateTable, deck: "botDeck" | "botDynastyDeck", source: "bot_deck" | "dynasty_deck"): BotEffectResolution {
  const cardId = bot[deck].shift();
  if (!cardId) {
    const gained = takeResourceFromSupply(G, "materials", 2);
    bot.resources.materials = (bot.resources.materials ?? 0) + gained;
    G.log.push({ round: G.round, playerId: bot.botId, message: `BotResolveTopCardFallback(${source}/gained=${gained === 2 ? 2 : `${gained}/2`} materials)` });
    return { resolved: gained > 0, warnings: [] };
  }
  const result = resolveBotCard({ G, bot, revealedCardId: cardId, source, table });
  if (deck === "botDynastyDeck" && bot.botDynastyDeck.length === 0) triggerScoring(G, "bot_dynasty_deck_empty", bot.botId);
  return { resolved: result.resolvedAny, warnings: result.warnings };
}

function cardVpValueForCondition(card: Card | undefined): number {
  const vp = card?.vp as unknown;
  if (typeof vp === "number") return vp;
  if (typeof vp === "object" && vp !== null) {
    const { mode, value } = vp as { mode?: string; value?: unknown };
    if (mode === "none") return 0;
    return typeof value === "number" ? value : 0;
  }
  return 0;
}

function resolveTopMainDeckCard(G: GameState, bot: BotState, table: BotStateTable, effect: Extract<BotEffectOp, { op: "bot_resolve_top_main_deck" }>): BotEffectResolution {
  const cardId = G.marketDecks?.mainDeck.shift();
  if (!cardId) return { resolved: false, warnings: [] };
  const result = resolveBotCard({ G, bot, revealedCardId: cardId, source: "effect", table });
  const conditional = effect.ifVp && cardVpValueForCondition(G.cardDb[cardId]) === effect.ifVp.value
    ? resolveBotFallbackEffects(G, bot, table, cardId, effect.ifVp.effects)
    : { resolved: false, warnings: [] };
  triggerScoringIfMainDeckEmpty(G, bot.botId);
  return { resolved: result.resolvedAny || conditional.resolved, warnings: [...result.warnings, ...conditional.warnings] };
}

function discardTopBotCards(G: GameState, bot: BotState, deck: "botDeck" | "botDynastyDeck", count = 1): number {
  let moved = 0;
  for (let i = 0; i < count; i += 1) {
    const cardId = bot[deck].shift();
    if (!cardId) break;
    bot.botDiscard.push(cardId);
    moved += 1;
  }
  if (deck === "botDynastyDeck" && bot.botDynastyDeck.length === 0) triggerScoring(G, "bot_dynasty_deck_empty", bot.botId);
  return moved;
}

function findLastMatchingIndex(cardIds: string[], G: GameState, filter?: BotAcquireFilter): number {
  for (let index = cardIds.length - 1; index >= 0; index -= 1) {
    if (cardMatchesFilter(G, cardIds[index], filter)) return index;
  }
  return -1;
}

function botReturnFromDiscard(G: GameState, bot: BotState, filter?: BotAcquireFilter): boolean {
  const index = findLastMatchingIndex(bot.botDiscard, G, filter);
  if (index < 0) return false;
  const [cardId] = bot.botDiscard.splice(index, 1);
  if (!cardId) return false;
  G.unrestPile ??= [];
  G.unrestPile.push(cardId);
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotReturnedFromDiscard(${cardId})` });
  return true;
}

function currentStateTokenKey(bot: BotState, table: BotStateTable): string {
  return `${table.id}_${table.side || bot.botStateSide}`;
}

function stateTokenCount(bot: BotState, table: BotStateTable, resource: ResourceName): number {
  return bot.stateTokens?.[currentStateTokenKey(bot, table)]?.[resource] ?? 0;
}

function addStateTokens(bot: BotState, table: BotStateTable, resource: ResourceName, count: number): void {
  const key = currentStateTokenKey(bot, table);
  bot.stateTokens ??= {};
  bot.stateTokens[key] ??= {};
  bot.stateTokens[key][resource] = (bot.stateTokens[key][resource] ?? 0) + count;
}

function clearStateTokens(bot: BotState, table: BotStateTable, resource: ResourceName): number {
  const key = currentStateTokenKey(bot, table);
  const count = bot.stateTokens?.[key]?.[resource] ?? 0;
  if (bot.stateTokens?.[key]) bot.stateTokens[key][resource] = 0;
  return count;
}

function moveBotResourceToStateCard(G: GameState, bot: BotState, table: BotStateTable, resource: ResourceName, count: number): boolean {
  const available = bot.resources[resource] ?? 0;
  if (available < count) return false;
  bot.resources[resource] = available - count;
  addStateTokens(bot, table, resource, count);
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotStateTokenMoved(${table.id}_${table.side}/${resource}/${count})` });
  return true;
}

function takeBotUnrest(G: GameState, bot: BotState, count: number): boolean {
  let moved = 0;
  G.unrestPile ??= [];
  for (let i = 0; i < count; i += 1) {
    const cardId = G.unrestPile.shift();
    if (!cardId) break;
    bot.botDiscard.push(cardId);
    moved += 1;
  }
  if (moved > 0) G.log.push({ round: G.round, playerId: bot.botId, message: `BotTookUnrest(count=${moved})` });
  return moved > 0;
}

function takeHumanChaos(G: GameState, bot: BotState, count: number, zoneId = "chaos_pile"): boolean {
  const playerId = humanPlayerId(G, bot);
  if (!playerId) return false;
  const zone = G.specialZones?.[playerId]?.[zoneId] ?? G.globalSpecialZones?.[zoneId];
  if (!zone) return false;
  let moved = 0;
  for (let i = 0; i < count; i += 1) {
    const cardId = zone.cardIds.shift();
    if (!cardId) break;
    G.players[playerId].discard.push(cardId);
    moved += 1;
  }
  if (moved > 0) G.log.push({ round: G.round, playerId, message: `HumanTookChaos(count=${moved})` });
  return moved > 0;
}

function exileMostTokenedMarketCards(G: GameState, bot: BotState): boolean {
  const counts = G.market.map((cardId) => ({
    cardId,
    count: cardId ? Object.values(G.marketResources?.[cardId] ?? {}).reduce((sum, value) => sum + (value ?? 0), 0) : 0
  })).filter((entry) => entry.cardId);
  const max = Math.max(0, ...counts.map((entry) => entry.count));
  if (max <= 0) return false;
  let moved = 0;
  for (const entry of counts.filter((candidate) => candidate.count === max)) {
    const index = G.market.indexOf(entry.cardId);
    if (index < 0) continue;
    delete G.marketResources?.[entry.cardId];
    G.sharedDiscard.push(entry.cardId);
    G.market.splice(index, 1);
    moved += 1;
  }
  if (moved > 0) G.log.push({ round: G.round, playerId: bot.botId, message: `BotCultistsExiledMostTokenedMarketCards(count=${moved})` });
  return moved > 0;
}

function flipBotTableTo(G: GameState, bot: BotState, tableId: string, side: string): boolean {
  const key = `${tableId}_${side}`;
  if (!G.solo?.botStateTables[key]) return false;
  bot.botStateTableId = key;
  bot.botStateSide = side;
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotStateTableFlipped(${key})` });
  return true;
}

function resolveCultistsStateCleanup(G: GameState, bot: BotState, table: BotStateTable): boolean {
  if (table.id === "cultists_ceremonial_gathering") {
    if (stateTokenCount(bot, table, "influence") >= 15) {
      const progressHistory = bot.botHistory.filter((cardId) => cardMatchesFilter(G, cardId, { tags: ["progress_history"] }));
      bot.botHistory = bot.botHistory.filter((cardId) => !progressHistory.includes(cardId));
      bot.botDiscard.push(...progressHistory);
      clearStateTokens(bot, table, "influence");
      flipBotTableTo(G, bot, "cultists_research_ceremony", "S");
      return true;
    }
    if (moveBotResourceToStateCard(G, bot, table, "influence", 2)) return true;
    addStateTokens(bot, table, "influence", 1);
    takeBotUnrest(G, bot, 1);
    return true;
  }
  if (table.id === "cultists_research_ceremony") {
    if (stateTokenCount(bot, table, "knowledge") >= 5) {
      exileMostTokenedMarketCards(G, bot);
      clearStateTokens(bot, table, "knowledge");
      flipBotTableTo(G, bot, "cultists_ceremonial_gathering", "F");
      return true;
    }
    if (moveBotResourceToStateCard(G, bot, table, "knowledge", 1)) return true;
    addStateTokens(bot, table, "knowledge", 1);
    takeBotUnrest(G, bot, 1);
    return true;
  }
  return false;
}

function botRecallInPlay(G: GameState, bot: BotState, filter?: BotAcquireFilter): boolean {
  const index = findLastMatchingIndex(bot.botPlayArea, G, filter);
  if (index < 0) return false;
  const [cardId] = bot.botPlayArea.splice(index, 1);
  if (!cardId) return false;
  bot.botDeck.unshift(cardId);
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotRecalledInPlay(${cardId})` });
  return true;
}

function botMoveTopDiscardToDeck(G: GameState, bot: BotState): boolean {
  const cardId = bot.botDiscard.pop();
  if (!cardId) return false;
  bot.botDeck.unshift(cardId);
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotMovedTopDiscardToDeck(${cardId})` });
  return true;
}

function createHumanRegionChoice(G: GameState, bot: BotState, sourceCardId: string, op: "recall_region" | "abandon_region", filter?: BotAcquireFilter): BotEffectResolution {
  const playerId = humanPlayerId(G, bot);
  if (!playerId) return { resolved: false, warnings: ["missing human player"] };
  const cardIds = G.players[playerId].playArea.filter((cardId) => isRegionCard(G, cardId) && cardMatchesFilter(G, cardId, filter));
  if (cardIds.length === 0) return { resolved: false, warnings: [] };
  G.pendingRegionChoice = { playerId, sourceCardId, op, cardIds };
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotHumanRegionChoicePending(${sourceCardId}/${op}/options=${cardIds.length})` });
  return { resolved: true, warnings: [] };
}

function addResourceToMarketSlot(G: GameState, bot: BotState, effect: Extract<BotEffectOp, { op: "bot_add_resource_to_market_slot" }>): string[] {
  const slotNumber = effect.slot === "rolled" ? bot.unresolvedSlot : effect.slot;
  if (!slotNumber) return ["missing rolled slot"];
  const cardId = G.market[slotNumber - 1];
  if (!cardId) return [`missing market card in slot ${slotNumber}`];
  return placeMarketResource(G, { playerId: bot.botId, cardId, resource: effect.resource, amount: effect.count }) ? [] : [`could not place market resource in slot ${slotNumber}`];
}

function resolveBotFallbackEffects(G: GameState, bot: BotState, table: BotStateTable, sourceCardId: string, effects?: BotEffectOp[]): BotEffectResolution {
  if (!effects?.length) return { resolved: false, warnings: [] };
  const warnings: string[] = [];
  let resolved = false;
  for (const fallback of effects) {
    const result = applyBotEffectWithResolution(G, bot, table, sourceCardId, fallback);
    resolved ||= result.resolved;
    warnings.push(...result.warnings);
    if (G.gameover) break;
  }
  return { resolved, warnings };
}

export function applyBotEffect(G: GameState, bot: BotState, table: BotStateTable, sourceCardId: string, effect: BotEffectOp): string[] {
  return applyBotEffectWithResolution(G, bot, table, sourceCardId, effect).warnings;
}

export function applyBotEffectWithResolution(G: GameState, bot: BotState, table: BotStateTable, sourceCardId: string, effect: BotEffectOp): BotEffectResolution {
  switch (effect.op) {
    case "bot_gain_resource": {
      const gained = takeResourceFromSupply(G, effect.resource, effect.count);
      bot.resources[effect.resource] = (bot.resources[effect.resource] ?? 0) + gained;
      return { resolved: gained > 0, warnings: [] };
    }
    case "bot_gain_resource_per_in_play": {
      const matching = bot.botPlayArea.filter((cardId) => cardMatchesFilter(G, cardId, effect.filter)).length;
      const amount = matching * (effect.countPerCard ?? 1);
      const gained = takeResourceFromSupply(G, effect.resource, amount);
      bot.resources[effect.resource] = (bot.resources[effect.resource] ?? 0) + gained;
      return { resolved: gained > 0, warnings: [] };
    }
    case "bot_spend_resource":
      {
        const spent = Math.min(bot.resources[effect.resource] ?? 0, effect.count);
        bot.resources[effect.resource] = (bot.resources[effect.resource] ?? 0) - spent;
        returnResourceToSupply(G, effect.resource, spent);
        return { resolved: spent > 0, warnings: [] };
      }
    case "bot_pay_resource_then":
      {
        const available = bot.resources[effect.resource] ?? 0;
        if (available < effect.count) return { resolved: false, warnings: [] };
        bot.resources[effect.resource] = available - effect.count;
        returnResourceToSupply(G, effect.resource, effect.count);
        const result = resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.effects);
        if (!result.resolved) {
          const refunded = takeResourceFromSupply(G, effect.resource, effect.count);
          bot.resources[effect.resource] = (bot.resources[effect.resource] ?? 0) + refunded;
          return { resolved: false, warnings: result.warnings };
        }
        return { resolved: true, warnings: result.warnings };
      }
    case "bot_move_resource_to_state_card":
      if (moveBotResourceToStateCard(G, bot, table, effect.resource, effect.count)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable);
    case "bot_spend_resource_to_state_card":
      if ((bot.resources[effect.spendResource] ?? 0) >= effect.spendCount) {
        bot.resources[effect.spendResource] = (bot.resources[effect.spendResource] ?? 0) - effect.spendCount;
        returnResourceToSupply(G, effect.spendResource, effect.spendCount);
        addStateTokens(bot, table, effect.placeResource, effect.placeCount);
        return { resolved: true, warnings: [] };
      }
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable);
    case "bot_take_unrest":
      return { resolved: takeBotUnrest(G, bot, effect.count), warnings: [] };
    case "human_take_chaos":
      return { resolved: takeHumanChaos(G, bot, effect.count, effect.zoneId), warnings: [] };
    case "bot_resolve_cultists_state_cleanup":
      return { resolved: resolveCultistsStateCleanup(G, bot, table), warnings: [] };
    case "bot_gain_fame":
      gainFameCardsForBot(G, bot, effect.count);
      return { resolved: effect.count > 0, warnings: [] };
    case "bot_acquire":
      if (botAcquireFromMarket(G, bot, effect.filter, effect.fromExile)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable);
    case "bot_break_through": {
      const beforeMaterials = bot.resources.materials ?? 0;
      const resolved = botBreakThrough(G, bot, effect.filter, {
        discardGained: effect.discardGained,
        resolveGained: effect.resolveGained ? (cardId) => resolveBotCard({ G, bot, revealedCardId: cardId, source: "effect", table }) : undefined
      });
      if (resolved || (bot.resources.materials ?? 0) > beforeMaterials) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable);
    }
    case "bot_trade":
      return { resolved: resolveBotTrade(G, bot), warnings: [] };
    case "bot_trigger_trade_route":
      resolveBotTriggerTradeRoute(G, bot, effect.cardId ?? sourceCardId);
      return { resolved: true, warnings: [] };
    case "bot_resolve_profits_where_able":
      return { resolved: resolveBotProfitsWhereAble(G, bot), warnings: [] };
    case "bot_add_resource_to_market_slot":
      {
        const warnings = addResourceToMarketSlot(G, bot, effect);
        return { resolved: warnings.length === 0, warnings };
      }
    case "bot_resolve_top_bot_deck":
      return resolveTopBotCard(G, bot, table, "botDeck", "bot_deck");
    case "bot_resolve_top_dynasty_deck":
      return resolveTopBotCard(G, bot, table, "botDynastyDeck", "dynasty_deck");
    case "bot_resolve_top_main_deck":
      return resolveTopMainDeckCard(G, bot, table, effect);
    case "bot_discard_top_bot_deck":
      if (discardTopBotCards(G, bot, "botDeck", effect.count ?? 1) > 0) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable);
    case "bot_discard_top_dynasty_deck":
      if (discardTopBotCards(G, bot, "botDynastyDeck", effect.count ?? 1) > 0) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable);
    case "bot_return_from_discard":
      if (botReturnFromDiscard(G, bot, effect.filter)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable);
    case "bot_recall_in_play":
      if (botRecallInPlay(G, bot, effect.filter)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable);
    case "bot_move_top_discard_to_deck":
      return { resolved: botMoveTopDiscardToDeck(G, bot), warnings: [] };
    case "human_gain_resource": {
      const playerId = humanPlayerId(G, bot);
      if (!playerId) return { resolved: false, warnings: ["missing human player"] };
      return { resolved: gainPlayerResource(G, playerId, effect.resource, effect.count) > 0, warnings: [] };
    }
    case "human_take_unrest": {
      const playerId = humanPlayerId(G, bot);
      if (!playerId) return { resolved: false, warnings: ["missing human player"] };
      takeUnrest(G, { playerIds: [playerId], count: effect.count, triggeredBy: bot.botId });
      return { resolved: effect.count > 0, warnings: [] };
    }
    case "human_recall":
      return createHumanRegionChoice(G, bot, sourceCardId, "recall_region", effect.filter);
    case "human_abandon":
      return createHumanRegionChoice(G, bot, sourceCardId, "abandon_region", effect.filter);
    case "bot_flip_state_table":
      {
        const beforeTableId = bot.botStateTableId;
        const beforeSide = bot.botStateSide;
        if (effect.nextTableId) bot.botStateTableId = effect.nextTableId;
        if (effect.nextSide) {
          if (!effect.nextTableId) {
            const nextTableId = findSideTableId(G, bot, effect.nextSide);
            if (!nextTableId) return { resolved: false, warnings: [`missing bot state table for side: ${effect.nextSide}`] };
            bot.botStateTableId = nextTableId;
          }
          bot.botStateSide = effect.nextSide;
        }
        return { resolved: bot.botStateTableId !== beforeTableId || bot.botStateSide !== beforeSide, warnings: [] };
      }
    case "bot_flip_merchant_state":
      {
        const before = bot.merchantState;
        bot.merchantState = effect.nextState;
        return { resolved: bot.merchantState !== before, warnings: [] };
      }
    case "log":
      bot.botLog.push({ round: G.round, playerId: bot.botId, message: effect.message });
      return { resolved: true, warnings: [] };
    case "bot_return_revealed_card_to_unrest":
    case "bot_discard_revealed_card":
    case "bot_put_revealed_card_into_history":
    case "bot_play_revealed_card":
    case "bot_put_revealed_card_on_bottom_of_deck":
      return { resolved: true, warnings: [] };
    default:
      return { resolved: false, warnings: [`unsupported bot effect: ${(effect as { op?: string }).op ?? "unknown"}`] };
  }
}

export function resolveBotCard(args: { G: GameState; bot: BotState; revealedCardId: string; source: "slot"|"bot_deck"|"dynasty_deck"|"discard"|"effect"; table: BotStateTable; }): BotCardResolutionResult {
  const card = args.G.cardDb[args.revealedCardId];
  if (!card) return { cardDestination: "discard", resolvedAny: false, warnings: ["missing card"] };
  const rows = args.table.rows.filter((r) => match(r, card)).sort((a,b)=>a.priority-b.priority);
  for (const row of rows) {
    if (!row.effects.length) continue;
    let destination: BotCardResolutionResult["cardDestination"] = "discard";
    const warnings: string[] = [];
    let resolvedPart = false;
    for (const effect of row.effects) {
      if (effect.op === "bot_return_revealed_card_to_unrest") destination = "unrest";
      if (effect.op === "bot_put_revealed_card_into_history") destination = "history";
      if (effect.op === "bot_play_revealed_card") destination = "play";
      if (effect.op === "bot_put_revealed_card_on_bottom_of_deck") destination = "bottom_deck";
      const result = applyBotEffectWithResolution(args.G, args.bot, args.table, card.id, effect);
      resolvedPart ||= result.resolved;
      warnings.push(...result.warnings);
      if (args.G.gameover) return { resolvedRowId: row.id, cardDestination: destination, resolvedAny: true, warnings };
    }
    if (!resolvedPart) continue;
    if (destination === "history") args.bot.botHistory.push(card.id); else if (destination === "play") args.bot.botPlayArea.push(card.id); else if (destination === "bottom_deck") args.bot.botDeck.push(card.id); else if (destination === "unrest") {
      args.G.unrestPile ??= [];
      args.G.unrestPile.push(card.id);
    } else args.bot.botDiscard.push(card.id);
    return { resolvedRowId: row.id, cardDestination: destination, resolvedAny: true, warnings };
  }
  args.bot.botDiscard.push(card.id);
  return { cardDestination: "discard", resolvedAny: false, warnings: [] };
}
