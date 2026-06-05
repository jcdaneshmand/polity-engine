import { describe, expect, it } from "vitest";
import { ACCOUNT_SESSION_STORAGE_KEY, parseAccountSessionRecord, serializeAccountSessionRecord } from "./accountSession";

describe("account session storage helpers", () => {
  it("round-trips a saved account session", () => {
    const record = {
      token: "token-1",
      account: {
        id: "account-1",
        email: "jonah@example.com",
        username: "Jonah",
        role: "admin" as const,
        createdAt: "2026-06-05T12:00:00.000Z",
        updatedAt: "2026-06-05T12:00:00.000Z",
        stats: {
          solo: {
            standard: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 },
            campaign: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0, campaignsStarted: 0, campaignsCompleted: 0 },
            practice: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 }
          },
          online: { gamesPlayed: 0, wins: 0, losses: 0, unfinished: 0 },
          byNation: {}
        }
      }
    };

    expect(parseAccountSessionRecord(serializeAccountSessionRecord(record))).toEqual(record);
    expect(ACCOUNT_SESSION_STORAGE_KEY).toBe("polity-engine.accountSession.v1");
  });

  it("rejects malformed saved account sessions", () => {
    expect(parseAccountSessionRecord("{")).toBeUndefined();
    expect(parseAccountSessionRecord(JSON.stringify({ token: "token-1" }))).toBeUndefined();
    expect(parseAccountSessionRecord(JSON.stringify({ token: "token-1", account: { username: "Jonah" } }))).toBeUndefined();
  });
});
