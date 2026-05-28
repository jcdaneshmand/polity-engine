import type { PlayerState, ResourceName } from "../game/state";
import type { NationRuleset, SideAreaState } from "./nationRulesetTypes";

export function applySetupOverrides(player: PlayerState, ruleset: NationRuleset): Record<string, SideAreaState> {
  const sideAreas: Record<string, SideAreaState> = {};
  for (const ov of ruleset.setupOverrides) {
    if (ov.op === "set_initial_resources") {
      Object.entries(ov.resources).forEach(([k, v]) => { player.resources[k as ResourceName] = v ?? 0; });
    }
    if (ov.op === "set_action_tokens_base") {
      player.actionTokensBase = ov.count; player.actionsRemaining = ov.count; player.actionTokensAvailable = ov.count;
    }
  }
  return sideAreas;
}
