import type { GameState, Suit } from "./state";
import { collectMarketResources, returnMarketUnrest } from "./marketResources";
import { deckForSuit, refillMarketSlot } from "./marketRefill";

function cardMatchesSuit(G: GameState, cardId: string, suit: Suit): boolean {
  return G.cardDb[cardId]?.suit === suit;
}

function breakThroughFromMarket(G: GameState, playerId: string, suit: Suit): boolean {
  const slotIndex = G.market.findIndex((cardId) => cardMatchesSuit(G, cardId, suit));
  if (slotIndex < 0) return false;

  const [cardId] = G.market.splice(slotIndex, 1);
  if (!cardId) return false;
  collectMarketResources(G, playerId, cardId);
  G.players[playerId].hand.push(cardId);
  returnMarketUnrest(G, playerId, cardId);
  G.log.push({ round: G.round, playerId, message: `BreakThroughMarket(${cardId}/${suit})` });
  refillMarketSlot(G, { playerId, slotIndex, acquiredCardId: cardId });
  return true;
}

function breakThroughFromDeck(G: GameState, playerId: string, suit: Suit): boolean {
  const sourceDeck = deckForSuit(suit);
  const smallDeckCard = sourceDeck ? G.marketDecks?.[sourceDeck].shift() : undefined;
  if (smallDeckCard) {
    G.players[playerId].hand.push(smallDeckCard);
    G.log.push({ round: G.round, playerId, message: `BreakThroughDeck(${smallDeckCard}/${sourceDeck})` });
    return true;
  }

  const mainDeck = G.marketDecks?.mainDeck;
  if (!mainDeck) return false;
  const revealed: string[] = [];
  while (mainDeck.length > 0) {
    const cardId = mainDeck.shift();
    if (!cardId) break;
    if (cardMatchesSuit(G, cardId, suit)) {
      G.players[playerId].hand.push(cardId);
      mainDeck.push(...revealed);
      G.log.push({ round: G.round, playerId, message: `BreakThroughMainDeck(${cardId}/${suit}/revealed=${revealed.length})` });
      return true;
    }
    revealed.push(cardId);
  }
  mainDeck.push(...revealed);
  G.log.push({ round: G.round, playerId, message: `BreakThroughFailed(${suit})` });
  return false;
}

export function breakThrough(G: GameState, args: { playerId: string; suit: Suit; source: "market" | "deck"; count: number }): void {
  for (let i = 0; i < args.count; i++) {
    const resolved = args.source === "market"
      ? breakThroughFromMarket(G, args.playerId, args.suit)
      : breakThroughFromDeck(G, args.playerId, args.suit);
    if (!resolved) break;
  }
}
