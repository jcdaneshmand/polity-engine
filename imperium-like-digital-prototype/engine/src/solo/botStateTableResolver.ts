import type { Card, GameState, ResourceName } from "../game/state";
import { createReactiveExhaustChoice } from "../cards/effectRunner";
import { marketCardHasTokens } from "../game/exile";
import { gainFameCardsForBot } from "../game/fame";
import { placeMarketResource, returnMarketUnrest, tuckUnrestUnderMarketCard } from "../game/marketResources";
import { refillMarketSlot } from "../game/marketRefill";
import { isRegionCard } from "../game/regions";
import { addResourceAmount, canonicalResourceName, gainPlayerResource, resourceAmount, returnResourceToSupply, setResourceAmount, takeResourceFromSupply } from "../game/resources";
import { triggerScoring } from "../game/scoring";
import { triggerScoringIfMainDeckEmpty } from "../game/scoringTriggers";
import { cardCanSwapWithMarket } from "../game/swap";
import { cardHasSuitIcon, cardHasAnySuitIcon } from "../game/suitIcons";
import { takeUnrest } from "../game/unrest";
import { botAcquireFromMarket, botBreakThrough } from "./botMarket";
import { resolveBotProfitsWhereAble, resolveBotTrade, resolveBotTriggerTradeRoute } from "./botTradeRoutesResolver";
import type { BotStateTable } from "./botStateTableTypes";
import type { BotState } from "./botTypes";
import type { BotAcquireFilter, BotEffectOp } from "./botEffectOps";

export type BotCardResolutionResult = { resolvedRowId?: string; cardDestination: "discard"|"history"|"play"|"unrest"|"bottom_deck"; resolvedAny: boolean; warnings: string[] };
type BotEffectResolution = { resolved: boolean; warnings: string[] };
type BotResolutionOptions = { randomNumber?: () => number };

function cloneGameState(G: GameState): GameState {
  return JSON.parse(JSON.stringify(G)) as GameState;
}

function cloneBotState(bot: BotState): BotState {
  return JSON.parse(JSON.stringify(bot)) as BotState;
}

function restoreGameStatePreservingBot(G: GameState, snapshot: GameState, bot: BotState, botSnapshot: BotState): void {
  for (const key of Object.keys(G) as Array<keyof GameState>) delete G[key];
  Object.assign(G, snapshot);
  for (const key of Object.keys(bot) as Array<keyof BotState>) delete bot[key];
  Object.assign(bot, botSnapshot);
  if (G.solo) G.solo.bot = bot;
}

const match = (row: BotStateTable["rows"][number], card: Card) => row.trigger.kind === "card_id" ? row.trigger.cardId === card.id : row.trigger.kind === "card_name_private" ? card.displayName.trim().toLowerCase() === row.trigger.value.trim().toLowerCase() : row.trigger.kind === "suit" ? cardHasSuitIcon(card, row.trigger.suit as any) : row.trigger.kind === "card_type" ? row.trigger.cardType === (card.cardType ?? card.type) : row.trigger.kind === "tag" ? card.tags.includes(row.trigger.tag) : row.trigger.kind === "unrest" ? card.tags.includes("unrest") || card.suit === "unrest" || (card.cardType ?? card.type) === "unrest" : row.trigger.kind === "other";

