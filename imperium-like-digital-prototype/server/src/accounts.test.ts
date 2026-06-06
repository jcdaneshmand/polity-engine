import { describe, expect, it } from "vitest";
import { createAccountStore } from "./accountStore";
import { bearerToken, createAccountMiddleware, requireAdmin, requireAccount } from "./accounts";

type TestContext = {
  method: string;
  path: string;
  headers?: Record<string, string | undefined>;
  request: { body?: unknown };
  status?: number;
  body?: unknown;
};

function context(method: string, path: string, body?: unknown, token?: string): TestContext {
  return {
    method,
    path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    request: { body }
  };
}

function store() {
  let id = 0;
  return createAccountStore({
    now: () => "2026-06-05T12:00:00.000Z",
    createID: () => `id-${id += 1}`,
    createToken: () => `token-${id += 1}`,
    saltPassword: (password, salt) => `hash:${salt}:${password}`
  });
}

describe("account middleware", () => {
  it("reports account route health for dev-full compatibility checks", async () => {
    const accountStore = store();
    const middleware = createAccountMiddleware({ store: accountStore });
    const health = context("GET", "/polity/accounts/health");

    await middleware(health, async () => undefined);

    expect(health.body).toEqual({ ok: true });
  });

  it("registers accounts and restores the current session", async () => {
    const accountStore = store();
    const middleware = createAccountMiddleware({ store: accountStore });

    const register = context("POST", "/polity/accounts/register", { email: "jonah@example.com", username: "Jonah", password: "secret123" });
    await middleware(register, async () => undefined);
    expect(register.status).toBe(201);
    expect(register.body).toEqual({ account: expect.objectContaining({ username: "Jonah", role: "admin" }), token: expect.any(String) });

    const token = (register.body as { token: string }).token;
    const me = context("GET", "/polity/accounts/me", undefined, token);
    await middleware(me, async () => undefined);
    expect(me.body).toEqual({ account: expect.objectContaining({ username: "Jonah", role: "admin" }) });
  });

  it("signs in and signs out", async () => {
    const accountStore = store();
    const middleware = createAccountMiddleware({ store: accountStore });
    await middleware(context("POST", "/polity/accounts/register", { email: "jonah@example.com", username: "Jonah", password: "secret123" }), async () => undefined);

    const signIn = context("POST", "/polity/accounts/sign-in", { login: "jonah", password: "secret123" });
    await middleware(signIn, async () => undefined);
    expect(signIn.body).toEqual({ account: expect.objectContaining({ username: "Jonah" }), token: expect.any(String) });

    const token = (signIn.body as { token: string }).token;
    const signOut = context("POST", "/polity/accounts/sign-out", undefined, token);
    await middleware(signOut, async () => undefined);
    expect(signOut.body).toEqual({ ok: true });

    const me = context("GET", "/polity/accounts/me", undefined, token);
    await middleware(me, async () => undefined);
    expect(me.status).toBe(401);
    expect(me.body).toEqual({ error: "invalid_session" });
  });

  it("uses a reset token for forgotten passwords", async () => {
    const accountStore = store();
    const middleware = createAccountMiddleware({ store: accountStore });
    await middleware(context("POST", "/polity/accounts/register", { email: "jonah@example.com", username: "Jonah", password: "secret123" }), async () => undefined);

    const request = context("POST", "/polity/accounts/forgot-password", { email: "JONAH@example.com", resetURLBase: "http://localhost/reset-password" });
    await middleware(request, async () => undefined);
    expect(request.body).toEqual({ ok: true, resetLink: "http://localhost/reset-password?token=token-3" });

    const reset = context("POST", "/polity/accounts/reset-password", { token: "token-3", password: "changed123", passwordConfirmation: "changed123" });
    await middleware(reset, async () => undefined);
    expect(reset.body).toEqual({ ok: true });

    const oldPassword = context("POST", "/polity/accounts/sign-in", { login: "jonah", password: "secret123" });
    await middleware(oldPassword, async () => undefined);
    expect(oldPassword.status).toBe(401);

    const newPassword = context("POST", "/polity/accounts/sign-in", { login: "jonah", password: "changed123" });
    await middleware(newPassword, async () => undefined);
    expect(newPassword.body).toEqual({ account: expect.objectContaining({ username: "Jonah" }), token: expect.any(String) });
  });

  it("changes passwords for signed-in accounts", async () => {
    const accountStore = store();
    const middleware = createAccountMiddleware({ store: accountStore });
    const register = context("POST", "/polity/accounts/register", { email: "jonah@example.com", username: "Jonah", password: "secret123" });
    await middleware(register, async () => undefined);
    const token = (register.body as { token: string }).token;

    const change = context("POST", "/polity/accounts/change-password", { currentPassword: "secret123", password: "changed123" }, token);
    await middleware(change, async () => undefined);
    expect(change.body).toEqual({ ok: true });

    const oldPassword = context("POST", "/polity/accounts/sign-in", { login: "jonah", password: "secret123" });
    await middleware(oldPassword, async () => undefined);
    expect(oldPassword.status).toBe(401);

    const newPassword = context("POST", "/polity/accounts/sign-in", { login: "jonah", password: "changed123" });
    await middleware(newPassword, async () => undefined);
    expect(newPassword.body).toEqual({ account: expect.objectContaining({ username: "Jonah" }), token: expect.any(String) });
  });

  it("returns expected account errors", async () => {
    const accountStore = store();
    const middleware = createAccountMiddleware({ store: accountStore });
    await middleware(context("POST", "/polity/accounts/register", { email: "jonah@example.com", username: "Jonah", password: "secret123" }), async () => undefined);

    const duplicate = context("POST", "/polity/accounts/register", { email: "JONAH@example.com", username: "Other", password: "secret123" });
    await middleware(duplicate, async () => undefined);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toEqual({ error: "email_taken" });

    const badSignIn = context("POST", "/polity/accounts/sign-in", { login: "jonah", password: "wrong" });
    await middleware(badSignIn, async () => undefined);
    expect(badSignIn.status).toBe(401);
    expect(badSignIn.body).toEqual({ error: "invalid_credentials" });
  });

  it("lists history and records starts and results for the signed-in account", async () => {
    const accountStore = store();
    const middleware = createAccountMiddleware({ store: accountStore });
    const register = context("POST", "/polity/accounts/register", { email: "jonah@example.com", username: "Jonah", password: "secret123" });
    await middleware(register, async () => undefined);
    const token = (register.body as { token: string }).token;

    const start = context("POST", "/polity/accounts/history/start", {
      id: "game-1",
      scope: "solo",
      variant: "practice",
      status: "started",
      outcome: "unknown",
      playerCount: 1,
      nationID: "test_nation_sun_coast"
    }, token);
    await middleware(start, async () => undefined);
    expect(start.body).toEqual({ entry: expect.objectContaining({ id: "game-1", scope: "solo", variant: "practice" }) });

    const result = context("POST", "/polity/accounts/history/result", { id: "game-1", outcome: "win", practiceScore: 51 }, token);
    await middleware(result, async () => undefined);
    expect(result.body).toEqual({
      entry: expect.objectContaining({ id: "game-1", status: "completed", outcome: "win" }),
      stats: expect.objectContaining({
        solo: expect.objectContaining({ practice: expect.objectContaining({ gamesPlayed: 1, wins: 1, bestScore: 51 }) })
      })
    });

    const history = context("GET", "/polity/accounts/history", undefined, token);
    await middleware(history, async () => undefined);
    expect(history.body).toEqual({
      history: [expect.objectContaining({ id: "game-1", outcome: "win" })],
      stats: expect.objectContaining({
        byNation: { test_nation_sun_coast: expect.objectContaining({ gamesPlayed: 1, practiceGamesPlayed: 1 }) }
      })
    });
  });

  it("extracts bearer tokens and gates account/admin helpers", () => {
    const accountStore = store();
    const admin = accountStore.createAccount({ email: "admin@example.com", username: "Admin", password: "secret123" });
    const player = accountStore.createAccount({ email: "player@example.com", username: "Player", password: "secret123" });
    if (!admin.ok || !player.ok) throw new Error("account create failed");

    const adminCtx = context("GET", "/admin", undefined, admin.token);
    const playerCtx = context("GET", "/admin", undefined, player.token);
    const guestCtx = context("GET", "/admin");

    expect(bearerToken(adminCtx)).toBe(admin.token);
    expect(requireAccount(adminCtx, accountStore)).toEqual({ ok: true, account: admin.account });
    expect(requireAdmin(adminCtx, accountStore)).toEqual({ ok: true, account: admin.account });
    expect(requireAdmin(playerCtx, accountStore)).toEqual({ ok: false, status: 403, reason: "not_admin" });
    expect(requireAccount(guestCtx, accountStore)).toEqual({ ok: false, status: 401, reason: "missing_session" });
  });
});
