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

function drawReplacementFromMarketDecks(G: GameState, args: { playerId: string; slotIndex: number; acquiredCardId: string; preferSuitDeck?: boolean }): string | undefined {
  const decks = G.marketDecks;
  if (!decks) return undefined;
  const sourceDeck = args.preferSuitDeck ? deckForSuit(G.cardDb[args.acquiredCardId]?.suit) : args.slotIndex < 2 ? "mainDeck" : deckForSuit(G.cardDb[args.acquiredCardId]?.suit);
  const suitedCard = sourceDeck && sourceDeck !== "mainDeck" ? decks[sourceDeck].shift() : undefined;
  if (suitedCard) return suitedCard;

  const card = decks.mainDeck.shift();
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