function hasPendingInterruption(G: GameState): boolean {
  return Boolean(
    G.pendingChoice
    ?? G.pendingDrawChoice
    ?? G.pendingFindChoice
    ?? G.pendingAcquireChoice
    ?? G.pendingMarketCardChoice
    ?? G.pendingBreakThroughChoice
    ?? G.pendingExileChoice
    ?? G.pendingGarrisonChoice
    ?? G.pendingRegionChoice
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingDiscardChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingReturnFameChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingReturnExhaustTokenChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingSolsticeOrderChoice
    ?? G.pendingCleanupMarketResourceChoice
    ?? G.pendingCleanupDiscardChoice
    ?? G.pendingReactiveExhaustChoice
    ?? G.pendingPlayCardResolution
    ?? G.pendingPlayedCardResolution
    ?? G.pendingAcquireCardResolution
    ?? G.pendingAcquireEffectResolution
    ?? G.pendingMarketMoveEffectResolution
    ?? G.pendingMarketUnrestHookContinuation
    ?? G.pendingNationHookContinuation
    ?? G.pendingUnrestTakeContinuation
    ?? G.pendingUnrestAllocationResolution
    ?? G.pendingPostDevelopmentResolution
    ?? G.pendingReshuffleResolution
    ?? G.pendingAfterReshuffleEffects
    ?? G.pendingReshuffleDraw
    ?? G.pendingTurnEndCleanup
    ?? G.pendingScoringFinalization
    ?? G.pendingScoringLifecycle
    ?? G.pendingCollapseLifecycle
    ?? G.pendingSolsticeContinuation
    ?? G.pendingSolsticeRoundEnd
    ?? G.pendingPracticeMarketExileBeforeCleanup
    ?? G.pausedSolstice
  );
}

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

function botEffectSourceIsInPlay(G: GameState, bot: BotState, sourceCardId: string | undefined): boolean {
  if (!sourceCardId) return false;
  if (bot.botPlayArea.includes(sourceCardId)) return true;
  if (Object.values(bot.slots).some((slot) => slot.cardId === sourceCardId)) return true;
  return Object.values(G.players).some((player) => player.playArea.includes(sourceCardId) || player.powerArea.includes(sourceCardId));
}

function resolveTopBotCard(G: GameState, bot: BotState, table: BotStateTable, deck: "botDeck" | "botDynastyDeck", source: "bot_deck" | "dynasty_deck", options?: BotResolutionOptions): BotEffectResolution {
  const cardId = bot[deck].shift();
  if (!cardId) {
    const gained = takeResourceFromSupply(G, "materials", 2);
    bot.resources.materials = (bot.resources.materials ?? 0) + gained;
    G.log.push({ round: G.round, playerId: bot.botId, message: `BotResolveTopCardFallback(${source}/gained=${gained === 2 ? 2 : `${gained}/2`} materials)` });
    return { resolved: gained > 0, warnings: [] };
  }
  const result = resolveBotCard({ G, bot, revealedCardId: cardId, source, table, randomNumber: options?.randomNumber });
  if (deck === "botDynastyDeck" && bot.botDynastyDeck.length === 0) triggerScoring(G, "bot_dynasty_deck_empty", bot.botId);
  return { resolved: result.resolvedAny, warnings: result.warnings };
}

function capPositiveCardVp(value: number): number {
  return value > 0 ? Math.min(value, 10) : value;
}

function cardVpValueForCondition(card: Card | undefined): number {
  const vp = card?.vp as unknown;
  if (typeof vp === "number") return capPositiveCardVp(vp);
  if (typeof vp === "object" && vp !== null) {
    const { mode, value, trueValue, falseValue } = vp as { mode?: string; value?: unknown; trueValue?: unknown; falseValue?: unknown };
    const numericValue = typeof value === "number" ? value : 0;
    if (mode === "none") return 0;
    if (mode === "conditional" && (typeof trueValue === "number" || typeof falseValue === "number")) {
      return capPositiveCardVp(Math.max(
        typeof trueValue === "number" ? trueValue : numericValue,
        typeof falseValue === "number" ? falseValue : numericValue
      ));
    }
    if (mode === "conditional" || mode === "variable") return capPositiveCardVp(numericValue || 5);
    if (mode === "negative") return -Math.abs(numericValue);
    return capPositiveCardVp(numericValue);
  }
  return 0;
}

