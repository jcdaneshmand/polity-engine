import { Client } from "boardgame.io/client";
import { describe, expect, it } from "vitest";
import { PrototypeGame } from "../../engine/src/game/game";
import { createInitialGameState } from "../../engine/src/game/initialState";
import { createLocalGameRestoreEnhancer, importLocalGameExport, serializeLocalGame } from "./localGameSave";

describe("authoritative local persistence", () => {
  it("preserves hidden decks and RNG state through save, restore, and the next move", () => {
    const game = { ...PrototypeGame, setup: () => {
      const G = createInitialGameState({ options: { mode: "practice", playerCount: 1, enabledExpansions: [], enabledVariants: [] }, randomSeed: "save-regression" });
      G.cardDb.save_draw = { id: "save_draw", displayName: "Save Draw", type: "action", cost: 0, tags: [], effects: [{ trigger: "on_play", op: "draw", count: 1 }] };
      G.players["1"].hand = ["save_draw", "save_draw"];
      G.players["1"].deck = ["save_draw", "save_draw", "save_draw"];
      return G;
    } };
    let saved = "";
    const client = Client({ game, numPlayers: 1, playerID: "0", debug: false, enhancer: createLocalGameRestoreEnhancer(undefined, (state) => {
      saved = serializeLocalGame({ state, privateDataFingerprint: "placeholder", snapshotSource: "authoritative-local" });
    }) });
    client.start();
    let restored: ReturnType<typeof Client> | undefined;
    try {
      expect(client.getState()!.G.players["1"].deck).toEqual([]);
      expect(JSON.parse(saved).state.G.players["1"].deck).toHaveLength(3);
      client.moves.playCard("save_draw");
      expect(JSON.parse(saved).state.G.players["1"].deck).toHaveLength(2);
      const legacyState = client.getState()!;
      const legacy = importLocalGameExport(serializeLocalGame({ state: {
        G: legacyState.G, ctx: legacyState.ctx, plugins: legacyState.plugins,
        _undo: legacyState._undo, _redo: legacyState._redo, _stateID: legacyState._stateID
      }, privateDataFingerprint: "placeholder" }));
      expect(legacy.kind).toBe("valid");
      if (legacy.kind !== "valid") throw new Error(legacy.reason);
      expect(legacy.envelope.snapshotSource).toBe("authoritative-local");
      expect((legacy.envelope.state as any).G.players["1"].deck).toHaveLength(2);
      const mismatched = JSON.parse(serializeLocalGame({ state: legacyState, privateDataFingerprint: "placeholder" }));
      mismatched.state.G.round += 1;
      const rejectedRecovery = importLocalGameExport(JSON.stringify(mismatched));
      if (rejectedRecovery.kind !== "valid") throw new Error(rejectedRecovery.reason);
      expect(rejectedRecovery.envelope.snapshotSource).toBeUndefined();
      const imported = importLocalGameExport(saved);
      expect(imported.kind).toBe("valid");
      if (imported.kind !== "valid") throw new Error(imported.reason);
      expect(imported.envelope.snapshotSource).toBe("authoritative-local");
      restored = Client({ game, numPlayers: 1, playerID: "0", debug: false, enhancer: createLocalGameRestoreEnhancer(imported.envelope) });
      restored.start();
      expect(restored.store.getState()).toEqual(client.store.getState());
      client.moves.playCard("save_draw");
      restored.moves.playCard("save_draw");
      expect(restored.store.getState()).toEqual(client.store.getState());
    } finally { client.stop(); restored?.stop(); }
  });
});
