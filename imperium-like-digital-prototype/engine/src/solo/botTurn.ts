import type { GameState } from "../game/state";

export function runBotTurn(G: GameState): void {
  if (!G.solo) return;
  const bot = G.solo.bot;
  if (bot.botDeck.length === 0 && bot.botDiscard.length > 0) {
    bot.botDeck = [...bot.botDiscard];
    bot.botDiscard = [];
  }
  const card = bot.botDeck.shift();
  if (card) {
    bot.log.push({ round: G.round, playerId: bot.botId, message: `Bot resolved ${card}.` });
    bot.botDiscard.push(card);
    G.log.push({ round: G.round, playerId: bot.botId, message: `Bot turn resolved ${card}.` });
  } else {
    G.log.push({ round: G.round, playerId: bot.botId, message: "Bot had no card to resolve." });
  }
}
