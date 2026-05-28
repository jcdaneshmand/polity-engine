import type { GameOptions } from "./gameOptions";
import type { OptionValidationIssue } from "./optionValidation";
import type { GameState, PlayerState } from "../game/state";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";

export type SetupContext = {
  options: GameOptions;
  players: Record<string, PlayerState>;
  cards: NormalizedCardRecord[];
  setupReport: { delayedAggressiveCount: number; usedQuickSetup: boolean; shortGameExiled: number; shortGameNationAdvanced: number };
  gameState?: GameState;
};

export type PlayerSetupHook = (ctx: SetupContext) => void;
export type CommonsSetupHook = (ctx: SetupContext) => void;
export type DeckConstructionHook = (ctx: SetupContext) => void;
export type MarketSetupHook = (ctx: SetupContext) => void;
export type FameSetupHook = (ctx: SetupContext) => void;
export type CleanupHook = (G: GameState, playerId: string, options: GameOptions) => void;
export type GameEndHook = (G: GameState, options: GameOptions) => void;
export type LegalMovesHook = (G: GameState, playerId: string, options: GameOptions) => { canVoluntaryDiscardCleanup: boolean };

export type RulesModule = {
  id: string;
  kind: "expansion" | "variant" | "mode" | "solo_difficulty";
  validateOptions?: (options: GameOptions) => OptionValidationIssue[];
  modifyPlayerSetup?: PlayerSetupHook;
  modifyCommonsSetup?: CommonsSetupHook;
  modifyDeckConstruction?: DeckConstructionHook;
  modifyMarketSetup?: MarketSetupHook;
  modifyFameSetup?: FameSetupHook;
  modifyCleanup?: CleanupHook;
  modifyGameEnd?: GameEndHook;
  modifyLegalMoves?: LegalMovesHook;
};
