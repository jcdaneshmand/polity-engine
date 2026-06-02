import type { ExpansionId, GameMode, VariantId } from "../options/gameOptions";
import type { CardType, ResourceName, Suit } from "../game/state";
import type {
  BotOverride,
  CleanupOverride,
  CollapseOverride,
  EffectCondition,
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
const HOOK_TRIGGERS: NationHookTrigger[] = ["before_setup_player", "after_setup_player", "before_play_card", "after_play_card", "before_acquire", "after_acquire", "after_break_through", "after_revolt", "before_reshuffle", "after_reshuffle", "after_develop", "after_gain_unrest", "before_solstice", "after_solstice", "before_scoring", "after_scoring"];
const RESOURCE_NAMES: ResourceName[] = ["materials", "knowledge", "influence", "unrest", "goods"];
const CARD_TYPES: CardType[] = ["action", "unit", "technology", "legacy", "in_play", "attack", "power", "state", "development", "accession", "nation", "region", "unrest", "fame", "trade_route", "bot_state", "other"];
const SUITS: Suit[] = ["military", "civic", "economic", "unrest", "wild", "region", "uncivilized", "civilized", "tributary", "fame", "power", "trade_route", "none", "multi"];
const CONDITION_OP_REQUIREMENTS: Record<EffectCondition["op"], string[]> = {
  always: [],
  state_is: ["state"],
  zone_empty: ["zoneId"],
  zone_has_at_least: ["zoneId", "count"],
  card_in_zone: ["cardId", "zoneId"],
  expansion_enabled: ["expansion"],
  variant_enabled: ["variant"],
  mode_is: ["mode"],
  payload_card_is: ["payloadKey", "cardId"],
  payload_card_suit_is: ["payloadKey", "suit"],
  payload_card_type_is: ["payloadKey", "cardType"],
  payload_card_has_tag: ["payloadKey", "tag"],
};

const has = (set: string[], value: unknown): value is string => typeof value === "string" && set.includes(value);
const hasFields = (obj: unknown, fields: string[]) => typeof obj === "object" && obj !== null && fields.every((f) => Object.prototype.hasOwnProperty.call(obj, f));

function validateResourceReferences(nationId: string, field: string, value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      issues.push(...validateResourceReferences(nationId, `${field}[${index}]`, entry));
    });
    return issues;
  }
  if (typeof value !== "object" || value === null) return issues;

  Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
    const path = `${field}.${key}`;
    if (key === "resource") {
      if (!has(RESOURCE_NAMES, entry)) {
        issues.push({ nationId, field: path, reason: `invalid resource '${String(entry)}'` });
      }
      return;
    }
    if (key === "resources") {
      if (Array.isArray(entry)) {
        entry.forEach((resource, index) => {
          if (!has(RESOURCE_NAMES, resource)) {
            issues.push({ nationId, field: `${path}[${index}]`, reason: `invalid resource '${String(resource)}'` });
          }
        });
        return;
      }
      if (typeof entry === "object" && entry !== null) {
        Object.keys(entry).forEach((resource) => {
          if (!has(RESOURCE_NAMES, resource)) {
            issues.push({ nationId, field: `${path}.${resource}`, reason: `invalid resource '${resource}'` });
          }
        });
        return;
      }
    }
    issues.push(...validateResourceReferences(nationId, path, entry));
  });
  return issues;
}

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
    issues.push(...validateResourceReferences(nationId, path, entry));
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

