import type { Card, GameState, ResourceName } from "../game/state";
import { deckForSuit, drawMarketDeckCard, refillMarketSlot } from "../game/marketRefill";
import { triggerCollapse } from "../game/scoring";
import { triggerScoringIfMainDeckEmpty } from "../game/scoringTriggers";
import { takeResourceFromSupply } from "../game/resources";
import { cardHasSuitIcon, cardHasAnySuitIcon } from "../game/suitIcons";
import type { BotAcquireFilter } from "./botEffectOps";
import type { BotState } from "./botTypes";

type BotAcquireCandidate =
  | { source: "market"; cardId: string; slotIndex: number }
  | { source: "exile"; cardId: string; ownerId: string; exileIndex: number; optionIndex: number }
  | { source: "global_exile"; cardId: string; exileIndex: number; optionIndex: number };
type BotBreakThroughOptions = { discardGained?: boolean; resolveGained?: (cardId: string) => void };

function cardVpForBot(card: Card | undefined): number {
  const vp = card?.vp as unknown;
  if (typeof vp === "number") return vp;
  if (typeof vp === "object" && vp !== null) {
    const { mode, value, trueValue, falseValue } = vp as { mode?: string; value?: unknown; trueValue?: unknown; falseValue?: unknown };
    const numericValue = typeof value === "number" ? value : 0;
    if (mode === "none") return 0;
    if (mode === "conditional" && (typeof trueValue === "number" || typeof falseValue === "number")) {
      return Math.max(
        typeof trueValue === "number" ? trueValue : numericValue,
        typeof falseValue === "number" ? falseValue : numericValue
      );
    }
    if (mode === "conditional") return numericValue || 5;
    if (mode === "variable") return numericValue || 5;
    if (mode === "negative") return -Math.abs(numericValue);
    return numericValue;
  }
  return 0;
}

function marketTokenCount(G: GameState, cardId: string): number {
  const resources = Object.values(G.marketResources?.[cardId] ?? {}).reduce((sum, amount) => sum + (amount ?? 0), 0);
  const unrest = G.marketUnrest?.[cardId]?.length ?? 0;
  return resources + unrest;
}

function matchesFilter(G: GameState, cardId: string, filter?: BotAcquireFilter): boolean {
  const card = G.cardDb[cardId];
  if (!card) return false;
  if (filter?.suits?.length && !cardHasAnySuitIcon(card, filter.suits as any)) return false;
  if (filter?.cardTypes?.length && !filter.cardTypes.includes((card.cardType ?? card.type) as any)) return false;
  if (filter?.tags?.length && !filter.tags.some((tag) => card.tags.includes(tag))) return false;
  if (filter?.minVp !== undefined && cardVpForBot(card) < filter.minVp) return false;
  if (filter?.maxVp !== undefined && cardVpForBot(card) > filter.maxVp) return false;
  if (filter?.hasMarketResource && !G.marketResources?.[cardId]?.[filter.hasMarketResource]) return false;
  const slotNumber = G.market.indexOf(cardId) + 1;
  if (filter?.slotNumbers?.length && !filter.slotNumbers.includes(slotNumber as any)) return false;
  return true;
}

function chooseBotMarketCard(G: GameState, filter?: BotAcquireFilter): { cardId: string; slotIndex: number } | undefined {
  return G.market
    .map((cardId, slotIndex) => ({ cardId, slotIndex }))
    .filter(({ cardId }) => matchesFilter(G, cardId, filter))
    .sort((a, b) => {
      const vpDiff = cardVpForBot(G.cardDb[b.cardId]) - cardVpForBot(G.cardDb[a.cardId]);
      if (vpDiff !== 0) return vpDiff;
      const tokenDiff = marketTokenCount(G, b.cardId) - marketTokenCount(G, a.cardId);
      if (tokenDiff !== 0) return tokenDiff;
      return a.slotIndex - b.slotIndex;
    })[0];
}

