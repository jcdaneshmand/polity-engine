import type { SoloDifficulty } from "../options/gameOptions";
import type { BotState } from "./soloTypes";

export function createBotState(difficulty: SoloDifficulty): BotState {
  return { botId: "bot_0", botDeck: ["placeholder_bot_action"], botDiscard: [], botStateCards: ["placeholder_bot_state"], difficulty, resources: { goods: 0 }, log: [] };
}
