import type { Game } from "boardgame.io";
import { createInitialGameState } from "./initialState";
import type { GameState } from "./state";
import { endTurnMove, exhaustCard, innovateTurn, playCard, profitCard, resolveAcquireChoice, resolveBreakThroughChoice, resolveChoice, resolveCleanupDiscard, resolveCleanupMarketResource, resolveDevelopmentChoice, resolveDrawChoice, resolveExileChoice, resolveFindChoice, resolveGarrisonChoice, resolveGiveCardChoice, resolveLookOrderChoice, resolvePlaceOnDeckChoice, resolveRegionChoice, resolveReturnUnrestChoice, resolveShortGameDevelopmentExileChoice, resolveSolsticeOrderChoice, resolveSwapChoice, resolveTradeChoice, resolveUnrestAllocationChoice, revoltTurn, skipDevelopmentChoice, skipExileChoice } from "./moves";
import { onTurnBegin, onTurnEnd } from "./turn";
import type { GameOptions } from "../options/gameOptions";

export const PrototypeGame: Game<GameState> = {
  name: "prototype-game",
  setup: (_ctx, setupData?: { playerNationIds?: Record<string, string>; soloBotNationId?: string; options?: GameOptions; randomSeed?: string; usePrivateData?: boolean; privateCardPath?: string; privateNationPath?: string; privateRulesetPath?: string; privateStrategyPath?: string; privateBotStateTablePath?: string; privateBotTradeRoutesTablePath?: string }) =>
    createInitialGameState({
      playerNationIds: setupData?.playerNationIds,
      soloBotNationId: setupData?.soloBotNationId,
      options: setupData?.options,
      randomSeed: setupData?.randomSeed,
      usePrivateData: setupData?.usePrivateData,
      privateCardPath: setupData?.privateCardPath,
      privateNationPath: setupData?.privateNationPath,
      privateRulesetPath: setupData?.privateRulesetPath,
      privateStrategyPath: setupData?.privateStrategyPath,
      privateBotStateTablePath: setupData?.privateBotStateTablePath,
      privateBotTradeRoutesTablePath: setupData?.privateBotTradeRoutesTablePath
    }),
  endIf: ({ G }) => G.gameover,
  turn: { onBegin: ({ G, ctx, random }) => onTurnBegin(G, ctx, random?.Number), onEnd: ({ G, ctx, random }) => onTurnEnd(G, ctx, random?.Number) },
  moves: { playCard, profitCard, exhaustCard, innovateTurn, revoltTurn, resolveChoice, resolveDrawChoice, resolveFindChoice, resolveAcquireChoice, resolveExileChoice, skipExileChoice, resolveBreakThroughChoice, resolveGarrisonChoice, resolveRegionChoice, resolveDevelopmentChoice, skipDevelopmentChoice, resolveShortGameDevelopmentExileChoice, resolveTradeChoice, resolveReturnUnrestChoice, resolvePlaceOnDeckChoice, resolveGiveCardChoice, resolveSwapChoice, resolveLookOrderChoice, resolveUnrestAllocationChoice, resolveSolsticeOrderChoice, resolveCleanupMarketResource, resolveCleanupDiscard, endTurn: endTurnMove }
};