function chooseBotAcquireCard(G: GameState, filter: BotAcquireFilter | undefined, includeExile: boolean): BotAcquireCandidate | undefined {
  const candidates: BotAcquireCandidate[] = G.market
    .map((cardId, slotIndex) => ({ source: "market" as const, cardId, slotIndex }))
    .filter(({ cardId }) => matchesFilter(G, cardId, filter));

  if (includeExile) {
    let optionIndex = 0;
    for (const ownerId of Object.keys(G.players).sort()) {
      const exile = G.players[ownerId].exile;
      for (let exileIndex = 0; exileIndex < exile.length; exileIndex += 1) {
        const cardId = exile[exileIndex];
        if (matchesFilter(G, cardId, filter)) candidates.push({ source: "exile", cardId, ownerId, exileIndex, optionIndex });
        optionIndex += 1;
      }
    }
    const globalExile = G.globalSpecialZones?.exile?.cardIds ?? [];
    for (let exileIndex = 0; exileIndex < globalExile.length; exileIndex += 1) {
      const cardId = globalExile[exileIndex];
      if (matchesFilter(G, cardId, filter)) candidates.push({ source: "global_exile", cardId, exileIndex, optionIndex });
      optionIndex += 1;
    }
  }

  return candidates.sort((a, b) => {
    const vpDiff = cardVpForBot(G.cardDb[b.cardId]) - cardVpForBot(G.cardDb[a.cardId]);
    if (vpDiff !== 0) return vpDiff;
    const tokenDiff = (b.source === "market" ? marketTokenCount(G, b.cardId) : 0) - (a.source === "market" ? marketTokenCount(G, a.cardId) : 0);
    if (tokenDiff !== 0) return tokenDiff;
    const aOrder = a.source === "market" ? a.slotIndex : G.market.length + a.optionIndex;
    const bOrder = b.source === "market" ? b.slotIndex : G.market.length + b.optionIndex;
    return aOrder - bOrder;
  })[0];
}

function isUnrestCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "unrest" || card?.cardType === "unrest" || card?.type === "unrest";
}

function takeUnrestForBotExileAcquire(G: GameState, bot: BotState, cardId: string): string[] {
  if (isUnrestCard(G, cardId)) return [];
  const unrestCardId = G.unrestPile?.shift();
  if (unrestCardId) return [unrestCardId];
  triggerCollapse(G, "unrest_pile_empty", bot.botId);
  return [];
}

function canTakeRequiredUnrestForBotExileAcquire(G: GameState, cardId: string): boolean {
  return isUnrestCard(G, cardId) || (G.unrestPile?.length ?? 0) > 0;
}

function addGainedCardsToTopOfBotDeck(bot: BotState, cardIds: string[]): void {
  bot.botDeck.unshift(...[...cardIds].reverse());
}

function placeBotGainedCards(bot: BotState, cardIds: string[], options?: BotBreakThroughOptions): void {
  if (options?.resolveGained) {
    for (const cardId of cardIds) options.resolveGained(cardId);
    return;
  }
  if (options?.discardGained) {
    bot.botDiscard.push(...cardIds);
    return;
  }
  addGainedCardsToTopOfBotDeck(bot, cardIds);
}

function gainMarketResources(G: GameState, bot: BotState, cardId: string): void {
  const resources = G.marketResources?.[cardId];
  if (!resources) return;
  for (const [resource, amount] of Object.entries(resources) as [ResourceName, number | undefined][]) {
    bot.resources[resource] = (bot.resources[resource] ?? 0) + (amount ?? 0);
  }
  delete G.marketResources?.[cardId];
}

function gainMarketUnrest(G: GameState, cardId: string): string[] {
  const unrestCards = G.marketUnrest?.[cardId] ?? [];
  delete G.marketUnrest?.[cardId];
  return unrestCards;
}

