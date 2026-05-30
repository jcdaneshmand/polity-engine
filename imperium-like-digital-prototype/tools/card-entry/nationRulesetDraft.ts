import type { NationRulesetTag } from "../../engine/src/nations/nationRulesetTypes";
import type { PrivateNationRulesetCsvRow } from "../card-import/nationRulesetCsvTypes";

export const nationRulesetTagOptions: NationRulesetTag[] = [
  "default_nation_deck",
  "no_nation_deck",
  "no_accession",
  "no_development_area",
  "development_area_available_from_start",
  "quest_development_replacement",
  "never_becomes_empire",
  "starts_as_empire",
  "custom_state_card",
  "seasonal_state_cycle",
  "custom_state_symbols",
  "state_flip_on_solstice",
  "no_history",
  "alternate_history_zone",
  "discard_instead_of_history",
  "special_side_area",
  "ceremony_track",
  "journey_track",
  "mana_track",
  "chaos_pile",
  "chaos_collapse_victory",
  "trade_routes_required",
  "merchant_focused",
  "clean_up_market_resource_override",
  "extra_unrest_supply",
  "nadir_card",
  "zenith_card",
  "reverse_progression",
  "martian_gadget_system",
  "polynesian_mana_system",
  "treaty_or_tributary_focus",
  "aggressive_attack_focus",
  "peaceful_engine_focus",
  "market_acquisition_focus",
  "development_focus",
  "history_thinning_focus",
  "garrison_focus",
  "fame_focus",
  "unrest_management_focus",
  "collapse_pressure_focus",
  "short_game_exception",
  "short_game_excluded",
  "solo_bot_exception",
  "solo_bot_custom_dynasty",
  "solo_bot_custom_state",
  "campaign_exception"
];

export const nationRulesetCsvColumns = [
  "nation_id",
  "nation_name_private",
  "public_placeholder_name",
  "ruleset_tags",
  "required_expansions",
  "excluded_expansions",
  "allowed_modes",
  "disallowed_modes",
  "required_variants",
  "excluded_variants",
  "setup_overrides_json",
  "zone_overrides_json",
  "state_overrides_json",
  "reshuffle_overrides_json",
  "cleanup_overrides_json",
  "solstice_overrides_json",
  "scoring_overrides_json",
  "collapse_overrides_json",
  "bot_overrides_json",
  "short_game_overrides_json",
  "hook_rules_json",
  "public_summary",
  "private_notes",
  "implemented",
  "tested"
] as const;

export type NationRulesetEntryDraft = {
  nationId: string;
  privateName: string;
  publicPlaceholderName: string;
  rulesetTags: NationRulesetTag[];
  requiredExpansions: string;
  excludedExpansions: string;
  allowedModes: string;
  disallowedModes: string;
  requiredVariants: string;
  excludedVariants: string;
  setupOverridesJson: string;
  zoneOverridesJson: string;
  stateOverridesJson: string;
  reshuffleOverridesJson: string;
  cleanupOverridesJson: string;
  solsticeOverridesJson: string;
  scoringOverridesJson: string;
  collapseOverridesJson: string;
  botOverridesJson: string;
  shortGameOverridesJson: string;
  hookRulesJson: string;
  publicSummary: string;
  privateNotes: string;
  implemented: "true" | "false";
  tested: "true" | "false";
};

const jsonArrayDefault = "[]";

function splitTags(value: string | undefined): NationRulesetTag[] {
  return (value || "").split("|").map((tag) => tag.trim()).filter(Boolean) as NationRulesetTag[];
}

export function createBlankNationRulesetDraft(nationId = ""): NationRulesetEntryDraft {
  return {
    nationId,
    privateName: "",
    publicPlaceholderName: "",
    rulesetTags: ["default_nation_deck"],
    requiredExpansions: "",
    excludedExpansions: "",
    allowedModes: "",
    disallowedModes: "",
    requiredVariants: "",
    excludedVariants: "",
    setupOverridesJson: jsonArrayDefault,
    zoneOverridesJson: jsonArrayDefault,
    stateOverridesJson: jsonArrayDefault,
    reshuffleOverridesJson: jsonArrayDefault,
    cleanupOverridesJson: jsonArrayDefault,
    solsticeOverridesJson: jsonArrayDefault,
    scoringOverridesJson: jsonArrayDefault,
    collapseOverridesJson: jsonArrayDefault,
    botOverridesJson: jsonArrayDefault,
    shortGameOverridesJson: jsonArrayDefault,
    hookRulesJson: jsonArrayDefault,
    publicSummary: "",
    privateNotes: "",
    implemented: "false",
    tested: "false"
  };
}

