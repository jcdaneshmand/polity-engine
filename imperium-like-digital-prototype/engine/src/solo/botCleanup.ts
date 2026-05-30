import type { BotState } from "./botTypes";
import type { GameState } from "../game/state";
import { triggerScoring } from "../game/scoring";

function shuffleWithRandom<T>(items: T[], randomNumber?: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const roll = randomNumber ? randomNumber() : 0;
    const j = Math.floor(roll * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function rebuildBotDeckFromDiscard(bot: BotState, options?: { G?: GameState; randomNumber?: () => number }): void {
  if (bot.botDeck.length) return;
  const dynastyCardId = bot.botDynastyDeck.shift();
  if (dynastyCardId) {
    bot.botDiscard.push(dynastyCardId);
    if (bot.botDynastyDeck.length === 0 && options?.G) triggerScoring(options.G, "bot_dynasty_deck_empty", bot.botId);
  }
  if (bot.botDiscard.length) bot.botDeck.push(...shuffleWithRandom(bot.botDiscard.splice(0), options?.randomNumber));
}

function drawBotCard(bot: BotState, options?: { G?: GameState; randomNumber?: () => number }): string | undefined {
  if (!bot.botDeck.length) rebuildBotDeckFromDiscard(bot, options);
  return bot.botDeck.shift();
}

export function runBotCleanup(bot: BotState, options?: { G?: GameState; randomNumber?: () => number }): void {
  if (bot.unresolvedSlot && bot.slots[bot.unresolvedSlot]?.cardId) {
    bot.slots[1].cardId = bot.slots[bot.unresolvedSlot].cardId;
    bot.slots[1].face = "down";
    if (bot.unresolvedSlot !== 1) bot.slots[bot.unresolvedSlot].cardId = undefined;
  }
  for (const slot of Object.values(bot.slots)) {
    if (!slot.cardId) slot.cardId = drawBotCard(bot, options);
    slot.face = slot.cardId ? "down" : slot.face;
    slot.blockedByDie = false;
  }
  if (bot.difficulty === "warlord") {
    const discarded = bot.botDeck.shift();
    if (discarded) bot.botDiscard.push(discarded);
  }
}
