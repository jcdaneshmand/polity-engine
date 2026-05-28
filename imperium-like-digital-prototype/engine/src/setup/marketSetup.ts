import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";

export interface MarketSetupResult {
  market: string[];
  refillPool: string[];
  notes: string[];
}

export function setupMarket(cards: NormalizedCardRecord[], quick = false): MarketSetupResult {
  const marketEligible = cards.filter((c) => c.startingLocation === "market" || c.startingLocation === "supply");
  const pool = quick ? [...marketEligible] : [...marketEligible].sort((a, b) => String(a.suit).localeCompare(String(b.suit)));
  const market = pool.slice(0, 5).map((c) => c.id);
  const refillPool = pool.slice(5).map((c) => c.id);
  const notes: string[] = [];
  if (market.length === 0) notes.push("MarketEmptyOnSetup(no_eligible_cards)");
  else notes.push(`MarketInitialized(slots=${market.length})`);
  notes.push(`MarketRefillPool(size=${refillPool.length})`);
  return { market, refillPool, notes };
}
