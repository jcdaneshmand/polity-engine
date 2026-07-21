import { describe, expect, it } from "vitest";
import { createLocalGameExport, createLocalGameRestoreEnhancer, createLocalSaveMetadata, formatLocalGameExportFilename, importLocalGameExport, loadSavedLocalGameRecord, parseSavedLocalGame, serializeLocalGame, upsertLocalGameSlot } from "./localGameSave";

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
      metadata: {
        slotName: "Autosave",
        mode: "multiplayer",
        playerCount: 2,
        currentPlayer: "1",
        enabledExpansions: [],
        enabledVariants: [],
        dataSource: "private"
      },
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

  it("creates public-safe metadata from a boardgame state", () => {
    const metadata = createLocalSaveMetadata({
      slotName: "Trade Routes check",
      privateDataFingerprint: "placeholder",
      state: {
        G: {
          round: 3,
          options: {
            mode: "multiplayer",
            playerCount: 2,
            commonsSetId: "horizons",
            enabledExpansions: ["trade_routes"],
            enabledVariants: ["quick_setup"]
          },
          players: {
            "1": { hand: ["hidden-hand-card"], deck: ["hidden-deck-card"] },
            "2": { hand: ["opponent-hidden-card"] }
          },
          cardDb: {
            hidden: { privateName: "Private Hidden", rawEffectTextPrivate: "Private text" }
          }
        },
        ctx: { currentPlayer: "2" }
      }
    });

    expect(metadata).toEqual({
      slotName: "Trade Routes check",
      mode: "multiplayer",
      playerCount: 2,
      commonsSetId: "horizons",
      round: 3,
      currentPlayer: "2",
      enabledExpansions: ["trade_routes"],
      enabledVariants: ["quick_setup"],
      dataSource: "placeholder"
    });
    expect(JSON.stringify(metadata)).not.toContain("hidden-hand-card");
    expect(JSON.stringify(metadata)).not.toContain("Private Hidden");
    expect(JSON.stringify(metadata)).not.toContain("Private text");
  });

  it("upserts named save slots by most recent metadata first", () => {
    const first = parseSavedLocalGame(serializeLocalGame({
      slotName: "Autosave",
      privateDataFingerprint: "placeholder",
      now: new Date("2026-07-14T05:00:00.000Z"),
      state: { G: { options: { mode: "solo", playerCount: 1 } }, ctx: { currentPlayer: "1" } }
    }))!;
    const second = parseSavedLocalGame(serializeLocalGame({
      slotName: "Trade Routes",
      privateDataFingerprint: "placeholder",
      now: new Date("2026-07-14T06:00:00.000Z"),
      state: { G: { options: { mode: "multiplayer", playerCount: 2, enabledExpansions: ["trade_routes"] } }, ctx: { currentPlayer: "2" } }
    }))!;

    expect(upsertLocalGameSlot([first], second).map((slot) => slot.metadata.slotName)).toEqual(["Trade Routes", "Autosave"]);
    expect(upsertLocalGameSlot([first], { ...second, metadata: { ...second.metadata, slotName: "Autosave" } })).toHaveLength(1);
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
    const envelope = parseSavedLocalGame(serializeLocalGame({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      now: new Date("2026-07-14T05:00:00.000Z"),
      state: restoredState
    }));
    const enhancer = createLocalGameRestoreEnhancer(envelope ?? undefined);
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
      metadata: {
        slotName: "Autosave",
        mode: "unknown",
        enabledExpansions: [],
        enabledVariants: [],
        dataSource: "private"
      },
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
    }))).toEqual({ kind: "invalid", reason: "Unsupported local game export version." });
  });

  it("rejects corrupt imported JSON with a reason", () => {
    expect(importLocalGameExport("{not json")).toEqual({ kind: "invalid", reason: "Local game export is not valid JSON." });
  });

  it("rejects private-data fingerprint mismatches with a reason", () => {
    const exported = createLocalGameExport({
      privateDataFingerprint: "private-a",
      state: { G: { options: { playerCount: 2, mode: "multiplayer" } }, ctx: { numPlayers: 2 } }
    });

    expect(importLocalGameExport(exported.content, { expectedPrivateDataFingerprint: "private-b" })).toEqual({
      kind: "invalid",
      reason: "Local game export was saved with different private data."
    });
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
