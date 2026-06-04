import type { GameState } from "./state";
import type { ZoneOverride } from "../nations/nationRulesetTypes";

function isDisableHistoryOverride(override: ZoneOverride): override is Extract<ZoneOverride, { op: "disable_history" }> {
  return override.op === "disable_history";
}

function historyReplacementZone(override: ZoneOverride): override is Extract<ZoneOverride, { op: "replace_history_with_zone" }> {
  return override.op === "replace_history_with_zone";
}

function effectiveDisableHistoryOverride(G: GameState, playerId: string): Extract<ZoneOverride, { op: "disable_history" }> | undefined {
  const ruleset = G.activeNationRulesets?.[playerId];
  const explicitOverride = ruleset?.zoneOverrides?.find(isDisableHistoryOverride);
  if (explicitOverride) return explicitOverride;
  const tags = ruleset?.rulesetTags ?? [];
  if (tags.includes("no_history") && tags.includes("discard_instead_of_history")) {
    return { op: "disable_history", replacementBehavior: "discard" };
  }
  return undefined;
}

export function moveCardsToHistoryDestination(G: GameState, playerId: string, cardIds: string[]): string {
  const player = G.players[playerId];
  const disableHistory = effectiveDisableHistoryOverride(G, playerId);
  if (disableHistory?.replacementBehavior === "discard") {
    player.discard.push(...cardIds);
    return "discard";
  }
  if (disableHistory?.replacementBehavior === "exile") {
    player.exile.push(...cardIds);
    return "exile";
  }
  if (disableHistory?.replacementBehavior === "alternate_zone") {
    player.sideAreas ??= {};
    player.sideAreas.alternate_history ??= [];
    player.sideAreas.alternate_history.push(...cardIds);
    return "alternate_history";
  }
  const replacementZone = G.activeNationRulesets?.[playerId]?.zoneOverrides?.find(historyReplacementZone);
  if (replacementZone) {
    player.sideAreas ??= {};
    player.sideAreas[replacementZone.zoneId] ??= [];
    player.sideAreas[replacementZone.zoneId].push(...cardIds);
    return replacementZone.zoneId;
  }
  player.history.push(...cardIds);
  return "history";
}

export function actualHistorySourceZoneIds(G: GameState, playerId: string): string[] {
  const disableHistory = effectiveDisableHistoryOverride(G, playerId);
  if (disableHistory?.replacementBehavior === "discard") return ["discard"];
  if (disableHistory?.replacementBehavior === "exile") return ["exile"];
  if (disableHistory?.replacementBehavior === "alternate_zone") return ["alternate_history"];
  const replacementZone = G.activeNationRulesets?.[playerId]?.zoneOverrides?.find(historyReplacementZone);
  return replacementZone ? [replacementZone.zoneId] : ["history"];
}

export function actualScoredHistoryZoneIds(G: GameState, playerId: string): string[] {
  const disableHistory = effectiveDisableHistoryOverride(G, playerId);
  if (disableHistory?.replacementBehavior === "alternate_zone") return ["alternate_history"];
  if (disableHistory) return [];
  const replacementZone = G.activeNationRulesets?.[playerId]?.zoneOverrides?.find(historyReplacementZone);
  if (replacementZone) return replacementZone.cardsScore === false ? [] : [replacementZone.zoneId];
  return ["history"];
}
