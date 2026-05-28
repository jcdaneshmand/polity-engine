import { runEffects } from "../cards/effectRunner";
import type { GameState } from "../game/state";
import type { EffectCondition, NationHookTrigger } from "./nationRulesetTypes";

function evaluateCondition(G: GameState, playerId: string, condition?: EffectCondition): boolean {
  if (!condition || condition.op === "always") return true;
  const p = G.players[playerId];
  if (!p) return false;
  if (condition.op === "state_is") return p.stateArea.includes(condition.state);
  if (condition.op === "zone_empty") return getZoneCards(G, playerId, p, condition.zoneId).length === 0;
  if (condition.op === "zone_has_at_least") return getZoneCards(G, playerId, p, condition.zoneId).length >= condition.count;
  if (condition.op === "card_in_zone") return getZoneCards(G, playerId, p, condition.zoneId).includes(condition.cardId);
  if (condition.op === "expansion_enabled") return !!G.options?.enabledExpansions.includes(condition.expansion);
  if (condition.op === "variant_enabled") return !!G.options?.enabledVariants.includes(condition.variant);
  if (condition.op === "mode_is") return G.options?.mode === condition.mode;
  return false;
}

function getZoneCards(G: GameState, playerId: string, p: GameState["players"][string], zoneId: string): string[] {
  const direct = (p as any)[zoneId];
  if (Array.isArray(direct)) return direct;
  if (p.sideAreas?.[zoneId]) return p.sideAreas[zoneId];
  if (G.specialZones?.[playerId]?.[zoneId]?.cardIds) return G.specialZones[playerId][zoneId].cardIds;
  if (G.globalSpecialZones?.[zoneId]?.cardIds) return G.globalSpecialZones[zoneId].cardIds;
  return [];
}

export function runNationHooks(args: {G: GameState; playerId: string; trigger: NationHookTrigger; payload?: Record<string, unknown>; randomNumber?: () => number}): void {
  const ruleset = args.G.activeNationRulesets?.[args.playerId];
  if (!ruleset) return;
  const hooks = [...ruleset.hookRules.filter((h) => h.trigger === args.trigger)].sort((a,b)=>(a.priority??0)-(b.priority??0));
  hooks.forEach((hook, index) => {
    if (!evaluateCondition(args.G, args.playerId, hook.condition)) return;
    try {
      runEffects({ G: args.G, playerId: args.playerId, enabledExpansions: args.G.options?.enabledExpansions, randomNumber: args.randomNumber }, hook.effects as any);
      args.G.log.push({ round: args.G.round, playerId: args.playerId, message: `Nation hook ${args.trigger} #${index} resolved.` });
    } catch (err) {
      args.G.log.push({ round: args.G.round, playerId: args.playerId, message: `NationRulesetError(${ruleset.nationId}/${args.trigger}/${index}): ${(err as Error).message}` });
    }
  });
}