function returnMarketUnrestToPile(G: GameState, bot: BotState, cardId: string): void {
  const unrestCards = G.marketUnrest?.[cardId] ?? [];
  if (unrestCards.length === 0) return;
  G.unrestPile ??= [];
  G.unrestPile.push(...unrestCards);
  delete G.marketUnrest?.[cardId];
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotMarketUnrestReturned(${cardId}/count=${unrestCards.length})` });
}

function botGainMarketCard(G: GameState, bot: BotState, filter: BotAcquireFilter | undefined, mode: "acquire" | "break_through", options?: BotBreakThroughOptions): boolean {
  const chosen = chooseBotMarketCard(G, filter);
  if (!chosen) {
    G.log.push({ round: G.round, playerId: bot.botId, message: mode === "acquire" ? "BotAcquireSkipped(no_eligible_market_card)" : "BotBreakThroughSkipped(no_eligible_market_card)" });
    return false;
  }
  const [gainedCardId] = G.market.splice(chosen.slotIndex, 1);
  if (!gainedCardId) return false;
  gainMarketResources(G, bot, gainedCardId);
  const unrestCards = mode === "acquire" ? gainMarketUnrest(G, gainedCardId) : [];
  if (mode === "break_through") returnMarketUnrestToPile(G, bot, gainedCardId);
  if (mode === "break_through") placeBotGainedCards(bot, [gainedCardId], options);
  else addGainedCardsToTopOfBotDeck(bot, [gainedCardId, ...unrestCards]);
  refillMarketSlot(G, { playerId: bot.botId, slotIndex: chosen.slotIndex, acquiredCardId: gainedCardId });
  if (G.gameover) return true;
  G.log.push({ round: G.round, playerId: bot.botId, message: mode === "acquire" ? `BotAcquiredFromMarket(${gainedCardId})` : `BotBrokeThroughFromMarket(${gainedCardId})` });
  return true;
}

export function botAcquireFromMarket(G: GameState, bot: BotState, filter?: BotAcquireFilter, includeExile = false): boolean {
  if (!includeExile) return botGainMarketCard(G, bot, filter, "acquire");

  const chosen = chooseBotAcquireCard(G, filter, includeExile);
  if (!chosen) {
    G.log.push({ round: G.round, playerId: bot.botId, message: "BotAcquireSkipped(no_eligible_card)" });
    return false;
  }

  if (chosen.source === "market") {
    return botGainMarketCard(G, bot, { ...filter, slotNumbers: [chosen.slotIndex + 1 as any] }, "acquire");
  }

  if (!canTakeRequiredUnrestForBotExileAcquire(G, chosen.cardId)) {
    triggerCollapse(G, "unrest_pile_empty", bot.botId);
    return true;
  }
  const exileSource = chosen.source === "global_exile" ? G.globalSpecialZones?.exile?.cardIds : G.players[chosen.ownerId].exile;
  const [gainedCardId] = exileSource?.splice(chosen.exileIndex, 1) ?? [];
  if (!gainedCardId) return false;
  const unrestCards = takeUnrestForBotExileAcquire(G, bot, gainedCardId);
  if (G.gameover) return true;
  addGainedCardsToTopOfBotDeck(bot, [gainedCardId, ...unrestCards]);
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotAcquiredFromExile(${gainedCardId})` });
  return true;
}

function primarySuit(filter?: BotAcquireFilter) {
  return filter?.suits?.[0];
}

export function botBreakThrough(G: GameState, bot: BotState, filter?: BotAcquireFilter, options?: BotBreakThroughOptions): boolean {
  if (botGainMarketCard(G, bot, filter, "break_through", options)) return true;

  const suit = primarySuit(filter);
  const sourceDeck = deckForSuit(suit as any);
  const smallDeckCard = sourceDeck ? drawMarketDeckCard(G, sourceDeck) : undefined;
  if (smallDeckCard) {
    placeBotGainedCards(bot, [smallDeckCard], options);
    G.log.push({ round: G.round, playerId: bot.botId, message: `BotBreakThroughDeck(${smallDeckCard}/${sourceDeck})` });
    return true;
  }

  const mainDeck = G.marketDecks?.mainDeck;
  if (mainDeck && suit) {
    const missed: string[] = [];
    while (mainDeck.length > 0) {
      const cardId = mainDeck.shift();
      if (!cardId) break;
      if (cardHasSuitIcon(G.cardDb[cardId], suit as any)) {
        placeBotGainedCards(bot, [cardId], options);
        mainDeck.unshift(...missed);
        triggerScoringIfMainDeckEmpty(G, bot.botId);
        G.log.push({ round: G.round, playerId: bot.botId, message: `BotBreakThroughMainDeck(${cardId}/${suit}/revealed=${missed.length})` });
        return true;
      }
      missed.push(cardId);
    }
    mainDeck.unshift(...missed);
  }

  const gained = takeResourceFromSupply(G, "materials", 2);
  bot.resources.materials = (bot.resources.materials ?? 0) + gained;
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotBreakThroughFailed(${suit ?? "unknown"}/gained=${gained === 2 ? 2 : `${gained}/2`} materials)` });
  return false;
}
