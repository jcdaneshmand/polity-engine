import type { Ctx } from "boardgame.io";
import type { GameState } from "../game/state";

export function runNationHooks(_G: GameState, _ctx: Ctx, _playerId: string, _trigger: string): void {
  // TODO: execute NationRuleHook records; keep generic data-driven behavior.
}
export const beforeReshuffle = runNationHooks;
export const afterReshuffle = runNationHooks;
export const onAcquire = runNationHooks;
export const onSolstice = runNationHooks;
export const onScoring = runNationHooks;
