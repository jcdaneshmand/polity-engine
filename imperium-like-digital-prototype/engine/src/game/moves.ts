import type { Ctx } from "boardgame.io";
import { runEffects } from "../cards/effectRunner";
import type { GameState } from "./state";

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

  runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number },
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

export function refillMarketFromSharedDiscard(G: GameState, randomNumber?: () => number): void {
  if (G.market.length > 0 || G.sharedDiscard.length === 0) return;

  const ordered = [...G.sharedDiscard];
  const shuffled: string[] = [];
  while (ordered.length > 0) {
    const roll = randomNumber ? randomNumber() : 0;
    const safeRoll = Number.isFinite(roll) && roll >= 0 && roll < 1 ? roll : 0;
    const index = Math.floor(safeRoll * ordered.length);
    shuffled.push(ordered.splice(index, 1)[0]);
  }

  const drawn = shuffled.shift();
  G.sharedDiscard = shuffled;
  if (drawn) {
    G.market.push(drawn);
    G.log.push({ round: G.round, playerId: "system", message: `Market refilled with ${drawn}.` });
  }
}

export function endTurnMove({ events }: MoveCtx): void {
  events?.endTurn?.();
}
