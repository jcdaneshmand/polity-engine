import { Client } from "boardgame.io/client";
import { describe, expect, it, vi } from "vitest";
import { PrototypeGame } from "../game/game";
import { createInitialGameState } from "../game/initialState";
import { canUndoLastMove } from "../game/undoPolicy";

function clientFor(effect: any, mode: "practice" | "multiplayer" = "practice") {
  const playerCount = mode === "multiplayer" ? 2 : 1;
  const game = { ...PrototypeGame, setup: () => {
    const G = createInitialGameState({ options: { mode, playerCount, enabledExpansions: [], enabledVariants: [] }, randomSeed: "undo-fixture" });
    G.cardDb.undo_fixture = { id: "undo_fixture", displayName: "Undo Fixture", type: "action", cardType: "action", cost: 0, tags: [], effects: [effect] } as any;
    G.players["1"].hand = ["undo_fixture"];
    G.players["1"].deck = ["undo_fixture"];
    G.players["1"].actionsRemaining = 3; G.players["1"].actionTokensAvailable = 3;
    return G;
  } };
  const client = Client({ game, numPlayers: playerCount, playerID: "0", debug: false });
  client.start(); return client;
}

describe("authoritative undo boundaries", () => {
  it("blocks a one-card look even when the deck does not change", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = clientFor({ trigger: "on_play", op: "look_cards", source: "deck", count: 1 });
    try {
      const deck = [...client.store.getState().G.players["1"].deck];
      client.moves.playCard("undo_fixture");
      const after = JSON.parse(JSON.stringify(client.getState()!.G));
      expect(after.lookedCards.cardIds).toEqual(deck);
      expect(client.store.getState().G.players["1"].deck).toEqual(deck);
      expect(canUndoLastMove(after)).toBe(false);
      client.undo();
      expect(JSON.parse(JSON.stringify(client.getState()!.G))).toEqual(after);
    } finally { client.stop(); errors.mockRestore(); }
  });
  it("reverses a public resource gain and restores state", () => {
    const client = clientFor({ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 });
    try {
      const before = JSON.parse(JSON.stringify(client.getState()!.G));
      client.moves.playCard("undo_fixture");
      expect(client.getState()!.G.lastMoveUndoable).toBe(true);
      expect(client.getState()!.G.players["1"].resources.materials).toBe(before.players["1"].resources.materials + 1);
      client.undo();
      expect(JSON.parse(JSON.stringify(client.getState()!.G))).toEqual(before);
    } finally { client.stop(); }
  });
  it.each(["practice", "multiplayer"] as const)("blocks hidden draws in %s even after resolution", (mode) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = clientFor({ trigger: "on_play", op: "draw", count: 1 }, mode);
    try {
      client.moves.playCard("undo_fixture");
      const before = JSON.parse(JSON.stringify(client.getState()!.G));
      expect(canUndoLastMove(client.getState()!.G)).toBe(false);
      client.undo();
      expect(JSON.parse(JSON.stringify(client.getState()!.G))).toEqual(before);
    } finally { client.stop(); errors.mockRestore(); }
  });
  it("rejects invalid active-player moves without changing state or history", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = clientFor({ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 });
    try {
      const before = client.getState()!;
      client.moves.playCard("not-in-hand");
      expect(client.getState()!.G).toEqual(before.G);
      expect(client.getState()!._stateID).toBe(before._stateID);
    } finally { client.stop(); errors.mockRestore(); }
  });

  it("blocks undo both before and after a pending choice reveals hidden draw information", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = clientFor({
      trigger: "on_play",
      op: "choose_one",
      choices: [
        [{ trigger: "on_play", op: "draw", count: 1 }],
        [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }]
      ]
    });
    try {
      client.moves.playCard("undo_fixture");
      const pending = JSON.parse(JSON.stringify(client.getState()!.G));
      expect(pending.pendingChoice?.playerId).toBe("1");
      expect(canUndoLastMove(pending)).toBe(false);
      client.undo();
      expect(JSON.parse(JSON.stringify(client.getState()!.G))).toEqual(pending);

      client.moves.resolveChoice(0);
      const revealed = JSON.parse(JSON.stringify(client.getState()!.G));
      expect(revealed.pendingChoice).toBeUndefined();
      expect(canUndoLastMove(revealed)).toBe(false);
      client.undo();
      expect(JSON.parse(JSON.stringify(client.getState()!.G))).toEqual(revealed);
    } finally { client.stop(); errors.mockRestore(); }
  });
});
