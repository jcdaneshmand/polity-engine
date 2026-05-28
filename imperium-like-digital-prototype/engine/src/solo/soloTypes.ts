import type { SoloDifficulty } from "../options/gameOptions";
import type { GameLogEntry, ResourceName } from "../game/state";

export type BotState = {
  botId: string;
  botDeck: string[];
  botDiscard: string[];
  botStateCards: string[];
  difficulty: SoloDifficulty;
  resources: Partial<Record<ResourceName, number>>;
  log: GameLogEntry[];
};
