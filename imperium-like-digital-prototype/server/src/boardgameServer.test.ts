import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getBoardgameServerPackage } from "./boardgameServer";

describe("boardgame.io server runtime loader", () => {
  it("loads the concrete CommonJS server bundle under tsx", () => {
    const serverPackage = getBoardgameServerPackage();

    expect(typeof serverPackage.Server).toBe("function");
    expect(typeof serverPackage.SocketIO).toBe("function");
    expect(typeof serverPackage.FlatFile).toBe("function");
  });

  it("constructs FlatFile storage when persistence is enabled", () => {
    const dir = mkdtempSync(join(tmpdir(), "polity-boardgame-flatfile-"));
    try {
      const serverPackage = getBoardgameServerPackage();

      expect(() => new serverPackage.FlatFile({ dir })).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
