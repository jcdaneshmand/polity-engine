import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server, State } from "boardgame.io";
import { describe, expect, it } from "vitest";
import { CURRENT_GAME_STATE_VERSION, CURRENT_RULES_VERSION } from "../../engine/src/game/version";
import { PrototypeGame } from "../../engine/src/game/game";
import {
  createBoardgameStorage,
  fetchBoardgameMatchForRecovery,
  INCOMPATIBLE_MATCH_STATE_CODE,
  IncompatibleMatchStateError,
  waitForBoardgameStorageIdle
} from "./boardgameStorage";
import { getBoardgameServerPackage } from "./boardgameServer";

const require = createRequire(import.meta.url);
const { Master } = require("boardgame.io/dist/cjs/master.js") as {
  Master: new (game: unknown, storage: unknown, transport: unknown) => {
    onUpdate: (action: unknown, stateID: number, matchID: string, playerID: string) => Promise<unknown>;
    onSync: (matchID: string, playerID: string) => Promise<unknown>;
    onConnectionChange: (matchID: string, playerID: string, credentials: string | undefined, connected: boolean) => Promise<unknown>;
  };
};

function matchState(overrides: Record<string, unknown> = {}): State {
  return {
    G: { rulesVersion: CURRENT_RULES_VERSION, stateVersion: CURRENT_GAME_STATE_VERSION, ...overrides },
    ctx: {},
    plugins: {},
    _undo: [],
    _redo: [],
    _stateID: 0
  } as unknown as State;
}

function metadata(): Server.MatchData {
  return {
    gameName: "polity-engine",
    players: { "0": { id: 0, name: "Player" } },
    createdAt: 1,
    updatedAt: 1
  } as Server.MatchData;
}

async function expectCompatibilityFailure(action: () => unknown, kind: string): Promise<void> {
  try {
    await action();
    throw new Error("Expected compatibility failure");
  } catch (error) {
    expect(error).toBeInstanceOf(IncompatibleMatchStateError);
    expect(error).toMatchObject({ code: INCOMPATIBLE_MATCH_STATE_CODE, compatibility: { kind } });
    expect((error as Error).message).not.toContain("rulesVersion");
  }
}

