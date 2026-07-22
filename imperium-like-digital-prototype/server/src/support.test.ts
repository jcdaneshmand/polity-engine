import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createSupportMiddleware } from "./support";
import { createSupportStore } from "./supportStore";

type TestContext = {
  method: string;
  path: string;
  status?: number;
  body?: unknown;
};

function context(method: string, path: string): TestContext {
  return { method, path };
}

describe("support store", () => {
  it("tracks whether the current month hosting cost is covered", () => {
    const store = createSupportStore({ now: () => "2026-07-22T12:00:00.000Z" });

    expect(store.currentStatus()).toEqual({ month: "2026-07", isCovered: false });
    expect(store.markCurrentMonthCovered()).toEqual({
      month: "2026-07",
      isCovered: true,
      coveredAt: "2026-07-22T12:00:00.000Z"
    });
    expect(store.currentStatus().isCovered).toBe(true);
  });

  it("persists covered month status when storage is configured", () => {
    const dir = mkdtempSync(join(tmpdir(), "polity-support-"));
    try {
      const storageFile = join(dir, "support.json");
      createSupportStore({ now: () => "2026-07-22T12:00:00.000Z", storageFile }).markCurrentMonthCovered();

      expect(JSON.parse(readFileSync(storageFile, "utf8"))).toEqual({
        coveredMonths: {
          "2026-07": { coveredAt: "2026-07-22T12:00:00.000Z" }
        }
      });
      expect(createSupportStore({ now: () => "2026-07-23T12:00:00.000Z", storageFile }).currentStatus().isCovered).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("support middleware", () => {
  it("serves and updates the monthly support status", async () => {
    const middleware = createSupportMiddleware({
      store: createSupportStore({ now: () => "2026-07-22T12:00:00.000Z" })
    });
    const status = context("GET", "/polity/support/monthly");
    const mark = context("POST", "/polity/support/monthly/mark-covered");

    await middleware(status, async () => undefined);
    await middleware(mark, async () => undefined);

    expect(status.body).toEqual({ month: "2026-07", isCovered: false });
    expect(mark.body).toEqual({ month: "2026-07", isCovered: true, coveredAt: "2026-07-22T12:00:00.000Z" });
  });
});
