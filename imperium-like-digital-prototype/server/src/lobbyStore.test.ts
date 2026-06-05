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

  it("sorts joinable setup games before spectatable in-progress games", () => {
    const store = createLobbyStore({ now: () => "2026-06-05T01:00:00.000Z" });
    store.createMatchMetadata({ matchID: "full", roomName: "Full", playerCount: 1, setupData: {}, privateDataFingerprint: "placeholder" });
    store.recordPlayerJoin({ matchID: "full", playerID: "0", playerName: "A" });
    store.createMatchMetadata({ matchID: "watch", roomName: "Watch", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });
    store.markMatchInProgress("watch");
    store.createMatchMetadata({ matchID: "open", roomName: "Open", playerCount: 2, setupData: {}, privateDataFingerprint: "placeholder" });

    expect(store.listMatches().map((match) => match.matchID)).toEqual(["open", "watch", "full"]);
  });
});
