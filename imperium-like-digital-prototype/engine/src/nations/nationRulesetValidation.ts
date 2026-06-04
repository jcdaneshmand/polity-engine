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
const EFFECT_TRIGGERS = ["on_play", "on_exhaust", "on_acquire", "on_solstice", "end_of_solstice"];
const EFFECT_OPS = [
  "draw", "draw_if_able", "gain_resource", "spend_resource", "remove_resource", "return_resource", "steal_resource",
  "discard_random", "discard_cards", "return_unrest", "return_fame", "place_card_on_deck", "give_card", "swap_card", "take_unrest",
  "gain_fame", "gain_action", "spend_action", "return_exhaust_token", "trigger_scoring", "trade", "treat_suit_as",
  "commerce", "profit", "garrison_card", "recall_region", "abandon_region", "develop", "move_self_to_history",
  "exile_card", "acquire_card", "gain_card", "take_card", "break_through", "find_card", "look_cards",
  "conditional_resource_at_least", "conditional_state_is", "optional", "choose_one",
];
const BOT_EFFECT_OPS = [
  "bot_return_revealed_card_to_unrest", "bot_discard_revealed_card", "bot_put_revealed_card_into_history",
  "bot_play_revealed_card", "bot_put_revealed_card_on_bottom_of_deck", "bot_gain_resource", "bot_gain_resource_per_in_play", "bot_spend_resource",
  "bot_pay_resource_then", "bot_move_resource_to_state_card", "bot_spend_resource_to_state_card", "bot_take_unrest",
  "human_take_chaos", "bot_resolve_cultists_state_cleanup", "bot_gain_fame", "bot_acquire", "bot_break_through",
  "bot_exile_market", "bot_resolve_top_bot_deck", "bot_resolve_top_dynasty_deck", "bot_resolve_top_main_deck",
  "bot_discard_top_bot_deck", "bot_discard_top_dynasty_deck", "bot_return_from_discard", "bot_abandon_in_play",
  "bot_recall_in_play", "bot_swap_market", "bot_move_top_discard_to_deck", "bot_add_resource_to_market_slot",
  "bot_flip_state_table", "bot_flip_merchant_state", "bot_trade", "bot_trigger_trade_route",
  "bot_resolve_profits_where_able", "human_take_unrest", "human_abandon", "human_recall", "human_gain_resource", "log",
];
const BOT_EFFECT_FIELDS = [
  "op", "resource", "count", "countPerCard", "spendResource", "spendCount", "placeResource", "placeCount",
  "effects", "ifUnable", "ifVp", "filter", "marketFilter", "fromExile", "resolveGained", "discardGained",
  "slot", "nextSide", "nextTableId", "nextState", "cardId", "zoneId", "message",
];
const BOT_FILTER_FIELDS = ["suits", "cardTypes", "tags", "minVp", "maxVp", "hasMarketResource", "slotNumbers"];
const BOT_IF_VP_FIELDS = ["value", "effects"];
const RESOURCE_NAMES: ResourceName[] = ["materials", "knowledge", "influence", "unrest", "goods"];
const CARD_TYPES: CardType[] = ["action", "unit", "technology", "legacy", "in_play", "attack", "power", "state", "development", "accession", "nation", "region", "unrest", "fame", "trade_route", "bot_state", "other"];
const SUITS: Suit[] = ["military", "civic", "economic", "unrest", "wild", "region", "uncivilized", "civilized", "tributary", "fame", "power", "trade_route", "none", "multi"];
const SUIT_ICONS: Suit[] = ["military", "civic", "economic", "unrest", "wild", "region", "uncivilized", "civilized", "tributary", "fame", "power", "trade_route"];
const BREAK_THROUGH_SUITS: Suit[] = ["region", "uncivilized", "civilized", "tributary"];
const REACTIVE_TRIGGERS = ["after_gain_resource", "after_take_unrest", "after_acquire_card", "after_play_card", "after_break_through_card"];
const REACTIVE_TARGETS = ["self", "opponent", "any"];
const REACTIVE_FIELDS = ["trigger", "target", "sourceSuit", "resource"];
const DRAW_SOURCES = ["deck", "discard", "exile", "fameDeck"];
const EXILE_SOURCES = ["market", "hand", "discard", "deck", "playArea", "history", "garrison"];
const ACQUIRE_SOURCES = ["market", "exile"];
const MARKET_MOVE_SOURCES = ["market"];
const BREAK_THROUGH_SOURCES = ["market", "deck", "exile"];
const FIND_SOURCES = ["hand", "discard", "deck", "nationDeck", "playArea", "history", "garrison"];
const LOOK_SOURCES = ["deck", "nationDeck", "fameDeck"];
const RETURN_UNREST_SOURCES = ["hand", "playArea", "discard", "deck", "history", "exile"];
const RETURN_FAME_SOURCES = ["hand", "playArea", "discard", "deck", "history", "exile"];
const PLACE_ON_DECK_SOURCES = ["hand", "discard"];
const SWAP_SOURCES = ["hand", "discard", "deck"];
const FIND_DESTINATIONS = ["deck", "hand", "discard", "playArea", "history", "exile"];
const GAIN_DESTINATIONS = ["hand", "discard"];
const PROFIT_DESTINATIONS = ["discard", "history"];
const CARD_ID_EFFECT_OPS = ["return_unrest", "return_fame", "place_card_on_deck", "give_card", "swap_card", "return_exhaust_token", "garrison_card", "recall_region", "abandon_region", "exile_card", "acquire_card", "gain_card", "take_card", "break_through", "find_card"];
const HOST_CARD_ID_EFFECT_OPS = ["garrison_card"];
const MARKET_CARD_ID_EFFECT_OPS = ["swap_card"];
const TARGET_PLAYER_ID_EFFECT_OPS = ["give_card"];
const TARGET_PLAYER_IDS_EFFECT_OPS = ["give_card", "take_unrest"];
const FROM_PLAYER_ID_EFFECT_OPS = ["steal_resource"];
const REASON_EFFECT_OPS = ["trigger_scoring"];
const STATE_EFFECT_OPS = ["conditional_state_is"];
const FROM_EFFECT_OPS = ["treat_suit_as"];
const TO_EFFECT_OPS = ["treat_suit_as"];
const EFFECTS_EFFECT_OPS = ["optional", "commerce", "profit"];
const CHOICES_EFFECT_OPS = ["choose_one"];
const THEN_EFFECT_OPS = ["conditional_resource_at_least", "conditional_state_is"];
const ELSE_EFFECT_OPS = ["conditional_resource_at_least", "conditional_state_is"];
const SOURCE_EFFECT_OPS = ["draw", "draw_if_able", "exile_card", "acquire_card", "gain_card", "take_card", "break_through", "look_cards"];
const SOURCE_ZONES_EFFECT_OPS = ["return_unrest", "return_fame", "find_card"];
const SOURCE_ZONE_EFFECT_OPS = ["place_card_on_deck", "swap_card"];
const DESTINATION_EFFECT_OPS = ["find_card", "acquire_card", "gain_card", "take_card", "profit"];
const SUIT_EFFECT_OPS = ["acquire_card", "gain_card", "take_card", "find_card", "exile_card", "break_through"];
const CARD_TYPE_EFFECT_OPS = ["acquire_card", "gain_card", "take_card", "find_card", "exile_card", "break_through"];
const RESOURCE_EFFECT_OPS = ["gain_resource", "spend_resource", "remove_resource", "return_resource", "steal_resource", "conditional_resource_at_least"];
const COUNT_EFFECT_OPS = ["draw", "draw_if_able", "discard_random", "discard_cards", "take_unrest", "gain_fame", "recall_region", "abandon_region", "exile_card", "acquire_card", "gain_card", "take_card", "break_through", "look_cards"];
const AMOUNT_EFFECT_OPS = ["gain_resource", "spend_resource", "remove_resource", "return_resource", "steal_resource", "gain_action", "spend_action"];
const AT_LEAST_EFFECT_OPS = ["conditional_resource_at_least"];
const EFFECT_FIELDS = [
  "trigger",
  "op",
  "count",
  "source",
  "resource",
  "amount",
  "fromPlayerId",
  "cardId",
  "sourceZones",
  "sourceZone",
  "targetPlayerId",
  "targetPlayerIds",
  "marketCardId",
  "reason",
  "from",
  "to",
  "effects",
  "destination",
  "hostCardId",
  "suit",
  "cardType",
  "atLeast",
  "then",
  "else",
  "state",
  "choices",
  "free",
  "reactive",
];
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
const OVERRIDE_OPTIONAL_FIELDS_BY_OP: Record<string, string[]> = {
  create_side_area: ["public"],
  replace_history_with_zone: ["cardsScore"],
  flip_state_on_solstice: ["loop"],
  take_unrest_when_spending_resource: ["state"],
  suppress_king_of_kings_reward: ["state"],
  place_nation_card_in_play_when_added: ["suppressStateFlip"],
  remove_play_card_and_nation_deck_if_resource_empty: ["state", "activateState"],
  score_resource_ratio: ["numerator", "state"],
  initial_bot_state_table: ["side"],
  move_one_advanced_nation_card_to_side_area: ["selection"],
};
const RULESET_FIELDS = [
  "nationId", "displayName", "privateName", "rulesetTags", "requiredExpansions", "excludedExpansions",
  "allowedModes", "disallowedModes", "excludedVariants", "requiredVariants", "setupOverrides", "zoneOverrides",
  "stateOverrides", "reshuffleOverrides", "cleanupOverrides", "solsticeOverrides", "scoringOverrides",
  "collapseOverrides", "botOverrides", "shortGameOverrides", "hookRules", "publicSummary", "privateNotes",
  "implemented", "tested",
];
const HOOK_FIELDS = ["trigger", "condition", "effects", "priority", "description"];
const BOT_MARKET_SLOTS = ["rolled", 1, 2, 3, 4, 5, 6];
const BOT_MERCHANT_STATES = ["merchants", "merchant_empire"];

