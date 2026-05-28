import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
export function setupMarket(cards: NormalizedCardRecord[], quick = false): string[] {
  const marketEligible = cards.filter((c) => c.startingLocation === "market" || c.startingLocation === "supply");
  const pool = quick ? [...marketEligible] : [...marketEligible].sort((a,b)=>String(a.suit).localeCompare(String(b.suit)));
  return pool.slice(0,5).map(c=>c.id);
}
