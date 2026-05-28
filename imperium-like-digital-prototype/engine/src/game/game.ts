import type { Game } from "boardgame.io";
import { createInitialGameState } from "./initialState";
import type { GameState } from "./state";
import { acquireCard, endTurnMove, playCard } from "./moves";
import { onTurnBegin, onTurnEnd } from "./turn";
import type { GameOptions } from "../options/gameOptions";

export const PrototypeGame: Game<GameState> = {
  name: "prototype-game",
  setup: (_ctx, setupData?: { playerNationIds?: Record<string, string>; options?: GameOptions }) =>
    createInitialGameState({ playerNationIds: setupData?.playerNationIds, options: setupData?.options }),
  endIf: ({ G }) => G.gameover,
  turn: { onBegin: ({ G, ctx, random }) => onTurnBegin(G, ctx, random?.Number), onEnd: ({ G, ctx, random }) => onTurnEnd(G, ctx, random?.Number) },
  moves: { playCard, acquireCard, endTurn: endTurnMove }
};