const has = (set: string[], value: unknown): value is string => typeof value === "string" && set.includes(value);
const hasFields = (obj: unknown, fields: string[]) => typeof obj === "object" && obj !== null && fields.every((f) => Object.prototype.hasOwnProperty.call(obj, f));
const isPositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;
const isNonNegativeInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

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
        Object.entries(entry as Record<string, unknown>).forEach(([resource, amount]) => {
          if (!has(RESOURCE_NAMES, resource)) {
            issues.push({ nationId, field: `${path}.${resource}`, reason: `invalid resource '${resource}'` });
            return;
          }
          if (!isNonNegativeInteger(amount)) {
            issues.push({ nationId, field: `${path}.${resource}`, reason: `invalid resource amount '${String(amount)}'` });
          }
        });
        return;
      }
    }
    issues.push(...validateResourceReferences(nationId, path, entry));
  });
  return issues;
}

function validateHumanEffectPayloads(nationId: string, field: string, effects: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(effects)) {
    issues.push({ nationId, field, reason: "effect must be an array" });
    return issues;
  }
  effects.forEach((effect, index) => {
    const path = `${field}[${index}]`;
    if (typeof effect !== "object" || effect === null || Array.isArray(effect)) {
      issues.push({ nationId, field: path, reason: "effect entry must be an object" });
      return;
    }
    const record = effect as Record<string, unknown>;
    if (record.trigger !== undefined && !has(EFFECT_TRIGGERS, record.trigger)) {
      issues.push({ nationId, field: `${path}.trigger`, reason: `unsupported effect trigger '${String(record.trigger)}'` });
    }
    if (!has(EFFECT_OPS, record.op)) {
      issues.push({ nationId, field: `${path}.op`, reason: `unsupported effect op '${String(record.op ?? "missing")}'` });
      return;
    }
    issues.push(...validateHumanEffectShape(nationId, path, record));
    if (record.op === "optional" || record.op === "commerce" || record.op === "profit") {
      if (Array.isArray(record.effects) && record.effects.length === 0) {
        issues.push({ nationId, field: `${path}.effects`, reason: "effects must contain at least one effect" });
      }
      issues.push(...validateHumanEffectPayloads(nationId, `${path}.effects`, record.effects));
    }
    if (record.op === "choose_one") {
      if (!Array.isArray(record.choices)) {
        issues.push({ nationId, field: `${path}.choices`, reason: "choices must be an array" });
      } else if (record.choices.length === 0) {
        issues.push({ nationId, field: `${path}.choices`, reason: "choices must contain at least one choice" });
      } else {
        record.choices.forEach((choice, choiceIndex) => {
          if (Array.isArray(choice) && choice.length === 0) {
            issues.push({ nationId, field: `${path}.choices[${choiceIndex}]`, reason: "choice must contain at least one effect" });
          }
          issues.push(...validateHumanEffectPayloads(nationId, `${path}.choices[${choiceIndex}]`, choice));
        });
      }
    }
    if (record.op === "conditional_resource_at_least" || record.op === "conditional_state_is") {
      if (Array.isArray(record.then) && record.then.length === 0) {
        issues.push({ nationId, field: `${path}.then`, reason: "then must contain at least one effect" });
      }
      issues.push(...validateHumanEffectPayloads(nationId, `${path}.then`, record.then));
      if (Array.isArray(record.else) && record.else.length === 0) {
        issues.push({ nationId, field: `${path}.else`, reason: "else must contain at least one effect" });
      }
      if (record.else !== undefined) issues.push(...validateHumanEffectPayloads(nationId, `${path}.else`, record.else));
    }
  });
  return issues;
}

