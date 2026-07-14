import { describe, expect, it } from "vitest";
import { parseSavedLocalGame, serializeLocalGame } from "./localGameSave";

describe("local game save envelope", () => {
  it("serializes a versioned local game envelope", () => {
    const raw = serializeLocalGame({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      now: new Date("2026-07-14T05:00:00.000Z"),
      state: {
        options: { playerCount: 2, mode: "multiplayer" },
        ctx: { currentPlayer: "1", turn: 4 },
        players: { "1": { hand: ["fixture_action_gain_materials"] } }
      }
    });

    expect(JSON.parse(raw)).toEqual({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: {
        options: { playerCount: 2, mode: "multiplayer" },
        ctx: { currentPlayer: "1", turn: 4 },
        players: { "1": { hand: ["fixture_action_gain_materials"] } }
      }
    });
  });

  it("parses a valid saved game and preserves turn state", () => {
    const parsed = parseSavedLocalGame(JSON.stringify({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: {
        options: { enabledVariants: ["quick_setup"] },
        turn: { currentPlayer: "2", round: 3 }
      }
    }));

    expect(parsed?.state).toEqual({
      options: { enabledVariants: ["quick_setup"] },
      turn: { currentPlayer: "2", round: 3 }
    });
  });

  it("rejects corrupt saved JSON", () => {
    expect(parseSavedLocalGame("{not json")).toBeNull();
  });

  it("rejects unsupported versions", () => {
    expect(parseSavedLocalGame(JSON.stringify({
      version: 99,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state: {}
    }))).toBeNull();
  });

  it("does not serialize or parse private official fields", () => {
    const state = {
      cardDb: {
        fixture_card: {
          id: "fixture_card",
          rawEffectTextPrivate: "private text must not be saved"
        }
      }
    };

    expect(() => serializeLocalGame({
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state
    })).toThrow("private fields");
    expect(parseSavedLocalGame(JSON.stringify({
      version: 1,
      savedAtIso: "2026-07-14T05:00:00.000Z",
      privateDataFingerprint: "fictional-fixture-fingerprint",
      state
    }))).toBeNull();
  });
});