function resolveTopMainDeckCard(G: GameState, bot: BotState, table: BotStateTable, effect: Extract<BotEffectOp, { op: "bot_resolve_top_main_deck" }>, options?: BotResolutionOptions): BotEffectResolution {
  const cardId = G.marketDecks?.mainDeck.shift();
  if (!cardId) return { resolved: false, warnings: [] };
  const result = resolveBotCard({ G, bot, revealedCardId: cardId, source: "effect", table, randomNumber: options?.randomNumber });
  const conditional = effect.ifVp && cardVpValueForCondition(G.cardDb[cardId]) === effect.ifVp.value
    ? resolveBotFallbackEffects(G, bot, table, cardId, effect.ifVp.effects, options)
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
  if (deck === "botDynastyDeck" && moved > 0 && bot.botDynastyDeck.length === 0) triggerScoring(G, "bot_dynasty_deck_empty", bot.botId);
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
  maybeGainSupremeRulerReturnBonus(G, bot);
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotReturnedFromDiscard(${cardId})` });
  return true;
}

function maybeGainSupremeRulerReturnBonus(G: GameState, bot: BotState): void {
  if (!bot.difficultyConfig.returnsUnrestGainBonus) return;
  const gained = takeResourceFromSupply(G, "knowledge", 1);
  bot.resources.knowledge = (bot.resources.knowledge ?? 0) + gained;
  if (gained > 0) G.log.push({ round: G.round, playerId: bot.botId, message: "BotSupremeRulerReturnBonus(knowledge=1)" });
}

function currentStateTokenKey(bot: BotState, table: BotStateTable): string {
  return `${table.id}_${table.side || bot.botStateSide}`;
}

function stateTokenCount(bot: BotState, table: BotStateTable, resource: ResourceName): number {
  return bot.stateTokens?.[currentStateTokenKey(bot, table)]?.[canonicalResourceName(resource)] ?? 0;
}

function addStateTokens(bot: BotState, table: BotStateTable, resource: ResourceName, count: number): void {
  const canonical = canonicalResourceName(resource);
  const key = currentStateTokenKey(bot, table);
  bot.stateTokens ??= {};
  bot.stateTokens[key] ??= {};
  bot.stateTokens[key][canonical] = (bot.stateTokens[key][canonical] ?? 0) + count;
}

function clearStateTokens(bot: BotState, table: BotStateTable, resource: ResourceName): number {
  const canonical = canonicalResourceName(resource);
  const key = currentStateTokenKey(bot, table);
  const count = bot.stateTokens?.[key]?.[canonical] ?? 0;
  if (bot.stateTokens?.[key]) bot.stateTokens[key][canonical] = 0;
  return count;
}

function moveBotResourceToStateCard(G: GameState, bot: BotState, table: BotStateTable, resource: ResourceName, count: number): boolean {
  const available = resourceAmount(bot.resources, resource);
  if (available < count) return false;
  setResourceAmount(bot.resources, resource, available - count);
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

function botAbandonInPlay(G: GameState, bot: BotState, filter?: BotAcquireFilter): boolean {
  const index = findLastMatchingIndex(bot.botPlayArea, G, filter);
  if (index < 0) return false;
  const [cardId] = bot.botPlayArea.splice(index, 1);
  if (!cardId) return false;
  bot.botDiscard.push(cardId);
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotAbandonedInPlay(${cardId})` });
  return true;
}

function updateMarketSlotAfterBotSwap(G: GameState, marketIndex: number, previousMarketCardId: string, incomingCardId: string): void {
  const slot = G.marketSlots?.find((candidate) => candidate.cardId === previousMarketCardId)
    ?? G.marketSlots?.find((candidate) => candidate.index === marketIndex);
  if (!slot) return;
  slot.cardId = incomingCardId;
  slot.resourceMarkers = { ...(G.marketResources?.[incomingCardId] ?? {}) } as Record<string, number>;
  slot.attachedUnrestCardIds = [...(G.marketUnrest?.[incomingCardId] ?? [])];
}

