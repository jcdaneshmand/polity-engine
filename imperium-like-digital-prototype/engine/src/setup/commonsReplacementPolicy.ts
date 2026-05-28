import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsSetupOptions } from "./commonsTypes";

function isEligibleReplacement(c: NormalizedCardRecord, options: CommonsSetupOptions): boolean {
  if (c.ownership !== "replacement" && c.ownership !== "commons") return false;
  if (c.playerCountRequirement === "4+" && options.effectiveCommonsPlayerCount !== 4) return false;
  if (c.playerCountRequirement === "3+" && options.effectiveCommonsPlayerCount < 3) return false;
  const req = c.requiredExpansions ?? [];
  const exc = c.excludedExpansions ?? [];
  if (req.some((e) => !options.enabledExpansions.includes(e))) return false;
  if (exc.some((e) => options.enabledExpansions.includes(e))) return false;
  if ((c.conflictsWithNationIds ?? []).some((id) => options.selectedNationIds.includes(id))) return false;
  return true;
}

export function resolveNationConflictReplacement(args: { card: NormalizedCardRecord; allCards: NormalizedCardRecord[]; options: CommonsSetupOptions }) {
  const { card, allCards, options } = args;
  if (options.replacementPolicy === "none") return undefined;
  let candidates = allCards.filter((c) => c.id !== card.id && isEligibleReplacement(c, options));
  if (card.replacementGroupId) candidates = candidates.filter((c) => c.replacementGroupId === card.replacementGroupId);
  else candidates = candidates.filter((c) => c.replacementForCardId === card.id || c.commonsGroup === "replacement");
  if (options.replacementPolicy === "prefer_latest") {
    candidates = candidates.sort((a, b) => b.id.localeCompare(a.id));
  }
  return candidates[0];
}
