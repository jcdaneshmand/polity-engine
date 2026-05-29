import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { MarketDeckName } from "../game/state";

export interface MarketSetupResult {
  market: string[];
  refillPool: string[];
  marketDecks: Record<MarketDeckName, string[]>;
  notes: string[];
}

function emptyMarketDecks(): Record<MarketDeckName, string[]> {
  return { mainDeck: [], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] };
}

function deckForMarketCard(card: NormalizedCardRecord): MarketDeckName {
  if (card.suit === "region") return "regionDeck";
  if (card.suit === "uncivilized") return "uncivilizedDeck";
  if (card.suit === "civilized") return "civilizedDeck";
  if (card.suit === "tributary") return "tributaryDeck";
  return "mainDeck";
}

export function setupMarket(cards: NormalizedCardRecord[], quick = false): MarketSetupResult {
  const marketEligible = cards.filter((c) => c.startingLocation === "market" || c.startingLocation === "supply");
  const pool = quick ? [...marketEligible] : [...marketEligible].sort((a, b) => String(a.suit).localeCompare(String(b.suit)));
  const market = pool.slice(0, 5).map((c) => c.id);
  const marketDecks = emptyMarketDecks();
  for (const card of pool.slice(5)) marketDecks[deckForMarketCard(card)].push(card.id);
  const refillPool: string[] = [];
  const notes: string[] = [];
  if (market.length === 0) notes.push("MarketEmptyOnSetup(no_eligible_cards)");
  else notes.push(`MarketInitialized(slots=${market.length})`);
  notes.push(`MarketDecks(main=${marketDecks.mainDeck.length},region=${marketDecks.regionDeck.length},uncivilized=${marketDecks.uncivilizedDeck.length},civilized=${marketDecks.civilizedDeck.length},tributary=${marketDecks.tributaryDeck.length})`);
  return { market, refillPool, marketDecks, notes };
}