function validateHumanEffectShape(nationId: string, path: string, record: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const op = String(record.op);
  Object.keys(record).forEach((fieldName) => {
    if (!EFFECT_FIELDS.includes(fieldName)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `unsupported field '${fieldName}'` });
    }
  });
  const optionalEnum = (fieldName: string, allowed: string[]) => {
    const value = record[fieldName];
    if (value !== undefined && !has(allowed, value)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
    }
  };
  const requiredEnum = (fieldName: string, allowed: string[]) => {
    const value = record[fieldName];
    if (value === undefined) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `missing required ${fieldName}` });
      return;
    }
    if (!has(allowed, value)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
    }
  };
  const sourceZones = (fieldName: "sourceZones" | "sourceZone", allowed: string[]) => {
    const value = record[fieldName];
    if (value === undefined) return;
    const values = fieldName === "sourceZones" ? value : [value];
    if (!Array.isArray(values) || values.length === 0 || values.some((entry) => !has(allowed, entry))) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName}` });
    }
  };
  const requiredPositiveInteger = (fieldName: "count" | "amount") => {
    if (!isPositiveInteger(record[fieldName])) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(record[fieldName])}'` });
    }
  };
  const requiredResource = () => {
    const value = record.resource;
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push({ nationId, field: `${path}.resource`, reason: "missing required resource" });
    }
  };
  const optionalPositiveInteger = (fieldName: "count") => {
    const value = record[fieldName];
    if (value !== undefined && !isPositiveInteger(value)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
    }
  };
  const optionalString = (fieldName: "cardId" | "hostCardId" | "marketCardId" | "targetPlayerId") => {
    const value = record[fieldName];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
    }
  };
  const optionalStringArray = (fieldName: "targetPlayerIds") => {
    const value = record[fieldName];
    if (value !== undefined && (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0))) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName}` });
    }
  };

  if (["draw", "draw_if_able", "discard_random", "discard_cards", "take_unrest", "gain_fame", "acquire_card", "gain_card", "take_card", "break_through", "look_cards"].includes(op)) requiredPositiveInteger("count");
  if (op === "exile_card") optionalPositiveInteger("count");
  if (["gain_resource", "spend_resource", "remove_resource", "return_resource", "steal_resource", "gain_action", "spend_action"].includes(op)) requiredPositiveInteger("amount");
  if (op === "conditional_resource_at_least" && !isNonNegativeInteger(record.atLeast)) issues.push({ nationId, field: `${path}.atLeast`, reason: `invalid atLeast '${String(record.atLeast)}'` });
  if (["gain_resource", "spend_resource", "remove_resource", "return_resource", "steal_resource", "conditional_resource_at_least"].includes(op)) requiredResource();
  if (op === "draw") optionalEnum("source", DRAW_SOURCES);
  if (op === "draw_if_able" && record.source !== undefined) issues.push({ nationId, field: `${path}.source`, reason: `invalid source '${String(record.source)}'` });
  if (op === "exile_card") requiredEnum("source", EXILE_SOURCES);
  if (op === "acquire_card") optionalEnum("source", ACQUIRE_SOURCES);
  if (op === "gain_card" || op === "take_card") requiredEnum("source", MARKET_MOVE_SOURCES);
  if (op === "break_through") {
    requiredEnum("source", BREAK_THROUGH_SOURCES);
    requiredEnum("suit", BREAK_THROUGH_SUITS);
  }
  if (op === "look_cards") requiredEnum("source", LOOK_SOURCES);
  if (op === "return_unrest") sourceZones("sourceZones", RETURN_UNREST_SOURCES);
  if (op === "return_fame") sourceZones("sourceZones", RETURN_FAME_SOURCES);
  if (op === "place_card_on_deck") sourceZones("sourceZone", PLACE_ON_DECK_SOURCES);
  if (op === "swap_card") sourceZones("sourceZone", SWAP_SOURCES);
  if (op === "find_card") {
    requiredEnum("destination", FIND_DESTINATIONS);
    sourceZones("sourceZones", FIND_SOURCES);
  }
  if (op === "acquire_card" || op === "gain_card" || op === "take_card") optionalEnum("destination", GAIN_DESTINATIONS);
  if (op === "profit") optionalEnum("destination", PROFIT_DESTINATIONS);
  if (["acquire_card", "gain_card", "take_card", "find_card", "exile_card"].includes(op)) optionalEnum("suit", SUITS);
  if (op === "break_through" && record.cardType !== undefined) {
    issues.push({ nationId, field: `${path}.cardType`, reason: `invalid cardType '${String(record.cardType)}'` });
  }
  if (record.cardId !== undefined && !CARD_ID_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.cardId`, reason: `invalid cardId '${String(record.cardId)}'` });
  }
  if (record.hostCardId !== undefined && !HOST_CARD_ID_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.hostCardId`, reason: `invalid hostCardId '${String(record.hostCardId)}'` });
  }
  if (record.marketCardId !== undefined && !MARKET_CARD_ID_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.marketCardId`, reason: `invalid marketCardId '${String(record.marketCardId)}'` });
  }
  if (record.targetPlayerId !== undefined && !TARGET_PLAYER_ID_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.targetPlayerId`, reason: `invalid targetPlayerId '${String(record.targetPlayerId)}'` });
  }
  if (record.targetPlayerIds !== undefined && !TARGET_PLAYER_IDS_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.targetPlayerIds`, reason: "invalid targetPlayerIds" });
  }
  if (record.fromPlayerId !== undefined && !FROM_PLAYER_ID_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.fromPlayerId`, reason: `invalid fromPlayerId '${String(record.fromPlayerId)}'` });
  }
  if (record.reason !== undefined && !REASON_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.reason`, reason: `invalid reason '${String(record.reason)}'` });
  }
  if (record.state !== undefined && !STATE_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.state`, reason: `invalid state '${String(record.state)}'` });
  }
  if (record.from !== undefined && !FROM_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.from`, reason: `invalid from '${String(record.from)}'` });
  }
  if (record.to !== undefined && !TO_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.to`, reason: "invalid to" });
  }
  if (record.effects !== undefined && !EFFECTS_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.effects`, reason: "invalid effects" });
  }
  if (record.choices !== undefined && !CHOICES_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.choices`, reason: "invalid choices" });
  }
  if (record.then !== undefined && !THEN_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.then`, reason: "invalid then" });
  }
  if (record.else !== undefined && !ELSE_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.else`, reason: "invalid else" });
  }
  if (record.source !== undefined && !SOURCE_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.source`, reason: `invalid source '${String(record.source)}'` });
  }
  if (record.sourceZones !== undefined && !SOURCE_ZONES_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.sourceZones`, reason: "invalid sourceZones" });
  }
  if (record.sourceZone !== undefined && !SOURCE_ZONE_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.sourceZone`, reason: "invalid sourceZone" });
  }
  if (record.destination !== undefined && !DESTINATION_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.destination`, reason: `invalid destination '${String(record.destination)}'` });
  }
  if (record.suit !== undefined && !SUIT_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.suit`, reason: `invalid suit '${String(record.suit)}'` });
  }
  if (record.cardType !== undefined && !CARD_TYPE_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.cardType`, reason: `invalid cardType '${String(record.cardType)}'` });
  }
  if (record.resource !== undefined && !RESOURCE_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.resource`, reason: `invalid resource '${String(record.resource)}'` });
  }
  if (record.count !== undefined && !COUNT_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.count`, reason: `invalid count '${String(record.count)}'` });
  }
  if (record.amount !== undefined && !AMOUNT_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.amount`, reason: `invalid amount '${String(record.amount)}'` });
  }
  if (record.atLeast !== undefined && !AT_LEAST_EFFECT_OPS.includes(op)) {
    issues.push({ nationId, field: `${path}.atLeast`, reason: `invalid atLeast '${String(record.atLeast)}'` });
  }
  if (record.free !== undefined && op !== "develop") {
    issues.push({ nationId, field: `${path}.free`, reason: `invalid free '${String(record.free)}'` });
  }
  if (op === "develop" && record.free !== undefined && typeof record.free !== "boolean") {
    issues.push({ nationId, field: `${path}.free`, reason: `invalid free '${String(record.free)}'` });
  }
  if (["acquire_card", "gain_card", "take_card", "find_card", "exile_card"].includes(op)) optionalEnum("cardType", CARD_TYPES);
  if (op === "treat_suit_as") {
    requiredEnum("from", SUIT_ICONS);
    const to = record.to;
    if (!Array.isArray(to) || to.length === 0 || to.some((suit) => !has(SUIT_ICONS, suit))) {
      issues.push({ nationId, field: `${path}.to`, reason: "invalid to" });
    }
  }
  if (FROM_PLAYER_ID_EFFECT_OPS.includes(op) && (typeof record.fromPlayerId !== "string" || record.fromPlayerId.trim().length === 0)) issues.push({ nationId, field: `${path}.fromPlayerId`, reason: "missing required fromPlayerId" });
  if (op === "trigger_scoring" && (typeof record.reason !== "string" || record.reason.trim().length === 0)) issues.push({ nationId, field: `${path}.reason`, reason: "missing required reason" });
  if (op === "conditional_state_is" && (typeof record.state !== "string" || record.state.trim().length === 0)) issues.push({ nationId, field: `${path}.state`, reason: "missing required state" });
  if (CARD_ID_EFFECT_OPS.includes(op)) optionalString("cardId");
  if (HOST_CARD_ID_EFFECT_OPS.includes(op)) optionalString("hostCardId");
  if (MARKET_CARD_ID_EFFECT_OPS.includes(op)) optionalString("marketCardId");
  if (TARGET_PLAYER_ID_EFFECT_OPS.includes(op)) {
    optionalString("targetPlayerId");
    optionalStringArray("targetPlayerIds");
  }
  if (op === "take_unrest") optionalStringArray("targetPlayerIds");
  issues.push(...validateReactiveMetadata(nationId, path, record));
  return issues;
}

