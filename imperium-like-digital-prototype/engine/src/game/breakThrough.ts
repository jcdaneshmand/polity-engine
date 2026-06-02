import type { GameState, ResourceName, Suit } from "./state";
import { collectMarketResources, returnMarketUnrest } from "./marketResources";
import { deckForSuit, drawMarketDeckCard, refillMarketSlot } from "./marketRefill";
import { gainPlayerResource } from "./resources";
import { triggerScoringIfMainDeckEmpty } from "./scoringTriggers";
import { cardHasSuitIconForPlayer } from "./suitIcons";
import { availableExileCards } from "./exile";

const TRIBUTARY_VISIBLE_BOTTOM_DECKS = ["regionDeck", "uncivilizedDeck", "civilizedDeck"] as const;

export interface BreakThroughResult {
  gainedCardIds: string[];
  fallbackResourceGains: Partial<Record<ResourceName, number>>;
  marketResourceGains: Partial<Record<ResourceName, number>>;
}

function cardMatchesSuit(G: GameState, playerId: string, cardId: string, suit: Suit): boolean {
  return cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], suit);
}

function shuffleWithRandom<T>(items: T[], randomNumber?: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const roll = randomNumber ? randomNumber() : 0;
    const j = Math.floor(roll * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function addResourceGains(target: Partial<Record<ResourceName, number>>, gained: Partial<Record<ResourceName, number>>): void {
  for (const [resource, amount] of Object.entries(gained) as Array<[ResourceName, number | undefined]>) {
    if ((amount ?? 0) <= 0) continue;
    target[resource] = (target[resource] ?? 0) + (amount ?? 0);
  }
}

function breakThroughFromMarket(G: GameState, playerId: string, suit: Suit, marketResourceGains: Partial<Record<ResourceName, number>>, cardId?: string): string | undefined {
  const slotIndex = cardId
    ? G.market.findIndex((marketCardId) => marketCardId === cardId && cardMatchesSuit(G, playerId, marketCardId, suit))
    : G.market.findIndex((marketCardId) => cardMatchesSuit(G, playerId, marketCardId, suit));
  if (slotIndex < 0) return undefined;

  const [acquiredCardId] = G.market.splice(slotIndex, 1);
  if (!acquiredCardId) return undefined;
  addResourceGains(marketResourceGains, collectMarketResources(G, playerId, acquiredCardId));
  G.players[playerId].hand.push(acquiredCardId);
  returnMarketUnrest(G, playerId, acquiredCardId);
  refillMarketSlot(G, { playerId, slotIndex, acquiredCardId });
  if (G.gameover) return acquiredCardId;
  G.log.push({ round: G.round, playerId, message: `BreakThroughMarket(${acquiredCardId}/${suit})` });
  return acquiredCardId;
}

function gainBreakThroughFallback(G: GameState, playerId: string, suit: Suit): number {
  const gained = gainPlayerResource(G, playerId, "materials", 2);
  G.log.push({ round: G.round, playerId, message: `BreakThroughFailed(${suit}/gained=${gained === 2 ? 2 : `${gained}/2`} materials)` });
  return gained;
}

export function visibleTributaryBreakThroughCards(G: GameState, playerId: string): string[] {
  return TRIBUTARY_VISIBLE_BOTTOM_DECKS.flatMap((deckName) => {
    const deck = G.marketDecks?.[deckName];
    const bottomCardId = G.marketDeckBottomCards?.[deckName];
    if (!deck || deck.length !== 1 || !bottomCardId || deck[0] !== bottomCardId) return [];
    return cardMatchesSuit(G, playerId, bottomCardId, "tributary") ? [bottomCardId] : [];
  });
}

function takeVisibleTributaryBottom(G: GameState, playerId: string, cardId?: string): string | undefined {
  for (const deckName of TRIBUTARY_VISIBLE_BOTTOM_DECKS) {
    const deck = G.marketDecks?.[deckName];
    const bottomCardId = G.marketDeckBottomCards?.[deckName];
    if (!deck || deck.length !== 1 || !bottomCardId || deck[0] !== bottomCardId) continue;
    if (cardId && bottomCardId !== cardId) continue;
    if (!cardMatchesSuit(G, playerId, bottomCardId, "tributary")) continue;
    deck.shift();
    delete G.marketDeckBottomCards?.[deckName];
    G.players[playerId].hand.push(bottomCardId);
    G.log.push({ round: G.round, playerId, message: `BreakThroughVisibleBottom(${bottomCardId}/${deckName})` });
    return bottomCardId;
  }
  return undefined;
}

function breakThroughFromDeck(G: GameState, playerId: string, suit: Suit, fallbackResourceGains: Partial<Record<ResourceName, number>>, randomNumber?: () => number): string | undefined {
  const visibleTributaryCardId = suit === "tributary" ? takeVisibleTributaryBottom(G, playerId) : undefined;
  if (visibleTributaryCardId) return visibleTributaryCardId;

  const sourceDeck = suit === "tributary" ? undefined : deckForSuit(suit);
  const smallDeckCard = sourceDeck ? drawMarketDeckCard(G, sourceDeck) : undefined;
  if (smallDeckCard) {
    G.players[playerId].hand.push(smallDeckCard);
    G.log.push({ round: G.round, playerId, message: `BreakThroughDeck(${smallDeckCard}/${sourceDeck})` });
    return smallDeckCard;
  }

  const mainDeck = G.marketDecks?.mainDeck;
  if (!mainDeck) {
    const gained = gainBreakThroughFallback(G, playerId, suit);
    if (gained > 0) fallbackResourceGains.materials = (fallbackResourceGains.materials ?? 0) + gained;
    return undefined;
  }
  const revealed: string[] = [];
  while (mainDeck.length > 0) {
    const cardId = mainDeck.shift();
    if (!cardId) break;
    if (cardMatchesSuit(G, playerId, cardId, suit)) {
      G.players[playerId].hand.push(cardId);
      mainDeck.splice(0, mainDeck.length, ...shuffleWithRandom([...mainDeck, ...revealed], randomNumber));
      G.log.push({ round: G.round, playerId, message: `BreakThroughMainDeck(${cardId}/${suit}/revealed=${revealed.length})` });
      triggerScoringIfMainDeckEmpty(G, playerId);
      return cardId;
    }
    revealed.push(cardId);
  }
  mainDeck.splice(0, mainDeck.length, ...shuffleWithRandom(revealed, randomNumber));
  const gained = gainBreakThroughFallback(G, playerId, suit);
  if (gained > 0) fallbackResourceGains.materials = (fallbackResourceGains.materials ?? 0) + gained;
  return undefined;
}

function breakThroughFromExile(G: GameState, playerId: string, suit: Suit, cardId?: string): string | undefined {
  const player = G.players[playerId];
  const acquiredCardId = cardId
    ? availableExileCards(G, playerId).find((exiledCardId) => exiledCardId === cardId && cardMatchesSuit(G, playerId, exiledCardId, suit))
    : availableExileCards(G, playerId).find((exiledCardId) => cardMatchesSuit(G, playerId, exiledCardId, suit));
  if (!acquiredCardId) return undefined;

  const personalIndex = player.exile.indexOf(acquiredCardId);
  if (personalIndex >= 0) player.exile.splice(personalIndex, 1);
  else {
    const globalExile = G.globalSpecialZones?.exile?.cardIds;
    const globalIndex = globalExile?.indexOf(acquiredCardId) ?? -1;
    if (globalIndex < 0) return undefined;
    globalExile?.splice(globalIndex, 1);
  }
  player.hand.push(acquiredCardId);
  G.log.push({ round: G.round, playerId, message: `BreakThroughExile(${acquiredCardId}/${suit})` });
  return acquiredCardId;
}

export function breakThrough(G: GameState, args: { playerId: string; suit: Suit; source: "market" | "deck" | "exile"; count: number; cardId?: string; randomNumber?: () => number }): BreakThroughResult {
  const result: BreakThroughResult = { gainedCardIds: [], fallbackResourceGains: {}, marketResourceGains: {} };
  for (let i = 0; i < args.count; i++) {
    const gainedCardId = args.source === "market"
      ? breakThroughFromMarket(G, args.playerId, args.suit, result.marketResourceGains, args.cardId)
      : args.source === "exile"
        ? breakThroughFromExile(G, args.playerId, args.suit, args.cardId)
        : args.suit === "tributary" && args.cardId
          ? takeVisibleTributaryBottom(G, args.playerId, args.cardId) || breakThroughFromDeck(G, args.playerId, args.suit, result.fallbackResourceGains, args.randomNumber)
          : breakThroughFromDeck(G, args.playerId, args.suit, result.fallbackResourceGains, args.randomNumber);
    if (!gainedCardId) break;
    result.gainedCardIds.push(gainedCardId);
  }
  return result;
}
