import { Client } from "boardgame.io/client";
import { InitializeGame } from "boardgame.io/internal";
import { describe, expect, it, vi } from "vitest";
import { PrototypeGame } from "../game/game";
import type { GameState } from "../game/state";

const setupData = {
  options: {
    playerCount: 2,
    mode: "multiplayer",
    commonsSetId: "classics",
    enabledExpansions: [],
    enabledVariants: []
  },
  playerNationIds: {
    "0": "test_nation_sun_coast",
    "1": "test_nation_sun_coast"
  }
};

function startInactivePlayerClient(configureState?: (state: ReturnType<typeof InitializeGame>) => void) {
  const client = Client({
    game: PrototypeGame,
    numPlayers: 2,
    playerID: "1",
    debug: false
  });
  client.start();
  const state = InitializeGame({ game: PrototypeGame, numPlayers: 2, setupData });
  configureState?.(state);
  client.overrideGameState(state);

  return { client, state: requireState(client) };
}

function requireState(client: ReturnType<typeof Client>) {
  const state = client.getState();
  if (state === null) {
    throw new Error("Expected started client to have game state");
  }
  return state;
}

describe("multiplayer move authorization", () => {
  it("rejects an end-turn move submitted by an inactive player", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { client, state: before } = startInactivePlayerClient();

      client.moves.endTurn();

      const after = client.getState();
      if (after === null) {
        throw new Error("Expected client to keep game state after rejected move");
      }
      expect(before.ctx.currentPlayer).toBe("0");
      expect(after.ctx.currentPlayer).toBe("0");
      expect(after._stateID).toBe(before._stateID);
      expect(after.G).toEqual(before.G);
      expect(errorSpy).toHaveBeenCalledWith("ERROR:", "disallowed move: endTurn");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("rejects an action move submitted by an inactive player before engine state changes", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { client, state: before } = startInactivePlayerClient();

      client.moves.playCard("test_action_archive_survey");

      const after = client.getState();
      if (after === null) {
        throw new Error("Expected client to keep game state after rejected move");
      }
      expect(before.ctx.currentPlayer).toBe("0");
      expect(after.ctx.currentPlayer).toBe("0");
      expect(after._stateID).toBe(before._stateID);
      expect(after.G).toEqual(before.G);
      expect(errorSpy).toHaveBeenCalledWith("ERROR:", "disallowed move: playCard");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("rejects a pending-choice resolution submitted by an inactive player", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { client, state: before } = startInactivePlayerClient((state) => {
        state.G = {
          ...state.G,
          pendingChoice: {
            playerId: "1",
            choices: [[{ op: "gain_resource", resource: "material", count: 1 }]]
          }
        };
      });

      client.moves.resolveChoice(0);

      const after = client.getState();
      if (after === null) {
        throw new Error("Expected client to keep game state after rejected move");
      }
      expect(before.ctx.currentPlayer).toBe("0");
      expect((before.G as GameState).pendingChoice).toBeDefined();
      expect(after.ctx.currentPlayer).toBe("0");
      expect(after._stateID).toBe(before._stateID);
      expect(after.G).toEqual(before.G);
      expect(errorSpy).toHaveBeenCalledWith("ERROR:", "disallowed move: resolveChoice");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