describe("boardgame.io storage compatibility guard", () => {
  it("guards the default synchronous storage while allowing current matches", async () => {
    const storage = createBoardgameStorage(undefined);
    expect(storage.type()).toBe(0);
    await storage.connect();
    await storage.createMatch("current", { initialState: matchState(), metadata: metadata() });

    const { state } = await storage.fetch("current", { state: true });
    expect(state.G).toMatchObject({ rulesVersion: CURRENT_RULES_VERSION, stateVersion: CURRENT_GAME_STATE_VERSION });
    await expect(waitForBoardgameStorageIdle(storage)).resolves.toBeUndefined();
  });

  it.each([
    ["unversioned", { rulesVersion: undefined, stateVersion: undefined }, "legacy-rules"],
    ["legacy", { rulesVersion: CURRENT_RULES_VERSION - 1, stateVersion: CURRENT_GAME_STATE_VERSION }, "legacy-rules"],
    ["future", { rulesVersion: CURRENT_RULES_VERSION + 1, stateVersion: CURRENT_GAME_STATE_VERSION }, "future-rules"],
    ["unsupported", { rulesVersion: CURRENT_RULES_VERSION, stateVersion: CURRENT_GAME_STATE_VERSION + 1 }, "unsupported-state"],
    ["malformed", { rulesVersion: "private-value", stateVersion: CURRENT_GAME_STATE_VERSION }, "malformed"]
  ])("refuses %s new matches without persisting them", async (_label, G, kind) => {
    const storage = createBoardgameStorage(undefined);
    await expectCompatibilityFailure(
      () => storage.createMatch("blocked", { initialState: matchState(G), metadata: metadata() }),
      kind
    );
    expect(await storage.listMatches()).not.toContain("blocked");
  });

  it("keeps an incompatible default-store record byte-equivalent and blocks reads and mutations", async () => {
    const storage = createBoardgameStorage(undefined);
    const legacy = matchState({ rulesVersion: CURRENT_RULES_VERSION - 1 });
    await storage.polityDelegate.createMatch("legacy", { initialState: legacy, metadata: metadata() });

    await expectCompatibilityFailure(() => storage.fetch("legacy", { state: true }), "legacy-rules");
    await expectCompatibilityFailure(() => storage.setState("legacy", matchState({ marker: "move" })), "legacy-rules");
    await expectCompatibilityFailure(() => storage.setMetadata("legacy", { ...metadata(), updatedAt: 2 }), "legacy-rules");

    const recovered = await fetchBoardgameMatchForRecovery(storage, "legacy", { state: true, metadata: true });
    expect(recovered.state).toEqual(legacy);
    expect(recovered.metadata.updatedAt).toBe(1);
  });

  it("rejects boardgame.io moves, events, undo, redo, reconnect, and connection writes", async () => {
    const storage = createBoardgameStorage(undefined);
    const legacy = matchState({ rulesVersion: CURRENT_RULES_VERSION - 1, marker: "lifecycle-preserved" });
    await storage.polityDelegate.createMatch("legacy-lifecycle", { initialState: legacy, metadata: metadata() });
    const master = new Master(PrototypeGame, storage, { send: () => undefined, sendAll: () => undefined });

    for (const type of ["MAKE_MOVE", "GAME_EVENT", "UNDO", "REDO"]) {
      await expectCompatibilityFailure(
        () => master.onUpdate({ type, payload: {} }, 0, "legacy-lifecycle", "0"),
        "legacy-rules"
      );
    }
    await expectCompatibilityFailure(() => master.onSync("legacy-lifecycle", "0"), "legacy-rules");
    await expectCompatibilityFailure(() => master.onConnectionChange("legacy-lifecycle", "0", undefined, true), "legacy-rules");

    const recovered = await fetchBoardgameMatchForRecovery(storage, "legacy-lifecycle", { state: true, metadata: true });
    expect(recovered.state).toEqual(legacy);
    expect(recovered.metadata.updatedAt).toBe(1);
  });

  it("waits for current FlatFile writes to settle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polity-boardgame-storage-"));
    try {
      const storage = createBoardgameStorage(dir);
      expect(storage.type()).toBe(1);
      await storage.connect();

      const write = storage.setState("matchID", matchState({ marker: "persisted" }));
      await waitForBoardgameStorageIdle(storage);
      await write;

      const { state } = await storage.fetch("matchID", { state: true });
      expect(state.G).toMatchObject({ marker: "persisted" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a legacy FlatFile record after restart and leaves it intact", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polity-boardgame-compatibility-restart-"));
    try {
      const first = createBoardgameStorage(dir);
      await first.connect();
      await first.createMatch("legacy-after-restart", { initialState: matchState(), metadata: metadata() });
      await waitForBoardgameStorageIdle(first);

      const { FlatFile } = getBoardgameServerPackage();
      const administrativeStore = new FlatFile({ dir });
      await administrativeStore.connect();
      const legacy = matchState({ rulesVersion: CURRENT_RULES_VERSION - 1, marker: "preserve-me" });
      await administrativeStore.setState("legacy-after-restart", legacy);

      const restarted = createBoardgameStorage(dir);
      await restarted.connect();
      await expectCompatibilityFailure(() => restarted.fetch("legacy-after-restart", { state: true }), "legacy-rules");
      await expectCompatibilityFailure(() => restarted.setState("legacy-after-restart", matchState()), "legacy-rules");
      await expectCompatibilityFailure(() => restarted.setMetadata("legacy-after-restart", { ...metadata(), updatedAt: 2 }), "legacy-rules");

      const recovered = await fetchBoardgameMatchForRecovery(restarted, "legacy-after-restart", { state: true, metadata: true });
      expect(recovered.state).toEqual(legacy);
      expect(recovered.metadata.updatedAt).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