export function nationRulesetDraftToCsvRow(draft: NationRulesetEntryDraft): PrivateNationRulesetCsvRow {
  return {
    nation_id: draft.nationId,
    nation_name_private: draft.privateName,
    public_placeholder_name: draft.publicPlaceholderName,
    ruleset_tags: draft.rulesetTags.join("|"),
    required_expansions: draft.requiredExpansions,
    excluded_expansions: draft.excludedExpansions,
    allowed_modes: draft.allowedModes,
    disallowed_modes: draft.disallowedModes,
    required_variants: draft.requiredVariants,
    excluded_variants: draft.excludedVariants,
    setup_overrides_json: draft.setupOverridesJson,
    zone_overrides_json: draft.zoneOverridesJson,
    state_overrides_json: draft.stateOverridesJson,
    reshuffle_overrides_json: draft.reshuffleOverridesJson,
    cleanup_overrides_json: draft.cleanupOverridesJson,
    solstice_overrides_json: draft.solsticeOverridesJson,
    scoring_overrides_json: draft.scoringOverridesJson,
    collapse_overrides_json: draft.collapseOverridesJson,
    bot_overrides_json: draft.botOverridesJson,
    short_game_overrides_json: draft.shortGameOverridesJson,
    hook_rules_json: draft.hookRulesJson,
    public_summary: draft.publicSummary,
    private_notes: draft.privateNotes,
    implemented: draft.implemented,
    tested: draft.tested
  };
}

export function nationRulesetRowToDraft(row: PrivateNationRulesetCsvRow): NationRulesetEntryDraft {
  return {
    nationId: row.nation_id || "",
    privateName: row.nation_name_private || "",
    publicPlaceholderName: row.public_placeholder_name || "",
    rulesetTags: splitTags(row.ruleset_tags || "default_nation_deck"),
    requiredExpansions: row.required_expansions || "",
    excludedExpansions: row.excluded_expansions || "",
    allowedModes: row.allowed_modes || "",
    disallowedModes: row.disallowed_modes || "",
    requiredVariants: row.required_variants || "",
    excludedVariants: row.excluded_variants || "",
    setupOverridesJson: row.setup_overrides_json || jsonArrayDefault,
    zoneOverridesJson: row.zone_overrides_json || jsonArrayDefault,
    stateOverridesJson: row.state_overrides_json || jsonArrayDefault,
    reshuffleOverridesJson: row.reshuffle_overrides_json || jsonArrayDefault,
    cleanupOverridesJson: row.cleanup_overrides_json || jsonArrayDefault,
    solsticeOverridesJson: row.solstice_overrides_json || jsonArrayDefault,
    scoringOverridesJson: row.scoring_overrides_json || jsonArrayDefault,
    collapseOverridesJson: row.collapse_overrides_json || jsonArrayDefault,
    botOverridesJson: row.bot_overrides_json || jsonArrayDefault,
    shortGameOverridesJson: row.short_game_overrides_json || jsonArrayDefault,
    hookRulesJson: row.hook_rules_json || jsonArrayDefault,
    publicSummary: row.public_summary || "",
    privateNotes: row.private_notes || "",
    implemented: row.implemented === "true" ? "true" : "false",
    tested: row.tested === "true" ? "true" : "false"
  };
}

export function toggleNationRulesetTag(tags: NationRulesetTag[], tag: NationRulesetTag): NationRulesetTag[] {
  return tags.includes(tag) ? tags.filter((current) => current !== tag) : [...tags, tag];
}

export function appendOrReplaceNationRulesetRow(rows: PrivateNationRulesetCsvRow[], row: PrivateNationRulesetCsvRow): PrivateNationRulesetCsvRow[] {
  const nationId = row.nation_id?.trim();
  const index = rows.findIndex((existing) => existing.nation_id?.trim() === nationId);
  if (index === -1) return [...rows, row];
  return rows.map((existing, existingIndex) => (existingIndex === index ? row : existing));
}
