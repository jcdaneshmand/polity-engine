import type { PlayerState, ResourceName } from "../game/state";
import type { NationRuleset, SideAreaState } from "./nationRulesetTypes";

export function applySetupOverrides(player: PlayerState, ruleset: NationRuleset): Record<string, SideAreaState> {
  const sideAreas: Record<string, SideAreaState> = {};
  for (const ov of ruleset.setupOverrides) {
    if (ov.op === "set_initial_resources") {
      Object.entries(ov.resources).forEach(([k, v]) => { player.resources[k as ResourceName] = v ?? 0; });
    }
    if (ov.op === "gain_resource") {
      player.resources[ov.resource] = (player.resources[ov.resource] ?? 0) + ov.count;
    }
    if (ov.op === "set_action_tokens_base") {
      player.actionTokensBase = ov.count; player.actionsRemaining = ov.count; player.actionTokensAvailable = ov.count;
    }
    if (ov.op === "create_side_area") {
      player.sideAreas ??= {};
      player.sideAreas[ov.areaId] ??= [];
    }
  }
  return sideAreas;
}
