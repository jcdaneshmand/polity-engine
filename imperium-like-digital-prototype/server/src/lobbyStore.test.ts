import { describe, expect, it } from "vitest";
import { createLobbyStore } from "./lobbyStore";

describe("lobby store", () => {
  it("lists locked games without leaking password verifiers", () => {
    const store = createLobbyStore({
      now: () => "2026-06-05T01:00:00.000Z",
      hashPassword: (value) => `hash:${value}`
    });

    store.createMatchMetadata({
      matchID: "match-1",
      roomName: "Locked Table",
      playerCount: 2,
      setupData: {
        options: { commonsSetId: "classics", enabledExpansions: [], enabledVariants: [] },
        playerNationIds: { "1": "Sun Coast", "2": "River League" }
      },
      privateDataFingerprint: "private:abc",
      password: "swordfish"
    });

    expect(store.listMatches()).toEqual([
      expect.objectContaining({
        matchID: "match-1",
        roomName: "Locked Table",
        isLocked: true,
        privateDataLabel: "private_data_required"
      })
    ]);
    expect(JSON.stringify(store.listMatches())).not.toContain("swordfish");
    expect(JSON.stringify(store.listMatches())).not.toContain("hash:swordfish");
  });

  it("validates passwords and private data fingerprints before access", () => {
    const store = createLobbyStore({
      now: () => "2026-06-05T01:00:00.000Z",
      hashPassword: (value) => `hash:${value}`
    });

    store.createMatchMetadata({
      matchID: "match-1",
      roomName: "Locked",
      playerCount: 2,
      setupData: {},
      privateDataFingerprint: "fp-a",
      password: "pw"
    });

    expect(store.validateAccess({ matchID: "match-1", password: "wrong", privateDataFingerprint: "fp-a" })).toEqual({ ok: false, reason: "wrong_password" });
    expect(store.validateAccess({ matchID: "match-1", password: "pw", privateDataFingerprint: "fp-b" })).toEqual({ ok: false, reason: "private_data_mismatch" });
    expect(store.validateAccess({ matchID: "match-1", password: "pw", privateDataFingerprint: "fp-a" })).toEqual({ ok: true });
  });

  it("accepts pre-hashed passwords for started lobby matches", () => {
    const store = createLobbyStore({
      now: () => "2026-06-05T01:00:00.000Z",
      hashPassword: (value) => `hash:${value}`
    });

    store.createMatchMetadata({
      matchID: "match-1",
      roomName: "Started",
      playerCount: 2,
      setupData: {},
      privateDataFingerprint: "fp-a",
      passwordVerifier: "hash:pw",
      status: "in_progress",
      occupiedSeats: [
        { playerID: "0", playerName: "Host", isConnected: true },
        { playerID: "1", playerName: "Guest", isConnected: true }
      ]
    });

    expect(store.listMatches()).toEqual([
      expect.objectContaining({
        matchID: "match-1",
        status: "in_progress",
        isLocked: true,
        availableSeats: [],
        occupiedSeats: [
          { playerID: "0", playerName: "Host", isConnected: true },
          { playerID: "1", playerName: "Guest", isConnected: true }
        ]
      })
    ]);
    expect(store.validateAccess({ matchID: "match-1", password: "pw", privateDataFingerprint: "fp-a" })).toEqual({ ok: true });
  });

  it("sorts joinable setup games before spectatable in-progress games", () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    store.createMatchMetadata({ matchID: "full", roomName: "Full", playerCount: 1, setupData: {}, privateDataFingerprint: "placeholder" });
    store.recordPlayerJoin({ matchID: "full", playerID: "0", playerName: "A" });
    store.createMatchMetadata({ matchID: "watch", roomName: "Watch", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });
    store.markMatchInProgress("watch");
    store.createMatchMetadata({ matchID: "open", roomName: "Open", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });

    expect(store.listMatches().map((match) => match.matchID)).toEqual(["open", "watch", "full"]);
  });

  it("removes listed games after the last occupied seat leaves", () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    store.createMatchMetadata({ matchID: "match-1", roomName: "Leaving", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });
    store.recordPlayerJoin({ matchID: "match-1", playerID: "0", playerName: "Host" });
    store.recordPlayerJoin({ matchID: "match-1", playerID: "1", playerName: "Guest" });

    expect(store.recordPlayerLeave({ matchID: "match-1", playerID: "0" })).toEqual(expect.objectContaining({
      matchID: "match-1",
      occupiedSeats: [expect.objectContaining({ playerID: "1" })],
      availableSeats: ["0"]
    }));
    expect(store.recordPlayerLeave({ matchID: "match-1", playerID: "1" })).toBeUndefined();
    expect(store.listMatches()).toEqual([]);
  });

  it("clears all listed games at once", () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    store.createMatchMetadata({ matchID: "match-1", roomName: "One", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });
    store.createMatchMetadata({ matchID: "match-2", roomName: "Two", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });

    expect(store.clearMatches()).toBe(2);
    expect(store.listMatches()).toEqual([]);
  });

  it("finds an existing player seat for the same client in one match", () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    store.createMatchMetadata({ matchID: "match-1", roomName: "Open", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });
    store.recordPlayerJoin({ matchID: "match-1", playerID: "0", playerName: "Host", clientID: "client-a" });

    expect(store.findPlayerByClientID("match-1", "client-a")).toEqual({ playerID: "0" });
    expect(store.findPlayerByClientID("match-1", "client-b")).toBeUndefined();
  });

  it("frees seats when player heartbeats go stale", () => {
    let nowMs = Date.parse("2026-06-05T01:00:00.000Z");
    const store = createLobbyStore({ now: () => new Date(nowMs).toISOString(), playerStaleMs: 15_000 });
    store.createMatchMetadata({ matchID: "match-1", roomName: "Open", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });
    store.recordPlayerJoin({ matchID: "match-1", playerID: "0", playerName: "Host", clientID: "client-a" });

    nowMs += 10_000;
    expect(store.heartbeatPlayer({ matchID: "match-1", playerID: "0", clientID: "client-a" })).toEqual({ ok: true });

    nowMs += 14_000;
    expect(store.listMatches()[0]).toEqual(expect.objectContaining({
      occupiedSeats: [expect.objectContaining({ playerID: "0" })],
      availableSeats: ["1"]
    }));

    nowMs += 2_000;
    expect(store.listMatches()[0]).toEqual(expect.objectContaining({
      occupiedSeats: [],
      availableSeats: ["0", "1"]
    }));
  });
});
