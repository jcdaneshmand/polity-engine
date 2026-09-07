export const CURRENT_RULES_VERSION = 3 as const;
export const CURRENT_GAME_STATE_VERSION = 1 as const;

export type GameStateCompatibility =
  | { kind: "current" }
  | { kind: "legacy-rules"; found?: number }
  | { kind: "future-rules"; found: number }
  | { kind: "unsupported-state"; found?: number }
  | { kind: "malformed" };

export function isCurrentRulesVersion(value: unknown): value is typeof CURRENT_RULES_VERSION {
  return value === CURRENT_RULES_VERSION;
}

export function inspectGameStateCompatibility(value: unknown): GameStateCompatibility {
  if (!value || typeof value !== "object") return { kind: "malformed" };
  const state = value as { rulesVersion?: unknown; stateVersion?: unknown };
  if (state.rulesVersion === undefined) return { kind: "legacy-rules" };
  if (typeof state.rulesVersion !== "number" || !Number.isSafeInteger(state.rulesVersion)) return { kind: "malformed" };
  if (state.rulesVersion < CURRENT_RULES_VERSION) return { kind: "legacy-rules", found: state.rulesVersion };
  if (state.rulesVersion > CURRENT_RULES_VERSION) return { kind: "future-rules", found: state.rulesVersion };
  if (state.stateVersion === undefined) return { kind: "unsupported-state" };
  if (typeof state.stateVersion !== "number" || state.stateVersion !== CURRENT_GAME_STATE_VERSION) {
    return { kind: "unsupported-state", ...(typeof state.stateVersion === "number" ? { found: state.stateVersion } : {}) };
  }
  return { kind: "current" };
}
