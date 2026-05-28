import type { GameState } from "./state";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

export function applyScoringLifecycleOnce(G: GameState, playerId: string): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset) return;
  const key = `${ruleset.nationId}:scoring_lifecycle:${G.round}`;
  (G as any)._appliedScoringLifecycleKeys ??= {};
  if ((G as any)._appliedScoringLifecycleKeys[key]) return;
  (G as any)._appliedScoringLifecycleKeys[key] = true;

  runNationHooks({ G, playerId, trigger: "before_scoring" });
  for (const ov of ruleset.scoringOverrides ?? []) {
    logOverride(G, playerId, ruleset.nationId, "scoring", ov.op);
    if (ov.op === "custom_scoring_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  for (const ov of ruleset.collapseOverrides ?? []) {
    logOverride(G, playerId, ruleset.nationId, "collapse", ov.op);
    if (ov.op === "custom_collapse_resolution") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  runNationHooks({ G, playerId, trigger: "after_scoring" });
}

export function scorePlayer(G: GameState, playerId: string): number {
  const p = G.players[playerId];
  return p.history.length + p.resources.influence - p.resources.unrest;
}
