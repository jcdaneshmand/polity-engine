import type { Game } from "boardgame.io";
import { createInitialGameState } from "./initialState";
import type { GameState } from "./state";
import { acquireCard, endTurnMove, playCard, resolveChoice, resolveCleanupMarketResource, resolveDevelopmentChoice } from "./moves";
import { onTurnBegin, onTurnEnd } from "./turn";
import type { GameOptions } from "../options/gameOptions";

export const PrototypeGame: Game<GameState> = {
  name: "prototype-game",
  setup: (_ctx, setupData?: { playerNationIds?: Record<string, string>; options?: GameOptions; usePrivateData?: boolean; privateCardPath?: string; privateNationPath?: string; privateRulesetPath?: string; privateStrategyPath?: string }) =>
    createInitialGameState({
      playerNationIds: setupData?.playerNationIds,
      options: setupData?.options,
      usePrivateData: setupData?.usePrivateData,
      privateCardPath: setupData?.privateCardPath,
      privateNationPath: setupData?.privateNationPath,
      privateRulesetPath: setupData?.privateRulesetPath,
      privateStrategyPath: setupData?.privateStrategyPath
    }),
  endIf: ({ G }) => G.gameover,
  turn: { onBegin: ({ G, ctx, random }) => onTurnBegin(G, ctx, random?.Number), onEnd: ({ G, ctx, random }) => onTurnEnd(G, ctx, random?.Number) },
  moves: { playCard, acquireCard, resolveChoice, resolveDevelopmentChoice, resolveCleanupMarketResource, endTurn: endTurnMove }
};
