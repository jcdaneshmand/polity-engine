import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { createAccountStore } from "./accountStore";
import { createSupportMiddleware } from "./support";
import { createSupportStore } from "./supportStore";

type TestContext = {
  method: string;
  path: string;
  headers?: Record<string, string>;
  status?: number;
  body?: unknown;
};

function context(method: string, path: string, token?: string): TestContext {
  return { method, path, ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}) };
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
  it("serves the monthly support status publicly and requires admin to update it", async () => {
    const accountStore = createAccountStore();
    const admin = accountStore.createAccount({ email: "admin@example.com", username: "Admin", password: "secret123" });
    const player = accountStore.createAccount({ email: "player@example.com", username: "Player", password: "secret123" });
    if (!admin.ok || !player.ok) throw new Error("account setup failed");
    const middleware = createSupportMiddleware({
      store: createSupportStore({ now: () => "2026-07-22T12:00:00.000Z" }),
      accountStore
    });
    const status = context("GET", "/polity/support/monthly");
    const missing = context("POST", "/polity/support/monthly/mark-covered");
    const blocked = context("POST", "/polity/support/monthly/mark-covered", player.token);
    const mark = context("POST", "/polity/support/monthly/mark-covered", admin.token);

    await middleware(status, async () => undefined);
    await middleware(missing, async () => undefined);
    await middleware(blocked, async () => undefined);
    await middleware(mark, async () => undefined);

    expect(status.body).toEqual({ month: "2026-07", isCovered: false });
    expect(missing.status).toBe(401);
    expect(missing.body).toEqual({ error: "missing_session" });
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ error: "not_admin" });
    expect(mark.body).toEqual({ month: "2026-07", isCovered: true, coveredAt: "2026-07-22T12:00:00.000Z" });
  });
});
