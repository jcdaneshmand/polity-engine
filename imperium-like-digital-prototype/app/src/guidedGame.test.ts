import { describe, expect, it } from "vitest";
import type { GameState, PlayerState } from "../../engine/src/game/state";
import {
  GUIDED_CHAPTERS,
  GUIDED_GAME_LESSON_VERSION,
  GUIDED_GAME_STORAGE_KEY,
  deriveGuidedProgress,
  inspectGuidedGame,
  loadGuidedGame,
  nextGuidedChapterId,
  serializeGuidedGame
} from "./guidedGame";

function player(): PlayerState {
  return {
    deck: [], hand: [], discard: [], playArea: [], history: [], exile: [], powerArea: [], stateArea: [], developmentArea: [], nationDeck: [],
    resources: { materials: 3, knowledge: 3, influence: 2, unrest: 0, goods: 3 }, actionsRemaining: 3,
    actionTokensBase: 3, exhaustTokensBase: 1, actionTokensAvailable: 3, exhaustTokensAvailable: 1,
    progressionTokens: { nationDeck: 0, developmentArea: 0 }
  };
}

function state(): { G: GameState; ctx: { currentPlayer: string; numPlayers: number } } {
  return {
    G: {
      rulesVersion: 3,
      stateVersion: 1,
      options: { mode: "multiplayer", playerCount: 2, commonsSetId: "custom", enabledExpansions: [], enabledVariants: [] },
      players: { "1": player(), "2": player() }, cardDb: {}, market: [], marketRefillPool: [], sharedDiscard: [], log: [], round: 1
    },
    ctx: { currentPlayer: "0", numPlayers: 2 }
  };
}

describe("guided game contracts", () => {
  it("defines six ordered public chapters backed by executable fictional scenarios", () => {
    expect(GUIDED_CHAPTERS.map((chapter) => chapter.number)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(new Set(GUIDED_CHAPTERS.map((chapter) => chapter.scenarioId))).toEqual(new Set(["F01", "F02", "F03", "F05", "F09"]));
    expect(GUIDED_CHAPTERS.every((chapter) => chapter.steps.length > 0 && chapter.seed.length > 0)).toBe(true);
    expect(nextGuidedChapterId("commit-action")).toBe("progression");
    expect(nextGuidedChapterId("trade")).toBe("ordering");
    expect(nextGuidedChapterId("scoring")).toBeUndefined();
  });

  it("does not advance for an unrelated or stale action", () => {
    const { G } = state();
    G.players["1"].resources.knowledge += 1;
    G.log.push({ round: 1, playerId: "1", message: "UnrelatedAction." });
    expect(deriveGuidedProgress("commit-action", G)).toBe(0);
  });

  it("advances the opening step only when its independent state contract is satisfied", () => {
    const { G } = state();
    G.players["1"].resources.materials = 4;
    G.players["1"].actionsRemaining = 2;
    G.log.push({ round: 1, playerId: "1", message: "TurnPhase(action_execution): playCard(fixture_action_gain_materials)" });
    expect(deriveGuidedProgress("commit-action", G)).toBe(1);
    G.players["1"].exhaustTokensAvailable = 0;
    expect(deriveGuidedProgress("commit-action", G)).toBe(0);
  });

  it("requires the real reaction boundary before later reaction checkpoints", () => {
    const { G } = state();
    G.players["1"].resources.influence = 3;
    G.players["1"].exhaustTokensAvailable = 0;
    G.log.push({ round: 1, playerId: "1", message: "ReactiveExhaustResolved(fixture_power_wayfinder)." });
    expect(deriveGuidedProgress("reaction", G)).toBe(0);
    G.log.unshift({ round: 1, playerId: "1", message: "TurnPhase(action_execution): playCard(fixture_region_greenway)" });
    expect(deriveGuidedProgress("reaction", G)).toBe(2);
  });

  it("serializes through the real save codec and derives progress again on load", () => {
    const snapshot = state();
    snapshot.G.players["1"].resources.materials = 4;
    snapshot.G.players["1"].actionsRemaining = 2;
    snapshot.G.log.push({ round: 1, playerId: "1", message: "TurnPhase(action_execution): playCard(fixture_action_gain_materials)" });
    const raw = serializeGuidedGame({ chapterId: "commit-action", state: snapshot, now: new Date("2026-09-06T12:00:00.000Z") });
    const parsed = JSON.parse(raw);
    parsed.progress = 0;

    const inspected = inspectGuidedGame(JSON.stringify(parsed));
    expect(inspected.kind).toBe("valid");
    if (inspected.kind === "valid") {
      expect(inspected.save.progress).toBe(1);
      expect(inspected.save.lessonVersion).toBe(GUIDED_GAME_LESSON_VERSION);
      expect(inspected.save.snapshot.metadata.slotName).toBe("Learning: Commit an Action");
    }
  });

  it("preserves incompatible bytes without applying them", () => {
    const raw = serializeGuidedGame({ chapterId: "commit-action", state: state() });
    const parsed = JSON.parse(raw);
    parsed.lessonVersion = GUIDED_GAME_LESSON_VERSION + 1;
    expect(inspectGuidedGame(JSON.stringify(parsed))).toMatchObject({ kind: "incompatible" });
  });

  it("uses a dedicated storage identity", () => {
    const raw = serializeGuidedGame({ chapterId: "commit-action", state: state() });
    const storage = { getItem: (key: string) => key === GUIDED_GAME_STORAGE_KEY ? raw : null };
    expect(loadGuidedGame(storage).kind).toBe("valid");
    expect(GUIDED_GAME_STORAGE_KEY).not.toContain("localGameSave");
  });
});
