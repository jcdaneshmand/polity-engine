import type { Ctx } from "boardgame.io";
import { runEffects } from "../cards/effectRunner";
import type { GameState } from "./state";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { acquireMarketCardToDiscard } from "./marketAcquisition";

interface MoveCtx {
  G: GameState;
  ctx: Ctx;
  events?: { endTurn?: () => void };
  random?: { Number?: () => number };
}

function logTurnPhase(G: GameState, playerId: string, phase: string, message: string): void {
  G.log.push({ round: G.round, playerId, message: `TurnPhase(${phase}): ${message}` });
}

export function playCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  if (p.actionsRemaining < 1 || !p.hand.includes(cardId)) return;

  logTurnPhase(G, ctx.currentPlayer, "action_execution", `playCard(${cardId})`);
  p.actionsRemaining -= 1;
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_play_card", payload: { cardId }, randomNumber: random?.Number });
  const handIndex = p.hand.indexOf(cardId);
  if (handIndex < 0) {
    p.actionsRemaining += 1;
    return;
  }
  p.hand.splice(handIndex, 1);
  p.playArea.push(cardId);

  runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number },
    G.cardDb[cardId]?.effects ?? []
  );
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_play_card", payload: { cardId }, randomNumber: random?.Number });
}

export function acquireCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  if (!G.market.includes(cardId)) return;

  logTurnPhase(G, ctx.currentPlayer, "acquire_resolution", `acquireCard(${cardId})`);
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_acquire", payload: { cardId }, randomNumber: random?.Number });
  if (!acquireMarketCardToDiscard(G, ctx.currentPlayer, cardId)) return;
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `Acquired ${cardId}.` });
  if (G.market.length === 0) {
    G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "MarketExhausted(no_refill_pipeline_defined)." });
  } else {
    G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `MarketRefillStatus(static_market_remaining=${G.market.length}).` });
  }
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_acquire", payload: { cardId }, randomNumber: random?.Number });
}

export function endTurnMove({ events }: MoveCtx): void {
  events?.endTurn?.();
}
