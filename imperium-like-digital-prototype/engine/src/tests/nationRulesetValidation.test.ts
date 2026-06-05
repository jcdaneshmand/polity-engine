import { describe, expect, it } from "vitest";
import path from "node:path";
import { validateNationRuleset } from "../nations/nationRulesetValidation";
import type { NationRuleset } from "../nations/nationRulesetTypes";
import { validateNationRulesetCompatibility } from "../nations/nationRulesetRegistry";
import { parseCsvFile } from "../../../tools/card-import/csvParser";
import { normalizeNationRuleset } from "../../../tools/card-import/normalizeNationRuleset";
import { validatePrivateNationRulesetsRows } from "../../../tools/card-import/validatePrivateNationRulesets";

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

function privateRulesetRow(overrides: Record<string, string> = {}) {
  return {
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
    setup_overrides_json: "",
    zone_overrides_json: "",
    state_overrides_json: "",
    reshuffle_overrides_json: "",
    cleanup_overrides_json: "",
    solstice_overrides_json: "",
    scoring_overrides_json: "",
    collapse_overrides_json: "",
    bot_overrides_json: "",
    short_game_overrides_json: "",
    hook_rules_json: "",
    public_summary: "",
    private_notes: "",
    implemented: "true",
    tested: "true",
    ...overrides,
  };
}

