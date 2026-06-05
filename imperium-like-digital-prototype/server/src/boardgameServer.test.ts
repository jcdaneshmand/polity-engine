import { describe, expect, it } from "vitest";
import { getBoardgameServerPackage } from "./boardgameServer";

describe("boardgame.io server runtime loader", () => {
  it("loads the concrete CommonJS server bundle under tsx", () => {
    const serverPackage = getBoardgameServerPackage();

    expect(typeof serverPackage.Server).toBe("function");
    expect(typeof serverPackage.SocketIO).toBe("function");
    expect(typeof serverPackage.FlatFile).toBe("function");
  });
});
