import type { Ctx } from "boardgame.io";
import type { GameState } from "./state";
import { drawCard, moveAllToDiscard } from "./zones";

export function onTurnBegin(G: GameState, ctx: Ctx): void {
  const p = G.players[ctx.currentPlayer];
  p.actionsRemaining = 1;
  if (p.hand.length < 5) {
    while (p.hand.length < 5) drawCard(p);
  }
}

export function onTurnEnd(G: GameState, ctx: Ctx): void {
  moveAllToDiscard(G.players[ctx.currentPlayer]);
  G.round += 1;
}
