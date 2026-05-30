import type { GameLogEntry, ResourceName } from "../game/state";
import type { SoloDifficulty } from "../options/gameOptions";
import type { BotOverride } from "../nations/nationRulesetTypes";
import type { SoloDifficultyConfig } from "./botDifficulty";
import type { BotStateTable } from "./botStateTableTypes";
import type { BotTradeRoutesTable } from "./botTradeRoutesTypes";

export type BotId = string;
export type SlotNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type BotSlot = {
  slotNumber: SlotNumber;
  cardId?: string;
  face: "up" | "down";
  blockedByDie?: boolean;
  markerResource?: ResourceName;
  markerCount?: number;
};

export type BotState = {
  botId: BotId;
  botNationId: string;
  botDeck: string[];
  botDiscard: string[];
  botHistory: string[];
  botPlayArea: string[];
  botDynastyDeck: string[];
  botStateTableId: string;
  botStateSide: string;
  stateTokens?: Record<string, Partial<Record<ResourceName, number>>>;
  slots: Record<number, BotSlot>;
  resources: Partial<Record<ResourceName, number>>;
  merchantState?: "none" | "merchants" | "merchant_empire";
  difficulty: SoloDifficulty;
  difficultyConfig: SoloDifficultyConfig;
  customCleanupEffects?: Extract<BotOverride, { op: "bot_custom_cleanup" }>["effect"];
  unresolvedSlot?: SlotNumber;
  revealedSlotCard?: { slotNumber: SlotNumber; cardId: string };
  lastDieRoll?: number;
  botLog: GameLogEntry[];
};

export type SoloState = {
  bot: BotState;
  botStateTables: Record<string, BotStateTable>;
  botTradeRoutesTables?: Record<string, BotTradeRoutesTable>;
  pausedBotTurn?: { remainingSlotNumbers: SlotNumber[]; effectsRemaining?: number };
};
