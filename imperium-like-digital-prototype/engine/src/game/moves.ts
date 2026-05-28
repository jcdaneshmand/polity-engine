import type { Ctx } from "boardgame.io";
import { runEffects } from "../cards/effectRunner";
import type { GameState } from "./state";
import { runNationHooks } from "../nations/nationRulesetHooks";

interface MoveCtx {
  G: GameState;
  ctx: Ctx;
  events?: { endTurn?: () => void };
  random?: { Number?: () => number };
}

export function playCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  if (p.actionsRemaining < 1 || !p.hand.includes(cardId)) return;

  p.actionsRemaining -= 1;
  const handIndex = p.hand.indexOf(cardId);
  if (handIndex >= 0) p.hand.splice(handIndex, 1);
  p.playArea.push(cardId);
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_play_card", payload: { cardId }, randomNumber: random?.Number });

  runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number },
    G.cardDb[cardId]?.effects ?? []
  );
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_play_card", payload: { cardId }, randomNumber: random?.Number });
}

export function acquireCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  const idx = G.market.indexOf(cardId);
  if (idx < 0) return;

  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_acquire", payload: { cardId }, randomNumber: random?.Number });
  G.market.splice(idx, 1);
  p.discard.push(cardId);
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `Acquired ${cardId}.` });
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_acquire", payload: { cardId }, randomNumber: random?.Number });
}

export function endTurnMove({ events }: MoveCtx): void {
  events?.endTurn?.();
}
