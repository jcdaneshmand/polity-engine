import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsSetupOptions } from "./commonsTypes";

export function selectCommonsCandidates(cards: NormalizedCardRecord[], options: CommonsSetupOptions): NormalizedCardRecord[] {
  return cards.filter((c) => c.ownership === "commons" && c.commonsSetId === options.commonsSetId);
}

export function applyExpansionAndPlayerCountFilters(cards: NormalizedCardRecord[], options: CommonsSetupOptions) {
  const removedForExpansion: string[] = [];
  const removedForPlayerCount: string[] = [];
  const kept = cards.filter((c) => {
    const req = c.requiredExpansions ?? [];
    const exc = c.excludedExpansions ?? [];
    if (req.some((e) => !options.enabledExpansions.includes(e)) || exc.some((e) => options.enabledExpansions.includes(e))) {
      removedForExpansion.push(c.id);
      return false;
    }
    if (c.commonsGroup === "trade_routes" && !options.enabledExpansions.includes("trade_routes")) {
      removedForExpansion.push(c.id);
      return false;
    }
    if (c.playerCountRequirement === "4+" && options.effectiveCommonsPlayerCount !== 4) { removedForPlayerCount.push(c.id); return false; }
    if (c.playerCountRequirement === "3+" && options.effectiveCommonsPlayerCount < 3) { removedForPlayerCount.push(c.id); return false; }
    return true;
  });
  return { kept, removedForExpansion, removedForPlayerCount };
}
