import type { ExpansionId, NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import { loadCardDb } from "./cardLoader";
import type { Card } from "../game/state";
import { getNodeFs } from "../local/nodeBuiltins";

/** Local-only private data loader. generated-private JSON is gitignored and must be explicitly requested. */
export function loadCardDbWithOptionalPrivateData(opts?: { usePrivate?: boolean; privatePath?: string; enabledExpansions?: ExpansionId[] }): Record<string, Card> {
  if (!opts?.usePrivate) return loadCardDb();
  const fs = getNodeFs();
  if (!fs) return loadCardDb();
  const path = opts.privatePath ?? "generated-private/cards.normalized.json";
  if (!fs.existsSync(path)) return loadCardDb();
  const enabled = opts.enabledExpansions ?? [];
  const rows = JSON.parse(fs.readFileSync(path, "utf8")) as NormalizedCardRecord[];
  const filtered = rows.filter((r) => {
    const required = r.requiredExpansions ?? [];
    const excluded = r.excludedExpansions ?? [];
    if (required.some((e) => !enabled.includes(e))) return false;
    if (excluded.some((e) => enabled.includes(e))) return false;
    return true;
  });
  const fromPrivate: Record<string, Card> = {};
  filtered.forEach((r) => { fromPrivate[r.id] = { id: r.id, displayName: r.displayName, type: r.cardType as any, cardType: r.cardType as any, suit: r.suit as any, cost: r.cost.materials + r.cost.population + r.cost.progress + r.cost.goods, tags: r.tags, effects: r.effects as any, stateRequirement: r.stateRequirement, allowedModes: r.allowedModes, disallowedModes: r.disallowedModes, playerCountRequirement: r.playerCountRequirement, startingLocation: r.startingLocation, ownership: r.ownership, commonsSetId: r.commonsSetId, setupBannerSuit: r.setupBannerSuit as any, commonsGroup: r.commonsGroup, replacementForCardId: r.replacementForCardId, replacementGroupId: r.replacementGroupId, conflictsWithNationIds: r.conflictsWithNationIds, delayableInLoweredAggression: r.delayableInLoweredAggression, marketEligible: r.marketEligible, smallDeckEligible: r.smallDeckEligible, mainDeckEligible: r.mainDeckEligible, unrestPileEligible: r.unrestPileEligible, fameDeckEligible: r.fameDeckEligible }; });
  return fromPrivate;
}