function validateReactiveMetadata(nationId: string, path: string, record: Record<string, unknown>): ValidationIssue[] {
  const reactive = record.reactive;
  const issues: ValidationIssue[] = [];
  if (reactive === undefined) return issues;
  if (record.trigger !== "on_exhaust") {
    issues.push({ nationId, field: `${path}.reactive`, reason: "reactive metadata is only valid on on_exhaust effects" });
  }
  if (!reactive || typeof reactive !== "object" || Array.isArray(reactive)) {
    issues.push({ nationId, field: `${path}.reactive`, reason: "invalid reactive metadata" });
    return issues;
  }
  const condition = reactive as Record<string, unknown>;
  Object.keys(condition).forEach((fieldName) => {
    if (!REACTIVE_FIELDS.includes(fieldName)) {
      issues.push({ nationId, field: `${path}.reactive.${fieldName}`, reason: `unsupported reactive field '${fieldName}'` });
    }
  });
  const triggerName = has(REACTIVE_TRIGGERS, condition.trigger) ? condition.trigger : undefined;
  if (triggerName === undefined) {
    issues.push({ nationId, field: `${path}.reactive.trigger`, reason: `invalid reactive trigger '${String(condition.trigger ?? "missing")}'` });
  }
  if (condition.target !== undefined && (!has(REACTIVE_TARGETS, condition.target) || triggerName === "after_gain_resource")) {
    issues.push({ nationId, field: `${path}.reactive.target`, reason: `invalid reactive target '${String(condition.target)}'` });
  }
  if (condition.sourceSuit !== undefined && (!has(SUIT_ICONS, condition.sourceSuit) || (triggerName !== undefined && triggerName !== "after_gain_resource"))) {
    issues.push({ nationId, field: `${path}.reactive.sourceSuit`, reason: `invalid reactive sourceSuit '${String(condition.sourceSuit)}'` });
  }
  if (condition.resource !== undefined && triggerName !== undefined && triggerName !== "after_gain_resource") {
    issues.push({ nationId, field: `${path}.reactive.resource`, reason: `invalid reactive resource '${String(condition.resource)}'` });
  }
  return issues;
}

