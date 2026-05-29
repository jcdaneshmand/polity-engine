import type { Ctx } from "boardgame.io";
import type { GameState } from "./state";
import { advanceScoringAtRoundBoundary, applyCollapseWinChecks } from "./scoring";
import { drawCardWithReshuffleLifecycle } from "./zones";
import { runEffects, runTriggeredEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { runBotTurn } from "../solo/botTurn";
import { ensureCleanupMarketResourcePlaced } from "./marketResources";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

function applyCollapseWinChecksForAllPlayers(G: GameState, randomNumber?: () => number): void {
  for (const playerId of Object.keys(G.players)) {
    applyCollapseWinChecks(G, playerId, randomNumber);
    if (G.gameover) return;
  }
}

function getTurnOrder(G: GameState, ctx: Ctx): string[] {
  const ctxOrder = (ctx as unknown as { playOrder?: string[] }).playOrder;
  return ctxOrder?.length ? ctxOrder : Object.keys(G.players).sort((a, b) => Number(a) - Number(b));
}

function isLastPlayerInRound(G: GameState, ctx: Ctx): boolean {
  const order = getTurnOrder(G, ctx);
  return order.at(-1) === ctx.currentPlayer;
}

function drawUpToHandLimit(G: GameState, playerId: string, randomNumber?: () => number, handLimit = 5): void {
  const p = G.players[playerId];
  while (p.hand.length < handLimit && !G.pendingDevelopmentChoice) {
    const remaining = handLimit - p.hand.length;
    const drawn = drawCardWithReshuffleLifecycle(G, playerId, randomNumber, remaining);
    if (!drawn) break;
  }
}

export function startCleanupDiscardChoice(G: GameState, playerId: string): boolean {
  if (G.pendingCleanupDiscardChoice) return false;
  if (G.cleanupDiscardResolved?.playerId === playerId && G.cleanupDiscardResolved.round === G.round) return false;
  const cardIds = [...G.players[playerId].hand];
  if (cardIds.length === 0) return false;
  G.pendingCleanupDiscardChoice = { playerId, cardIds };
  G.log.push({ round: G.round, playerId, message: `CleanupDiscardChoicePending(options=${cardIds.length})` });
  return true;
}

export function resolveCleanupDiscardChoice(G: GameState, playerId: string, cardIds: string[]): boolean {
  const pending = G.pendingCleanupDiscardChoice;
  if (!pending || pending.playerId !== playerId) return false;
  const p = G.players[playerId];
  const uniqueCardIds = [...new Set(cardIds)];
  if (uniqueCardIds.some((cardId) => !pending.cardIds.includes(cardId) || !p.hand.includes(cardId))) return false;

  for (const cardId of uniqueCardIds) {
    const index = p.hand.indexOf(cardId);
    if (index < 0) return false;
    p.hand.splice(index, 1);
    p.discard.push(cardId);
  }

  G.pendingCleanupDiscardChoice = undefined;
  G.cleanupDiscardResolved = { playerId, round: G.round };
  G.log.push({ round: G.round, playerId, message: `CleanupDiscardResolved(count=${uniqueCardIds.length})` });
  return true;
}

function runSolsticeForPlayer(G: GameState, playerId: string, randomNumber?: () => number): void {
  const p = G.players[playerId];
  const ruleset = G.activeNationRulesets?.[playerId];
  const solsticeCardIds = [...p.playArea, ...p.powerArea, ...p.stateArea];
  runNationHooks({ G, playerId, trigger: "before_solstice", randomNumber });
  const preventEmpireFlip = (ruleset?.stateOverrides ?? []).some((ov) => ov.op === "never_flip_to_empire");
  for (const cardId of solsticeCardIds) {
    runTriggeredEffects({ G, playerId, selfCardId: cardId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, G.cardDb[cardId]?.effects ?? [], "on_solstice");
  }
  if (ruleset) {
    for (const ov of ruleset.solsticeOverrides ?? []) {
      logOverride(G, playerId, ruleset.nationId, "solstice", ov.op);
      if (ov.op === "flip_state" && !preventEmpireFlip) p.stateArea.reverse();
      if (ov.op === "custom_solstice_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
    }
  }
  for (const cardId of solsticeCardIds) {
    runTriggeredEffects({ G, playerId, selfCardId: cardId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, G.cardDb[cardId]?.effects ?? [], "end_of_solstice");
  }
  runNationHooks({ G, playerId, trigger: "after_solstice", randomNumber });
}

function runSolsticeForAllPlayers(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  for (const playerId of getTurnOrder(G, ctx)) runSolsticeForPlayer(G, playerId, randomNumber);
}

export function onTurnBegin(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  const p = G.players[ctx.currentPlayer];
  const ruleset = G.activeNationRulesets?.[ctx.currentPlayer];
  G.currentTurnType ??= "activate";

  if (ruleset) {
    for (const ov of ruleset.stateOverrides ?? []) {
      logOverride(G, ctx.currentPlayer, ruleset.nationId, "state", ov.op);
      if (ov.op === "start_as_state" && !p.stateArea.includes(ov.state)) p.stateArea.unshift(ov.state);
    }
  }
  p.actionsRemaining = p.actionTokensBase;
  p.actionTokensAvailable = p.actionTokensBase;
  p.exhaustTokensAvailable = p.exhaustTokensBase;
  G.freePlayedThisTurn ??= {};
  G.freePlayedThisTurn[ctx.currentPlayer] = [];

  applyCollapseWinChecksForAllPlayers(G, randomNumber);
}

export function onTurnEnd(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(cleanup): start" });
  const p = G.players[ctx.currentPlayer];
  const ruleset = G.activeNationRulesets?.[ctx.currentPlayer];
  ensureCleanupMarketResourcePlaced(G, ctx.currentPlayer);
  if (ruleset) {
    for (const ov of ruleset.cleanupOverrides ?? []) {
      logOverride(G, ctx.currentPlayer, ruleset.nationId, "cleanup", ov.op);
      if (ov.op === "custom_cleanup_effect") runEffects({ G, playerId: ctx.currentPlayer, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
    }
  }
  p.progressionTokens = { nationDeck: 0, developmentArea: 0 };
  p.actionTokensAvailable = p.actionTokensBase;
  p.exhaustTokensAvailable = p.exhaustTokensBase;
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(cleanup): optional_discard_resolved" });
  drawUpToHandLimit(G, ctx.currentPlayer, randomNumber);
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `TurnPhase(cleanup): draw_up(hand=${p.hand.length})` });
  if (G.options?.mode === "solo") {
    for (const ov of ruleset?.botOverrides ?? []) {
      if (ov.op === "bot_custom_cleanup") runEffects({ G, playerId: ctx.currentPlayer, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
    }
    runBotTurn({ G, rollDie: randomNumber ? () => Math.floor(randomNumber() * 6) + 1 : undefined });
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(reshuffle_as_needed): next_draw_handles_reshuffle_lifecycle" });
  if (isLastPlayerInRound(G, ctx)) {
    runSolsticeForAllPlayers(G, ctx, randomNumber);
    G.round += 1;
    advanceScoringAtRoundBoundary(G);
  }
  applyCollapseWinChecksForAllPlayers(G, randomNumber);
  G.currentTurnType = "activate";
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(turn_handoff): end_turn_complete" });
}
