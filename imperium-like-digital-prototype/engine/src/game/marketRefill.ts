import type { GameState, MarketDeckName, Suit } from "./state";
import { tuckUnrestUnderMarketCard } from "./marketResources";
import { triggerScoringIfMainDeckEmpty } from "./scoringTriggers";

export function deckForSuit(suit?: Suit): MarketDeckName | undefined {
  if (suit === "region") return "regionDeck";
  if (suit === "uncivilized") return "uncivilizedDeck";
  if (suit === "civilized") return "civilizedDeck";
  if (suit === "tributary") return "tributaryDeck";
  return undefined;
}

export function drawMarketDeckCard(G: GameState, deckName: MarketDeckName): string | undefined {
  const deck = G.marketDecks?.[deckName];
  if (!deck || deck.length === 0) return undefined;
  if (deck.length === 1 && G.marketDeckBottomCards?.[deckName] === deck[0]) return undefined;
  const cardId = deck.shift();
  if (cardId && G.marketDeckBottomCards?.[deckName] === cardId) delete G.marketDeckBottomCards[deckName];
  return cardId;
}

function drawReplacementFromMarketDecks(G: GameState, args: { playerId: string; slotIndex: number; acquiredCardId: string; preferSuitDeck?: boolean }): string | undefined {
  const decks = G.marketDecks;
  if (!decks) return undefined;
  const acquiredCard = G.cardDb[args.acquiredCardId];
  const bannerSuit = acquiredCard?.setupBannerSuit ?? acquiredCard?.suit;
  const sourceDeck = args.preferSuitDeck ? deckForSuit(bannerSuit) : args.slotIndex < 2 ? "mainDeck" : deckForSuit(bannerSuit);
  const suitedCard = sourceDeck && sourceDeck !== "mainDeck" ? drawMarketDeckCard(G, sourceDeck) : undefined;
  if (suitedCard) return suitedCard;

  const card = drawMarketDeckCard(G, "mainDeck");
  if (card) triggerScoringIfMainDeckEmpty(G, args.playerId);
  return card;
}

function drawReplacementFromLegacyPool(G: GameState): string | undefined {
  return G.marketRefillPool.shift();
}

export function refillMarketSlot(G: GameState, args: { playerId: string; slotIndex: number; acquiredCardId: string; preferSuitDeck?: boolean }): void {
  const liveSlotIndex = G.marketSlots?.findIndex((slot) => slot.cardId === args.acquiredCardId) ?? -1;
  if (liveSlotIndex >= 0) G.marketSlots?.splice(liveSlotIndex, 1);

  const nextCardId = drawReplacementFromMarketDecks(G, args) ?? drawReplacementFromLegacyPool(G);
  if (!nextCardId) {
    G.marketSlots?.forEach((slot, index) => { slot.index = index; });
    G.log.push({ round: G.round, playerId: args.playerId, message: "MarketRefillStatus(pool_empty)" });
    return;
  }

  G.market.splice(args.slotIndex, 0, nextCardId);
  tuckUnrestUnderMarketCard(G, args.playerId, nextCardId);
  if (G.gameover) {
    G.marketSlots?.forEach((slot, index) => { slot.index = index; });
    return;
  }
  if (G.marketSlots) {
    G.marketSlots.splice(args.slotIndex, 0, {
      index: args.slotIndex,
      cardId: nextCardId,
      attachedUnrestCardIds: [...(G.marketUnrest?.[nextCardId] ?? [])],
      resourceMarkers: {}
    });
    G.marketSlots.forEach((slot, index) => { slot.index = index; });
  }
  G.log.push({ round: G.round, playerId: args.playerId, message: `MarketRefilled(${nextCardId})` });
}
