import type { Game } from "boardgame.io";
import { TurnOrder } from "boardgame.io/core";
import { createInitialGameState } from "./initialState";
import type { GameState } from "./state";
import { endTurnMove, exhaustCard, innovateTurn, playCard, profitCard, resolveAcquireChoice, resolveBreakThroughChoice, resolveChoice, resolveCleanupDiscard, resolveCleanupMarketResource, resolveDevelopmentChoice, resolveDiscardChoice, resolveDrawChoice, resolveExileChoice, resolveFindChoice, resolveGarrisonChoice, resolveGiveCardChoice, resolveLookOrderChoice, resolveMarketCardChoice, resolvePlaceOnDeckChoice, resolveReactiveExhaustChoice, resolveRegionChoice, resolveReturnExhaustTokenChoice, resolveReturnFameChoice, resolveReturnUnrestChoice, resolveShortGameDevelopmentExileChoice, resolveSolsticeOrderChoice, resolveSwapChoice, resolveTradeChoice, resolveUnrestAllocationChoice, revoltTurn, skipDevelopmentChoice, skipExileChoice, skipReactiveExhaustChoice } from "./moves";
import { onTurnBegin, onTurnEnd } from "./turn";
import type { GameOptions } from "../options/gameOptions";
import type { PrivateDataBundle } from "../setup/privateDataBundle";

export const PrototypeGame: Game<GameState> = {
  name: "polity-engine",
  setup: (_ctx, setupData?: { playerNationIds?: Record<string, string>; soloBotNationId?: string; options?: GameOptions; randomSeed?: string; usePrivateData?: boolean; privateData?: PrivateDataBundle; privateCardPath?: string; privateNationPath?: string; privateRulesetPath?: string; privateStrategyPath?: string; privateBotStateTablePath?: string; privateBotTradeRoutesTablePath?: string }) =>
    createInitialGameState({
      playerNationIds: setupData?.playerNationIds,
      soloBotNationId: setupData?.soloBotNationId,
      options: setupData?.options,
      randomSeed: setupData?.randomSeed,
      usePrivateData: setupData?.usePrivateData,
      privateData: setupData?.privateData,
      privateCardPath: setupData?.privateCardPath,
      privateNationPath: setupData?.privateNationPath,
      privateRulesetPath: setupData?.privateRulesetPath,
      privateStrategyPath: setupData?.privateStrategyPath,
      privateBotStateTablePath: setupData?.privateBotStateTablePath,
      privateBotTradeRoutesTablePath: setupData?.privateBotTradeRoutesTablePath
    }),
  endIf: ({ G }) => G.gameover,
  turn: { order: TurnOrder.CUSTOM_FROM("playOrder"), onBegin: ({ G, ctx, random }) => onTurnBegin(G, ctx, random?.Number), onEnd: ({ G, ctx, random }) => onTurnEnd(G, ctx, random?.Number) },
  moves: { playCard, profitCard, exhaustCard, innovateTurn, revoltTurn, resolveChoice, resolveDrawChoice, resolveFindChoice, resolveAcquireChoice, resolveMarketCardChoice, resolveExileChoice, skipExileChoice, resolveBreakThroughChoice, resolveGarrisonChoice, resolveRegionChoice, resolveDevelopmentChoice, skipDevelopmentChoice, resolveShortGameDevelopmentExileChoice, resolveTradeChoice, resolveDiscardChoice, resolveReturnUnrestChoice, resolveReturnFameChoice, resolvePlaceOnDeckChoice, resolveReturnExhaustTokenChoice, resolveGiveCardChoice, resolveSwapChoice, resolveLookOrderChoice, resolveUnrestAllocationChoice, resolveReactiveExhaustChoice, skipReactiveExhaustChoice, resolveSolsticeOrderChoice, resolveCleanupMarketResource, resolveCleanupDiscard, endTurn: endTurnMove }
};