function chooseBotSwapMarketCard(G: GameState, botId: string, botCardId: string, filter?: BotAcquireFilter): { cardId: string; slotIndex: number } | undefined {
  return G.market
    .map((cardId, slotIndex) => ({ cardId, slotIndex }))
    .filter(({ cardId }) => cardMatchesFilter(G, cardId, filter) && cardCanSwapWithMarket(G, botId, botCardId, cardId))
    .sort((a, b) => {
      const value = (cardId: string) => cardVpValueForCondition(G.cardDb[cardId]) + marketResourceTokenCount(G, cardId);
      const vpDiff = value(b.cardId) - value(a.cardId);
      if (vpDiff !== 0) return vpDiff;
      const tokenDiff = marketResourceTokenCount(G, b.cardId) - marketResourceTokenCount(G, a.cardId);
      if (tokenDiff !== 0) return tokenDiff;
      return a.slotIndex - b.slotIndex;
    })[0];
}

function botSwapMarket(G: GameState, bot: BotState, filter?: BotAcquireFilter, marketFilter?: BotAcquireFilter): boolean {
  for (let botIndex = bot.botPlayArea.length - 1; botIndex >= 0; botIndex -= 1) {
    const botCardId = bot.botPlayArea[botIndex];
    if (!cardMatchesFilter(G, botCardId, filter)) continue;
    const chosen = chooseBotSwapMarketCard(G, bot.botId, botCardId, marketFilter);
    if (!chosen) continue;

    const [marketCardId] = G.market.splice(chosen.slotIndex, 1, botCardId);
    bot.botPlayArea.splice(botIndex, 1);
    bot.botDiscard.push(marketCardId);

    const marketResources = { ...(G.marketResources?.[marketCardId] ?? {}) } as Partial<Record<ResourceName, number>>;
    delete G.marketResources?.[marketCardId];
    if (Object.keys(marketResources).length > 0) {
      G.marketResources ??= {};
      G.marketResources[botCardId] = marketResources;
    }
    returnMarketUnrest(G, bot.botId, marketCardId);
    tuckUnrestUnderMarketCard(G, bot.botId, botCardId);
    updateMarketSlotAfterBotSwap(G, chosen.slotIndex, marketCardId, botCardId);
    if (!G.gameover) G.log.push({ round: G.round, playerId: bot.botId, message: `BotSwappedWithMarket(${botCardId}<->${marketCardId})` });
    return true;
  }
  return false;
}

function botMoveTopDiscardToDeck(G: GameState, bot: BotState): boolean {
  const cardId = bot.botDiscard.pop();
  if (!cardId) return false;
  bot.botDeck.unshift(cardId);
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotMovedTopDiscardToDeck(${cardId})` });
  return true;
}

function moveResolvedBotCardToDestination(G: GameState, bot: BotState, cardId: string, destination: BotCardResolutionResult["cardDestination"]): void {
  if (destination === "history") bot.botHistory.push(cardId);
  else if (destination === "play") bot.botPlayArea.push(cardId);
  else if (destination === "bottom_deck") bot.botDeck.push(cardId);
  else if (destination === "unrest") {
    G.unrestPile ??= [];
    G.unrestPile.push(cardId);
    maybeGainSupremeRulerReturnBonus(G, bot);
  } else bot.botDiscard.push(cardId);
}

function isTradeRouteCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.type === "trade_route" || card?.cardType === "trade_route" || card?.suit === "trade_route";
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

function resolveBotFallbackEffects(G: GameState, bot: BotState, table: BotStateTable, sourceCardId: string, effects?: BotEffectOp[], options?: BotResolutionOptions): BotEffectResolution {
  if (!effects?.length) return { resolved: false, warnings: [] };
  const warnings: string[] = [];
  let resolved = false;
  for (const fallback of effects) {
    const result = applyBotEffectWithResolution(G, bot, table, sourceCardId, fallback, options);
    resolved ||= result.resolved;
    warnings.push(...result.warnings);
    if (G.gameover) break;
  }
  return { resolved, warnings };
}

export function applyBotEffect(G: GameState, bot: BotState, table: BotStateTable, sourceCardId: string, effect: BotEffectOp, options?: BotResolutionOptions): string[] {
  return applyBotEffectWithResolution(G, bot, table, sourceCardId, effect, options).warnings;
}

function marketResourceTokenCount(G: GameState, cardId: string): number {
  return Object.values(G.marketResources?.[cardId] ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
}

function ensureGlobalExile(G: GameState): NonNullable<GameState["globalSpecialZones"]>[string] {
  G.globalSpecialZones ??= {};
  G.globalSpecialZones.exile ??= {
    id: "exile",
    displayName: "Exile",
    cardIds: [],
    visibility: "public",
    scoresAsOwned: false
  };
  return G.globalSpecialZones.exile;
}

function botExileMarketCard(G: GameState, bot: BotState): boolean {
  const slotIndex = G.market.findIndex((cardId) => cardId && !marketCardHasTokens(G, cardId));
  if (slotIndex < 0) {
    G.log.push({ round: G.round, playerId: bot.botId, message: "BotExileSkipped(all_market_cards_have_tokens)" });
    return false;
  }
  const [cardId] = G.market.splice(slotIndex, 1);
  if (!cardId) return false;
  returnMarketUnrest(G, bot.botId, cardId);
  delete G.marketResources?.[cardId];
  ensureGlobalExile(G).cardIds.push(cardId);
  refillMarketSlot(G, { playerId: bot.botId, slotIndex, acquiredCardId: cardId, preferSuitDeck: true });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotExiledFromMarket(${cardId})` });
  return true;
}