function validateBotEffectShape(nationId: string, path: string, record: Record<string, unknown>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const op = String(record.op);
  Object.keys(record).forEach((fieldName) => {
    if (!BOT_EFFECT_FIELDS.includes(fieldName)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `unsupported bot effect field '${fieldName}'` });
    }
  });
  const requiredResource = (fieldName: "resource" | "spendResource" | "placeResource") => {
    const value = record[fieldName];
    if (value === undefined) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `missing required ${fieldName}` });
      return;
    }
    if (!has(RESOURCE_NAMES, value)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
    }
  };
  const requiredPositiveInteger = (fieldName: "count" | "spendCount" | "placeCount") => {
    if (!isPositiveInteger(record[fieldName])) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(record[fieldName])}'` });
    }
  };
  const optionalPositiveInteger = (fieldName: "count" | "countPerCard") => {
    const value = record[fieldName];
    if (value !== undefined && !isPositiveInteger(value)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
    }
  };
  const optionalString = (fieldName: "cardId" | "zoneId") => {
    const value = record[fieldName];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
    }
  };
  const optionalBoolean = (fieldName: "fromExile" | "resolveGained" | "discardGained") => {
    const value = record[fieldName];
    if (value !== undefined && typeof value !== "boolean") {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
    }
  };

  if (["bot_gain_resource", "bot_spend_resource", "bot_pay_resource_then", "bot_move_resource_to_state_card", "bot_add_resource_to_market_slot", "human_gain_resource"].includes(op)) {
    requiredResource("resource");
  }
  if (["bot_gain_resource", "bot_spend_resource", "bot_pay_resource_then", "bot_move_resource_to_state_card", "bot_take_unrest", "human_take_chaos", "bot_gain_fame", "bot_add_resource_to_market_slot", "human_take_unrest"].includes(op)) {
    requiredPositiveInteger("count");
  }
  if (op === "bot_gain_resource_per_in_play") {
    requiredResource("resource");
    optionalPositiveInteger("countPerCard");
  }
  if (op === "bot_spend_resource_to_state_card") {
    requiredResource("spendResource");
    requiredPositiveInteger("spendCount");
    requiredResource("placeResource");
    requiredPositiveInteger("placeCount");
  }
  if (op === "bot_discard_top_bot_deck" || op === "bot_discard_top_dynasty_deck" || op === "human_abandon" || op === "human_recall") {
    optionalPositiveInteger("count");
  }
  if (op === "bot_add_resource_to_market_slot" && !BOT_MARKET_SLOTS.includes(record.slot as "rolled" | number)) {
    issues.push({ nationId, field: `${path}.slot`, reason: `invalid slot '${String(record.slot)}'` });
  }
  if (op === "bot_flip_state_table") {
    for (const fieldName of ["nextSide", "nextTableId"] as const) {
      const value = record[fieldName];
      if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
      }
    }
  }
  if (op === "bot_flip_merchant_state" && !has(BOT_MERCHANT_STATES, record.nextState)) {
    issues.push({ nationId, field: `${path}.nextState`, reason: `invalid nextState '${String(record.nextState)}'` });
  }
  if (op === "human_take_chaos") optionalString("zoneId");
  if (op === "bot_trigger_trade_route") optionalString("cardId");
  if (op === "bot_acquire") optionalBoolean("fromExile");
  if (op === "bot_break_through") {
    optionalBoolean("resolveGained");
    optionalBoolean("discardGained");
  }
  if (op === "log" && (typeof record.message !== "string" || record.message.trim().length === 0)) {
    issues.push({ nationId, field: `${path}.message`, reason: `invalid message '${String(record.message)}'` });
  }

  return issues;
}

