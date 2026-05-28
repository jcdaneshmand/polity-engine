import type { Game } from "boardgame.io";
import { createInitialGameState } from "./initialState";
import type { GameState } from "./state";
import { acquireCard, endTurnMove, playCard } from "./moves";
import { onTurnBegin, onTurnEnd } from "./turn";

export const PrototypeGame: Game<GameState> = {
  name: "prototype-game",
  setup: (_ctx, setupData?: { playerNationIds?: Record<string, string>; enabledExpansions?: ("trade_routes")[] }) =>
    createInitialGameState({ playerNationIds: setupData?.playerNationIds, enabledExpansions: setupData?.enabledExpansions ?? [] }),
  turn: {
    onBegin: ({ G, ctx, random }) => onTurnBegin(G, ctx, random?.Number),
    onEnd: ({ G, ctx }) => onTurnEnd(G, ctx)
  },
  moves: { playCard, acquireCard, endTurn: endTurnMove }
};