function validateCondition(nationId: string, field: string, condition: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (condition === undefined) return issues;
  if (!hasFields(condition, ["op"])) {
    issues.push({ nationId, field, reason: "missing op" });
    return issues;
  }
  const op = (condition as { op: unknown }).op;
  if (!has(Object.keys(CONDITION_OP_REQUIREMENTS), op)) {
    issues.push({ nationId, field: `${field}.op`, reason: `unsupported op '${String(op)}'` });
    return issues;
  }
  const required = CONDITION_OP_REQUIREMENTS[op as EffectCondition["op"]];
  if (!hasFields(condition, required)) {
    issues.push({ nationId, field, reason: `op '${op}' requires fields: ${required.join(", ")}` });
    return issues;
  }
  const typed = condition as Partial<EffectCondition>;
  if (typed.op === "expansion_enabled" && !has(EXPANSIONS, typed.expansion)) {
    issues.push({ nationId, field: `${field}.expansion`, reason: `invalid expansion '${String(typed.expansion)}'` });
  }
  if (typed.op === "variant_enabled" && !has(VARIANTS, typed.variant)) {
    issues.push({ nationId, field: `${field}.variant`, reason: `invalid variant '${String(typed.variant)}'` });
  }
  if (typed.op === "mode_is" && !has(GAME_MODES, typed.mode)) {
    issues.push({ nationId, field: `${field}.mode`, reason: `invalid mode '${String(typed.mode)}'` });
  }
  if (typed.op === "payload_card_suit_is" && !has(SUITS, typed.suit)) {
    issues.push({ nationId, field: `${field}.suit`, reason: `invalid suit '${String(typed.suit)}'` });
  }
  if (typed.op === "payload_card_type_is" && !has(CARD_TYPES, typed.cardType)) {
    issues.push({ nationId, field: `${field}.cardType`, reason: `invalid card type '${String(typed.cardType)}'` });
  }
  return issues;
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
    issues.push(...validateCondition(nationId, `${base}.condition`, hook.condition));
    if (!Array.isArray(hook.effects)) {
      issues.push({ nationId, field: `${base}.effects`, reason: "effects must be an array" });
      return;
    }
    if (hook.effects.some((effect) => typeof effect !== "object" || effect === null || Array.isArray(effect))) {
      issues.push({ nationId, field: `${base}.effects`, reason: "each effect payload entry must be an object" });
    }
    issues.push(...validateResourceReferences(nationId, `${base}.effects`, hook.effects));
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
    move_cards_to_unrest_supply: ["cardIds"],
    create_side_area: ["areaId", "displayName"],
  }));
  issues.push(...validateOverrides<ZoneOverride>(nationId, "zoneOverrides", ruleset.zoneOverrides, {
    disable_history: ["replacementBehavior"],
    replace_history_with_zone: ["zoneId", "displayName"],
    create_zone: ["zoneId", "displayName", "visibility"],
  }));
  issues.push(...validateOverrides<StateOverride>(nationId, "stateOverrides", ruleset.stateOverrides, {
    start_as_state: ["state"],
    never_flip_to_empire: [],
    flip_state_on_solstice: ["sequence"],
    take_unrest_when_spending_resource: ["resource"],
    suppress_king_of_kings_reward: [],
  }));
  issues.push(...validateOverrides<ReshuffleOverride>(nationId, "reshuffleOverrides", ruleset.reshuffleOverrides, {
    skip_default_nation_card_addition: [],
    development_available_from_start: [],
    trigger_game_end_when_card_added: ["cardId"],
    place_nation_card_in_play_when_added: ["cardId"],
    custom_reshuffle_effect: ["effect"],
  }));
  issues.push(...validateOverrides<CleanupOverride>(nationId, "cleanupOverrides", ruleset.cleanupOverrides, {
    prevent_voluntary_discard: [],
    market_resource_added: ["resource", "count"],
    custom_cleanup_effect: ["effect"],
  }));
  issues.push(...validateOverrides<SolsticeOverride>(nationId, "solsticeOverrides", ruleset.solsticeOverrides, {
    flip_state: [],
    remove_play_card_and_nation_deck_if_resource_empty: ["cardId", "resource"],
    custom_solstice_effect: ["effect"],
  }));
  issues.push(...validateOverrides<ScoringOverride>(nationId, "scoringOverrides", ruleset.scoringOverrides, {
    exclude_zone_from_scoring: ["zoneId"],
    score_resource_ratio: ["resource", "denominator"],
    custom_scoring_effect: ["effect"],
  }));
  issues.push(...validateOverrides<CollapseOverride>(nationId, "collapseOverrides", ruleset.collapseOverrides, {
    auto_win_if_zone_empty: ["zoneId"],
    custom_collapse_resolution: ["effect"],
  }));
  issues.push(...validateOverrides<BotOverride>(nationId, "botOverrides", ruleset.botOverrides, {
    skip_default_dynasty_setup: [],
    skip_bot_accession_state_flip: [],
    bot_cleanup_market_resource: ["resource", "count"],
    custom_dynasty_setup: ["config"],
    custom_bot_state_stack: ["cardIds"],
    initial_bot_state_table: ["tableId"],
    bot_custom_cleanup: ["effect"],
  }));
  issues.push(...validateOverrides<ShortGameOverride>(nationId, "shortGameOverrides", ruleset.shortGameOverrides, {
    excluded_from_short_game: [],
    custom_short_game_setup: ["effect"],
    add_nation_cards_to_discard: ["count"],
    skip_accession_development_exile: [],
    remove_starting_resource: ["resource", "count"],
    remove_starting_resources: ["resources"],
    develop_one_remove_one_development: ["developCardId", "removeCardId"],
    move_development_cards_to_discard: ["cardIds"],
    move_one_advanced_nation_card_to_side_area: ["areaId"],
    garrison_development_and_add_nation_to_starting_deck: ["developmentCardId", "hostCardId"],
  }));
  issues.push(...validateHookRules(nationId, ruleset.hookRules));

  if (Array.isArray(ruleset.shortGameOverrides)) ruleset.shortGameOverrides.forEach((override, i) => {
    if (override.op === "move_one_advanced_nation_card_to_side_area" && override.selection !== undefined && !has(["first", "random"], override.selection)) {
      issues.push({ nationId, field: `shortGameOverrides[${i}].selection`, reason: `invalid selection '${String(override.selection)}'` });
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
