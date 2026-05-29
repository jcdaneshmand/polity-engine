import type { ExpansionId, GameMode, VariantId } from "../options/gameOptions";
import type { ResourceName } from "../game/state";
import type {
  BotOverride,
  CleanupOverride,
  CollapseOverride,
  NationHookRule,
  NationHookTrigger,
  NationRuleset,
  NationRulesetTag,
  ReshuffleOverride,
  ScoringOverride,
  SetupOverride,
  ShortGameOverride,
  SolsticeOverride,
  StateOverride,
  ZoneOverride,
} from "./nationRulesetTypes";

type ValidationIssue = { nationId: string; field: string; reason: string };

const RULESET_TAGS: NationRulesetTag[] = [
  "default_nation_deck", "no_nation_deck", "no_accession", "no_development_area", "development_area_available_from_start",
  "quest_development_replacement", "never_becomes_empire", "starts_as_empire", "custom_state_card", "seasonal_state_cycle",
  "custom_state_symbols", "state_flip_on_solstice", "no_history", "alternate_history_zone", "discard_instead_of_history",
  "special_side_area", "ceremony_track", "journey_track", "mana_track", "chaos_pile", "chaos_collapse_victory",
  "trade_routes_required", "merchant_focused", "clean_up_market_resource_override", "extra_unrest_supply", "nadir_card", "zenith_card",
  "reverse_progression", "martian_gadget_system", "polynesian_mana_system", "treaty_or_tributary_focus", "aggressive_attack_focus",
  "peaceful_engine_focus", "market_acquisition_focus", "development_focus", "history_thinning_focus", "garrison_focus", "fame_focus",
  "unrest_management_focus", "collapse_pressure_focus", "short_game_exception", "short_game_excluded", "solo_bot_exception",
  "solo_bot_custom_dynasty", "solo_bot_custom_state", "campaign_exception",
];
const GAME_MODES: GameMode[] = ["multiplayer", "solo", "practice"];
const VARIANTS: VariantId[] = ["lowered_aggression", "quick_setup", "precious_cards", "short_game"];
const EXPANSIONS: ExpansionId[] = ["trade_routes"];
const HOOK_TRIGGERS: NationHookTrigger[] = ["before_setup_player", "after_setup_player", "before_play_card", "after_play_card", "before_acquire", "after_acquire", "before_reshuffle", "after_reshuffle", "before_solstice", "after_solstice", "before_scoring", "after_scoring"];
const RESOURCE_NAMES: ResourceName[] = ["materials", "knowledge", "influence", "unrest", "goods"];

const has = (set: string[], value: unknown): value is string => typeof value === "string" && set.includes(value);
const hasFields = (obj: unknown, fields: string[]) => typeof obj === "object" && obj !== null && fields.every((f) => Object.prototype.hasOwnProperty.call(obj, f));

function validateOverrides<T extends { op: string }>(nationId: string, field: string, list: unknown, opRequirements: Record<string, string[]>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(list)) {
    issues.push({ nationId, field, reason: "must be an array" });
    return issues;
  }
  list.forEach((entry, index) => {
    const path = `${field}[${index}]`;
    if (!hasFields(entry, ["op"])) {
      issues.push({ nationId, field: path, reason: "missing op" });
      return;
    }
    const op = (entry as T).op;
    if (!has(Object.keys(opRequirements), op)) {
      issues.push({ nationId, field: `${path}.op`, reason: `unsupported op '${String(op)}'` });
      return;
    }
    const required = opRequirements[op];
    if (!hasFields(entry, required)) {
      issues.push({ nationId, field: path, reason: `op '${op}' requires fields: ${required.join(", ")}` });
    }
  });
  return issues;
}


function asArray<T>(nationId: string, issues: ValidationIssue[], field: string, value: unknown): T[] {
  if (!Array.isArray(value)) {
    issues.push({ nationId, field, reason: "must be an array" });
    return [];
  }
  return value as T[];
}

function validateHookRules(nationId: string, hookRules: NationHookRule[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(hookRules)) {
    return [{ nationId, field: "hookRules", reason: "must be an array" }];
  }
  hookRules.forEach((hook, index) => {
    const base = `hookRules[${index}]`;
    if (typeof hook !== "object" || hook === null || Array.isArray(hook)) {
      issues.push({ nationId, field: base, reason: "hook entry must be an object" });
      return;
    }
    if (!hasFields(hook, ["trigger"])) {
      issues.push({ nationId, field: `${base}.trigger`, reason: "missing trigger" });
      return;
    }
    if (!has(HOOK_TRIGGERS, hook.trigger)) issues.push({ nationId, field: `${base}.trigger`, reason: `invalid trigger '${String(hook.trigger)}'` });
    if (!Array.isArray(hook.effects)) {
      issues.push({ nationId, field: `${base}.effects`, reason: "effects must be an array" });
      return;
    }
    if (hook.effects.some((effect) => typeof effect !== "object" || effect === null || Array.isArray(effect))) {
      issues.push({ nationId, field: `${base}.effects`, reason: "each effect payload entry must be an object" });
    }
  });
  return issues;
}

