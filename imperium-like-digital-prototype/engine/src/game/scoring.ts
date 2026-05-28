import type { GameState } from "./state";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

function getZoneCards(G: GameState, playerId: string, zoneId: string): string[] {
  const p = G.players[playerId];
  if (!p) return [];
  const direct = (p as any)[zoneId];
  if (Array.isArray(direct)) return direct;
  if (p.sideAreas?.[zoneId]) return p.sideAreas[zoneId];
  if (G.specialZones?.[playerId]?.[zoneId]?.cardIds) return G.specialZones[playerId][zoneId].cardIds;
  if (G.globalSpecialZones?.[zoneId]?.cardIds) return G.globalSpecialZones[zoneId].cardIds;
  return [];
}

function applyAutoWinCollapseOverride(G: GameState, playerId: string, ruleset: NonNullable<GameState["activeNationRulesets"]>[string], zoneId: string): void {
  if (G.gameover || getZoneCards(G, playerId, zoneId).length > 0) return;
  logOverride(G, playerId, ruleset.nationId, "collapse", "auto_win_if_zone_empty");
  G.gameover = { winner: playerId, reason: `auto_win_if_zone_empty:${zoneId}` };
  G.log.push({ round: G.round, playerId, message: `CollapseAutoWin(${ruleset.nationId}/${zoneId})` });
}

export function applyCollapseWinChecks(G: GameState, playerId: string): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset || G.gameover) return;
  for (const ov of ruleset.collapseOverrides ?? []) {
    if (ov.op === "auto_win_if_zone_empty") applyAutoWinCollapseOverride(G, playerId, ruleset, ov.zoneId);
  }
}

export function applyScoringLifecycleOnce(G: GameState, playerId: string): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset) return;
  const key = `${playerId}:${ruleset.nationId}:scoring_lifecycle:${G.round}`;
  (G as any)._appliedScoringLifecycleKeys ??= {};
  if ((G as any)._appliedScoringLifecycleKeys[key]) return;
  (G as any)._appliedScoringLifecycleKeys[key] = true;

  runNationHooks({ G, playerId, trigger: "before_scoring" });
  for (const ov of ruleset.scoringOverrides ?? []) {
    logOverride(G, playerId, ruleset.nationId, "scoring", ov.op);
    if (ov.op === "custom_scoring_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  for (const ov of ruleset.collapseOverrides ?? []) {
    if (ov.op === "auto_win_if_zone_empty") {
      applyAutoWinCollapseOverride(G, playerId, ruleset, ov.zoneId);
      continue;
    }
    logOverride(G, playerId, ruleset.nationId, "collapse", ov.op);
    if (ov.op === "custom_collapse_resolution") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  runNationHooks({ G, playerId, trigger: "after_scoring" });
}

export function scorePlayer(G: GameState, playerId: string): number {
  applyScoringLifecycleOnce(G, playerId);

  const p = G.players[playerId];
  const ruleset = G.activeNationRulesets?.[playerId];
  const excludedZones = new Set((ruleset?.scoringOverrides ?? []).filter((ov: any) => ov.op === "exclude_zone_from_scoring").map((ov: any) => ov.zoneId));
  const disableHistory = ruleset?.zoneOverrides?.find((ov: any) => ov.op === "disable_history");
  const historyZoneId = disableHistory?.replacementBehavior === "alternate_zone" ? "alternate_history" : "history";
  const historyScore = excludedZones.has(historyZoneId)
    ? 0
    : disableHistory?.replacementBehavior === "alternate_zone"
      ? (p.sideAreas?.alternate_history?.length ?? 0)
      : disableHistory
        ? 0
        : p.history.length;
  return historyScore + p.resources.influence - p.resources.unrest;
}
