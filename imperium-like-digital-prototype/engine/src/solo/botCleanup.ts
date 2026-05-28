import type { BotState } from "./botTypes";

function drawBotCard(bot: BotState): string | undefined {
  if (!bot.botDeck.length && bot.botDiscard.length) {
    bot.botDeck.push(...bot.botDiscard.splice(0));
  }
  return bot.botDeck.shift();
}

export function runBotCleanup(bot: BotState): void {
  if (bot.unresolvedSlot && bot.slots[bot.unresolvedSlot]?.cardId) {
    bot.slots[1].cardId = bot.slots[bot.unresolvedSlot].cardId;
    bot.slots[1].face = "down";
    if (bot.unresolvedSlot !== 1) bot.slots[bot.unresolvedSlot].cardId = undefined;
  }
  for (const slot of Object.values(bot.slots)) {
    if (!slot.cardId) slot.cardId = drawBotCard(bot);
    slot.face = slot.cardId ? "down" : slot.face;
    slot.blockedByDie = false;
  }
}
