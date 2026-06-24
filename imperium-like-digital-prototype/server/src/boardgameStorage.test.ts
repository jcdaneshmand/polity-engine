import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBoardgameStorage, waitForBoardgameStorageIdle } from "./boardgameStorage";

describe("boardgame.io storage wrapper", () => {
  it("returns undefined when persistent storage is not configured", async () => {
    const storage = createBoardgameStorage(undefined);

    expect(storage).toBeUndefined();
    await expect(waitForBoardgameStorageIdle(storage)).resolves.toBeUndefined();
  });

  it("waits for queued FlatFile writes to settle", async () => {
    const dir = mkdtempSync(join(tmpdir(), "polity-boardgame-storage-"));
    try {
      const storage = createBoardgameStorage(dir);
      expect(storage).toBeDefined();
      await storage?.connect();

      const write = storage?.setState("matchID", { _stateID: 1 } as never);
      await waitForBoardgameStorageIdle(storage);
      await write;

      const { state } = await storage!.fetch("matchID", { state: true });
      expect(state).toEqual({ _stateID: 1 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
