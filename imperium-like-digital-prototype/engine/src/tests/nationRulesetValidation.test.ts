import { describe, expect, it } from "vitest";
import path from "node:path";
import { validateNationRuleset } from "../nations/nationRulesetValidation";
import type { NationRuleset } from "../nations/nationRulesetTypes";
import { validateNationRulesetCompatibility } from "../nations/nationRulesetRegistry";
import { parseCsvFile } from "../../../tools/card-import/csvParser";
import { normalizeNationRuleset } from "../../../tools/card-import/normalizeNationRuleset";

const privateRulesetCsvPath = path.resolve(import.meta.dirname, "../../../private-card-data/imperium_nation_rulesets_private.csv");

function ruleset(overrides: Partial<NationRuleset> = {}): NationRuleset {
  return {
    nationId: "test_nation",
    displayName: "Test Nation",
    rulesetTags: [],
    requiredExpansions: [],
    setupOverrides: [],
    zoneOverrides: [],
    stateOverrides: [],
    reshuffleOverrides: [],
    cleanupOverrides: [],
    solsticeOverrides: [],
    scoringOverrides: [],
    collapseOverrides: [],
    botOverrides: [],
    shortGameOverrides: [],
    hookRules: [],
    implemented: true,
    tested: true,
    ...overrides,
  };
}

describe("nation ruleset validation", () => {
  it("accepts payload card hook conditions", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_play_card",
        condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "civilized" } as any,
        effects: [],
      }],
    }));

    expect(issues).toEqual([]);
  });

  it("rejects unsupported hook conditions", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_play_card",
        condition: { op: "not_real" } as any,
        effects: [],
      }],
    }));

    expect(issues.some((issue) => issue.field === "hookRules[0].condition.op")).toBe(true);
  });

  it("imports the Inuit short-game exception that skips default Nation-card advancement", () => {
    const rows = parseCsvFile(privateRulesetCsvPath);
    const inuit = rows.find((row) => row.nation_id === "inuit");

    expect(inuit).toBeDefined();
    const normalized = normalizeNationRuleset(inuit as any);

    expect(normalized.shortGameOverrides).toContainEqual({ op: "add_nation_cards_to_discard", count: 0 });
    expect(normalized.shortGameOverrides).toContainEqual({
      op: "move_development_cards_to_discard",
      cardIds: ["TODO_PRIVATE_INUIT_WINTER_CARD_ID", "TODO_PRIVATE_INUIT_SUMMER_CARD_ID"]
    });
  });

  it("imports Utopians as excluded from the short game variant", () => {
    const rows = parseCsvFile(privateRulesetCsvPath);
    const utopians = rows.find((row) => row.nation_id === "utopians");

    expect(utopians).toBeDefined();
    const normalized = normalizeNationRuleset(utopians as any);

    expect(normalized.rulesetTags).toContain("short_game_excluded");
    expect(normalized.shortGameOverrides).toContainEqual({ op: "excluded_from_short_game" });
    expect(validateNationRulesetCompatibility({ id: "utopians", displayName: "Utopians", powerCardIds: [], stateCardIds: [], startingDeckCardIds: [], nationDeckCardIds: [], developmentCardIds: [], setupRules: [], passiveRules: [], actionTokensBase: 3, exhaustTokensBase: 5, requiredExpansions: [], implemented: false, tested: false } as any, normalized, { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: ["short_game"] })).toContain("Ruleset excluded by enabled variant short_game");
  });

  it("imports the Martians Alien-state scoring, payment, and nadir reshuffle exceptions", () => {
    const rows = parseCsvFile(privateRulesetCsvPath);
    const martians = rows.find((row) => row.nation_id === "martians");

    expect(martians).toBeDefined();
    const normalized = normalizeNationRuleset(martians as any);

    expect(normalized.stateOverrides).toContainEqual({ op: "start_as_state", state: "alien" });
    expect(normalized.stateOverrides).toContainEqual({ op: "take_unrest_when_spending_resource", resource: "knowledge", state: "alien" });
    expect(normalized.reshuffleOverrides).toContainEqual({
      op: "place_nation_card_in_play_when_added",
      cardId: "TODO_PRIVATE_REACTOR_OR_NADIR_CARD_ID",
      suppressStateFlip: true
    });
    expect(normalized.solsticeOverrides).toContainEqual({
      op: "remove_play_card_and_nation_deck_if_resource_empty",
      cardId: "TODO_PRIVATE_REACTOR_OR_NADIR_CARD_ID",
      resource: "knowledge",
      state: "alien",
      activateState: "native"
    });
    expect(normalized.scoringOverrides).toContainEqual({ op: "score_resource_ratio", resource: "knowledge", denominator: 3, state: "alien" });
    expect(validateNationRuleset(normalized)).toEqual([]);
  });
});