describe("nation ruleset validation", () => {
  it("accepts payload card hook conditions", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_play_card",
        condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "civilized" } as any,
        effects: [{ op: "gain_resource", resource: "materials", amount: 1 } as any],
      }],
    }));

    expect(issues).toEqual([]);
  });

  it("accepts every current ruleset override and hook condition shape", () => {
    const issues = validateNationRuleset(ruleset({
      setupOverrides: [
        { op: "set_initial_resources", resources: { materials: 1, knowledge: 0 } },
        { op: "gain_resource", resource: "materials", count: 1 },
        { op: "set_action_tokens_base", count: 3 },
        { op: "move_cards_to_unrest_supply", cardIds: ["placeholder_unrest"] },
        { op: "create_side_area", areaId: "public_track", displayName: "Public Track", public: true }
      ],
      zoneOverrides: [
        { op: "disable_history", replacementBehavior: "alternate_zone" },
        { op: "replace_history_with_zone", zoneId: "archive", displayName: "Archive", cardsScore: true },
        { op: "create_zone", zoneId: "quest_area", displayName: "Quest Area", visibility: "public" }
      ],
      stateOverrides: [
        { op: "start_as_state", state: "empire" },
        { op: "never_flip_to_empire" },
        { op: "flip_state_on_solstice", sequence: ["barbarian", "empire"], loop: true },
        { op: "take_unrest_when_spending_resource", resource: "knowledge", state: "barbarian" },
        { op: "suppress_king_of_kings_reward", state: "empire" }
      ],
      reshuffleOverrides: [
        { op: "skip_default_nation_card_addition" },
        { op: "development_available_from_start" },
        { op: "trigger_game_end_when_card_added", cardId: "terminal_card" },
        { op: "place_nation_card_in_play_when_added", cardId: "nadir_card", suppressStateFlip: true },
        { op: "custom_reshuffle_effect", effect: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] }
      ],
      cleanupOverrides: [
        { op: "prevent_voluntary_discard" },
        { op: "market_resource_added", resource: "goods", count: 1 },
        { op: "custom_cleanup_effect", effect: [{ trigger: "on_play", op: "draw_if_able", count: 1 }] }
      ],
      solsticeOverrides: [
        { op: "flip_state" },
        { op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "reactor_card", resource: "knowledge", state: "alien", activateState: "native" },
        { op: "custom_solstice_effect", effect: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] }
      ],
      scoringOverrides: [
        { op: "exclude_zone_from_scoring", zoneId: "history" },
        { op: "score_resource_ratio", resource: "knowledge", denominator: 3, numerator: 1, state: "alien" },
        { op: "custom_scoring_effect", effect: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] }
      ],
      collapseOverrides: [
        { op: "auto_win_if_zone_empty", zoneId: "chaos_pile" },
        { op: "custom_collapse_resolution", effect: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] }
      ],
      botOverrides: [
        { op: "skip_default_dynasty_setup" },
        { op: "skip_bot_accession_state_flip" },
        { op: "bot_cleanup_market_resource", resource: "goods", count: 1 },
        { op: "custom_dynasty_setup", config: { cardIds: ["dynasty_card"] } },
        { op: "custom_bot_state_stack", cardIds: ["bot_state_card"] },
        { op: "initial_bot_state_table", tableId: "state_table", side: "S" },
        { op: "bot_custom_cleanup", effect: [{ op: "bot_gain_resource", resource: "materials", count: 1 }] }
      ],
      shortGameOverrides: [
        { op: "excluded_from_short_game" },
        { op: "custom_short_game_setup", effect: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { op: "add_nation_cards_to_discard", count: 2 },
        { op: "skip_accession_development_exile" },
        { op: "remove_starting_resource", resource: "materials", count: 1 },
        { op: "remove_starting_resources", resources: ["materials", "knowledge"] },
        { op: "develop_one_remove_one_development", developCardId: "develop_card", removeCardId: "remove_card" },
        { op: "move_development_cards_to_discard", cardIds: ["winter_card", "summer_card"] },
        { op: "move_one_advanced_nation_card_to_side_area", areaId: "mana_track", selection: "random" },
        { op: "garrison_development_and_add_nation_to_starting_deck", developmentCardId: "quest_card", hostCardId: "host_region" }
      ],
      hookRules: [
        { trigger: "before_setup_player", condition: { op: "always" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_setup_player", condition: { op: "state_is", state: "barbarian" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "before_play_card", condition: { op: "zone_empty", zoneId: "nationDeck" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_play_card", condition: { op: "zone_has_at_least", zoneId: "discard", count: 1 }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "before_acquire", condition: { op: "card_in_zone", cardId: "watched_card", zoneId: "playArea" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_acquire", condition: { op: "expansion_enabled", expansion: "trade_routes" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_break_through", condition: { op: "variant_enabled", variant: "short_game" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_revolt", condition: { op: "mode_is", mode: "solo" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "before_reshuffle", condition: { op: "payload_card_is", payloadKey: "cardId", cardId: "payload_card" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_reshuffle", condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "civilized" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_develop", condition: { op: "payload_card_type_is", payloadKey: "cardId", cardType: "development" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_gain_unrest", condition: { op: "payload_card_has_tag", payloadKey: "cardId", tag: "unrest" }, effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "before_solstice", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_solstice", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "before_scoring", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] },
        { trigger: "after_scoring", effects: [{ trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1 }] }
      ]
    }));

    expect(issues).toEqual([]);
  });

  it("rejects payload card hook suit conditions outside real suit icons", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [
        {
          trigger: "after_play_card",
          condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "none" } as any,
          effects: [{ op: "gain_resource", resource: "materials", amount: 1 } as any],
        },
        {
          trigger: "after_acquire",
          condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "multi" } as any,
          effects: [{ op: "gain_resource", resource: "materials", amount: 1 } as any],
        },
      ],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "hookRules[0].condition.suit", reason: "invalid suit 'none'" },
      { nationId: "test_nation", field: "hookRules[1].condition.suit", reason: "invalid suit 'multi'" },
    ]));
  });

  it("rejects rulesets outside their allowed modes", () => {
    const issues = validateNationRulesetCompatibility(
      { id: "test_nation", displayName: "Test Nation", powerCardIds: [], stateCardIds: [], startingDeckCardIds: [], nationDeckCardIds: [], developmentCardIds: [], setupRules: [], passiveRules: [], actionTokensBase: 3, exhaustTokensBase: 5, requiredExpansions: [], implemented: false, tested: false } as any,
      ruleset({ allowedModes: ["solo"] }),
      { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] }
    );

    expect(issues).toContain("Ruleset not allowed in mode multiplayer");
  });

  it("treats trade_routes_required ruleset tags as a Trade Routes expansion requirement", () => {
    const issues = validateNationRulesetCompatibility(
      { id: "test_nation", displayName: "Test Nation", powerCardIds: [], stateCardIds: [], startingDeckCardIds: [], nationDeckCardIds: [], developmentCardIds: [], setupRules: [], passiveRules: [], actionTokensBase: 3, exhaustTokensBase: 5, requiredExpansions: [], implemented: false, tested: false } as any,
      ruleset({ rulesetTags: ["trade_routes_required"] }),
      { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: [] }
    );

    expect(issues).toContain("Ruleset requires disabled expansion trade_routes");
  });

  it("treats missing imported ruleset compatibility arrays as empty", () => {
    const issues = validateNationRulesetCompatibility(
      { id: "test_nation", displayName: "Test Nation", powerCardIds: [], stateCardIds: [], startingDeckCardIds: [], nationDeckCardIds: [], developmentCardIds: [], setupRules: [], passiveRules: [], actionTokensBase: 3, exhaustTokensBase: 5, requiredExpansions: [], implemented: false, tested: false } as any,
      ruleset({
        rulesetTags: undefined as any,
        requiredExpansions: undefined as any,
        excludedExpansions: undefined,
        requiredVariants: undefined,
        excludedVariants: undefined,
        shortGameOverrides: undefined as any
      }),
      { playerCount: 2, mode: "multiplayer", enabledExpansions: [], enabledVariants: ["short_game"] }
    );

    expect(issues).toEqual([]);
  });

  it("rejects empty nation ruleset effect payloads before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      reshuffleOverrides: [{ op: "custom_reshuffle_effect", effect: [] }],
      cleanupOverrides: [{ op: "custom_cleanup_effect", effect: [] }],
      solsticeOverrides: [{ op: "custom_solstice_effect", effect: [] }],
      scoringOverrides: [{ op: "custom_scoring_effect", effect: [] }],
      collapseOverrides: [{ op: "custom_collapse_resolution", effect: [] }],
      botOverrides: [{ op: "bot_custom_cleanup", effect: [] }],
      shortGameOverrides: [{ op: "custom_short_game_setup", effect: [] }],
      hookRules: [{ trigger: "after_reshuffle", effects: [] }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "reshuffleOverrides[0].effect", reason: "effect must contain at least one effect" },
      { nationId: "test_nation", field: "cleanupOverrides[0].effect", reason: "effect must contain at least one effect" },
      { nationId: "test_nation", field: "solsticeOverrides[0].effect", reason: "effect must contain at least one effect" },
      { nationId: "test_nation", field: "scoringOverrides[0].effect", reason: "effect must contain at least one effect" },
      { nationId: "test_nation", field: "collapseOverrides[0].effect", reason: "effect must contain at least one effect" },
      { nationId: "test_nation", field: "botOverrides[0].effect", reason: "effect must contain at least one effect" },
      { nationId: "test_nation", field: "shortGameOverrides[0].effect", reason: "effect must contain at least one effect" },
      { nationId: "test_nation", field: "hookRules[0].effects", reason: "effects must contain at least one effect" },
    ]));
  });

  it("rejects empty nested ruleset effect branches before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "optional", effects: [] } as any,
          { trigger: "on_play", op: "choose_one", choices: [] } as any,
          { trigger: "on_play", op: "choose_one", choices: [[]] } as any,
          { trigger: "on_play", op: "conditional_resource_at_least", resource: "materials", atLeast: 1, then: [] } as any,
          { trigger: "on_play", op: "conditional_resource_at_least", resource: "materials", atLeast: 1, then: [{ trigger: "on_play", op: "draw", count: 1 }], else: [] } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].effects",
        reason: "effects must contain at least one effect",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].choices",
        reason: "choices must contain at least one choice",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].choices[0]",
        reason: "choice must contain at least one effect",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[3].then",
        reason: "then must contain at least one effect",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[4].else",
        reason: "else must contain at least one effect",
      },
    ]));
  });

  it("rejects empty nested Bot custom cleanup branches before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      botOverrides: [{
        op: "bot_custom_cleanup",
        effect: [{ op: "bot_pay_resource_then", resource: "materials", count: 1, effects: [] }],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "botOverrides[0].effect[0].effects",
      reason: "effects must contain at least one bot effect",
    });
  });

  it("rejects malformed Bot custom cleanup effect payloads before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      botOverrides: [{
        op: "bot_custom_cleanup",
        effect: [
          { op: "bot_gain_resource", count: 1 },
          { op: "bot_spend_resource", resource: "materials", count: 0 },
          { op: "bot_spend_resource_to_state_card", spendResource: "materials", spendCount: 1, placeResource: "knowledge", placeCount: "1" },
          { op: "bot_move_resource_to_state_card", resource: "materials", count: 1, ifUnable: {} },
          { op: "bot_resolve_top_main_deck", ifVp: { value: 1, effects: [] } },
          { op: "bot_add_resource_to_market_slot", resource: "goods", slot: 7, count: 1 },
          { op: "bot_flip_merchant_state", nextState: "market" },
          { op: "log", message: "" },
        ] as any,
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "botOverrides[0].effect[0].resource", reason: "missing required resource" },
      { nationId: "test_nation", field: "botOverrides[0].effect[1].count", reason: "invalid count '0'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[2].placeCount", reason: "invalid placeCount '1'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[3].ifUnable", reason: "ifUnable must be an array" },
      { nationId: "test_nation", field: "botOverrides[0].effect[4].ifVp.effects", reason: "effects must contain at least one bot effect" },
      { nationId: "test_nation", field: "botOverrides[0].effect[5].slot", reason: "invalid slot '7'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[6].nextState", reason: "invalid nextState 'market'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[7].message", reason: "invalid message ''" },
    ]));
  });

  it("rejects malformed Bot custom cleanup optional identifier and boolean payloads before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      botOverrides: [{
        op: "bot_custom_cleanup",
        effect: [
          { op: "human_take_chaos", count: 1, zoneId: [] },
          { op: "bot_trigger_trade_route", cardId: 1 },
          { op: "bot_acquire", fromExile: "yes" },
          { op: "bot_break_through", resolveGained: "true", discardGained: 1 },
        ] as any,
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "botOverrides[0].effect[0].zoneId", reason: "invalid zoneId ''" },
      { nationId: "test_nation", field: "botOverrides[0].effect[1].cardId", reason: "invalid cardId '1'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[2].fromExile", reason: "invalid fromExile 'yes'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[3].resolveGained", reason: "invalid resolveGained 'true'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[3].discardGained", reason: "invalid discardGained '1'" },
    ]));
  });

  it("rejects malformed Bot custom cleanup filter payloads before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      botOverrides: [{
        op: "bot_custom_cleanup",
        effect: [
          {
            op: "bot_acquire",
            filter: {
              suits: ["science"],
              cardTypes: ["artifact"],
              tags: [""],
              minVp: "1",
              maxVp: [],
              hasMarketResource: "stone",
              slotNumbers: [0, 7, "1"],
            },
          },
          { op: "bot_recall_in_play", filter: { suits: ["none", "multi"] } },
          { op: "bot_swap_market", marketFilter: "civilized" },
          { op: "bot_gain_resource_per_in_play", resource: "knowledge", filter: [] },
          { op: "bot_resolve_top_main_deck", ifVp: { value: "3", effects: [{ op: "bot_gain_fame", count: 1 }] } },
        ] as any,
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.suits[0]", reason: "invalid suit 'science'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.cardTypes[0]", reason: "invalid cardType 'artifact'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.tags[0]", reason: "invalid tag ''" },
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.minVp", reason: "invalid minVp '1'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.maxVp", reason: "invalid maxVp ''" },
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.hasMarketResource", reason: "invalid hasMarketResource 'stone'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.slotNumbers[0]", reason: "invalid slotNumber '0'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.slotNumbers[1]", reason: "invalid slotNumber '7'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[0].filter.slotNumbers[2]", reason: "invalid slotNumber '1'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[1].filter.suits[0]", reason: "invalid suit 'none'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[1].filter.suits[1]", reason: "invalid suit 'multi'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[2].marketFilter", reason: "filter must be an object" },
      { nationId: "test_nation", field: "botOverrides[0].effect[3].filter", reason: "filter must be an object" },
      { nationId: "test_nation", field: "botOverrides[0].effect[4].ifVp.value", reason: "invalid value '3'" },
    ]));
  });

  it("rejects unknown Bot custom cleanup metadata fields before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      botOverrides: [{
        op: "bot_custom_cleanup",
        effect: [
          { op: "bot_gain_resource", resource: "materials", count: 1, bonus: "ignored" },
          { op: "bot_acquire", filter: { suits: ["civilized"], bonus: "ignored" } },
          { op: "bot_resolve_top_main_deck", ifVp: { value: 3, effects: [{ op: "bot_gain_fame", count: 1 }], bonus: "ignored" } },
        ] as any,
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "botOverrides[0].effect[0].bonus", reason: "unsupported bot effect field 'bonus'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[1].filter.bonus", reason: "unsupported filter field 'bonus'" },
      { nationId: "test_nation", field: "botOverrides[0].effect[2].ifVp.bonus", reason: "unsupported ifVp field 'bonus'" },
    ]));
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

  it("validates private ruleset JSON and normalized ruleset semantics before import", () => {
    const report = validatePrivateNationRulesetsRows([
      privateRulesetRow({ nation_id: "bad_json", reshuffle_overrides_json: "{" }),
      privateRulesetRow({
        nation_id: "bad_effect",
        cleanup_overrides_json: JSON.stringify([{ op: "custom_cleanup_effect", effect: [{ trigger: "on_play", op: "not_a_real_op" }] }]),
      }),
    ]);

    expect(report.counts.fatal).toBe(2);
    expect(report.errors.map((error) => error.message)).toEqual(expect.arrayContaining([
      "normalization failed: Expected property name or '}' in JSON at position 1 (line 1 column 2)",
      "[bad_effect] unsupported effect op 'not_a_real_op'",
    ]));
  });

  it("rejects unsupported hook conditions", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [
        {
          trigger: "after_play_card",
          condition: { op: "not_real" } as any,
          effects: [],
        },
        {
          trigger: "after_play_card",
          condition: { op: "payload_card_is", payloadKey: "", cardId: "" } as any,
          effects: [{ op: "gain_resource", resource: "materials", amount: 1 } as any],
        },
        {
          trigger: "after_play_card",
          condition: { op: "zone_has_at_least", zoneId: "", count: 0 } as any,
          effects: [{ op: "gain_resource", resource: "materials", amount: 1 } as any],
        },
        {
          trigger: "after_play_card",
          condition: { op: "state_is", state: "" } as any,
          effects: [{ op: "gain_resource", resource: "materials", amount: 1 } as any],
        },
      ],
    }));

    expect(issues.some((issue) => issue.field === "hookRules[0].condition.op")).toBe(true);
    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "hookRules[1].condition.payloadKey", reason: "invalid payloadKey" },
      { nationId: "test_nation", field: "hookRules[1].condition.cardId", reason: "invalid cardId" },
      { nationId: "test_nation", field: "hookRules[2].condition.zoneId", reason: "invalid zoneId" },
      { nationId: "test_nation", field: "hookRules[2].condition.count", reason: "invalid count '0'" },
      { nationId: "test_nation", field: "hookRules[3].condition.state", reason: "invalid state" },
    ]));
  });

  it("rejects unknown ruleset override and condition fields before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      setupOverrides: [{ op: "gain_resource", resource: "materials", count: 1, bonus: "ignored" } as any],
      hookRules: [{
        trigger: "after_play_card",
        condition: { op: "payload_card_suit_is", payloadKey: "cardId", suit: "civilized", bonus: "ignored" } as any,
        effects: [{ op: "gain_resource", resource: "materials", amount: 1 } as any],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "setupOverrides[0].bonus", reason: "unsupported override field 'bonus'" },
      { nationId: "test_nation", field: "hookRules[0].condition.bonus", reason: "unsupported condition field 'bonus'" },
    ]));
  });

  it("rejects unknown top-level ruleset and hook fields before runtime", () => {
    const issues = validateNationRuleset({
      ...ruleset({
        hookRules: [{
          trigger: "after_play_card",
          effects: [{ op: "gain_resource", resource: "materials", amount: 1 } as any],
          bonus: "ignored",
        } as any],
      }),
      bonus: "ignored",
    } as any);

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "bonus", reason: "unsupported ruleset field 'bonus'" },
      { nationId: "test_nation", field: "hookRules[0].bonus", reason: "unsupported hook field 'bonus'" },
    ]));
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
      setupOverrides: [{ op: "set_initial_resources", resources: { stone: 1, materials: -1, knowledge: "2" } } as any],
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
      field: "setupOverrides[0].resources.materials",
      reason: "invalid resource amount '-1'",
    });
    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "setupOverrides[0].resources.knowledge",
      reason: "invalid resource amount '2'",
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

  it("rejects malformed resource payload shapes inside top-level ruleset overrides", () => {
    const issues = validateNationRuleset(ruleset({
      setupOverrides: [{ op: "set_initial_resources", resources: ["materials"] } as any],
      shortGameOverrides: [{ op: "remove_starting_resources", resources: {} } as any],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "setupOverrides[0].resources",
      reason: "invalid resources",
    });
    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "shortGameOverrides[0].resources",
      reason: "invalid resources",
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

  it("rejects unsupported custom ruleset effect ops and triggers before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      reshuffleOverrides: [{
        op: "custom_reshuffle_effect",
        effect: [{ trigger: "after_reshuffle", op: "gain_resource", resource: "materials", amount: 1 } as any],
      }],
      cleanupOverrides: [{
        op: "custom_cleanup_effect",
        effect: [{ trigger: "on_play", op: "not_a_real_op" } as any],
      }],
      botOverrides: [{
        op: "bot_custom_cleanup",
        effect: [{ op: "not_a_bot_op" } as any],
      }],
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [{ trigger: "on_play", op: "choose_one", choices: [[{ trigger: "on_play", op: "not_nested_real" }]] } as any],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "reshuffleOverrides[0].effect[0].trigger",
        reason: "unsupported effect trigger 'after_reshuffle'",
      },
      {
        nationId: "test_nation",
        field: "cleanupOverrides[0].effect[0].op",
        reason: "unsupported effect op 'not_a_real_op'",
      },
      {
        nationId: "test_nation",
        field: "botOverrides[0].effect[0].op",
        reason: "unsupported bot effect op 'not_a_bot_op'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].choices[0][0].op",
        reason: "unsupported effect op 'not_nested_real'",
      },
    ]));
  });

  it("rejects malformed human effect payloads in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "break_through", source: "deck", count: 1 } as any,
          { trigger: "on_play", op: "find_card", destination: "nationDeck" } as any,
          { trigger: "on_play", op: "exile_card", source: "hand", count: 0 } as any,
          { trigger: "on_play", op: "gain_resource", amount: 1 } as any,
          { trigger: "on_play", op: "spend_resource", amount: 1 } as any,
          { trigger: "on_play", op: "remove_resource", amount: 1 } as any,
          { trigger: "on_play", op: "return_resource", amount: 1 } as any,
          { trigger: "on_play", op: "steal_resource", fromPlayerId: "1", amount: 1 } as any,
          { trigger: "on_play", op: "conditional_resource_at_least", atLeast: 1, then: [{ trigger: "on_play", op: "draw_if_able", count: 1 }] } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].suit",
        reason: "missing required suit",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].destination",
        reason: "invalid destination 'nationDeck'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].count",
        reason: "invalid count '0'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[3].resource",
        reason: "missing required resource",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[4].resource",
        reason: "missing required resource",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[5].resource",
        reason: "missing required resource",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[6].resource",
        reason: "missing required resource",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[7].resource",
        reason: "missing required resource",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[8].resource",
        reason: "missing required resource",
      },
    ]));
  });

  it("rejects ruleset Break through suit filters outside the Common setup suits", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "break_through", source: "deck", suit: "fame", count: 1 } as any,
          { trigger: "on_play", op: "break_through", source: "market", suit: "power", count: 1 } as any,
          { trigger: "on_play", op: "break_through", source: "exile", suit: "multi", count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "hookRules[0].effects[0].suit", reason: "invalid suit 'fame'" },
      { nationId: "test_nation", field: "hookRules[0].effects[1].suit", reason: "invalid suit 'power'" },
      { nationId: "test_nation", field: "hookRules[0].effects[2].suit", reason: "invalid suit 'multi'" },
    ]));
  });

  it("rejects non-icon Treat As suit values in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "treat_suit_as", from: "none", to: ["civilized"] } as any,
          { trigger: "on_play", op: "treat_suit_as", from: "uncivilized", to: ["multi"] } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "hookRules[0].effects[0].from", reason: "invalid from 'none'" },
      { nationId: "test_nation", field: "hookRules[0].effects[1].to", reason: "invalid to" },
    ]));
  });

  it("rejects unsupported Break through card-type filters in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "break_through", source: "market", suit: "civilized", cardType: "action", count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "hookRules[0].effects[0].cardType",
      reason: "invalid cardType 'action'",
    });
  });

  it("rejects unsupported Draw-if-able source filters in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "draw_if_able", source: "discard", count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "hookRules[0].effects[0].source",
      reason: "invalid source 'discard'",
    });
  });

  it("rejects unsupported targeted Develop effects in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "develop", cardId: "specific_development" } as any,
        ],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "hookRules[0].effects[0].cardId",
      reason: "invalid cardId 'specific_development'",
    });
  });

  it("accepts free Develop effects in rulesets", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "develop", free: true } as any,
        ],
      }],
    }));

    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].free",
    }));
  });

  it("accepts free-play card effects with card, suit, type, and state-bypass filters in rulesets", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "free_play_card", cardId: "hand_action", suit: "civilized", cardType: "action", ignoreStateRequirement: true } as any,
        ],
      }],
    }));

    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].op",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].cardId",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].ignoreStateRequirement",
    }));
  });

  it("accepts up-to Draw metadata in rulesets", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "draw", count: 2, upTo: true } as any,
          { trigger: "on_play", op: "draw_if_able", count: 2, upTo: true } as any,
        ],
      }],
    }));

    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].upTo",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[1].upTo",
    }));
  });

  it("accepts discard-card suit and card-type filters in rulesets", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "discard_cards", count: 1, suit: "region", cardType: "action" } as any,
        ],
      }],
    }));

    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].suit",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].cardType",
    }));
  });

  it("accepts player-resource to market-card movement in rulesets", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "move_resource_to_market", resource: "materials", amount: 2 } as any,
        ],
      }],
    }));

    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].op",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].resource",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].amount",
    }));
  });

  it("accepts look-then-take hidden-deck effects in rulesets", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "look_take_card", source: "deck", count: 2, destination: "history" } as any,
        ],
      }],
    }));

    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].op",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].source",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].count",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].destination",
    }));
  });

  it("accepts counted Recall and Abandon Region effects in rulesets", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "recall_region", count: 2 } as any,
          { trigger: "on_play", op: "abandon_region", count: 2 } as any,
        ],
      }],
    }));

    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].count",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[1].count",
    }));
  });

  it("accepts dynamic player scopes for supported effects in rulesets", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "draw", count: 1, targetPlayerScope: "others", optionalForTargets: true } as any,
          { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1, targetPlayerScope: "all" } as any,
          { trigger: "on_play", op: "take_unrest", count: 1, targetPlayerScope: "others" } as any,
          { trigger: "on_play", op: "steal_resource", resource: "materials", amount: 1, targetPlayerScope: "others", ifUnable: [
            { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 },
          ] } as any,
          { trigger: "on_play", op: "steal_resource", resource: "materials", amount: 1, fromPlayerIds: ["1", "2"], ifUnable: [
            { trigger: "on_play", op: "gain_resource", resource: "knowledge", amount: 1 },
          ], attackTargeted: true } as any,
          { trigger: "on_play", op: "recall_region", targetPlayerScope: "others" } as any,
          { trigger: "on_play", op: "abandon_region", targetPlayerIds: ["1", "2"] } as any,
          { trigger: "on_play", op: "take_unrest", count: 1, targetPlayerIds: ["1"], attackTargeted: true } as any,
        ],
      }],
    }));

    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[0].targetPlayerScope",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[1].targetPlayerScope",
    }));
    expect(issues).not.toContainEqual(expect.objectContaining({
      field: "hookRules[0].effects[4].attackTargeted",
    }));
  });

  it("rejects unsupported targeted Move-self-to-history effects in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "move_self_to_history", cardId: "other_card" } as any,
        ],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "hookRules[0].effects[0].cardId",
      reason: "invalid cardId 'other_card'",
    });
  });

  it("rejects cardId on effect ops that do not support card targets in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "gain_fame", cardId: "specific_fame", count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "hookRules[0].effects[0].cardId",
      reason: "invalid cardId 'specific_fame'",
    });
  });

  it("rejects unsupported target fields on unrelated effect ops in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "gain_fame", hostCardId: "region_a", count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", marketCardId: "market_a", count: 1 } as any,
          { trigger: "on_play", op: "take_unrest", targetPlayerId: "1", count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].hostCardId",
        reason: "invalid hostCardId 'region_a'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].marketCardId",
        reason: "invalid marketCardId 'market_a'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].targetPlayerId",
        reason: "invalid targetPlayerId '1'",
      },
    ]));
  });

  it("rejects unsupported player target fields on unrelated effect ops in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "gain_fame", targetPlayerIds: ["1"], count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", fromPlayerId: "1", count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].targetPlayerIds",
        reason: "invalid targetPlayerIds",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].fromPlayerId",
        reason: "invalid fromPlayerId '1'",
      },
    ]));
  });

  it("rejects unsupported scalar control fields on unrelated effect ops in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "gain_fame", reason: "manual_score", count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", state: "barbarian", count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", from: "uncivilized", count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", to: ["civilized"], count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].reason",
        reason: "invalid reason 'manual_score'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].state",
        reason: "invalid state 'barbarian'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].from",
        reason: "invalid from 'uncivilized'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[3].to",
        reason: "invalid to",
      },
    ]));
  });

  it("rejects unsupported nested control fields on unrelated effect ops in rulesets before runtime", () => {
    const nested = [{ trigger: "on_play", op: "draw_if_able", count: 1 }];
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "gain_fame", effects: nested, count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", choices: [nested], count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", then: nested, count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", else: nested, count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].effects",
        reason: "invalid effects",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].choices",
        reason: "invalid choices",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].then",
        reason: "invalid then",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[3].else",
        reason: "invalid else",
      },
    ]));
  });

  it("rejects unsupported source and destination fields on unrelated effect ops in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "gain_fame", source: "deck", count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", sourceZones: ["discard"], count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", sourceZone: "discard", count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", destination: "discard", count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].source",
        reason: "invalid source 'deck'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].sourceZones",
        reason: "invalid sourceZones",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].sourceZone",
        reason: "invalid sourceZone",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[3].destination",
        reason: "invalid destination 'discard'",
      },
    ]));
  });

  it("rejects unsupported scalar payload fields on unrelated effect ops in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "gain_fame", suit: "civilized", count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", cardType: "action", count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", resource: "materials", count: 1 } as any,
          { trigger: "on_play", op: "gain_action", amount: 1, count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", amount: 1, count: 1 } as any,
          { trigger: "on_play", op: "gain_fame", atLeast: 1, count: 1 } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].suit",
        reason: "invalid suit 'civilized'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].cardType",
        reason: "invalid cardType 'action'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].resource",
        reason: "invalid resource 'materials'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[3].count",
        reason: "invalid count '1'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[4].amount",
        reason: "invalid amount '1'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[5].atLeast",
        reason: "invalid atLeast '1'",
      },
    ]));
  });

  it("rejects unknown effect fields in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "gain_fame", count: 1, bonus: "ignored" } as any,
        ],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "hookRules[0].effects[0].bonus",
      reason: "unsupported field 'bonus'",
    });
  });

  it("rejects malformed reactive Exhaust metadata in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_draw" } } as any,
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_play_card", target: "neighbor" } } as any,
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_gain_resource", sourceSuit: "bad_suit" } } as any,
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: "after_gain_resource" } as any,
          { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_gain_resource" } } as any,
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_gain_resource", target: "self" } } as any,
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_play_card", sourceSuit: "civilized" } } as any,
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_play_card", resource: "materials" } } as any,
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_gain_resource", sourceSuit: "none" } } as any,
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_gain_resource", sourceSuit: "multi" } } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].reactive.trigger",
        reason: "invalid reactive trigger 'after_draw'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].reactive.target",
        reason: "invalid reactive target 'neighbor'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].reactive.sourceSuit",
        reason: "invalid reactive sourceSuit 'bad_suit'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[3].reactive",
        reason: "invalid reactive metadata",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[4].reactive",
        reason: "reactive metadata is only valid on on_exhaust effects",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[5].reactive.target",
        reason: "invalid reactive target 'self'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[6].reactive.sourceSuit",
        reason: "invalid reactive sourceSuit 'civilized'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[7].reactive.resource",
        reason: "invalid reactive resource 'materials'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[8].reactive.sourceSuit",
        reason: "invalid reactive sourceSuit 'none'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[9].reactive.sourceSuit",
        reason: "invalid reactive sourceSuit 'multi'",
      },
    ]));
  });

  it("rejects unknown reactive Exhaust metadata fields in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_exhaust", op: "gain_resource", resource: "materials", amount: 1, reactive: { trigger: "after_gain_resource", bonus: "ignored" } } as any,
        ],
      }],
    }));

    expect(issues).toContainEqual({
      nationId: "test_nation",
      field: "hookRules[0].effects[0].reactive.bonus",
      reason: "unsupported reactive field 'bonus'",
    });
  });

  it("rejects malformed effect identifier fields in rulesets before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      hookRules: [{
        trigger: "after_reshuffle",
        effects: [
          { trigger: "on_play", op: "give_card", cardId: 1, targetPlayerId: ["1"] } as any,
          { trigger: "on_play", op: "take_unrest", count: 1, targetPlayerIds: "1" } as any,
          { trigger: "on_play", op: "gain_fame", count: 1, targetPlayerScope: "all" } as any,
          { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1, targetPlayerScope: "neighbor" } as any,
          { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1, optionalForTargets: true } as any,
          { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1, fromPlayerIds: ["1"] } as any,
          { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1, ifUnable: [{ trigger: "on_play", op: "draw_if_able", count: 1 }] } as any,
          { trigger: "on_play", op: "gain_resource", resource: "materials", amount: 1, attackTargeted: true } as any,
          { trigger: "on_play", op: "take_unrest", count: 1, targetPlayerIds: ["1"], attackTargeted: "yes" } as any,
          { trigger: "on_play", op: "steal_resource", resource: "materials", amount: 1, targetPlayerScope: "others", fromPlayerIds: "1" } as any,
          { trigger: "on_play", op: "steal_resource", resource: "materials", amount: 1, targetPlayerScope: "others", ifUnable: [] } as any,
          { trigger: "on_play", op: "recall_region", targetPlayerIds: "1" } as any,
          { trigger: "on_play", op: "garrison_card", hostCardId: 1, cardId: false } as any,
          { trigger: "on_play", op: "swap_card", sourceZone: "hand", marketCardId: false } as any,
        ],
      }],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].cardId",
        reason: "invalid cardId '1'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[0].targetPlayerId",
        reason: "invalid targetPlayerId '1'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[1].targetPlayerIds",
        reason: "invalid targetPlayerIds",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[2].targetPlayerScope",
        reason: "invalid targetPlayerScope 'all'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[3].targetPlayerScope",
        reason: "invalid targetPlayerScope 'neighbor'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[4].optionalForTargets",
        reason: "invalid optionalForTargets 'true'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[5].fromPlayerIds",
        reason: "invalid fromPlayerIds",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[6].ifUnable",
        reason: "invalid ifUnable",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[7].attackTargeted",
        reason: "invalid attackTargeted 'true'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[8].attackTargeted",
        reason: "invalid attackTargeted 'yes'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[9].fromPlayerIds",
        reason: "invalid fromPlayerIds",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[10].ifUnable",
        reason: "ifUnable must contain at least one effect",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[11].targetPlayerIds",
        reason: "invalid targetPlayerIds",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[12].hostCardId",
        reason: "invalid hostCardId '1'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[12].cardId",
        reason: "invalid cardId 'false'",
      },
      {
        nationId: "test_nation",
        field: "hookRules[0].effects[13].marketCardId",
        reason: "invalid marketCardId 'false'",
      },
    ]));
  });

  it("rejects empty required override identifiers before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      setupOverrides: [{ op: "move_cards_to_unrest_supply", cardIds: [] } as any],
      reshuffleOverrides: [{ op: "trigger_game_end_when_card_added", cardId: "" } as any],
      botOverrides: [{ op: "initial_bot_state_table", tableId: "" } as any],
      shortGameOverrides: [{ op: "develop_one_remove_one_development", developCardId: "", removeCardId: "dev_remove" } as any],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "setupOverrides[0].cardIds", reason: "invalid cardIds" },
      { nationId: "test_nation", field: "reshuffleOverrides[0].cardId", reason: "invalid cardId" },
      { nationId: "test_nation", field: "botOverrides[0].tableId", reason: "invalid tableId" },
      { nationId: "test_nation", field: "shortGameOverrides[0].developCardId", reason: "invalid developCardId" },
    ]));
  });

  it("rejects malformed required override numbers before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      setupOverrides: [{ op: "gain_resource", resource: "materials", count: 0 } as any],
      cleanupOverrides: [{ op: "market_resource_added", resource: "materials", count: "1" } as any],
      scoringOverrides: [{ op: "score_resource_ratio", resource: "materials", denominator: 0 } as any],
      botOverrides: [{ op: "bot_cleanup_market_resource", resource: "materials", count: -1 } as any],
      shortGameOverrides: [
        { op: "add_nation_cards_to_discard", count: -1 } as any,
        { op: "remove_starting_resource", resource: "materials", count: 0 } as any,
      ],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "setupOverrides[0].count", reason: "invalid count '0'" },
      { nationId: "test_nation", field: "cleanupOverrides[0].count", reason: "invalid count '1'" },
      { nationId: "test_nation", field: "scoringOverrides[0].denominator", reason: "invalid denominator '0'" },
      { nationId: "test_nation", field: "botOverrides[0].count", reason: "invalid count '-1'" },
      { nationId: "test_nation", field: "shortGameOverrides[0].count", reason: "invalid count '-1'" },
      { nationId: "test_nation", field: "shortGameOverrides[1].count", reason: "invalid count '0'" },
    ]));
  });

  it("rejects malformed required override strings before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      setupOverrides: [{ op: "create_side_area", areaId: "ceremony_track", displayName: "" } as any],
      zoneOverrides: [
        { op: "disable_history", replacementBehavior: "archive" } as any,
        { op: "create_zone", zoneId: "secret_zone", displayName: "Secret Zone", visibility: "hidden" } as any,
      ],
      stateOverrides: [
        { op: "start_as_state", state: "" } as any,
        { op: "flip_state_on_solstice", sequence: [] } as any,
        { op: "flip_state_on_solstice", sequence: ["barbarian", ""] } as any,
      ],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "setupOverrides[0].displayName", reason: "invalid displayName" },
      { nationId: "test_nation", field: "zoneOverrides[0].replacementBehavior", reason: "invalid replacementBehavior 'archive'" },
      { nationId: "test_nation", field: "zoneOverrides[1].visibility", reason: "invalid visibility 'hidden'" },
      { nationId: "test_nation", field: "stateOverrides[0].state", reason: "invalid state" },
      { nationId: "test_nation", field: "stateOverrides[1].sequence", reason: "invalid sequence" },
      { nationId: "test_nation", field: "stateOverrides[2].sequence", reason: "invalid sequence" },
    ]));
  });

  it("rejects malformed optional override fields before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      stateOverrides: [
        { op: "take_unrest_when_spending_resource", resource: "materials", state: "" } as any,
        { op: "flip_state_on_solstice", sequence: ["barbarian", "empire"], loop: "yes" } as any,
      ],
      solsticeOverrides: [{ op: "remove_play_card_and_nation_deck_if_resource_empty", cardId: "nadir", resource: "materials", state: "", activateState: "" } as any],
      scoringOverrides: [{ op: "score_resource_ratio", resource: "materials", denominator: 3, numerator: 0, state: "" } as any],
      botOverrides: [{ op: "initial_bot_state_table", tableId: "cultists", side: "X" } as any],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "stateOverrides[0].state", reason: "invalid state" },
      { nationId: "test_nation", field: "stateOverrides[1].loop", reason: "invalid loop 'yes'" },
      { nationId: "test_nation", field: "solsticeOverrides[0].state", reason: "invalid state" },
      { nationId: "test_nation", field: "solsticeOverrides[0].activateState", reason: "invalid activateState" },
      { nationId: "test_nation", field: "scoringOverrides[0].numerator", reason: "invalid numerator '0'" },
      { nationId: "test_nation", field: "scoringOverrides[0].state", reason: "invalid state" },
      { nationId: "test_nation", field: "botOverrides[0].side", reason: "invalid side 'X'" },
    ]));
  });

  it("rejects malformed optional structured override fields before runtime", () => {
    const issues = validateNationRuleset(ruleset({
      setupOverrides: [{ op: "create_side_area", areaId: "ceremony_track", displayName: "Ceremony Track", public: "yes" } as any],
      zoneOverrides: [{ op: "replace_history_with_zone", zoneId: "archive", displayName: "Archive", cardsScore: "no" } as any],
      reshuffleOverrides: [{ op: "place_nation_card_in_play_when_added", cardId: "zenith", suppressStateFlip: "true" } as any],
      botOverrides: [
        { op: "custom_dynasty_setup", config: "manual" } as any,
        { op: "custom_dynasty_setup", config: { cardIds: ["dynasty_a", ""] } } as any,
      ],
    }));

    expect(issues).toEqual(expect.arrayContaining([
      { nationId: "test_nation", field: "setupOverrides[0].public", reason: "invalid public 'yes'" },
      { nationId: "test_nation", field: "zoneOverrides[0].cardsScore", reason: "invalid cardsScore 'no'" },
      { nationId: "test_nation", field: "reshuffleOverrides[0].suppressStateFlip", reason: "invalid suppressStateFlip 'true'" },
      { nationId: "test_nation", field: "botOverrides[0].config", reason: "invalid config" },
      { nationId: "test_nation", field: "botOverrides[1].config.cardIds", reason: "invalid cardIds" },
    ]));
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
