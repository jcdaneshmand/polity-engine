import { describe, expect, it } from "vitest";
import {
  CURRENT_GAME_STATE_VERSION,
  CURRENT_RULES_VERSION,
  inspectGameStateCompatibility,
  isCurrentRulesVersion
} from "../game/version";

describe("canonical game-state compatibility", () => {
  it("accepts only the current rules and state versions", () => {
    expect(inspectGameStateCompatibility({
      rulesVersion: CURRENT_RULES_VERSION,
      stateVersion: CURRENT_GAME_STATE_VERSION
    })).toEqual({ kind: "current" });
    expect(isCurrentRulesVersion(CURRENT_RULES_VERSION)).toBe(true);
    expect(isCurrentRulesVersion(CURRENT_RULES_VERSION - 1)).toBe(false);
  });

  it.each([
    [undefined, { kind: "malformed" }],
    [{}, { kind: "legacy-rules" }],
    [{ rulesVersion: CURRENT_RULES_VERSION - 1, stateVersion: CURRENT_GAME_STATE_VERSION }, { kind: "legacy-rules", found: CURRENT_RULES_VERSION - 1 }],
    [{ rulesVersion: CURRENT_RULES_VERSION + 1, stateVersion: CURRENT_GAME_STATE_VERSION }, { kind: "future-rules", found: CURRENT_RULES_VERSION + 1 }],
    [{ rulesVersion: CURRENT_RULES_VERSION }, { kind: "unsupported-state" }],
    [{ rulesVersion: CURRENT_RULES_VERSION, stateVersion: CURRENT_GAME_STATE_VERSION + 1 }, { kind: "unsupported-state", found: CURRENT_GAME_STATE_VERSION + 1 }],
    [{ rulesVersion: "3", stateVersion: CURRENT_GAME_STATE_VERSION }, { kind: "malformed" }]
  ])("classifies incompatible state %# without mutating it", (state, expected) => {
    const before = JSON.stringify(state);
    expect(inspectGameStateCompatibility(state)).toEqual(expected);
    expect(JSON.stringify(state)).toBe(before);
  });
});
