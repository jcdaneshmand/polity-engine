import { describe, expect, it } from "vitest";
import { normalizeNationStrategy } from "../../../tools/card-import/normalizeNationStrategy";

describe("private nation strategy import", () => {
  it("imports a tested public-safe fixture strategy profile", () => {
    const normalized = normalizeNationStrategy({
      nation_id: "fixture_strategy_nation",
      public_placeholder_name: "Fixture Strategy Nation",
      nation_name_private: "",
      complexity: "5",
      aggression: "ruthless",
      public_placeholder_summary: "Fixture profile for strategy import coverage.",
      private_core_gameplan: "",
      private_early_game: "",
      private_mid_game: "",
      private_late_game: "",
      private_key_mechanics: "ceremony-style side system|resource pressure",
      private_market_priorities: "",
      private_risk_notes: "can push or exploit collapse|needs special game-end testing",
      private_rules_engine_notes: "",
      implemented: "true",
      tested: "true"
    });

    expect(normalized.nationId).toBe("fixture_strategy_nation");
    expect(normalized.complexity).toBe(5);
    expect(normalized.aggression).toBe("ruthless");
    expect(normalized.privateKeyMechanics).toContain("ceremony-style side system");
    expect(normalized.privateRiskNotes).toContain("needs special game-end testing");
    expect(normalized.implemented).toBe(true);
    expect(normalized.tested).toBe(true);
  });
});