function validateBotAcquireFilter(nationId: string, path: string, value: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (value === undefined) return issues;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    issues.push({ nationId, field: path, reason: "filter must be an object" });
    return issues;
  }
  const filter = value as Record<string, unknown>;
  Object.keys(filter).forEach((fieldName) => {
    if (!BOT_FILTER_FIELDS.includes(fieldName)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `unsupported filter field '${fieldName}'` });
    }
  });
  const validateEnumArray = (fieldName: "suits" | "cardTypes", allowed: string[], label: "suit" | "cardType") => {
    const entries = filter[fieldName];
    if (entries === undefined) return;
    if (!Array.isArray(entries)) {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `${fieldName} must be an array` });
      return;
    }
    entries.forEach((entry, index) => {
      if (!has(allowed, entry)) {
        issues.push({ nationId, field: `${path}.${fieldName}[${index}]`, reason: `invalid ${label} '${String(entry)}'` });
      }
    });
  };
  validateEnumArray("suits", SUIT_ICONS, "suit");
  validateEnumArray("cardTypes", CARD_TYPES, "cardType");

  if (filter.tags !== undefined) {
    if (!Array.isArray(filter.tags)) {
      issues.push({ nationId, field: `${path}.tags`, reason: "tags must be an array" });
    } else {
      filter.tags.forEach((entry, index) => {
        if (typeof entry !== "string" || entry.trim().length === 0) {
          issues.push({ nationId, field: `${path}.tags[${index}]`, reason: `invalid tag '${String(entry)}'` });
        }
      });
    }
  }
  for (const fieldName of ["minVp", "maxVp"] as const) {
    const entry = filter[fieldName];
    if (entry !== undefined && typeof entry !== "number") {
      issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(entry)}'` });
    }
  }
  if (filter.hasMarketResource !== undefined && !has(RESOURCE_NAMES, filter.hasMarketResource)) {
    issues.push({ nationId, field: `${path}.hasMarketResource`, reason: `invalid hasMarketResource '${String(filter.hasMarketResource)}'` });
  }
  if (filter.slotNumbers !== undefined) {
    if (!Array.isArray(filter.slotNumbers)) {
      issues.push({ nationId, field: `${path}.slotNumbers`, reason: "slotNumbers must be an array" });
    } else {
      filter.slotNumbers.forEach((entry, index) => {
        if (typeof entry !== "number" || !BOT_MARKET_SLOTS.includes(entry)) {
          issues.push({ nationId, field: `${path}.slotNumbers[${index}]`, reason: `invalid slotNumber '${String(entry)}'` });
        }
      });
    }
  }
  return issues;
}

