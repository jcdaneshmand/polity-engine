import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createStaticAppMiddleware } from "./staticApp";

describe("static app middleware", () => {
  it("serves built app assets and falls back to index html", async () => {
    const dir = await mkdtemp(join(tmpdir(), "polity-static-"));
    try {
      await writeFile(join(dir, "index.html"), "<html>app</html>");
      await writeFile(join(dir, "asset.txt"), "asset");
      const middleware = createStaticAppMiddleware(dir);
      const next = async () => undefined;

      const assetCtx: any = { path: "/asset.txt", method: "GET", set: () => undefined };
      await middleware(assetCtx, next);
      expect(assetCtx.type).toBe("text/plain");
      expect(assetCtx.body.toString()).toBe("asset");

      const routeCtx: any = { path: "/multiplayer/room", method: "GET", set: () => undefined };
      await middleware(routeCtx, next);
      expect(routeCtx.type).toBe("text/html");
      expect(routeCtx.body.toString()).toBe("<html>app</html>");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
