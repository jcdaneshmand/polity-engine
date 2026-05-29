import type { GameState } from "./state";
import { triggerCollapse } from "./scoring";

function removeOne(cards: string[], cardId: string): boolean {
  const index = cards.indexOf(cardId);
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

function isUnrestCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "unrest" || card?.cardType === "unrest" || card?.type === "unrest";
}

export function acquireFromExile(G: GameState, args: { playerId: string; cardId: string; destination?: "hand" | "discard" }): boolean {
  const player = G.players[args.playerId];
  if (!player || !removeOne(player.exile, args.cardId)) return false;

  const destination = args.destination ?? "hand";
  player[destination].push(args.cardId);

  if (!isUnrestCard(G, args.cardId)) {
    const unrestCardId = G.unrestPile?.shift();
    if (unrestCardId) {
      player.discard.push(unrestCardId);
    } else {
      triggerCollapse(G, "unrest_pile_empty", args.playerId);
    }
  }

  G.log.push({ round: G.round, playerId: args.playerId, message: `AcquiredFromExile(${args.cardId}/destination=${destination})` });
  return true;
}
