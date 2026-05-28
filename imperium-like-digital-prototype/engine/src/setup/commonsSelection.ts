import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsSetupOptions, CommonsSelectionReport } from "./commonsTypes";

const playerCountFloor: Record<string, number> = { "1+": 1, "2+": 2, "3+": 3, "4+": 4 };

export function satisfiesCommonsPlayerCount(card: NormalizedCardRecord, effectivePlayerCount: 2 | 3 | 4): boolean {
  const req = card.playerCountRequirement?.trim();
  if (!req) return true;
  const required = playerCountFloor[req] ?? Number(req.replace("+", ""));
  if (!Number.isFinite(required)) return true;
  return effectivePlayerCount >= required;
}

export function satisfiesCommonsExpansionRules(card: NormalizedCardRecord, options: CommonsSetupOptions): boolean {
  const enabled = options.enabledExpansions;
  const required = card.requiredExpansions ?? [];
  const excluded = card.excludedExpansions ?? [];
  if (required.some((expansion) => !enabled.includes(expansion))) return false;
  if (excluded.some((expansion) => enabled.includes(expansion))) return false;

  const tradeRoutesEnabled = enabled.includes("trade_routes");
  if (!tradeRoutesEnabled && card.commonsGroup === "trade_routes") return false;
  if (tradeRoutesEnabled && options.commonsSetId === "horizons" && isTradeRoutesMutuallyExclusiveAlternate(card)) return false;
  return true;
}

export function isTradeRoutesMutuallyExclusiveAlternate(card: NormalizedCardRecord): boolean {
  return card.commonsGroup !== "trade_routes" && card.commonsGroup !== "trade_friendly" && (card.tags ?? []).includes("trade_routes_alternate");
}

export function satisfiesCommonsModeRules(card: NormalizedCardRecord, options: CommonsSetupOptions): boolean {
  if (!options.mode) return true;
  const allowedModes = card.allowedModes ?? ["multiplayer", "solo", "practice"];
  const disallowedModes = card.disallowedModes ?? [];
  return allowedModes.includes(options.mode) && !disallowedModes.includes(options.mode);
}

export function selectCommonsCards(cards: NormalizedCardRecord[], options: CommonsSetupOptions): CommonsSelectionReport {
  const selectedCards: NormalizedCardRecord[] = [];
  const removedForPlayerCount: string[] = [];
  const removedForExpansion: string[] = [];
  const removedForVariant: string[] = [];

  for (const card of cards) {
    if (card.ownership !== "commons") continue;
    if (card.commonsGroup === "replacement") continue;
    if (card.commonsSetId !== options.commonsSetId) continue;
    if (!satisfiesCommonsModeRules(card, options)) {
      removedForVariant.push(card.id);
      continue;
    }
    if (!satisfiesCommonsExpansionRules(card, options)) {
      removedForExpansion.push(card.id);
      continue;
    }
    if (!satisfiesCommonsPlayerCount(card, options.effectiveCommonsPlayerCount)) {
      removedForPlayerCount.push(card.id);
      continue;
    }
    selectedCards.push(card);
  }

  return { selectedCards, removedForPlayerCount, removedForExpansion, removedForVariant };
}
