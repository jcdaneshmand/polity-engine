import type { GameState } from "../game/state";
import { runBotCleanup } from "./botCleanup";
import { resolveBotCard } from "./botStateTableResolver";
import { getResolvableBotSlots, revealSlotCard, rollAndBlockSlot } from "./botSlots";

export function runBotTurn(args: { G: GameState; rollDie?: () => number }): GameState {
  const { G } = args;
  if (!G.solo) return G;
  const bot = G.solo.bot;
  const roll = args.rollDie ? args.rollDie() : Math.floor(Math.random() * 6) + 1;
  rollAndBlockSlot(bot, roll);
  const table = G.solo.botStateTables[bot.botStateTableId];
  for (const slot of getResolvableBotSlots(bot)) {
    const cardId = revealSlotCard(bot, slot.slotNumber);
    if (!cardId || !table) continue;
    resolveBotCard({ G, bot, revealedCardId: cardId, source: "slot", table });
    slot.cardId = undefined;
  }
  runBotCleanup(bot);
  G.log.push(...bot.botLog.splice(0));
  return G;
}
