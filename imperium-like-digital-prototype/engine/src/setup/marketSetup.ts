import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
export interface MarketSetupResult {
  market: string[];
  reserve: string[];
  eligibleCount: number;
}

export function setupMarket(cards: NormalizedCardRecord[], quick = false): MarketSetupResult {
  const marketEligible = cards.filter((c) => c.startingLocation === "market" || c.startingLocation === "supply");
  const pool = quick ? [...marketEligible] : [...marketEligible].sort((a,b)=>String(a.suit).localeCompare(String(b.suit)));
  const market = pool.slice(0,5).map(c=>c.id);
  const reserve = pool.slice(5).map(c=>c.id);
  return { market, reserve, eligibleCount: marketEligible.length };
}
