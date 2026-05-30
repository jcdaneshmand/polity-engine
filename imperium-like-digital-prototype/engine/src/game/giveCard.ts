import type { GameState } from "./state";

export function giveCardToPlayer(G: GameState, playerId: string, cardId: string, targetPlayerId: string): boolean {
  if (playerId === targetPlayerId) return false;
  const player = G.players[playerId];
  const target = G.players[targetPlayerId];
  if (!player || !target) return false;
  const index = player.hand.indexOf(cardId);
  if (index < 0) return false;
  player.hand.splice(index, 1);
  target.hand.push(cardId);
  G.log.push({ round: G.round, playerId, message: `CardGiven(${cardId}/${playerId}->${targetPlayerId})` });
  return true;
}
