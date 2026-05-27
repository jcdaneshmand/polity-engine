import type { Ctx } from "boardgame.io";
import { runEffects } from "../cards/effectRunner";
import type { GameState } from "./state";

interface MoveCtx {
  G: GameState;
  ctx: Ctx;
  events?: { endTurn?: () => void };
}

export function playCard({ G, ctx }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  if (p.actionsRemaining < 1 || !p.hand.includes(cardId)) return;

  p.actionsRemaining -= 1;
  const handIndex = p.hand.indexOf(cardId);
  if (handIndex >= 0) p.hand.splice(handIndex, 1);
  p.playArea.push(cardId);

  runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId },
    G.cardDb[cardId]?.effects ?? []
  );
}

export function acquireCard({ G, ctx }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  const idx = G.market.indexOf(cardId);
  if (idx < 0) return;

  G.market.splice(idx, 1);
  p.discard.push(cardId);
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `Acquired ${cardId}.` });
}

export function endTurnMove({ events }: MoveCtx): void {
  events?.endTurn?.();
}
