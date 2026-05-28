import { runEffects } from "../cards/effectRunner";
import type { GameState } from "../game/state";
import type { NationHookTrigger } from "./nationRulesetTypes";

export function runNationHooks(args: {G: GameState; playerId: string; trigger: NationHookTrigger; payload?: Record<string, unknown>}): void {
  const ruleset = args.G.activeNationRulesets?.[args.playerId];
  if (!ruleset) return;
  const hooks = [...ruleset.hookRules.filter((h) => h.trigger === args.trigger)].sort((a,b)=>(a.priority??0)-(b.priority??0));
  hooks.forEach((hook, index) => {
    try {
      runEffects({ G: args.G, playerId: args.playerId, enabledExpansions: args.G.options?.enabledExpansions }, hook.effects as any);
      args.G.log.push({ round: args.G.round, playerId: args.playerId, message: `Nation hook ${args.trigger} #${index} resolved.` });
    } catch (err) {
      args.G.log.push({ round: args.G.round, playerId: args.playerId, message: `NationRulesetError(${ruleset.nationId}/${args.trigger}/${index}): ${(err as Error).message}` });
    }
  });
}