function validateBotEffectPayloads(nationId: string, field: string, effects: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(effects)) {
    issues.push({ nationId, field, reason: "effect must be an array" });
    return issues;
  }
  effects.forEach((effect, index) => {
    const path = `${field}[${index}]`;
    if (typeof effect !== "object" || effect === null || Array.isArray(effect)) {
      issues.push({ nationId, field: path, reason: "bot effect entry must be an object" });
      return;
    }
    const record = effect as Record<string, unknown>;
    if (!has(BOT_EFFECT_OPS, record.op)) {
      issues.push({ nationId, field: `${path}.op`, reason: `unsupported bot effect op '${String(record.op ?? "missing")}'` });
      return;
    }
    issues.push(...validateBotEffectShape(nationId, path, record));
    issues.push(...validateBotAcquireFilter(nationId, `${path}.filter`, record.filter));
    issues.push(...validateBotAcquireFilter(nationId, `${path}.marketFilter`, record.marketFilter));
    if (record.op === "bot_pay_resource_then") {
      if (Array.isArray(record.effects) && record.effects.length === 0) {
        issues.push({ nationId, field: `${path}.effects`, reason: "effects must contain at least one bot effect" });
      }
      issues.push(...validateBotEffectPayloads(nationId, `${path}.effects`, record.effects));
    }
    if (record.ifUnable !== undefined && !Array.isArray(record.ifUnable)) {
      issues.push({ nationId, field: `${path}.ifUnable`, reason: "ifUnable must be an array" });
    } else if (Array.isArray(record.ifUnable)) {
      issues.push(...validateBotEffectPayloads(nationId, `${path}.ifUnable`, record.ifUnable));
    }
    const ifVp = record.ifVp;
    if (typeof ifVp === "object" && ifVp !== null && !Array.isArray(ifVp) && "effects" in ifVp) {
      const condition = ifVp as Record<string, unknown> & { value?: unknown; effects?: unknown };
      Object.keys(condition).forEach((fieldName) => {
        if (!BOT_IF_VP_FIELDS.includes(fieldName)) {
          issues.push({ nationId, field: `${path}.ifVp.${fieldName}`, reason: `unsupported ifVp field '${fieldName}'` });
        }
      });
      if (typeof condition.value !== "number") {
        issues.push({ nationId, field: `${path}.ifVp.value`, reason: `invalid value '${String(condition.value)}'` });
      }
      if (Array.isArray(condition.effects) && condition.effects.length === 0) {
        issues.push({ nationId, field: `${path}.ifVp.effects`, reason: "effects must contain at least one bot effect" });
      }
      issues.push(...validateBotEffectPayloads(nationId, `${path}.ifVp.effects`, condition.effects));
    }
  });
  return issues;
}

