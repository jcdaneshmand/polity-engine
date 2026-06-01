import type { BotState } from "./botTypes";
import type { GameState } from "../game/state";
import { triggerScoring } from "../game/scoring";

function isAccessionCard(G: GameState | undefined, cardId: string): boolean {
  const card = G?.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "accession" || Boolean(card?.tags?.includes("accession"));
}

function flipBotStateTableForAccession(bot: BotState, G: GameState | undefined, accessionCardId: string): void {
  const tables = G?.solo?.botStateTables;
  if (!tables) return;
  const current = tables[bot.botStateTableId];
  const targetSide = (current?.side ?? bot.botStateSide) === "S" ? "F" : "S";
  const tableBaseId = current?.id ?? bot.botStateTableId.replace(/_[^_]+$/, "");
  const targetEntry = Object.entries(tables).find(([, table]) => table.id === tableBaseId && table.side === targetSide);
  if (!targetEntry) return;
  const [targetTableId] = targetEntry;
  bot.botStateTableId = targetTableId;
  bot.botStateSide = targetSide;
  G.log.push({ round: G.round, playerId: bot.botId, message: `BotStateTableFlipped(${targetTableId}/${accessionCardId})` });
}

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
    if (isAccessionCard(options?.G, dynastyCardId)) {
      if (bot.skipAccessionStateFlip) {
        options?.G?.log.push({ round: options.G.round, playerId: bot.botId, message: `BotStateTableFlipSkipped(${dynastyCardId})` });
      } else {
        flipBotStateTableForAccession(bot, options?.G, dynastyCardId);
      }
    }
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
