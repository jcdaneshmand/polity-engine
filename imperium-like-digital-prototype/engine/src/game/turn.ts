import type { Ctx } from "boardgame.io";
import type { GameState } from "./state";
import { applyCollapseWinChecks } from "./scoring";
import { drawCardWithReshuffleLifecycle, moveAllToDiscard } from "./zones";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

function applyCollapseWinChecksForAllPlayers(G: GameState, randomNumber?: () => number): void {
  for (const playerId of Object.keys(G.players)) {
    applyCollapseWinChecks(G, playerId, randomNumber);
    if (G.gameover) return;
  }
}

export function onTurnBegin(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  const p = G.players[ctx.currentPlayer];
  const ruleset = G.activeNationRulesets?.[ctx.currentPlayer];

  for (const ov of ruleset?.stateOverrides ?? []) {
    logOverride(G, ctx.currentPlayer, ruleset.nationId, "state", ov.op);
    if (ov.op === "start_as_state" && !p.stateArea.includes(ov.state)) p.stateArea.unshift(ov.state);
  }
  p.actionsRemaining = p.actionTokensBase;
  p.actionTokensAvailable = p.actionTokensBase;
  p.exhaustTokensAvailable = p.exhaustTokensBase;

  if (p.hand.length < 5) {
    while (p.hand.length < 5) {
      const drawn = drawCardWithReshuffleLifecycle(G, ctx.currentPlayer, randomNumber);
      if (!drawn) break;
    }
  }
  applyCollapseWinChecksForAllPlayers(G, randomNumber);
}

export function onTurnEnd(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(cleanup): start" });
  const p = G.players[ctx.currentPlayer];
  const ruleset = G.activeNationRulesets?.[ctx.currentPlayer];
  for (const ov of ruleset?.cleanupOverrides ?? []) {
    logOverride(G, ctx.currentPlayer, ruleset.nationId, "cleanup", ov.op);
    if (ov.op === "custom_cleanup_effect") runEffects({ G, playerId: ctx.currentPlayer, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
  }
  moveAllToDiscard(p);
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(cleanup): cards_moved_to_discard" });
  if (G.options?.mode === "solo") {
    for (const ov of ruleset?.botOverrides ?? []) {
      if (ov.op === "bot_custom_cleanup") runEffects({ G, playerId: ctx.currentPlayer, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
    }
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(reshuffle_as_needed): next_draw_handles_reshuffle_lifecycle" });
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_solstice", randomNumber });
  const preventEmpireFlip = (ruleset?.stateOverrides ?? []).some((ov) => ov.op === "never_flip_to_empire");
  for (const ov of ruleset?.solsticeOverrides ?? []) {
    logOverride(G, ctx.currentPlayer, ruleset.nationId, "solstice", ov.op);
    if (ov.op === "flip_state" && !preventEmpireFlip) p.stateArea.reverse();
    if (ov.op === "custom_solstice_effect") runEffects({ G, playerId: ctx.currentPlayer, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
  }
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_solstice", randomNumber });
  applyCollapseWinChecksForAllPlayers(G, randomNumber);
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(turn_handoff): end_turn_complete" });
  G.round += 1;
}
