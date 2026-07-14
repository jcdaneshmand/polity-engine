import { describe, expect, it } from "vitest";
import { createLocalGameExport, createLocalGameRestoreEnhancer, formatLocalGameExportFilename, importLocalGameExport, loadSavedLocalGameRecord, parseSavedLocalGame, serializeLocalGame } from "./localGameSave";

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

  it("exports a versioned JSON envelope without private official fields", () => {
    const exported = createLocalGameExport({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { G: { cardDb: { fixture_card: { id: "fixture_card", displayName: "Fixture" } } } },
      now: new Date("2026-07-14T05:06:07.000Z")
    });

    expect(exported.fileName).toBe("polity-local-game-20260714-050607.json");
    expect(JSON.parse(exported.content)).toEqual({
      version: 1,
      savedAtIso: "2026-07-14T05:06:07.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { G: { cardDb: { fixture_card: { id: "fixture_card", displayName: "Fixture" } } } }
    });
  });

  it("formats export filenames from the save timestamp", () => {
    expect(formatLocalGameExportFilename(new Date("2026-12-03T04:05:06.000Z"))).toBe("polity-local-game-20261203-040506.json");
  });

  it("imports a valid exported game", () => {
    const exported = createLocalGameExport({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { G: { options: { playerCount: 2, mode: "multiplayer" } }, ctx: { numPlayers: 2 } },
      now: new Date("2026-07-14T05:00:00.000Z")
    });

    expect(importLocalGameExport(exported.content)).toEqual({
      kind: "valid",
      envelope: parseSavedLocalGame(exported.content)
    });
  });

  it("rejects unsupported imported versions with a reason", () => {
    expect(importLocalGameExport(JSON.stringify({
      version: 99,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: {}
    }))).toEqual({ kind: "invalid", reason: "Unsupported or invalid local game export." });
  });

  it("rejects malformed imported state before replacing the active game", () => {
    expect(importLocalGameExport(JSON.stringify({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { ctx: { numPlayers: 2 } }
    }))).toEqual({ kind: "invalid", reason: "Local game export does not contain a resumable game state." });
  });
});
