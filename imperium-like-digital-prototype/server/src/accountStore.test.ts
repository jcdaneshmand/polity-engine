import { describe, expect, it } from "vitest";
import { createAccountStore } from "./accountStore";

function accountStore() {
  let id = 0;
  return createAccountStore({
    now: () => "2026-06-05T12:00:00.000Z",
    createID: () => `id-${id += 1}`,
    createToken: () => `token-${id += 1}`,
    saltPassword: (password, salt) => `hash:${salt}:${password}`
  });
}

describe("account store", () => {
  it("creates the first account as admin and later accounts as players", () => {
    const store = accountStore();

    const admin = store.createAccount({ email: "Admin@Example.com", username: "Jonah", password: "secret123" });
    const player = store.createAccount({ email: "player@example.com", username: "River", password: "secret123" });

    expect(admin).toEqual({
      ok: true,
      account: expect.objectContaining({ email: "admin@example.com", username: "Jonah", role: "admin" }),
      token: expect.stringMatching(/^token-\d+$/)
    });
    expect(player).toEqual({
      ok: true,
      account: expect.objectContaining({ email: "player@example.com", username: "River", role: "player" }),
      token: expect.stringMatching(/^token-\d+$/)
    });
  });

  it("ensures a default admin account exists", () => {
    const store = accountStore();

    expect(store.ensureDefaultAdmin({ email: "xenokinesis@local.admin", username: "Xenokinesis", password: "admin" })).toEqual({
      ok: true,
      account: expect.objectContaining({ email: "xenokinesis@local.admin", username: "Xenokinesis", role: "admin" })
    });
    expect(store.signIn({ login: "Xenokinesis", password: "admin" })).toEqual({
      ok: true,
      account: expect.objectContaining({ username: "Xenokinesis", role: "admin" }),
      token: expect.any(String)
    });
    expect(store.ensureDefaultAdmin({ email: "xenokinesis@local.admin", username: "Xenokinesis", password: "admin" })).toEqual({
      ok: true,
      account: expect.objectContaining({ username: "Xenokinesis", role: "admin" })
    });
  });

  it("rejects duplicate email and username case-insensitively", () => {
    const store = accountStore();
    expect(store.createAccount({ email: "jonah@example.com", username: "Jonah", password: "secret123" }).ok).toBe(true);

    expect(store.createAccount({ email: "JONAH@example.com", username: "Other", password: "secret123" })).toEqual({ ok: false, reason: "email_taken" });
    expect(store.createAccount({ email: "other@example.com", username: "jonah", password: "secret123" })).toEqual({ ok: false, reason: "username_taken" });
  });

  it("signs in with email or username and resolves sessions", () => {
    const store = accountStore();
    const created = store.createAccount({ email: "jonah@example.com", username: "Jonah", password: "secret123" });
    if (!created.ok) throw new Error("account create failed");

    const byEmail = store.signIn({ login: "JONAH@example.com", password: "secret123" });
    const byUsername = store.signIn({ login: "jonah", password: "secret123" });

    expect(byEmail).toEqual({ ok: true, account: created.account, token: expect.stringMatching(/^token-\d+$/) });
    expect(byUsername).toEqual({ ok: true, account: created.account, token: expect.stringMatching(/^token-\d+$/) });
    expect(store.signIn({ login: "jonah", password: "wrong" })).toEqual({ ok: false, reason: "invalid_credentials" });
    if (!byEmail.ok) throw new Error("email sign-in failed");
    expect(store.resolveSession(byEmail.token)).toEqual({ ok: true, account: created.account });
    expect(store.signOut(byEmail.token)).toEqual({ ok: true });
    expect(store.resolveSession(byEmail.token)).toEqual({ ok: false, reason: "invalid_session" });
  });

  it("requires a reset token before changing a forgotten password", () => {
    const store = accountStore();
    const created = store.createAccount({ email: "jonah@example.com", username: "Jonah", password: "secret123" });
    if (!created.ok) throw new Error("account create failed");

    const requested = store.requestPasswordReset({ email: "JONAH@example.com", resetURLBase: "http://localhost/reset-password" });
    expect(requested).toEqual({ ok: true, resetLink: "http://localhost/reset-password?token=token-3", resetToken: "token-3" });
    expect(store.completePasswordReset({ token: "wrong", password: "changed123", passwordConfirmation: "changed123" })).toEqual({ ok: false, reason: "invalid_session" });
    expect(store.completePasswordReset({ token: "token-3", password: "changed123", passwordConfirmation: "mismatch" })).toEqual({ ok: false, reason: "invalid_account" });
    expect(store.completePasswordReset({ token: "token-3", password: "changed123", passwordConfirmation: "changed123" })).toEqual({ ok: true });
    expect(store.signIn({ login: "jonah", password: "secret123" })).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(store.signIn({ login: "jonah", password: "changed123" })).toEqual({ ok: true, account: expect.objectContaining({ username: "Jonah" }), token: expect.any(String) });
    expect(store.resolveSession(created.token)).toEqual({ ok: false, reason: "invalid_session" });
    expect(store.completePasswordReset({ token: "token-3", password: "again123", passwordConfirmation: "again123" })).toEqual({ ok: false, reason: "invalid_session" });
    expect(store.requestPasswordReset({ email: "missing@example.com", resetURLBase: "http://localhost/reset-password" })).toEqual({ ok: true });
  });

  it("expires stale sessions and password reset tokens", () => {
    let now = "2026-06-05T12:00:00.000Z";
    let id = 0;
    const store = createAccountStore({
      now: () => now,
      createID: () => `id-${id += 1}`,
      createToken: () => `token-${id += 1}`,
      saltPassword: (password, salt) => `hash:${salt}:${password}`,
      sessionTtlMs: 60_000,
      passwordResetTtlMs: 60_000
    });
    const created = store.createAccount({ email: "jonah@example.com", username: "Jonah", password: "secret123" });
    if (!created.ok) throw new Error("account create failed");

    expect(store.resolveSession(created.token)).toEqual({ ok: true, account: created.account });
    const reset = store.requestPasswordReset({ email: "jonah@example.com" });
    expect(reset).toEqual({ ok: true, resetToken: "token-3" });

    now = "2026-06-05T12:02:00.000Z";

    expect(store.resolveSession(created.token)).toEqual({ ok: false, reason: "invalid_session" });
    expect(store.completePasswordReset({ token: "token-3", password: "changed123", passwordConfirmation: "changed123" })).toEqual({ ok: false, reason: "invalid_session" });
  });

  it("changes a password for the signed-in account with the current password", () => {
    const store = accountStore();
    const created = store.createAccount({ email: "jonah@example.com", username: "Jonah", password: "secret123" });
    if (!created.ok) throw new Error("account create failed");

    expect(store.changePassword(created.account.id, { currentPassword: "wrong", password: "changed123" })).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(store.changePassword(created.account.id, { currentPassword: "secret123", password: "changed123" })).toEqual({ ok: true });
    expect(store.signIn({ login: "jonah", password: "secret123" })).toEqual({ ok: false, reason: "invalid_credentials" });
    expect(store.signIn({ login: "jonah", password: "changed123" })).toEqual({ ok: true, account: expect.objectContaining({ username: "Jonah" }), token: expect.any(String) });
  });

  it("records online results once and updates aggregate and nation stats", () => {
    const store = accountStore();
    const created = store.createAccount({ email: "jonah@example.com", username: "Jonah", password: "secret123" });
    if (!created.ok) throw new Error("account create failed");

    const started = store.recordGameStart(created.account.id, {
      id: "game-1",
      scope: "online",
      variant: "multiplayer",
      status: "started",
      outcome: "unknown",
      matchID: "match-1",
      roomName: "Friday Table",
      playerID: "0",
      playerCount: 2,
      nationID: "test_nation_sun_coast",
      nationName: "Sun Coast",
      opponentNationIDs: ["test_nation_river"],
      opponentNationNames: ["River League"]
    });
    expect(started).toEqual({ ok: true, entry: expect.objectContaining({ id: "game-1", status: "started" }) });

    const result = {
      id: "game-1",
      outcome: "win" as const,
      winnerID: "0",
      winnerNationID: "test_nation_sun_coast",
      reason: "scoring",
      scores: { "0": 72, "1": 55 },
      tieBreakScores: { "0": 9, "1": 4 },
      roundsPlayed: 7,
      finalResources: { materials: 3 },
      finalDeckSize: 18,
      finalCardsInPlay: 9,
      finalUnrest: 1,
      finalFame: 6,
      rawSummaryStats: { marketCardsRemaining: 4 }
    };

    expect(store.recordGameResult(created.account.id, result)).toEqual({
      ok: true,
      entry: expect.objectContaining({ id: "game-1", status: "completed", outcome: "win", scores: { "0": 72, "1": 55 } }),
      stats: expect.objectContaining({
        online: expect.objectContaining({ gamesPlayed: 1, wins: 1, losses: 0, unfinished: 0 }),
        byNation: {
          test_nation_sun_coast: expect.objectContaining({ gamesPlayed: 1, wins: 1, onlineGamesPlayed: 1, soloGamesPlayed: 0 })
        }
      })
    });
    expect(store.recordGameResult(created.account.id, result)).toEqual({
      ok: true,
      entry: expect.objectContaining({ id: "game-1", status: "completed", outcome: "win" }),
      stats: expect.objectContaining({
        online: expect.objectContaining({ gamesPlayed: 1, wins: 1 }),
        byNation: {
          test_nation_sun_coast: expect.objectContaining({ gamesPlayed: 1, wins: 1 })
        }
      })
    });
  });

  it("stratifies solo standard, campaign, and practice stats separately", () => {
    const store = accountStore();
    const created = store.createAccount({ email: "jonah@example.com", username: "Jonah", password: "secret123" });
    if (!created.ok) throw new Error("account create failed");

    for (const entry of [
      { id: "solo-standard", variant: "standard" as const, outcome: "loss" as const, nationID: "nation-a" },
      { id: "solo-campaign", variant: "campaign" as const, outcome: "win" as const, nationID: "nation-a", campaignCompleted: true },
      { id: "solo-practice", variant: "practice" as const, outcome: "win" as const, nationID: "nation-b", practiceScore: 44 }
    ]) {
      expect(store.recordGameStart(created.account.id, {
        id: entry.id,
        scope: "solo",
        variant: entry.variant,
        status: "started",
        outcome: "unknown",
        playerCount: 1,
        nationID: entry.nationID
      }).ok).toBe(true);
      expect(store.recordGameResult(created.account.id, {
        id: entry.id,
        outcome: entry.outcome,
        campaignCompleted: entry.campaignCompleted,
        practiceScore: entry.practiceScore
      }).ok).toBe(true);
    }

    const account = store.getAccount(created.account.id);
    expect(account?.stats.solo.standard).toEqual(expect.objectContaining({ gamesPlayed: 1, wins: 0, losses: 1 }));
    expect(account?.stats.solo.campaign).toEqual(expect.objectContaining({ campaignsStarted: 1, campaignsCompleted: 1, gamesPlayed: 1, wins: 1 }));
    expect(account?.stats.solo.practice).toEqual(expect.objectContaining({ gamesPlayed: 1, wins: 1, bestScore: 44 }));
    expect(account?.stats.byNation["nation-a"]).toEqual(expect.objectContaining({ gamesPlayed: 2, wins: 1, losses: 1, soloGamesPlayed: 2, campaignGamesPlayed: 1 }));
    expect(account?.stats.byNation["nation-b"]).toEqual(expect.objectContaining({ gamesPlayed: 1, wins: 1, practiceGamesPlayed: 1 }));
  });
});
