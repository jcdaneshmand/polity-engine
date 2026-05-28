import type { Game } from "boardgame.io";
import { createInitialGameState } from "./initialState";
import type { GameState } from "./state";
import { acquireCard, endTurnMove, playCard } from "./moves";
import { onTurnBegin, onTurnEnd } from "./turn";

export const PrototypeGame: Game<GameState> = {
  name: "prototype-game",
  setup: (_ctx, setupData?: { playerNationIds?: Record<string, string> }) => createInitialGameState({ playerNationIds: setupData?.playerNationIds }),
  turn: { onBegin: ({ G, ctx }) => onTurnBegin(G, ctx), onEnd: ({ G, ctx }) => onTurnEnd(G, ctx) },
  moves: { playCard, acquireCard, endTurn: endTurnMove }
};
