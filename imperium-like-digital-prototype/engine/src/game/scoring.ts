import type { GameState } from "./state";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";

export function scorePlayer(G: GameState, playerId: string): number {
  const p = G.players[playerId];
  const ruleset = G.activeNationRulesets?.[playerId];
  runNationHooks({ G, playerId, trigger: "before_scoring" });
  for (const ov of ruleset?.scoringOverrides ?? []) {
    G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${ruleset.nationId}/scoring/${ov.op})` });
    if (ov.op === "custom_scoring_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  for (const ov of ruleset?.collapseOverrides ?? []) {
    G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${ruleset.nationId}/collapse/${ov.op})` });
    if (ov.op === "custom_collapse_resolution") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  runNationHooks({ G, playerId, trigger: "after_scoring" });
  return p.history.length + p.resources.influence - p.resources.unrest;
}
