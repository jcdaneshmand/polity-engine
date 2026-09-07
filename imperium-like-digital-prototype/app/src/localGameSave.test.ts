import { describe, expect, it } from "vitest";
import { runEffects } from "../../engine/src/cards/effectRunner";
import { createInitialState } from "../../engine/src/game/initialState";
import { resolveChoice, resolveSolsticeOrderChoice } from "../../engine/src/game/moves";
import { finalizeNormalScoring, triggerScoring } from "../../engine/src/game/scoring";
import type { Card, GameState } from "../../engine/src/game/state";
import { onTurnEnd } from "../../engine/src/game/turn";
import { defaultGameOptions } from "../../engine/src/options/gameOptions";
import { CURRENT_RULES_VERSION, MAX_LOCAL_GAME_EXPORT_BYTES, createLocalGameExport, createLocalGameRestoreEnhancer, createLocalSaveMetadata, formatLocalGameExportFilename, importLocalGameExport, inspectLocalGameExport, loadSavedLocalGameRecord, parseSavedLocalGame, serializeLocalGame, upsertLocalGameSlot } from "./localGameSave";

const compatibleG = <T extends object>(G: T) => ({ rulesVersion: CURRENT_RULES_VERSION, stateVersion: 1, ...G });

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
      stateVersion: 1,
      rulesVersion: CURRENT_RULES_VERSION,
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
      rulesVersion: CURRENT_RULES_VERSION,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: {
        G: compatibleG({ options: { enabledVariants: ["quick_setup"] }, round: 3 }),
        ctx: { currentPlayer: "2" }
      }
    }));

    expect(parsed?.state).toEqual({
      G: compatibleG({ options: { enabledVariants: ["quick_setup"] }, round: 3 }),
      ctx: { currentPlayer: "2" }
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

  it("rejects normalized private names and CSV-style private transcription fields", () => {
    const states = [
      { G: { cardDb: { fixture_card: { id: "fixture_card", privateName: "Private Card Name" } } } },
      { G: { cardRows: [{ card_id: "fixture_card", card_name_private: "Private CSV Name" }] } },
      { G: { botTables: [{ table_id: "fixture_bot", private_effect_text: "Private bot instruction" }] } },
      { G: { rulesets: [{ nationId: "fixture_nation", private_notes: "Private nation note" }] } }
    ];

    for (const state of states) {
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
    }
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
      state: { G: compatibleG({ options: { mode: "solo", playerCount: 1 } }), ctx: { currentPlayer: "1" } }
    }))!;
    const second = parseSavedLocalGame(serializeLocalGame({
      slotName: "Trade Routes",
      privateDataFingerprint: "placeholder",
      now: new Date("2026-07-14T06:00:00.000Z"),
      state: { G: compatibleG({ options: { mode: "multiplayer", playerCount: 2, enabledExpansions: ["trade_routes"] } }), ctx: { currentPlayer: "2" } }
    }))!;

    expect(upsertLocalGameSlot([first], second).map((slot) => slot.metadata.slotName)).toEqual(["Trade Routes", "Autosave"]);
    expect(upsertLocalGameSlot([first], { ...second, metadata: { ...second.metadata, slotName: "Autosave" } })).toHaveLength(1);
  });

  it("loads a valid save from storage", () => {
    const storage = new Map<string, string>();
    const raw = serializeLocalGame({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { G: compatibleG({ options: { playerCount: 2 } }), ctx: { currentPlayer: "1" } }
    });
    storage.set("polity-engine.localGame.v1", raw);

    expect(loadSavedLocalGameRecord({
      getItem: (key) => storage.get(key) ?? null
    })).toEqual({ kind: "valid", envelope: parseSavedLocalGame(raw) });
  });

  it("reports corrupt saved storage for a visible recovery path", () => {
    expect(loadSavedLocalGameRecord({
      getItem: () => "{not json"
    })).toEqual({ kind: "corrupt", reason: "Local game export is not valid JSON." });
  });

  it("reports unsupported saved storage versions with a visible reason", () => {
    expect(loadSavedLocalGameRecord({
      getItem: () => JSON.stringify({
        version: 99,
        savedAtIso: "2026-07-14T05:00:00.000Z",
        privateDataFingerprint: "fictional-fixture-fingerprint",
        state: {}
      })
    })).toEqual({ kind: "corrupt", reason: "Unsupported local game export version." });
  });

  it("restores a saved state through a Redux enhancer", () => {
    const restoredState = { G: compatibleG({ players: { "1": { hand: ["fixture_action_gain_materials"] } } }), ctx: { currentPlayer: "1" } };
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
      state: { G: compatibleG({ cardDb: { fixture_card: { id: "fixture_card", displayName: "Fixture" } } }), ctx: {} },
      now: new Date("2026-07-14T05:06:07.000Z")
    });

    expect(exported.fileName).toBe("polity-local-game-20260714-050607.json");
    expect(JSON.parse(exported.content)).toEqual({
      version: 1,
      stateVersion: 1,
      rulesVersion: CURRENT_RULES_VERSION,
      savedAtIso: "2026-07-14T05:06:07.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      metadata: {
        slotName: "Autosave",
        mode: "unknown",
        enabledExpansions: [],
        enabledVariants: [],
        dataSource: "private"
      },
      state: { G: compatibleG({ cardDb: { fixture_card: { id: "fixture_card", displayName: "Fixture" } } }), ctx: {} }
    });
  });

  it("formats export filenames from the save timestamp", () => {
    expect(formatLocalGameExportFilename(new Date("2026-12-03T04:05:06.000Z"))).toBe("polity-local-game-20261203-040506.json");
  });

  it("imports a valid exported game", () => {
    const exported = createLocalGameExport({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { G: compatibleG({ options: { playerCount: 2, mode: "multiplayer" } }), ctx: { numPlayers: 2 } },
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
      state: { G: compatibleG({ options: { playerCount: 2, mode: "multiplayer" } }), ctx: { numPlayers: 2 } }
    });

    expect(importLocalGameExport(exported.content, { expectedPrivateDataFingerprint: "private-b" })).toEqual({
      kind: "invalid",
      reason: "Local game export was saved with different private data."
    });
  });

  it("rejects malformed imported state before replacing the active game", () => {
    expect(importLocalGameExport(JSON.stringify({
      version: 1,
      rulesVersion: CURRENT_RULES_VERSION,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { ctx: { numPlayers: 2 } }
    }))).toEqual({ kind: "invalid", reason: "Local game export does not contain a resumable game state." });
  });

  it("rejects pre-correction saves without mutating their source data", () => {
    const legacy = JSON.stringify({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: { G: { options: { mode: "practice" } }, ctx: { currentPlayer: "1" } }
    });

    expect(importLocalGameExport(legacy)).toEqual({
      kind: "invalid",
      reason: "This saved game predates the corrected rules engine and cannot be resumed safely. Its original data has been preserved."
    });
    expect(JSON.parse(legacy).rulesVersion).toBeUndefined();
  });

  it("rejects rules-version 2 saves without mutating their source data", () => {
    const previousRules = JSON.stringify({
      version: 1,
      stateVersion: 1,
      rulesVersion: 2,
      savedAtIso: "2026-09-05T05:00:00.000Z",
      privateDataFingerprint: "placeholder",
      state: { G: { options: { mode: "solo" } }, ctx: { currentPlayer: "1" } }
    });

    expect(importLocalGameExport(previousRules)).toEqual({
      kind: "invalid",
      reason: "This saved game predates the corrected rules engine and cannot be resumed safely. Its original data has been preserved."
    });
    expect(JSON.parse(previousRules).rulesVersion).toBe(2);
  });

  it("round-trips a pending solo interaction through the production save codec", () => {
    const G = createInitialState({
      usePrivateData: false,
      randomSeed: "local-save-solo-interaction-v3",
      options: { ...defaultGameOptions, playerCount: 1, mode: "solo" }
    });
    const bot = G.solo!.bot;
    G.players["1"].resources.materials = 0;
    G.cardDb.fixture_bot_draw = {
      id: "fixture_bot_draw",
      displayName: "Fixture Bot Draw",
      type: "action",
      cardType: "action",
      suit: "none",
      cost: 0,
      effects: [],
      tags: []
    } satisfies Card;
    bot.botDeck = ["fixture_bot_draw"];
    bot.botDiscard = [];

    expect(runEffects({ G, playerId: "1", selfCardId: "fixture_optional_source" }, [
      {
        trigger: "on_play",
        op: "optional",
        effects: [{ trigger: "on_play", op: "draw", count: 1, targetPlayerScope: "others", optionalForTargets: true }]
      },
      { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }
    ])).toBe(true);
    expect(G.pendingChoice).toMatchObject({ playerId: "1", sourceCardId: "fixture_optional_source" });

    const raw = serializeLocalGame({
      privateDataFingerprint: "placeholder",
      now: new Date("2026-09-06T05:00:00.000Z"),
      state: { G, ctx: { currentPlayer: "1" } }
    });
    const imported = importLocalGameExport(raw);
    expect(imported.kind).toBe("valid");
    if (imported.kind !== "valid") throw new Error(imported.reason);
    const restored = imported.envelope.state as { G: GameState; ctx: { currentPlayer: string } };

    resolveChoice({ G: restored.G, ctx: restored.ctx as any }, 0);

    expect(restored.G.pendingChoice).toBeUndefined();
    expect(restored.G.solo!.bot.botDeck).toEqual([]);
    expect(restored.G.solo!.bot.botDiscard).toEqual(["fixture_bot_draw"]);
    expect(restored.G.players["1"].resources.materials).toBe(1);
  });

  it("matches uninterrupted Solstice resolution after export/import at an ordering and random boundary", () => {
    const createPendingState = () => {
      const G = createInitialState({
        usePrivateData: false,
        randomSeed: "local-save-solstice-random-v3",
        options: { ...defaultGameOptions, playerCount: 3, mode: "multiplayer" }
      });
      for (const player of Object.values(G.players)) {
        player.hand = [];
        player.deck = [];
        player.discard = [];
        player.playArea = [];
        player.powerArea = [];
        player.stateArea = [];
        player.handSize = 0;
        player.resources = { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 };
      }
      G.cardDb.random_discard = {
        id: "random_discard",
        displayName: "Random Discard",
        type: "in_play",
        cardType: "in_play",
        suit: "none",
        cost: 0,
        tags: [],
        effects: [{ trigger: "on_solstice", op: "discard_random", count: 1 }]
      } satisfies Card;
      G.cardDb.later_gain = {
        id: "later_gain",
        displayName: "Later Gain",
        type: "in_play",
        cardType: "in_play",
        suit: "none",
        cost: 0,
        tags: [],
        effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 }]
      } satisfies Card;
      G.cardDb.hidden_a = { id: "hidden_a", displayName: "Hidden A", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] } satisfies Card;
      G.cardDb.hidden_b = { id: "hidden_b", displayName: "Hidden B", type: "action", cardType: "action", suit: "none", cost: 0, tags: [], effects: [] } satisfies Card;
      G.players["1"].playArea = ["random_discard", "later_gain"];
      G.players["1"].hand = ["hidden_a", "hidden_b"];
      G.log = [];
      onTurnEnd(G, { currentPlayer: "3", playOrder: ["1", "2", "3"] } as any);
      expect(G.pendingSolsticeOrderChoice?.playerId).toBe("1");
      return G;
    };

    const direct = createPendingState();
    resolveSolsticeOrderChoice(
      { G: direct, ctx: { currentPlayer: "1" } as any, random: { Number: () => 0.75 } },
      ["random_discard", "later_gain"]
    );

    const persistedState = {
      G: createPendingState(),
      ctx: { currentPlayer: "1", turn: 9, phase: null },
      plugins: { random: { data: { seed: "public-seed", prngstate: { value: 17 } } } },
      _stateID: 41
    };
    const raw = serializeLocalGame({
      privateDataFingerprint: "placeholder",
      now: new Date("2026-09-06T06:00:00.000Z"),
      state: persistedState
    });
    const imported = importLocalGameExport(raw);
    expect(imported.kind).toBe("valid");
    if (imported.kind !== "valid") throw new Error(imported.reason);
    const restored = imported.envelope.state as typeof persistedState;
    expect(restored.plugins).toEqual(persistedState.plugins);
    expect(restored._stateID).toBe(41);

    resolveSolsticeOrderChoice(
      { G: restored.G, ctx: restored.ctx as any, random: { Number: () => 0.75 } },
      ["random_discard", "later_gain"]
    );

    expect(restored.G).toEqual(direct);
    expect(restored.G.players["1"].hand).toEqual(["hidden_a"]);
    expect(restored.G.players["1"].discard).toContain("hidden_b");
    expect(restored.G.players["1"].resources.knowledge).toBe(1);
  });

  it("loads and inspects an already finalized score without scoring again", () => {
    const G = createInitialState({
      usePrivateData: false,
      randomSeed: "local-save-final-score-v3",
      options: { ...defaultGameOptions, playerCount: 2, mode: "multiplayer" }
    });
    triggerScoring(G, "save_inspection", "1");
    G.scoring = { ...G.scoring!, phase: "final_round", finalRound: G.round };
    finalizeNormalScoring(G);
    expect(G.log.filter((entry) => entry.message.startsWith("ScoringFinalized("))).toHaveLength(1);

    const raw = serializeLocalGame({
      privateDataFingerprint: "placeholder",
      now: new Date("2026-09-06T07:00:00.000Z"),
      state: { G, ctx: { currentPlayer: "1" } }
    });
    const first = importLocalGameExport(raw);
    const second = importLocalGameExport(raw);
    expect(first.kind).toBe("valid");
    expect(second.kind).toBe("valid");
    if (first.kind !== "valid" || second.kind !== "valid") throw new Error("Expected finalized score save to remain valid.");

    expect(first.envelope.state).toEqual(second.envelope.state);
    const restored = first.envelope.state as { G: GameState };
    expect(restored.G.gameover).toEqual(G.gameover);
    expect(restored.G.log.filter((entry) => entry.message.startsWith("ScoringFinalized("))).toHaveLength(1);
  });

  it("classifies current, legacy, future, and mismatched rules snapshots without rewriting bytes", () => {
    const currentRaw = serializeLocalGame({
      privateDataFingerprint: "placeholder",
      state: { G: compatibleG({ options: { mode: "practice" } }), ctx: { currentPlayer: "1" } }
    });
    const legacyRaw = JSON.stringify({ ...JSON.parse(currentRaw), rulesVersion: CURRENT_RULES_VERSION - 1 });
    const futureRaw = JSON.stringify({ ...JSON.parse(currentRaw), rulesVersion: CURRENT_RULES_VERSION + 1, state: { G: { rulesVersion: CURRENT_RULES_VERSION + 1, stateVersion: 1 }, ctx: { currentPlayer: "1" } } });
    const mismatchRaw = JSON.stringify({ ...JSON.parse(currentRaw), state: { G: { rulesVersion: CURRENT_RULES_VERSION - 1, stateVersion: 1 }, ctx: { currentPlayer: "1" } } });

    const unversionedStateRaw = JSON.stringify({ ...JSON.parse(currentRaw), state: { G: { options: { mode: "practice" } }, ctx: { currentPlayer: "1" } } });

    expect(inspectLocalGameExport(currentRaw).kind).toBe("playable");
    expect(inspectLocalGameExport(legacyRaw)).toMatchObject({ kind: "legacy-incompatible", raw: legacyRaw });
    expect(inspectLocalGameExport(futureRaw)).toMatchObject({ kind: "future-version", raw: futureRaw });
    expect(inspectLocalGameExport(mismatchRaw)).toMatchObject({ kind: "corrupt", raw: mismatchRaw });
    expect(inspectLocalGameExport(unversionedStateRaw)).toMatchObject({ kind: "corrupt", raw: unversionedStateRaw });
  });

  it("classifies oversized exports before parsing and preserves their exact content", () => {
    const raw = "x".repeat(MAX_LOCAL_GAME_EXPORT_BYTES + 1);
    const inspected = inspectLocalGameExport(raw);
    expect(inspected.kind).toBe("unsupported-format");
    expect(inspected.raw).toBe(raw);
  });
});
