import type { Game } from "boardgame.io";
import { TurnOrder } from "boardgame.io/core";
import { createInitialGameState } from "./initialState";
import type { GameState } from "./state";
import { endTurnMove, exhaustCard, innovateTurn, playCard, profitCard, resolveAcquireChoice, resolveBreakThroughChoice, resolveChoice, resolveCleanupDiscard, resolveCleanupMarketResource, resolveDevelopmentChoice, resolveDiscardChoice, resolveDrawChoice, resolveExileChoice, resolveFindChoice, resolveFreePlayChoice, resolveGarrisonChoice, resolveGiveCardChoice, resolveLookOrderChoice, resolveLookTakeChoice, resolveMarketCardChoice, resolveMarketResourcePlacement, resolvePlaceOnDeckChoice, resolveReactiveExhaustChoice, resolveRegionChoice, resolveReturnExhaustTokenChoice, resolveReturnFameChoice, resolveReturnUnrestChoice, resolveShortGameDevelopmentExileChoice, resolveSolsticeOrderChoice, resolveSwapChoice, resolveTradeChoice, resolveUnrestAllocationChoice, revoltTurn, skipDevelopmentChoice, skipExileChoice, skipReactiveExhaustChoice } from "./moves";
import { onTurnBegin, onTurnEnd } from "./turn";
import type { GameOptions } from "../options/gameOptions";
import type { PrivateDataBundle } from "../setup/privateDataBundle";
import { redactGameStateForPlayer } from "./playerView";

function gamePlayerIdForSeat(G: GameState, playerID?: string | null): string | undefined {
  if (playerID == null) return undefined;
  if (G.players[playerID]) return playerID;
  const mappedPlayerId = G.playOrder?.[Number(playerID)];
  return mappedPlayerId && G.players[mappedPlayerId] ? mappedPlayerId : playerID;
}

function engineCtx(G: GameState, ctx: any): any {
  return {
    ...ctx,
    currentPlayer: gamePlayerIdForSeat(G, ctx?.currentPlayer) ?? ctx?.currentPlayer,
    playOrder: G.playOrder ?? ctx?.playOrder
  };
}

function engineMove(move: (...args: any[]) => any): (...args: any[]) => any {
  return (args: any, ...moveArgs: any[]) => move({ ...args, ctx: engineCtx(args.G, args.ctx) }, ...moveArgs);
}

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
  playerView: ({ G, playerID }) => redactGameStateForPlayer(G, gamePlayerIdForSeat(G, playerID)),
  turn: { order: TurnOrder.CUSTOM_FROM("seatOrder"), onBegin: ({ G, ctx, random }) => onTurnBegin(G, engineCtx(G, ctx), random?.Number), onEnd: ({ G, ctx, random }) => onTurnEnd(G, engineCtx(G, ctx), random?.Number) },
  moves: {
    playCard: engineMove(playCard),
    profitCard: engineMove(profitCard),
    exhaustCard: engineMove(exhaustCard),
    innovateTurn: engineMove(innovateTurn),
    revoltTurn: engineMove(revoltTurn),
    resolveChoice: engineMove(resolveChoice),
    resolveDrawChoice: engineMove(resolveDrawChoice),
    resolveFindChoice: engineMove(resolveFindChoice),
    resolveAcquireChoice: engineMove(resolveAcquireChoice),
    resolveMarketCardChoice: engineMove(resolveMarketCardChoice),
    resolveExileChoice: engineMove(resolveExileChoice),
    skipExileChoice: engineMove(skipExileChoice),
    resolveBreakThroughChoice: engineMove(resolveBreakThroughChoice),
    resolveGarrisonChoice: engineMove(resolveGarrisonChoice),
    resolveRegionChoice: engineMove(resolveRegionChoice),
    resolveDevelopmentChoice: engineMove(resolveDevelopmentChoice),
    skipDevelopmentChoice: engineMove(skipDevelopmentChoice),
    resolveShortGameDevelopmentExileChoice: engineMove(resolveShortGameDevelopmentExileChoice),
    resolveTradeChoice: engineMove(resolveTradeChoice),
    resolveDiscardChoice: engineMove(resolveDiscardChoice),
    resolveMarketResourcePlacement: engineMove(resolveMarketResourcePlacement),
    resolveReturnUnrestChoice: engineMove(resolveReturnUnrestChoice),
    resolveReturnFameChoice: engineMove(resolveReturnFameChoice),
    resolvePlaceOnDeckChoice: engineMove(resolvePlaceOnDeckChoice),
    resolveReturnExhaustTokenChoice: engineMove(resolveReturnExhaustTokenChoice),
    resolveFreePlayChoice: engineMove(resolveFreePlayChoice),
    resolveGiveCardChoice: engineMove(resolveGiveCardChoice),
    resolveSwapChoice: engineMove(resolveSwapChoice),
    resolveLookOrderChoice: engineMove(resolveLookOrderChoice),
    resolveLookTakeChoice: engineMove(resolveLookTakeChoice),
    resolveUnrestAllocationChoice: engineMove(resolveUnrestAllocationChoice),
    resolveReactiveExhaustChoice: engineMove(resolveReactiveExhaustChoice),
    skipReactiveExhaustChoice: engineMove(skipReactiveExhaustChoice),
    resolveSolsticeOrderChoice: engineMove(resolveSolsticeOrderChoice),
    resolveCleanupMarketResource: engineMove(resolveCleanupMarketResource),
    resolveCleanupDiscard: engineMove(resolveCleanupDiscard),
    endTurn: engineMove(endTurnMove)
  }
};
