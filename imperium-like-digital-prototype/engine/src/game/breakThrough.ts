import type { GameState, Suit } from "./state";
import { collectMarketResources, returnMarketUnrest } from "./marketResources";
import { deckForSuit, refillMarketSlot } from "./marketRefill";
import { gainPlayerResource } from "./resources";
import { triggerScoringIfMainDeckEmpty } from "./scoringTriggers";
import { cardHasSuitIcon } from "./suitIcons";

function cardMatchesSuit(G: GameState, cardId: string, suit: Suit): boolean {
  return cardHasSuitIcon(G.cardDb[cardId], suit);
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

function breakThroughFromMarket(G: GameState, playerId: string, suit: Suit, cardId?: string): boolean {
  const slotIndex = cardId
    ? G.market.findIndex((marketCardId) => marketCardId === cardId && cardMatchesSuit(G, marketCardId, suit))
    : G.market.findIndex((marketCardId) => cardMatchesSuit(G, marketCardId, suit));
  if (slotIndex < 0) return false;

  const [acquiredCardId] = G.market.splice(slotIndex, 1);
  if (!acquiredCardId) return false;
  collectMarketResources(G, playerId, acquiredCardId);
  G.players[playerId].hand.push(acquiredCardId);
  returnMarketUnrest(G, playerId, acquiredCardId);
  G.log.push({ round: G.round, playerId, message: `BreakThroughMarket(${acquiredCardId}/${suit})` });
  refillMarketSlot(G, { playerId, slotIndex, acquiredCardId });
  return true;
}

function gainBreakThroughFallback(G: GameState, playerId: string, suit: Suit): void {
  const gained = gainPlayerResource(G, playerId, "materials", 2);
  G.log.push({ round: G.round, playerId, message: `BreakThroughFailed(${suit}/gained=${gained === 2 ? 2 : `${gained}/2`} materials)` });
}

function breakThroughFromDeck(G: GameState, playerId: string, suit: Suit, randomNumber?: () => number): boolean {
  const sourceDeck = deckForSuit(suit);
  const smallDeckCard = sourceDeck ? G.marketDecks?.[sourceDeck].shift() : undefined;
  if (smallDeckCard) {
    G.players[playerId].hand.push(smallDeckCard);
    G.log.push({ round: G.round, playerId, message: `BreakThroughDeck(${smallDeckCard}/${sourceDeck})` });
    return true;
  }

  const mainDeck = G.marketDecks?.mainDeck;
  if (!mainDeck) {
    gainBreakThroughFallback(G, playerId, suit);
    return false;
  }
  const revealed: string[] = [];
  while (mainDeck.length > 0) {
    const cardId = mainDeck.shift();
    if (!cardId) break;
    if (cardMatchesSuit(G, cardId, suit)) {
      G.players[playerId].hand.push(cardId);
      mainDeck.splice(0, mainDeck.length, ...shuffleWithRandom([...mainDeck, ...revealed], randomNumber));
      G.log.push({ round: G.round, playerId, message: `BreakThroughMainDeck(${cardId}/${suit}/revealed=${revealed.length})` });
      triggerScoringIfMainDeckEmpty(G, playerId);
      return true;
    }
    revealed.push(cardId);
  }
  mainDeck.splice(0, mainDeck.length, ...shuffleWithRandom(revealed, randomNumber));
  gainBreakThroughFallback(G, playerId, suit);
  return false;
}

function breakThroughFromExile(G: GameState, playerId: string, suit: Suit, cardId?: string): boolean {
  const player = G.players[playerId];
  const exileIndex = cardId
    ? player.exile.findIndex((exiledCardId) => exiledCardId === cardId && cardMatchesSuit(G, exiledCardId, suit))
    : player.exile.findIndex((exiledCardId) => cardMatchesSuit(G, exiledCardId, suit));
  if (exileIndex < 0) return false;

  const [acquiredCardId] = player.exile.splice(exileIndex, 1);
  if (!acquiredCardId) return false;
  player.hand.push(acquiredCardId);
  G.log.push({ round: G.round, playerId, message: `BreakThroughExile(${acquiredCardId}/${suit})` });
  return true;
}

export function breakThrough(G: GameState, args: { playerId: string; suit: Suit; source: "market" | "deck" | "exile"; count: number; cardId?: string; randomNumber?: () => number }): void {
  for (let i = 0; i < args.count; i++) {
    const resolved = args.source === "market"
      ? breakThroughFromMarket(G, args.playerId, args.suit, args.cardId)
      : args.source === "exile"
        ? breakThroughFromExile(G, args.playerId, args.suit, args.cardId)
        : breakThroughFromDeck(G, args.playerId, args.suit, args.randomNumber);
    if (!resolved) break;
  }
}
