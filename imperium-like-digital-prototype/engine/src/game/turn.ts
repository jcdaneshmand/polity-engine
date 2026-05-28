import type { Ctx } from "boardgame.io";
import type { GameState } from "./state";
import { drawCard, moveAllToDiscard } from "./zones";
import { refillMarketFromSharedDiscard } from "./moves";

export function onTurnBegin(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  const p = G.players[ctx.currentPlayer];
  p.actionsRemaining = p.actionTokensBase;
  p.actionTokensAvailable = p.actionTokensBase;
  p.exhaustTokensAvailable = p.exhaustTokensBase;

  if (p.hand.length < 5) {
    while (p.hand.length < 5) {
      const drawn = drawCard(p, randomNumber);
      if (!drawn) break;
    }
  }
}

export function onTurnEnd(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  G.log.push({ round: G.round, playerId: "system", message: `Turn lifecycle: action execution complete for P${ctx.currentPlayer}.` });
  G.log.push({ round: G.round, playerId: "system", message: `Turn lifecycle: acquire resolution complete for P${ctx.currentPlayer}.` });

  G.log.push({ round: G.round, playerId: "system", message: `Turn lifecycle: cleanup start for P${ctx.currentPlayer}.` });
  moveAllToDiscard(G.players[ctx.currentPlayer]);

  G.log.push({ round: G.round, playerId: "system", message: "Turn lifecycle: reshuffle/refill checks." });
  refillMarketFromSharedDiscard(G, randomNumber);

  G.log.push({ round: G.round, playerId: "system", message: `Turn lifecycle: handoff from P${ctx.currentPlayer}.` });
  G.round += 1;
}
