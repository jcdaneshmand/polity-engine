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

  it("normalizes rulebook resource names in imported ruleset override JSON", () => {
    const normalized = normalizeNationRuleset({
      nation_id: "resource_nation",
      public_placeholder_name: "Resource Nation",
      nation_name_private: "",
      ruleset_tags: "",
      required_expansions: "",
      excluded_expansions: "",
      allowed_modes: "",
      disallowed_modes: "",
      required_variants: "",
      excluded_variants: "",
      setup_overrides_json: JSON.stringify([{ op: "gain_resource", resource: "population", count: 1 }]),
      zone_overrides_json: "",
      state_overrides_json: JSON.stringify([{ op: "take_unrest_when_spending_resource", resource: "progress" }]),
      reshuffle_overrides_json: JSON.stringify([{ op: "custom_reshuffle_effect", effect: [{ trigger: "on_play", op: "gain_resource", resource: "progress", amount: 1 }] }]),
      cleanup_overrides_json: JSON.stringify([{ op: "market_resource_added", resource: "progress", count: 1 }]),
      solstice_overrides_json: JSON.stringify([{ op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "nadir", resource: "progress" }]),
      scoring_overrides_json: JSON.stringify([{ op: "score_resource_ratio", resource: "progress", denominator: 3 }]),
      collapse_overrides_json: "",
      bot_overrides_json: JSON.stringify([
        { op: "bot_custom_cleanup", effect: [{ op: "bot_gain_resource", resource: "progress", count: 1 }] },
        { op: "bot_cleanup_market_resource", resource: "population", count: 2 },
      ]),
      short_game_overrides_json: JSON.stringify([{ op: "remove_starting_resource", resource: "population", count: 1 }, { op: "remove_starting_resources", resources: ["population", "progress"] }]),
      hook_rules_json: JSON.stringify([{ trigger: "after_reshuffle", effects: [{ trigger: "on_play", op: "gain_resource", resource: "progress", amount: 1 }] }]),
      public_summary: "",
      private_notes: "",
      implemented: "true",
      tested: "true"
    });

    expect(normalized.setupOverrides).toEqual([{ op: "gain_resource", resource: "influence", count: 1 }]);
    expect(normalized.stateOverrides).toEqual([{ op: "take_unrest_when_spending_resource", resource: "knowledge" }]);
    expect(normalized.reshuffleOverrides).toEqual([{ op: "custom_reshuffle_effect", effect: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] }]);
    expect(normalized.cleanupOverrides).toEqual([{ op: "market_resource_added", resource: "knowledge", count: 1 }]);
    expect(normalized.solsticeOverrides).toEqual([{ op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "nadir", resource: "knowledge" }]);
    expect(normalized.scoringOverrides).toEqual([{ op: "score_resource_ratio", resource: "knowledge", denominator: 3 }]);
    expect(normalized.botOverrides).toEqual([
      { op: "bot_custom_cleanup", effect: [{ op: "bot_gain_resource", resource: "knowledge", count: 1 }] },
      { op: "bot_cleanup_market_resource", resource: "influence", count: 2 },
    ]);
    expect(normalized.shortGameOverrides).toEqual([{ op: "remove_starting_resource", resource: "influence", count: 1 }, { op: "remove_starting_resources", resources: ["influence", "knowledge"] }]);
    expect(normalized.hookRules).toEqual([{ trigger: "after_reshuffle", effects: [{ trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 }] }]);
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

  it("rejects invalid resources inside hook effect payloads", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [{ op: "gain_resource", resource: "stone", amount: 1 } as any],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "hookRules[0].effects[0].resource",
      reason: "invalid resource 'stone'",
    });
  });

  it("rejects invalid resources inside top-level ruleset overrides", () => {
    const issues = validateNationRuleset(ruleset({
      setupOverrides: [{ op: "set_initial_resources", resources: { stone: 1 } } as any],
      stateOverrides: [{ op: "take_unrest_when_spending_resource", resource: "science" } as any],
      cleanupOverrides: [{ op: "market_resource_added", resource: "stone", count: 1 } as any],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "setupOverrides[0].resources.stone",
      reason: "invalid resource 'stone'",
    });
    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "stateOverrides[0].resource",
      reason: "invalid resource 'science'",
    });
    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "cleanupOverrides[0].resource",
      reason: "invalid resource 'stone'",
    });
  });

  it("rejects invalid resources inside custom override effects", () => {
    const issues = validateNationRuleset(ruleset({
      reshuffleOverrides: [{
        op: "custom_reshuffle_effect",
        effect: [{ op: "gain_resource", resource: "science", amount: 1 } as any],
      }],
      botOverrides: [{
        op: "bot_custom_cleanup",
        effect: [{ op: "bot_gain_resource", resource: "stone", count: 1 } as any],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "reshuffleOverrides[0].effect[0].resource",
      reason: "invalid resource 'science'",
    });
    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "botOverrides[0].effect[0].resource",
      reason: "invalid resource 'stone'",
    });
  });

  it("imports nation-specific Bot cleanup Market token overrides", () => {
    const rows = parseCsvFile(privateRulesetCsvPath);
    const expected = new Map([
      ["carthaginians", { op: "bot_cleanup_market_resource", resource: "materials", count: 2 }],
      ["guptas", { op: "bot_cleanup_market_resource", resource: "goods", count: 1 }],
      ["qin", { op: "bot_cleanup_market_resource", resource: "influence", count: 1 }],
      ["tang", { op: "bot_cleanup_market_resource", resource: "influence", count: 1 }],
      ["wagadou", { op: "bot_cleanup_market_resource", resource: "materials", count: 1 }],
    ]);

    for (const [nationId, override] of expected) {
      const row = rows.find((entry) => entry.nation_id === nationId);

      expect(row).toBeDefined();
      const normalized = normalizeNationRuleset(row as any);

      expect(normalized.botOverrides).toContainEqual(override);
      expect(validateNationRuleset(normalized)).toEqual([]);
    }
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

  it("imports and validates the Cultists no-Nation custom-state ruleset", () => {
    const rows = parseCsvFile(privateRulesetCsvPath);
    const cultists = rows.find((row) => row.nation_id === "cultists");

    expect(cultists).toBeDefined();
    const normalized = normalizeNationRuleset(cultists as any);

    expect(normalized.rulesetTags).toEqual(expect.arrayContaining([
      "no_nation_deck",
      "no_accession",
      "no_development_area",
      "chaos_pile",
      "short_game_excluded",
      "solo_bot_exception"
    ]));
    expect(normalized.setupOverrides).toContainEqual({
      op: "create_side_area",
      areaId: "ceremony_track",
      displayName: "Ceremony Track",
      public: true
    });
    expect(normalized.zoneOverrides).toContainEqual({
      op: "create_zone",
      zoneId: "chaos_pile",
      displayName: "Chaos Pile",
      visibility: "public"
    });
    expect(normalized.collapseOverrides).toContainEqual({ op: "auto_win_if_zone_empty", zoneId: "chaos_pile" });
    expect(normalized.botOverrides).toContainEqual({ op: "bot_custom_cleanup", effect: [{ op: "bot_resolve_cultists_state_cleanup" }] });
    expect(normalized.shortGameOverrides).toContainEqual({ op: "excluded_from_short_game" });
    expect(validateNationRuleset(normalized)).toEqual([]);
    expect(normalized.implemented).toBe(true);
    expect(normalized.tested).toBe(true);
  });

  it("validates ruleset-specific King of Kings reward suppression states", () => {
    expect(validateNationRuleset(ruleset({
      stateOverrides: [{ op: "suppress_king_of_kings_reward", state: "ceremonial" }]
    }))).toEqual([]);
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
