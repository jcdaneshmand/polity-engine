import type { Card, GameState } from "../game/state";
import type { BotStateTable } from "./botStateTableTypes";
import type { BotState } from "./botTypes";

export type BotCardResolutionResult = { resolvedRowId?: string; cardDestination: "discard"|"history"|"play"; resolvedAny: boolean; warnings: string[] };

const match = (row: BotStateTable["rows"][number], card: Card) => row.trigger.kind === "card_id" ? row.trigger.cardId === card.id : row.trigger.kind === "suit" ? row.trigger.suit === card.suit : row.trigger.kind === "card_type" ? row.trigger.cardType === card.type : row.trigger.kind === "tag" ? card.tags.includes(row.trigger.tag) : row.trigger.kind === "unrest" ? card.tags.includes("unrest") || card.suit === "unrest" : row.trigger.kind === "other";

export function resolveBotCard(args: { G: GameState; bot: BotState; revealedCardId: string; source: "slot"|"bot_deck"|"dynasty_deck"|"discard"|"effect"; table: BotStateTable; }): BotCardResolutionResult {
  const card = args.G.cardDb[args.revealedCardId];
  if (!card) return { cardDestination: "discard", resolvedAny: false, warnings: ["missing card"] };
  const rows = args.table.rows.filter((r) => match(r, card)).sort((a,b)=>a.priority-b.priority);
  for (const row of rows) {
    if (!row.effects.length) continue;
    let destination: "discard"|"history"|"play" = "discard";
    for (const effect of row.effects) {
      if (effect.op === "bot_put_revealed_card_into_history") destination = "history";
      if (effect.op === "bot_play_revealed_card") destination = "play";
    }
    if (destination === "history") args.bot.botHistory.push(card.id); else if (destination === "play") args.bot.botPlayArea.push(card.id); else args.bot.botDiscard.push(card.id);
    return { resolvedRowId: row.id, cardDestination: destination, resolvedAny: true, warnings: [] };
  }
  args.bot.botDiscard.push(card.id);
  return { cardDestination: "discard", resolvedAny: false, warnings: ["unresolved fallback"] };
}