export function applyBotEffectWithResolution(G: GameState, bot: BotState, table: BotStateTable, sourceCardId: string, effect: BotEffectOp, options?: BotResolutionOptions): BotEffectResolution {
  switch (effect.op) {
    case "bot_gain_resource": {
      const gained = takeResourceFromSupply(G, effect.resource, effect.count);
      addResourceAmount(bot.resources, effect.resource, gained);
      return { resolved: gained > 0, warnings: [] };
    }
    case "bot_gain_resource_per_in_play": {
      const matching = bot.botPlayArea.filter((cardId) => !isTradeRouteCard(G, cardId) && cardMatchesFilter(G, cardId, effect.filter)).length;
      const amount = matching * (effect.countPerCard ?? 1);
      const gained = takeResourceFromSupply(G, effect.resource, amount);
      addResourceAmount(bot.resources, effect.resource, gained);
      return { resolved: gained > 0, warnings: [] };
    }
    case "bot_spend_resource":
      {
        const spent = Math.min(resourceAmount(bot.resources, effect.resource), effect.count);
        setResourceAmount(bot.resources, effect.resource, resourceAmount(bot.resources, effect.resource) - spent);
        returnResourceToSupply(G, effect.resource, spent);
        return { resolved: spent > 0, warnings: [] };
      }
    case "bot_pay_resource_then":
      {
        const available = resourceAmount(bot.resources, effect.resource);
        if (available < effect.count) return { resolved: false, warnings: [] };
        const snapshot = cloneGameState(G);
        const botSnapshot = cloneBotState(bot);
        setResourceAmount(bot.resources, effect.resource, available - effect.count);
        returnResourceToSupply(G, effect.resource, effect.count);
        const warnings: string[] = [];
        for (const childEffect of effect.effects) {
          const result = applyBotEffectWithResolution(G, bot, table, sourceCardId, childEffect, options);
          warnings.push(...result.warnings);
          if (G.gameover || hasPendingInterruption(G)) return { resolved: true, warnings };
          if (!result.resolved) {
            restoreGameStatePreservingBot(G, snapshot, bot, botSnapshot);
            return { resolved: false, warnings };
          }
        }
        return { resolved: true, warnings };
      }
    case "bot_move_resource_to_state_card":
      if (moveBotResourceToStateCard(G, bot, table, effect.resource, effect.count)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_spend_resource_to_state_card":
      if (resourceAmount(bot.resources, effect.spendResource) >= effect.spendCount) {
        setResourceAmount(bot.resources, effect.spendResource, resourceAmount(bot.resources, effect.spendResource) - effect.spendCount);
        returnResourceToSupply(G, effect.spendResource, effect.spendCount);
        addStateTokens(bot, table, effect.placeResource, effect.placeCount);
        return { resolved: true, warnings: [] };
      }
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
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
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_break_through": {
      const beforeMaterials = bot.resources.materials ?? 0;
      const resolved = botBreakThrough(G, bot, effect.filter, {
        discardGained: effect.discardGained,
        resolveGained: effect.resolveGained ? (cardId) => resolveBotCard({ G, bot, revealedCardId: cardId, source: "effect", table, randomNumber: options?.randomNumber }) : undefined,
        randomNumber: options?.randomNumber
      });
      if (resolved || (bot.resources.materials ?? 0) > beforeMaterials) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    }
    case "bot_exile_market":
      if (botExileMarketCard(G, bot)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_trade":
      return { resolved: resolveBotTrade(G, bot, options?.randomNumber), warnings: [] };
    case "bot_trigger_trade_route":
      return { resolved: resolveBotTriggerTradeRoute(G, bot, effect.cardId ?? sourceCardId, options?.randomNumber), warnings: [] };
    case "bot_resolve_profits_where_able":
      return { resolved: resolveBotProfitsWhereAble(G, bot, options?.randomNumber), warnings: [] };
    case "bot_add_resource_to_market_slot":
      {
        const warnings = addResourceToMarketSlot(G, bot, effect);
        return { resolved: warnings.length === 0, warnings };
      }
    case "bot_resolve_top_bot_deck":
      return resolveTopBotCard(G, bot, table, "botDeck", "bot_deck", options);
    case "bot_resolve_top_dynasty_deck":
      return resolveTopBotCard(G, bot, table, "botDynastyDeck", "dynasty_deck", options);
    case "bot_resolve_top_main_deck":
      return resolveTopMainDeckCard(G, bot, table, effect, options);
    case "bot_discard_top_bot_deck":
      if (discardTopBotCards(G, bot, "botDeck", effect.count ?? 1) > 0) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_discard_top_dynasty_deck":
      if (discardTopBotCards(G, bot, "botDynastyDeck", effect.count ?? 1) > 0) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_return_from_discard":
      if (botReturnFromDiscard(G, bot, effect.filter)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_abandon_in_play":
      if (botAbandonInPlay(G, bot, effect.filter)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_recall_in_play":
      if (botRecallInPlay(G, bot, effect.filter)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_swap_market":
      if (botSwapMarket(G, bot, effect.filter, effect.marketFilter)) return { resolved: true, warnings: [] };
      return resolveBotFallbackEffects(G, bot, table, sourceCardId, effect.ifUnable, options);
    case "bot_move_top_discard_to_deck":
      return { resolved: botMoveTopDiscardToDeck(G, bot), warnings: [] };
    case "human_gain_resource": {
      const playerId = humanPlayerId(G, bot);
      if (!playerId) return { resolved: false, warnings: ["missing human player"] };
      const resource = canonicalResourceName(effect.resource);
      const gained = gainPlayerResource(G, playerId, resource, effect.count);
      if (gained > 0) {
        createReactiveExhaustChoice(
          { G, playerId: bot.botId, selfCardId: sourceCardId, randomNumber: options?.randomNumber, enabledExpansions: G.options?.enabledExpansions },
          {
            trigger: "after_gain_resource",
            resource,
            sourceCardId,
            sourceWasInPlay: botEffectSourceIsInPlay(G, bot, sourceCardId)
          }
        );
      }
      return { resolved: gained > 0, warnings: [] };
    }
    case "human_take_unrest": {
      const playerId = humanPlayerId(G, bot);
      if (!playerId) return { resolved: false, warnings: ["missing human player"] };
      const handCountBefore = G.players[playerId].hand.length;
      takeUnrest(G, { playerIds: [playerId], count: effect.count, triggeredBy: bot.botId, randomNumber: options?.randomNumber });
      if ((G.players[playerId]?.hand.length ?? 0) > handCountBefore) {
        createReactiveExhaustChoice(
          { G, playerId: bot.botId, selfCardId: sourceCardId, randomNumber: options?.randomNumber, enabledExpansions: G.options?.enabledExpansions },
          { trigger: "after_take_unrest", targetPlayerId: playerId }
        );
      }
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

export function resolveBotCard(args: { G: GameState; bot: BotState; revealedCardId: string; source: "slot"|"bot_deck"|"dynasty_deck"|"discard"|"effect"; table: BotStateTable; randomNumber?: () => number; }): BotCardResolutionResult {
  const card = args.G.cardDb[args.revealedCardId];
  if (!card) return { cardDestination: "discard", resolvedAny: false, warnings: ["missing card"] };
  const rows = args.table.rows.filter((r) => match(r, card)).sort((a,b)=>a.priority-b.priority);
  for (const row of rows) {
    if (!row.effects.length) continue;
    let destination: BotCardResolutionResult["cardDestination"] = "discard";
    const warnings: string[] = [];
    let resolvedPart = false;
    for (let index = 0; index < row.effects.length; index += 1) {
      const effect = row.effects[index];
      if (effect.op === "bot_return_revealed_card_to_unrest") destination = "unrest";
      if (effect.op === "bot_put_revealed_card_into_history") destination = "history";
      if (effect.op === "bot_play_revealed_card") destination = "play";
      if (effect.op === "bot_put_revealed_card_on_bottom_of_deck") destination = "bottom_deck";
      const result = applyBotEffectWithResolution(args.G, args.bot, args.table, card.id, effect, { randomNumber: args.randomNumber });
      resolvedPart ||= result.resolved;
      warnings.push(...result.warnings);
      if (args.G.gameover) return { resolvedRowId: row.id, cardDestination: destination, resolvedAny: true, warnings };
      if (hasPendingInterruption(args.G)) {
        args.G.solo!.pendingBotRowContinuation = {
          revealedCardId: card.id,
          source: args.source,
          tableId: args.table.id,
          effects: row.effects,
          nextEffectIndex: index + 1,
          destination
        };
        return { resolvedRowId: row.id, cardDestination: destination, resolvedAny: true, warnings };
      }
    }
    if (!resolvedPart) continue;
    moveResolvedBotCardToDestination(args.G, args.bot, card.id, destination);
    return { resolvedRowId: row.id, cardDestination: destination, resolvedAny: true, warnings };
  }
  args.bot.botDiscard.push(card.id);
  return { cardDestination: "discard", resolvedAny: false, warnings: [] };
}

export function continuePendingBotRowContinuation(G: GameState, bot: BotState, randomNumber?: () => number): boolean {
  const pending = G.solo?.pendingBotRowContinuation;
  if (!pending || hasPendingInterruption(G) || G.gameover) return false;
  const table = G.solo?.botStateTables[pending.tableId];
  if (!table) {
    G.solo!.pendingBotRowContinuation = undefined;
    bot.botDiscard.push(pending.revealedCardId);
    bot.botLog.push({ round: G.round, playerId: bot.botId, message: `missing bot state table: ${pending.tableId}` });
    return true;
  }
  G.solo!.pendingBotRowContinuation = undefined;
  let destination = pending.destination;
  for (let index = pending.nextEffectIndex; index < pending.effects.length; index += 1) {
    const effect = pending.effects[index];
    if (effect.op === "bot_return_revealed_card_to_unrest") destination = "unrest";
    if (effect.op === "bot_put_revealed_card_into_history") destination = "history";
    if (effect.op === "bot_play_revealed_card") destination = "play";
    if (effect.op === "bot_put_revealed_card_on_bottom_of_deck") destination = "bottom_deck";
    const result = applyBotEffectWithResolution(G, bot, table, pending.revealedCardId, effect, { randomNumber });
    bot.botLog.push(...result.warnings.map((message) => ({ round: G.round, playerId: bot.botId, message })));
    if (G.gameover) return true;
    if (hasPendingInterruption(G)) {
      G.solo!.pendingBotRowContinuation = {
        ...pending,
        nextEffectIndex: index + 1,
        destination
      };
      return true;
    }
  }
  moveResolvedBotCardToDestination(G, bot, pending.revealedCardId, destination);
  return true;
}
