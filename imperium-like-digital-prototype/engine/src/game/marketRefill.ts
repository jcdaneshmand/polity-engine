import type { GameState, MarketDeckName, Suit } from "./state";
import { tuckUnrestUnderMarketCard } from "./marketResources";

export function deckForSuit(suit?: Suit): MarketDeckName | undefined {
  if (suit === "region") return "regionDeck";
  if (suit === "uncivilized") return "uncivilizedDeck";
  if (suit === "civilized") return "civilizedDeck";
  if (suit === "tributary") return "tributaryDeck";
  return undefined;
}

function drawReplacementFromMarketDecks(G: GameState, slotIndex: number, acquiredCardId: string): string | undefined {
  const decks = G.marketDecks;
  if (!decks) return undefined;
  const sourceDeck = slotIndex < 2 ? "mainDeck" : deckForSuit(G.cardDb[acquiredCardId]?.suit);
  return (sourceDeck ? decks[sourceDeck].shift() : undefined) ?? decks.mainDeck.shift();
}

function drawReplacementFromLegacyPool(G: GameState): string | undefined {
  return G.marketRefillPool.shift();
}

export function refillMarketSlot(G: GameState, args: { playerId: string; slotIndex: number; acquiredCardId: string }): void {
  const nextCardId = drawReplacementFromMarketDecks(G, args.slotIndex, args.acquiredCardId) ?? drawReplacementFromLegacyPool(G);
  if (!nextCardId) {
    G.log.push({ round: G.round, playerId: args.playerId, message: "MarketRefillStatus(pool_empty)" });
    return;
  }

  G.market.splice(args.slotIndex, 0, nextCardId);
  tuckUnrestUnderMarketCard(G, args.playerId, nextCardId);
  G.log.push({ round: G.round, playerId: args.playerId, message: `MarketRefilled(${nextCardId})` });
}
