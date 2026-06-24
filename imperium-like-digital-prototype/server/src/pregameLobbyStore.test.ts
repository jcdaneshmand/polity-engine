import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPregameLobbyStore } from "./pregameLobbyStore";

function setupData(playerCount = 2) {
  return {
    options: {
      playerCount,
      mode: "multiplayer",
      commonsSetId: "classics",
      enabledExpansions: [],
      enabledVariants: []
    },
    playerNationIds: {}
  };
}

describe("pregame lobby store", () => {
  it("creates a lobby with host in seat 0 and public-safe list metadata", () => {
    let id = 0;
    const store = createPregameLobbyStore({
      now: () => "2026-06-05T10:00:00.000Z",
      createID: () => `id-${id += 1}`,
      createCredential: () => `cred-${id += 1}`,
      hashPassword: (value) => `hash:${value}`
    });

    const created = store.createLobby({
      roomName: "Friday Table",
      playerCount: 2,
      setupData: setupData(),
      privateDataFingerprint: "private:abc",
      password: "swordfish",
      hostName: "Host"
    });

    expect(created).toEqual(expect.objectContaining({
      lobbyID: "id-1",
      seatID: "0",
      lobbyCredentials: "cred-3"
    }));
    expect(store.listLobbies()).toEqual([
      expect.objectContaining({
        lobbyID: "id-1",
        roomName: "Friday Table",
        isLocked: true,
        privateDataLabel: "private_data_required",
        occupiedSeats: [expect.objectContaining({ seatID: "0", displayName: "Host", ready: false })],
        availableSeats: ["1"]
      })
    ]);
    expect(JSON.stringify(store.listLobbies())).not.toContain("swordfish");
    expect(JSON.stringify(store.listLobbies())).not.toContain("hash:swordfish");
    expect(JSON.stringify(store.listLobbies())).not.toContain("private:abc");
    expect(JSON.stringify(store.listLobbies())).not.toContain("cred-3");
  });

  it("rejects a second lobby seat for the same client", () => {
    const store = createPregameLobbyStore({ now: () => "2026-06-05T01:00:00.000Z", createID: () => "generated", createCredential: () => "credential" });
    const host = store.createLobby({ playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host", clientID: "client-a" });

    expect(store.joinLobby({ lobbyID: host.lobbyID, displayName: "Duplicate", privateDataFingerprint: "placeholder", clientID: "client-a" })).toEqual({ ok: false, reason: "duplicate_client" });
  });

  it("clears ready state after host setup changes and player nation changes", () => {
    let id = 0;
    const store = createPregameLobbyStore({
      now: () => "2026-06-05T10:00:00.000Z",
      createID: () => `id-${id += 1}`,
      createCredential: () => `cred-${id += 1}`
    });
    const host = store.createLobby({ playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" });
    const guest = store.joinLobby({ lobbyID: host.lobbyID, displayName: "Guest", privateDataFingerprint: "placeholder" });
    if (!guest.ok) throw new Error("guest join failed");

    expect(store.selectNation({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, nationID: "test_nation_sun_coast" }).ok).toBe(true);
    expect(store.selectNation({ lobbyID: host.lobbyID, lobbyCredentials: guest.lobbyCredentials, nationID: "test_nation_sun_coast" }).ok).toBe(true);
    expect(store.setReady({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, ready: true }).ok).toBe(true);
    expect(store.setReady({ lobbyID: host.lobbyID, lobbyCredentials: guest.lobbyCredentials, ready: true }).ok).toBe(true);
    expect(store.getLobbyForCredentials(host.lobbyID, host.lobbyCredentials)?.status).toBe("locked");

    expect(store.updateSetup({
      lobbyID: host.lobbyID,
      lobbyCredentials: host.lobbyCredentials,
      setupData: setupData(3),
      playerCount: 3
    }).ok).toBe(true);
    expect(store.getLobbyForCredentials(host.lobbyID, host.lobbyCredentials)?.seats.map((seat) => seat.ready)).toEqual([false, false, false]);
    expect(store.getLobbyForCredentials(host.lobbyID, host.lobbyCredentials)?.status).toBe("waiting");

    expect(store.setReady({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, ready: true }).ok).toBe(true);
    expect(store.selectNation({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, nationID: "test_nation_sun_coast" }).ok).toBe(true);
    expect(store.getLobbyForCredentials(host.lobbyID, host.lobbyCredentials)?.seats[0].ready).toBe(false);
  });

  it("requires all seats to be occupied, selected, and ready before lock", () => {
    let id = 0;
    const store = createPregameLobbyStore({
      now: () => "2026-06-05T10:00:00.000Z",
      createID: () => `id-${id += 1}`,
      createCredential: () => `cred-${id += 1}`
    });
    const host = store.createLobby({ playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" });

    expect(store.selectNation({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, nationID: "test_nation_sun_coast" }).ok).toBe(true);
    expect(store.setReady({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, ready: true }).ok).toBe(true);
    expect(store.getLobbyForCredentials(host.lobbyID, host.lobbyCredentials)?.status).toBe("waiting");

    const guest = store.joinLobby({ lobbyID: host.lobbyID, displayName: "Guest", privateDataFingerprint: "placeholder" });
    if (!guest.ok) throw new Error("guest join failed");
    expect(store.selectNation({ lobbyID: host.lobbyID, lobbyCredentials: guest.lobbyCredentials, nationID: "test_nation_sun_coast" }).ok).toBe(true);
    expect(store.setReady({ lobbyID: host.lobbyID, lobbyCredentials: guest.lobbyCredentials, ready: true }).ok).toBe(true);
    expect(store.getLobbyForCredentials(host.lobbyID, host.lobbyCredentials)?.status).toBe("locked");
  });

  it("closes a lobby immediately when the last occupied seat leaves", () => {
    const store = createPregameLobbyStore({
      now: () => "2026-06-05T10:00:00.000Z",
      createID: () => "id",
      createCredential: () => "cred"
    });
    const host = store.createLobby({ playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" });
    expect(store.postLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, text: "Closing up." }).ok).toBe(true);

    expect(store.leaveLobby({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials })).toEqual({ ok: true });

    expect(store.listLobbies()).toEqual([]);
    expect(store.getLobbyForCredentials(host.lobbyID, host.lobbyCredentials)).toBeUndefined();
    expect(store.listLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials })).toEqual({ ok: false, reason: "lobby_not_found" });
  });

  it("deletes empty unstarted lobbies after the cleanup grace period but keeps started lobbies", () => {
    let nowMs = Date.parse("2026-06-05T10:00:00.000Z");
    let id = 0;
    const store = createPregameLobbyStore({
      now: () => new Date(nowMs).toISOString(),
      createID: () => `id-${id += 1}`,
      createCredential: () => `cred-${id += 1}`,
      cleanupGraceMs: 10 * 60 * 1000,
      playerStaleMs: 15_000
    });
    const abandoned = store.createLobby({ playerCount: 1, setupData: setupData(1), privateDataFingerprint: "placeholder", hostName: "Host" });
    const started = store.createLobby({ playerCount: 1, setupData: setupData(1), privateDataFingerprint: "placeholder", hostName: "Started" });

    store.markStarted({
      lobbyID: started.lobbyID,
      matchID: "match-1",
      playerCredentialsBySeat: { "0": "player-token" }
    });

    nowMs += 20_000;
    expect(store.listLobbies()).toEqual([expect.objectContaining({ lobbyID: abandoned.lobbyID, occupiedSeats: [] })]);
    nowMs += 9 * 60 * 1000;
    expect(store.cleanupEmptyLobbies()).toEqual([]);
    nowMs += 2 * 60 * 1000;
    expect(store.cleanupEmptyLobbies()).toEqual([abandoned.lobbyID]);
    expect(store.listLobbies().map((lobby) => lobby.lobbyID)).toEqual([]);
    expect(store.getStartedMatch(started.lobbyID)).toEqual(expect.objectContaining({ matchID: "match-1" }));
  });

  it("clears all listed lobbies and their lobby chat", () => {
    const store = createPregameLobbyStore({
      now: () => "2026-06-05T10:00:00.000Z",
      createID: () => "id",
      createCredential: () => "cred"
    });
    const host = store.createLobby({ playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" });
    expect(store.postLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, text: "Clearing soon." }).ok).toBe(true);

    expect(store.clearLobbies()).toBe(1);
    expect(store.listLobbies()).toEqual([]);
    expect(store.listLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials })).toEqual({ ok: false, reason: "lobby_not_found" });
  });

  it("frees lobby seats when player heartbeats go stale", () => {
    let nowMs = Date.parse("2026-06-05T10:00:00.000Z");
    const store = createPregameLobbyStore({
      now: () => new Date(nowMs).toISOString(),
      createID: () => "id",
      createCredential: () => "cred",
      playerStaleMs: 15_000
    });
    const host = store.createLobby({ playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host", clientID: "client-a" });

    nowMs += 10_000;
    expect(store.heartbeatLobby({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials })).toEqual({ ok: true });
    nowMs += 14_000;
    expect(store.listLobbies()[0]).toEqual(expect.objectContaining({
      occupiedSeats: [expect.objectContaining({ seatID: "0" })],
      availableSeats: ["1"]
    }));

    nowMs += 2_000;
    expect(store.listLobbies()[0]).toEqual(expect.objectContaining({
      occupiedSeats: [],
      availableSeats: ["0", "1"]
    }));
  });

  it("stores lounge and credentialed lobby chat messages", () => {
    let id = 0;
    const store = createPregameLobbyStore({
      now: () => "2026-06-05T10:00:00.000Z",
      createID: () => `id-${id += 1}`,
      createCredential: () => `cred-${id += 1}`
    });
    const host = store.createLobby({ playerCount: 2, setupData: setupData(), privateDataFingerprint: "placeholder", hostName: "Host" });

    expect(store.postLoungeChat({ author: "Jonah", text: "Anyone up for a game?" })).toEqual({
      ok: true,
      message: expect.objectContaining({ author: "Jonah", text: "Anyone up for a game?", createdAt: "2026-06-05T10:00:00.000Z" })
    });
    expect(store.listLoungeChat()).toEqual([
      expect.objectContaining({ author: "Jonah", text: "Anyone up for a game?" })
    ]);

    expect(store.postLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, text: "Ready when you are." })).toEqual({
      ok: true,
      message: expect.objectContaining({ author: "Host", text: "Ready when you are." })
    });
    expect(store.listLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials })).toEqual({
      ok: true,
      messages: [expect.objectContaining({ author: "Host", text: "Ready when you are." })]
    });
    expect(store.postLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: "wrong", text: "Nope" })).toEqual({ ok: false, reason: "invalid_credentials" });
  });

  it("reloads persisted lobby rooms, chat, and started-match credentials", () => {
    const dir = mkdtempSync(join(tmpdir(), "polity-pregame-store-"));
    const storageFile = join(dir, "pregame-lobbies.json");
    try {
      let id = 0;
      const store = createPregameLobbyStore({
        now: () => "2026-06-05T10:00:00.000Z",
        createID: () => `id-${id += 1}`,
        createCredential: () => `cred-${id += 1}`,
        hashPassword: (value) => `hash:${value}`,
        storageFile
      });
      const host = store.createLobby({
        roomName: "Restart Lobby",
        playerCount: 2,
        setupData: setupData(),
        privateDataFingerprint: "private:abc",
        password: "swordfish",
        hostName: "Host",
        clientID: "client-host"
      });
      const guest = store.joinLobby({
        lobbyID: host.lobbyID,
        displayName: "Guest",
        privateDataFingerprint: "private:abc",
        password: "swordfish",
        clientID: "client-guest"
      });
      if (!guest.ok) throw new Error("guest join failed");
      expect(store.postLoungeChat({ author: "Host", text: "Table open." }).ok).toBe(true);
      expect(store.postLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials, text: "Welcome." }).ok).toBe(true);
      store.markStarted({
        lobbyID: host.lobbyID,
        matchID: "match-1",
        playerCredentialsBySeat: { "0": "player-token-0", "1": "player-token-1" }
      });

      const reloaded = createPregameLobbyStore({
        now: () => "2026-06-05T10:00:00.000Z",
        hashPassword: (value) => `hash:${value}`,
        storageFile
      });

      expect(reloaded.getStartedMatch(host.lobbyID)).toEqual({ matchID: "match-1" });
      expect(reloaded.getLobbyForCredentials(host.lobbyID, host.lobbyCredentials)).toEqual(expect.objectContaining({
        lobbyID: host.lobbyID,
        roomName: "Restart Lobby",
        startedMatchID: "match-1",
        playerCredentials: "player-token-0"
      }));
      expect(reloaded.listLobbyChat({ lobbyID: host.lobbyID, lobbyCredentials: host.lobbyCredentials })).toEqual({
        ok: true,
        messages: [expect.objectContaining({ author: "Host", text: "Welcome." })]
      });
      expect(reloaded.listLoungeChat()).toEqual([expect.objectContaining({ author: "Host", text: "Table open." })]);
      expect(JSON.stringify(reloaded.listLobbies())).not.toContain("swordfish");
      expect(JSON.stringify(reloaded.listLobbies())).not.toContain("player-token-0");

      expect(reloaded.clearLobbies()).toBe(1);
      expect(createPregameLobbyStore({ storageFile }).getStartedMatch(host.lobbyID)).toBeUndefined();
      expect(createPregameLobbyStore({ storageFile }).listLoungeChat()).toEqual([expect.objectContaining({ text: "Table open." })]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
