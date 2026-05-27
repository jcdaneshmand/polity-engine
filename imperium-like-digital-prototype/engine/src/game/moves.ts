import type { Ctx } from "boardgame.io";
import { runEffects } from "../cards/effectRunner";
import type { GameState } from "./state";
import { moveAllToDiscard } from "./zones";

export function playCard(G: GameState, ctx: Ctx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  if (p.actionsRemaining < 1 || !p.hand.includes(cardId)) return;
  p.actionsRemaining -= 1;
  p.hand = p.hand.filter((id) => id !== cardId);
  p.playArea.push(cardId);
  runEffects({ G, playerId: ctx.currentPlayer, selfCardId: cardId }, G.cardDb[cardId]?.effects ?? []);
}

export function acquireCard(G: GameState, ctx: Ctx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  const idx = G.market.indexOf(cardId);
  if (idx < 0) return;
  G.market.splice(idx, 1);
  p.discard.push(cardId);
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `Acquired ${cardId}.` });
}

export function endTurnMove(G: GameState, ctx: Ctx): void {
  moveAllToDiscard(G.players[ctx.currentPlayer]);
}