function validateOverrides<T extends { op: string }>(nationId: string, field: string, list: unknown, opRequirements: Record<string, string[]>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!Array.isArray(list)) {
    issues.push({ nationId, field, reason: "must be an array" });
    return issues;
  }
  const validateRequiredIdentifiers = (path: string, entry: Record<string, unknown>, required: string[]) => {
    required.forEach((fieldName) => {
      const value = entry[fieldName];
      if (fieldName.endsWith("Ids") && (!Array.isArray(value) || value.length === 0 || value.some((id) => typeof id !== "string" || id.trim().length === 0))) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName}` });
      }
      if (fieldName.endsWith("Id") && (typeof value !== "string" || value.trim().length === 0)) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName}` });
      }
    });
  };
  const validateRequiredNumbers = (path: string, entry: Record<string, unknown>, op: string, required: string[]) => {
    required.forEach((fieldName) => {
      const value = entry[fieldName];
      if (fieldName === "denominator" && !isPositiveInteger(value)) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
      }
      if (fieldName === "count") {
        const validCount = op === "add_nation_cards_to_discard" ? isNonNegativeInteger(value) : isPositiveInteger(value);
        if (!validCount) {
          issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
        }
      }
    });
  };
  const validateRequiredStrings = (path: string, entry: Record<string, unknown>, required: string[]) => {
    required.forEach((fieldName) => {
      const value = entry[fieldName];
      if ((fieldName === "displayName" || fieldName === "state") && (typeof value !== "string" || value.trim().length === 0)) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName}` });
      }
      if (fieldName === "replacementBehavior" && !has(["discard", "exile", "alternate_zone"], value)) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
      }
      if (fieldName === "visibility" && !has(["public", "private"], value)) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
      }
      if (fieldName === "sequence" && (!Array.isArray(value) || value.length === 0 || value.some((state) => typeof state !== "string" || state.trim().length === 0))) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName}` });
      }
    });
  };
  const validateRequiredResourcePayloads = (path: string, entry: Record<string, unknown>, op: string, required: string[]) => {
    if (!required.includes("resources")) return;
    const resources = entry.resources;
    if (op === "set_initial_resources" && (typeof resources !== "object" || resources === null || Array.isArray(resources))) {
      issues.push({ nationId, field: `${path}.resources`, reason: "invalid resources" });
    }
    if (op === "remove_starting_resources" && (!Array.isArray(resources) || resources.length === 0)) {
      issues.push({ nationId, field: `${path}.resources`, reason: "invalid resources" });
    }
  };
  const validateOptionalFields = (path: string, entry: Record<string, unknown>) => {
    for (const fieldName of ["state", "activateState"] as const) {
      const value = entry[fieldName];
      if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName}` });
      }
    }
    const loop = entry.loop;
    if (loop !== undefined && typeof loop !== "boolean") {
      issues.push({ nationId, field: `${path}.loop`, reason: `invalid loop '${String(loop)}'` });
    }
    const numerator = entry.numerator;
    if (numerator !== undefined && !isPositiveInteger(numerator)) {
      issues.push({ nationId, field: `${path}.numerator`, reason: `invalid numerator '${String(numerator)}'` });
    }
    const side = entry.side;
    if (side !== undefined && !has(["S", "F"], side)) {
      issues.push({ nationId, field: `${path}.side`, reason: `invalid side '${String(side)}'` });
    }
    for (const fieldName of ["public", "cardsScore", "suppressStateFlip"] as const) {
      const value = entry[fieldName];
      if (value !== undefined && typeof value !== "boolean") {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `invalid ${fieldName} '${String(value)}'` });
      }
    }
    const config = entry.config;
    if (config !== undefined) {
      if (typeof config !== "object" || config === null || Array.isArray(config)) {
        issues.push({ nationId, field: `${path}.config`, reason: "invalid config" });
      } else {
        const cardIds = (config as Record<string, unknown>).cardIds;
        if (cardIds !== undefined && (!Array.isArray(cardIds) || cardIds.length === 0 || cardIds.some((id) => typeof id !== "string" || id.trim().length === 0))) {
          issues.push({ nationId, field: `${path}.config.cardIds`, reason: "invalid cardIds" });
        }
      }
    }
  };
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
    const allowedFields = new Set(["op", ...required, ...(OVERRIDE_OPTIONAL_FIELDS_BY_OP[op] ?? [])]);
    Object.keys(entry as Record<string, unknown>).forEach((fieldName) => {
      if (!allowedFields.has(fieldName)) {
        issues.push({ nationId, field: `${path}.${fieldName}`, reason: `unsupported override field '${fieldName}'` });
      }
    });
    validateRequiredIdentifiers(path, entry as Record<string, unknown>, required);
    validateRequiredNumbers(path, entry as Record<string, unknown>, op, required);
    validateRequiredStrings(path, entry as Record<string, unknown>, required);
    validateRequiredResourcePayloads(path, entry as Record<string, unknown>, op, required);
    validateOptionalFields(path, entry as Record<string, unknown>);
    if (required.includes("effect")) {
      const effect = (entry as Record<string, unknown>).effect;
      if (Array.isArray(effect) && effect.length === 0) {
        issues.push({ nationId, field: `${path}.effect`, reason: "effect must contain at least one effect" });
      }
      issues.push(...(field === "botOverrides" && op === "bot_custom_cleanup"
        ? validateBotEffectPayloads(nationId, `${path}.effect`, effect)
        : validateHumanEffectPayloads(nationId, `${path}.effect`, effect)));
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
  const allowedFields = new Set(["op", ...required]);
  Object.keys(condition as Record<string, unknown>).forEach((fieldName) => {
    if (!allowedFields.has(fieldName)) {
      issues.push({ nationId, field: `${field}.${fieldName}`, reason: `unsupported condition field '${fieldName}'` });
    }
  });
  const typed = condition as Partial<EffectCondition>;
  for (const fieldName of ["payloadKey", "cardId", "zoneId", "tag", "state"] as const) {
    const value = (typed as Record<string, unknown>)[fieldName];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      issues.push({ nationId, field: `${field}.${fieldName}`, reason: `invalid ${fieldName}` });
    }
  }
  if (typed.op === "zone_has_at_least" && !isPositiveInteger((typed as { count?: unknown }).count)) {
    issues.push({ nationId, field: `${field}.count`, reason: `invalid count '${String((typed as { count?: unknown }).count)}'` });
  }
  if (typed.op === "expansion_enabled" && !has(EXPANSIONS, typed.expansion)) {
    issues.push({ nationId, field: `${field}.expansion`, reason: `invalid expansion '${String(typed.expansion)}'` });
  }
  if (typed.op === "variant_enabled" && !has(VARIANTS, typed.variant)) {
    issues.push({ nationId, field: `${field}.variant`, reason: `invalid variant '${String(typed.variant)}'` });
  }
  if (typed.op === "mode_is" && !has(GAME_MODES, typed.mode)) {
    issues.push({ nationId, field: `${field}.mode`, reason: `invalid mode '${String(typed.mode)}'` });
  }
  if (typed.op === "payload_card_suit_is" && !has(SUIT_ICONS, typed.suit)) {
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
    Object.keys(hook as Record<string, unknown>).forEach((fieldName) => {
      if (!HOOK_FIELDS.includes(fieldName)) {
        issues.push({ nationId, field: `${base}.${fieldName}`, reason: `unsupported hook field '${fieldName}'` });
      }
    });
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
    if (hook.effects.length === 0) {
      issues.push({ nationId, field: `${base}.effects`, reason: "effects must contain at least one effect" });
    }
    if (hook.effects.some((effect) => typeof effect !== "object" || effect === null || Array.isArray(effect))) {
      issues.push({ nationId, field: `${base}.effects`, reason: "each effect payload entry must be an object" });
    }
    issues.push(...validateHumanEffectPayloads(nationId, `${base}.effects`, hook.effects));
    issues.push(...validateResourceReferences(nationId, `${base}.effects`, hook.effects));
  });
  return issues;
}

export function validateNationRuleset(ruleset: NationRuleset): ValidationIssue[] {
  const nationId = ruleset?.nationId || "<unknown-nation>";
  const issues: ValidationIssue[] = [];
  if (typeof ruleset === "object" && ruleset !== null && !Array.isArray(ruleset)) {
    Object.keys(ruleset as Record<string, unknown>).forEach((fieldName) => {
      if (!RULESET_FIELDS.includes(fieldName)) {
        issues.push({ nationId, field: fieldName, reason: `unsupported ruleset field '${fieldName}'` });
      }
    });
  }

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