export function validateNationRuleset(ruleset: NationRuleset): ValidationIssue[] {
  const nationId = ruleset?.nationId || "<unknown-nation>";
  const issues: ValidationIssue[] = [];

  const rulesetTags = asArray<NationRulesetTag>(nationId, issues, "rulesetTags", ruleset?.rulesetTags);
  const requiredExpansions = asArray<ExpansionId>(nationId, issues, "requiredExpansions", ruleset?.requiredExpansions);
  const allowedModes = asArray<GameMode>(nationId, issues, "allowedModes", ruleset?.allowedModes ?? []);
  const disallowedModes = asArray<GameMode>(nationId, issues, "disallowedModes", ruleset?.disallowedModes ?? []);
  const requiredVariants = asArray<VariantId>(nationId, issues, "requiredVariants", ruleset?.requiredVariants ?? []);
  const excludedVariants = asArray<VariantId>(nationId, issues, "excludedVariants", ruleset?.excludedVariants ?? []);
  const excludedExpansions = asArray<ExpansionId>(nationId, issues, "excludedExpansions", ruleset?.excludedExpansions ?? []);

  rulesetTags.forEach((tag, i) => {
    if (!has(RULESET_TAGS, tag)) issues.push({ nationId, field: `rulesetTags[${i}]`, reason: `invalid tag '${String(tag)}'` });
  });
  allowedModes.forEach((mode, i) => {
    if (!has(GAME_MODES, mode)) issues.push({ nationId, field: `allowedModes[${i}]`, reason: `invalid mode '${String(mode)}'` });
  });
  disallowedModes.forEach((mode, i) => {
    if (!has(GAME_MODES, mode)) issues.push({ nationId, field: `disallowedModes[${i}]`, reason: `invalid mode '${String(mode)}'` });
  });
  requiredVariants.forEach((variant, i) => {
    if (!has(VARIANTS, variant)) issues.push({ nationId, field: `requiredVariants[${i}]`, reason: `invalid variant '${String(variant)}'` });
  });
  excludedVariants.forEach((variant, i) => {
    if (!has(VARIANTS, variant)) issues.push({ nationId, field: `excludedVariants[${i}]`, reason: `invalid variant '${String(variant)}'` });
  });
  requiredExpansions.forEach((expansion, i) => {
    if (!has(EXPANSIONS, expansion)) issues.push({ nationId, field: `requiredExpansions[${i}]`, reason: `invalid expansion '${String(expansion)}'` });
  });
  excludedExpansions.forEach((expansion, i) => {
    if (!has(EXPANSIONS, expansion)) issues.push({ nationId, field: `excludedExpansions[${i}]`, reason: `invalid expansion '${String(expansion)}'` });
  });

  issues.push(...validateOverrides<SetupOverride>(nationId, "setupOverrides", ruleset.setupOverrides, {
    set_initial_resources: ["resources"],
    gain_resource: ["resource", "count"],
    set_action_tokens_base: ["count"],
  }));
  issues.push(...validateOverrides<ZoneOverride>(nationId, "zoneOverrides", ruleset.zoneOverrides, {
    disable_history: ["replacementBehavior"],
    create_zone: ["zoneId", "displayName", "visibility"],
  }));
  issues.push(...validateOverrides<StateOverride>(nationId, "stateOverrides", ruleset.stateOverrides, {
    start_as_state: ["state"],
    never_flip_to_empire: [],
  }));
  issues.push(...validateOverrides<ReshuffleOverride>(nationId, "reshuffleOverrides", ruleset.reshuffleOverrides, {
    skip_default_nation_card_addition: [],
    custom_reshuffle_effect: ["effect"],
  }));
  issues.push(...validateOverrides<CleanupOverride>(nationId, "cleanupOverrides", ruleset.cleanupOverrides, {
    prevent_voluntary_discard: [],
    custom_cleanup_effect: ["effect"],
  }));
  issues.push(...validateOverrides<SolsticeOverride>(nationId, "solsticeOverrides", ruleset.solsticeOverrides, {
    flip_state: [],
    custom_solstice_effect: ["effect"],
  }));
  issues.push(...validateOverrides<ScoringOverride>(nationId, "scoringOverrides", ruleset.scoringOverrides, {
    exclude_zone_from_scoring: ["zoneId"],
    custom_scoring_effect: ["effect"],
  }));
  issues.push(...validateOverrides<CollapseOverride>(nationId, "collapseOverrides", ruleset.collapseOverrides, {
    auto_win_if_zone_empty: ["zoneId"],
    custom_collapse_resolution: ["effect"],
  }));
  issues.push(...validateOverrides<BotOverride>(nationId, "botOverrides", ruleset.botOverrides, {
    skip_default_dynasty_setup: [],
    bot_custom_cleanup: ["effect"],
  }));
  issues.push(...validateOverrides<ShortGameOverride>(nationId, "shortGameOverrides", ruleset.shortGameOverrides, {
    excluded_from_short_game: [],
    custom_short_game_setup: ["effect"],
    add_nation_cards_to_discard: ["count"],
  }));
  issues.push(...validateHookRules(nationId, ruleset.hookRules));

  if (Array.isArray(ruleset.setupOverrides)) ruleset.setupOverrides.forEach((override, i) => {
    if (override.op === "set_initial_resources" && override.resources) {
      Object.keys(override.resources).forEach((resource) => {
        if (!has(RESOURCE_NAMES, resource)) issues.push({ nationId, field: `setupOverrides[${i}].resources.${resource}`, reason: `invalid resource '${resource}'` });
      });
    }
    if (override.op === "gain_resource" && !has(RESOURCE_NAMES, override.resource)) {
      issues.push({ nationId, field: `setupOverrides[${i}].resource`, reason: `invalid resource '${String(override.resource)}'` });
    }
  });

  return issues;
}

export function assertValidNationRuleset(ruleset: NationRuleset): void {
  const issues = validateNationRuleset(ruleset);
  if (issues.length === 0) return;
  const message = issues.map((issue) => `[${issue.nationId}] ${issue.field}: ${issue.reason}`).join("; ");
  throw new Error(`NationRulesetValidationError: ${message}`);
}
