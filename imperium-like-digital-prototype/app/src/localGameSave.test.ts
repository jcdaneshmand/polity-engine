import { describe, expect, it } from "vitest";
import { createLocalGameRestoreEnhancer, loadSavedLocalGameRecord, parseSavedLocalGame, serializeLocalGame } from "./localGameSave";

describe("local game save envelope", () => {
  it("serializes a versioned local game envelope", () => {
    const raw = serializeLocalGame({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      now: new Date("2026-07-14T05:00:00.000Z"),
      state: {
        options: { playerCount: 2, mode: "multiplayer" },
        ctx: { currentPlayer: "1", turn: 4 },
        players: { "1": { hand: ["fixture_action_gain_materials"] } }
      }
    });

    expect(JSON.parse(raw)).toEqual({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: {
        options: { playerCount: 2, mode: "multiplayer" },
        ctx: { currentPlayer: "1", turn: 4 },
        players: { "1": { hand: ["fixture_action_gain_materials"] } }
      }
    });
  });

  it("parses a valid saved game and preserves turn state", () => {
    const parsed = parseSavedLocalGame(JSON.stringify({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: {
        options: { enabledVariants: ["quick_setup"] },
        turn: { currentPlayer: "2", round: 3 }
      }
    }));

    expect(parsed?.state).toEqual({
      options: { enabledVariants: ["quick_setup"] },
      turn: { currentPlayer: "2", round: 3 }
    });
  });

  it("rejects corrupt saved JSON", () => {
    expect(parseSavedLocalGame("{not json")).toBeNull();
  });

  it("rejects unsupported versions", () => {
    expect(parseSavedLocalGame(JSON.stringify({
      version: 99,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: {}
    }))).toBeNull();
  });

  it("does not serialize or parse private official fields", () => {
    const state = {
      cardDb: {
        fixture_card: {
          id: "fixture_card",
          rawEffectTextPrivate: "private text must not be saved"
        }
      }
    };

    expect(() => serializeLocalGame({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state
    })).toThrow("private fields");
    expect(parseSavedLocalGame(JSON.stringify({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state
    }))).toBeNull();
  });

  it("loads a valid save from storage", () => {
    const storage = new Map<string, string>();
    const raw = serializeLocalGame({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { G: { options: { playerCount: 2 } }, ctx: { currentPlayer: "1" } }
    });
    storage.set("polity-engine.localGame.v1", raw);

    expect(loadSavedLocalGameRecord({
      getItem: (key) => storage.get(key) ?? null
    })).toEqual({ kind: "valid", envelope: parseSavedLocalGame(raw) });
  });

  it("reports corrupt saved storage for a visible recovery path", () => {
    expect(loadSavedLocalGameRecord({
      getItem: () => "{not json"
    })).toEqual({ kind: "corrupt" });
  });

  it("restores a saved state through a Redux enhancer", () => {
    const restoredState = { G: { players: { "1": { hand: ["fixture_action_gain_materials"] } } }, ctx: { currentPlayer: "1" } };
    const enhancer = createLocalGameRestoreEnhancer({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: restoredState
    });
    const createStore = (reducer: (state: unknown, action: { type: string }) => unknown, preloadedState: unknown) => ({
      getState: () => preloadedState,
      dispatch: (action: { type: string }) => action,
      subscribe: () => () => undefined,
      replaceReducer: () => undefined
    });
    const store = enhancer(createStore as any)((state: unknown = { G: "fresh" }) => state, { G: "fresh" });

    expect(store.getState()).toEqual(restoredState);
  });
});
