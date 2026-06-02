import { runEffects } from "../cards/effectRunner";
import type { GameState } from "../game/state";
import { hasNationHookInterruption, runNationHooksWithEffectRunner } from "./nationHookCore";
import type { NationHookTrigger } from "./nationRulesetTypes";

export function runNationHooks(args: {G: GameState; playerId: string; trigger: NationHookTrigger; payload?: Record<string, unknown>; randomNumber?: () => number; startIndex?: number}): boolean {
  return runNationHooksWithEffectRunner({
    ...args,
    runHookEffects: (_ruleset, _hookIndex, effects) => runEffects({
      G: args.G,
      playerId: args.playerId,
      enabledExpansions: args.G.options?.enabledExpansions,
      randomNumber: args.randomNumber
    }, effects as any)
  });
}

export function continuePendingNationHooks(args: { G: GameState; playerId: string; randomNumber?: () => number }): boolean {
  const continuation = args.G.pendingNationHookContinuation;
  if (!continuation || continuation.playerId !== args.playerId || hasNationHookInterruption(args.G) || args.G.gameover) return true;
  args.G.pendingNationHookContinuation = undefined;
  args.G.log.push({ round: args.G.round, playerId: args.playerId, message: `Nation hook ${continuation.trigger} #${continuation.resolvedHookIndex} resolved.` });
  return runNationHooks({
    G: args.G,
    playerId: args.playerId,
    trigger: continuation.trigger,
    payload: continuation.payload,
    randomNumber: args.randomNumber,
    startIndex: continuation.nextIndex
  });
  return true;
}
