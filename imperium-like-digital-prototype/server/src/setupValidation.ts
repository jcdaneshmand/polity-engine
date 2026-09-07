import { createInitialGameState } from "../../engine/src/game/initialState";
import { CommonsSetupValidationError, type CommonsAnalysisIssue } from "../../engine/src/setup/commonsAnalysis";

export type MatchSetupValidation =
  | { ok: true }
  | { ok: false; error: "invalid_setup"; issues: Array<Pick<CommonsAnalysisIssue, "code" | "severity" | "category" | "message" | "required" | "available">> };

export function validateMatchSetupData(value: unknown): MatchSetupValidation {
  try {
    const setupData = value && typeof value === "object" ? value as Parameters<typeof createInitialGameState>[0] : {};
    createInitialGameState({ ...setupData, enforceCommonsValidation: true });
    return { ok: true };
  } catch (error) {
    if (error instanceof CommonsSetupValidationError) {
      return {
        ok: false,
        error: "invalid_setup",
        issues: error.analysis.issues
          .filter((issue) => issue.severity === "blocking")
          .map(({ code, severity, category, message, required, available }) => ({ code, severity, category, message, required, available }))
      };
    }
    return {
      ok: false,
      error: "invalid_setup",
      issues: [{ code: "invalid_setup", severity: "blocking", category: "setup", message: error instanceof Error ? error.message : "Setup data is invalid." }]
    };
  }
}
