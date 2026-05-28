import marketCards from "../../../data/placeholder-cards/test-market.json";
import type { Card } from "../game/state";

export function loadCardDb(): Record<string, Card> {
  const cards = marketCards as Card[];
  return Object.fromEntries(cards.map((c) => [c.id, c]));
}
