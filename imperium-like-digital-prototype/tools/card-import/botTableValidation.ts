import type { BotStateTableImportError, BotStateTableImportReport, PrivateBotStateTableCsvRow } from "./botStateTableCsvTypes";
import type { BotTradeRoutesTableImportError, BotTradeRoutesTableImportReport, PrivateBotTradeRoutesTableCsvRow } from "./botTradeRoutesTableCsvTypes";
import { collectInvalidResourceNames } from "./normalizeResources";

const triggerKinds = new Set(["card_id", "card_name_private", "suit", "card_type", "tag", "unrest", "other"]);
const triggerKindsRequiringValue = new Set(["card_id", "card_name_private", "suit", "card_type", "tag"]);
const suitTriggerIcons = new Set(["region", "uncivilized", "civilized", "tributary", "fame", "unrest", "power", "trade_route"]);
const cardTypes = new Set(["action", "unit", "technology", "legacy", "in_play", "attack", "power", "state", "development", "accession", "nation", "region", "unrest", "fame", "trade_route", "bot_state", "other"]);
const resourceNames = new Set(["materials", "knowledge", "influence", "unrest", "goods"]);
const botMarketSlots = new Set([1, 2, 3, 4, 5, 6]);
const rowTypes = new Set(["route", "end_of_turn"]);
const merchantStates = new Set(["merchants", "merchant_empire"]);
const bools = new Set(["true", "false"]);
const botStateOps = new Set([
  "bot_return_revealed_card_to_unrest",
  "bot_discard_revealed_card",
  "bot_put_revealed_card_into_history",
  "bot_play_revealed_card",
  "bot_put_revealed_card_on_bottom_of_deck",
  "bot_gain_resource",
  "bot_gain_resource_per_in_play",
  "bot_spend_resource",
  "bot_pay_resource_then",
  "bot_move_resource_to_state_card",
  "bot_spend_resource_to_state_card",
  "bot_take_unrest",
  "human_take_chaos",
  "bot_resolve_cultists_state_cleanup",
  "bot_gain_fame",
  "bot_acquire",
  "bot_break_through",
  "bot_exile_market",
  "bot_resolve_top_bot_deck",
  "bot_resolve_top_dynasty_deck",
  "bot_resolve_top_main_deck",
  "bot_discard_top_bot_deck",
  "bot_discard_top_dynasty_deck",
  "bot_return_from_discard",
  "bot_abandon_in_play",
  "bot_recall_in_play",
  "bot_swap_market",
  "bot_move_top_discard_to_deck",
  "bot_add_resource_to_market_slot",
  "bot_flip_state_table",
  "bot_flip_merchant_state",
  "bot_trade",
  "bot_trigger_trade_route",
  "bot_resolve_profits_where_able",
  "human_take_unrest",
  "human_abandon",
  "human_recall",
  "human_gain_resource",
  "log"
]);
const botTradeOps = new Set([
  "bot_return_revealed_card_to_unrest",
  "bot_discard_revealed_card",
  "bot_put_revealed_card_into_history",
  "bot_play_revealed_card",
  "bot_put_revealed_card_on_bottom_of_deck",
  "bot_gain_resource",
  "bot_gain_resource_per_in_play",
  "bot_spend_resource",
  "bot_pay_resource_then",
  "bot_gain_fame",
  "bot_acquire",
  "bot_break_through",
  "bot_exile_market",
  "bot_resolve_top_bot_deck",
  "bot_resolve_top_dynasty_deck",
  "bot_resolve_top_main_deck",
  "bot_discard_top_bot_deck",
  "bot_discard_top_dynasty_deck",
  "bot_return_from_discard",
  "bot_abandon_in_play",
  "bot_recall_in_play",
  "bot_swap_market",
  "bot_move_top_discard_to_deck",
  "bot_add_resource_to_market_slot",
  "bot_flip_state_table",
  "bot_flip_merchant_state",
  "bot_trade",
  "bot_trigger_trade_route",
  "bot_resolve_profits_where_able",
  "human_take_unrest",
  "human_abandon",
  "human_recall",
  "human_gain_resource",
  "log"
]);
const botEffectFields = new Set([
  "op", "resource", "count", "countPerCard", "spendResource", "spendCount", "placeResource", "placeCount",
  "effects", "ifUnable", "ifVp", "filter", "marketFilter", "fromExile", "resolveGained", "discardGained",
  "slot", "nextSide", "nextTableId", "nextState", "cardId", "zoneId", "message",
]);
const botFilterFields = new Set(["suits", "cardTypes", "tags", "minVp", "maxVp", "hasMarketResource", "slotNumbers"]);
const botIfVpFields = new Set(["value", "effects"]);

const botStateRequired = ["table_id", "bot_nation_id", "table_side", "row_id", "priority", "trigger_kind", "effects_json", "implemented", "tested"];

const isPositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

function validateBotStateEffectSuitFilter(errors: BotStateTableImportError[], row: number, value: unknown, path: string): boolean {
  if (value === undefined) return false;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push({ level: "fatal", row, field: "effects_json", message: `${path} must be an object` });
    return true;
  }
  let fatal = false;
  Object.keys(value as Record<string, unknown>).forEach((fieldName) => {
    if (!botFilterFields.has(fieldName)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Unsupported filter field at ${path}: ${fieldName}` });
      fatal = true;
    }
  });
  const suits = (value as { suits?: unknown }).suits;
  if (suits !== undefined) {
    if (!Array.isArray(suits)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `${path}.suits must be an array` });
      fatal = true;
    } else {
      suits.forEach((suit, index) => {
        if (typeof suit !== "string" || !suitTriggerIcons.has(suit)) {
          errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid suit filter at ${path}.suits[${index}]: ${String(suit)}` });
          fatal = true;
        }
      });
    }
  }
  const cardTypesFilter = (value as { cardTypes?: unknown }).cardTypes;
  if (cardTypesFilter !== undefined) {
    if (!Array.isArray(cardTypesFilter)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `${path}.cardTypes must be an array` });
      fatal = true;
    } else {
      cardTypesFilter.forEach((cardType, index) => {
        if (typeof cardType !== "string" || !cardTypes.has(cardType)) {
          errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid cardType filter at ${path}.cardTypes[${index}]: ${String(cardType)}` });
          fatal = true;
        }
      });
    }
  }
  const tags = (value as { tags?: unknown }).tags;
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `${path}.tags must be an array` });
      fatal = true;
    } else {
      tags.forEach((tag, index) => {
        if (typeof tag !== "string" || tag.trim().length === 0) {
          errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid tag filter at ${path}.tags[${index}]: ${String(tag)}` });
          fatal = true;
        }
      });
    }
  }
  for (const fieldName of ["minVp", "maxVp"] as const) {
    const vpBound = (value as { minVp?: unknown; maxVp?: unknown })[fieldName];
    if (vpBound !== undefined && typeof vpBound !== "number") {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(vpBound)}` });
      fatal = true;
    }
  }
  const hasMarketResource = (value as { hasMarketResource?: unknown }).hasMarketResource;
  if (hasMarketResource !== undefined && (typeof hasMarketResource !== "string" || !resourceNames.has(hasMarketResource))) {
    errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid hasMarketResource at ${path}.hasMarketResource: ${String(hasMarketResource)}` });
    fatal = true;
  }
  const slotNumbers = (value as { slotNumbers?: unknown }).slotNumbers;
  if (slotNumbers !== undefined) {
    if (!Array.isArray(slotNumbers)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `${path}.slotNumbers must be an array` });
      fatal = true;
    } else {
      slotNumbers.forEach((slotNumber, index) => {
        if (typeof slotNumber !== "number" || !botMarketSlots.has(slotNumber)) {
          errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid slotNumber filter at ${path}.slotNumbers[${index}]: ${String(slotNumber)}` });
          fatal = true;
        }
      });
    }
  }
  return fatal;
}

function validateBotStateEffectNumericPayload(errors: BotStateTableImportError[], row: number, record: Record<string, unknown>, path: string): boolean {
  const op = String(record.op);
  let fatal = false;
  const requiredPositiveInteger = (fieldName: "count" | "spendCount" | "placeCount") => {
    if (!isPositiveInteger(record[fieldName])) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(record[fieldName])}` });
      fatal = true;
    }
  };
  const optionalPositiveInteger = (fieldName: "count" | "countPerCard") => {
    const value = record[fieldName];
    if (value !== undefined && !isPositiveInteger(value)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(value)}` });
      fatal = true;
    }
  };

  if (["bot_gain_resource", "bot_spend_resource", "bot_pay_resource_then", "bot_move_resource_to_state_card", "bot_take_unrest", "human_take_chaos", "bot_gain_fame", "bot_add_resource_to_market_slot", "human_take_unrest", "human_gain_resource"].includes(op)) {
    requiredPositiveInteger("count");
  }
  if (op === "bot_gain_resource_per_in_play") optionalPositiveInteger("countPerCard");
  if (op === "bot_spend_resource_to_state_card") {
    requiredPositiveInteger("spendCount");
    requiredPositiveInteger("placeCount");
  }
  if (op === "bot_discard_top_bot_deck" || op === "bot_discard_top_dynasty_deck" || op === "human_abandon" || op === "human_recall") {
    optionalPositiveInteger("count");
  }
  if (op === "bot_add_resource_to_market_slot" && record.slot !== "rolled" && (typeof record.slot !== "number" || !botMarketSlots.has(record.slot))) {
    errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid slot at ${path}.slot: ${String(record.slot)}` });
    fatal = true;
  }
  return fatal;
}

function validateBotStateEffectRequiredPayloads(errors: BotStateTableImportError[], row: number, record: Record<string, unknown>, path: string): boolean {
  const op = String(record.op);
  let fatal = false;
  const requiredResource = (fieldName: "resource" | "spendResource" | "placeResource") => {
    const value = record[fieldName];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Missing required ${fieldName} at ${path}.${fieldName}` });
      fatal = true;
    }
  };
  const optionalNonEmptyString = (fieldName: "nextSide" | "nextTableId") => {
    const value = record[fieldName];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(value)}` });
      fatal = true;
    }
  };
  const optionalString = (fieldName: "cardId" | "zoneId") => {
    const value = record[fieldName];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(value)}` });
      fatal = true;
    }
  };
  const optionalBoolean = (fieldName: "fromExile" | "resolveGained" | "discardGained") => {
    const value = record[fieldName];
    if (value !== undefined && typeof value !== "boolean") {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(value)}` });
      fatal = true;
    }
  };

  if (["bot_gain_resource", "bot_gain_resource_per_in_play", "bot_spend_resource", "bot_pay_resource_then", "bot_move_resource_to_state_card", "bot_add_resource_to_market_slot", "human_gain_resource"].includes(op)) {
    requiredResource("resource");
  }
  if (op === "bot_spend_resource_to_state_card") {
    requiredResource("spendResource");
    requiredResource("placeResource");
  }
  if (op === "bot_flip_state_table") {
    optionalNonEmptyString("nextSide");
    optionalNonEmptyString("nextTableId");
  }
  if (op === "bot_flip_merchant_state" && (typeof record.nextState !== "string" || !merchantStates.has(record.nextState))) {
    errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid nextState at ${path}.nextState: ${String(record.nextState)}` });
    fatal = true;
  }
  if (op === "human_take_chaos") optionalString("zoneId");
  if (op === "bot_trigger_trade_route") optionalString("cardId");
  if (op === "bot_acquire") optionalBoolean("fromExile");
  if (op === "bot_break_through") {
    optionalBoolean("resolveGained");
    optionalBoolean("discardGained");
  }
  if (op === "log" && (typeof record.message !== "string" || record.message.trim().length === 0)) {
    errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid message at ${path}.message: ${String(record.message)}` });
    fatal = true;
  }
  return fatal;
}

function validateBotTradeEffectSuitFilter(
  errors: BotTradeRoutesTableImportError[],
  row: number,
  field: string,
  value: unknown,
  path: string
): boolean {
  if (value === undefined) return false;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push({ level: "fatal", row, field, message: `${path} must be an object` });
    return true;
  }
  let fatal = false;
  Object.keys(value as Record<string, unknown>).forEach((fieldName) => {
    if (!botFilterFields.has(fieldName)) {
      errors.push({ level: "fatal", row, field, message: `Unsupported filter field at ${path}: ${fieldName}` });
      fatal = true;
    }
  });
  const suits = (value as { suits?: unknown }).suits;
  if (suits !== undefined) {
    if (!Array.isArray(suits)) {
      errors.push({ level: "fatal", row, field, message: `${path}.suits must be an array` });
      fatal = true;
    } else {
      suits.forEach((suit, index) => {
        if (typeof suit !== "string" || !suitTriggerIcons.has(suit)) {
          errors.push({ level: "fatal", row, field, message: `Invalid suit filter at ${path}.suits[${index}]: ${String(suit)}` });
          fatal = true;
        }
      });
    }
  }
  const cardTypesFilter = (value as { cardTypes?: unknown }).cardTypes;
  if (cardTypesFilter !== undefined) {
    if (!Array.isArray(cardTypesFilter)) {
      errors.push({ level: "fatal", row, field, message: `${path}.cardTypes must be an array` });
      fatal = true;
    } else {
      cardTypesFilter.forEach((cardType, index) => {
        if (typeof cardType !== "string" || !cardTypes.has(cardType)) {
          errors.push({ level: "fatal", row, field, message: `Invalid cardType filter at ${path}.cardTypes[${index}]: ${String(cardType)}` });
          fatal = true;
        }
      });
    }
  }
  const tags = (value as { tags?: unknown }).tags;
  if (tags !== undefined) {
    if (!Array.isArray(tags)) {
      errors.push({ level: "fatal", row, field, message: `${path}.tags must be an array` });
      fatal = true;
    } else {
      tags.forEach((tag, index) => {
        if (typeof tag !== "string" || tag.trim().length === 0) {
          errors.push({ level: "fatal", row, field, message: `Invalid tag filter at ${path}.tags[${index}]: ${String(tag)}` });
          fatal = true;
        }
      });
    }
  }
  for (const fieldName of ["minVp", "maxVp"] as const) {
    const vpBound = (value as { minVp?: unknown; maxVp?: unknown })[fieldName];
    if (vpBound !== undefined && typeof vpBound !== "number") {
      errors.push({ level: "fatal", row, field, message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(vpBound)}` });
      fatal = true;
    }
  }
  const hasMarketResource = (value as { hasMarketResource?: unknown }).hasMarketResource;
  if (hasMarketResource !== undefined && (typeof hasMarketResource !== "string" || !resourceNames.has(hasMarketResource))) {
    errors.push({ level: "fatal", row, field, message: `Invalid hasMarketResource at ${path}.hasMarketResource: ${String(hasMarketResource)}` });
    fatal = true;
  }
  const slotNumbers = (value as { slotNumbers?: unknown }).slotNumbers;
  if (slotNumbers !== undefined) {
    if (!Array.isArray(slotNumbers)) {
      errors.push({ level: "fatal", row, field, message: `${path}.slotNumbers must be an array` });
      fatal = true;
    } else {
      slotNumbers.forEach((slotNumber, index) => {
        if (typeof slotNumber !== "number" || !botMarketSlots.has(slotNumber)) {
          errors.push({ level: "fatal", row, field, message: `Invalid slotNumber filter at ${path}.slotNumbers[${index}]: ${String(slotNumber)}` });
          fatal = true;
        }
      });
    }
  }
  return fatal;
}

function validateBotTradeEffectNumericPayload(
  errors: BotTradeRoutesTableImportError[],
  row: number,
  field: string,
  record: Record<string, unknown>,
  path: string
): boolean {
  const op = String(record.op);
  let fatal = false;
  const requiredPositiveInteger = (fieldName: "count" | "spendCount" | "placeCount") => {
    if (!isPositiveInteger(record[fieldName])) {
      errors.push({ level: "fatal", row, field, message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(record[fieldName])}` });
      fatal = true;
    }
  };
  const optionalPositiveInteger = (fieldName: "count" | "countPerCard") => {
    const value = record[fieldName];
    if (value !== undefined && !isPositiveInteger(value)) {
      errors.push({ level: "fatal", row, field, message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(value)}` });
      fatal = true;
    }
  };

  if (["bot_gain_resource", "bot_spend_resource", "bot_pay_resource_then", "bot_move_resource_to_state_card", "bot_take_unrest", "human_take_chaos", "bot_gain_fame", "bot_add_resource_to_market_slot", "human_take_unrest", "human_gain_resource"].includes(op)) {
    requiredPositiveInteger("count");
  }
  if (op === "bot_gain_resource_per_in_play") optionalPositiveInteger("countPerCard");
  if (op === "bot_spend_resource_to_state_card") {
    requiredPositiveInteger("spendCount");
    requiredPositiveInteger("placeCount");
  }
  if (op === "bot_discard_top_bot_deck" || op === "bot_discard_top_dynasty_deck" || op === "human_abandon" || op === "human_recall") {
    optionalPositiveInteger("count");
  }
  if (op === "bot_add_resource_to_market_slot" && record.slot !== "rolled" && (typeof record.slot !== "number" || !botMarketSlots.has(record.slot))) {
    errors.push({ level: "fatal", row, field, message: `Invalid slot at ${path}.slot: ${String(record.slot)}` });
    fatal = true;
  }
  return fatal;
}

function validateBotTradeEffectRequiredPayloads(
  errors: BotTradeRoutesTableImportError[],
  row: number,
  field: string,
  record: Record<string, unknown>,
  path: string
): boolean {
  const op = String(record.op);
  let fatal = false;
  const requiredResource = (fieldName: "resource") => {
    const value = record[fieldName];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors.push({ level: "fatal", row, field, message: `Missing required ${fieldName} at ${path}.${fieldName}` });
      fatal = true;
    }
  };
  const optionalNonEmptyString = (fieldName: "nextSide" | "nextTableId") => {
    const value = record[fieldName];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      errors.push({ level: "fatal", row, field, message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(value)}` });
      fatal = true;
    }
  };
  const optionalString = (fieldName: "cardId") => {
    const value = record[fieldName];
    if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
      errors.push({ level: "fatal", row, field, message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(value)}` });
      fatal = true;
    }
  };
  const optionalBoolean = (fieldName: "fromExile" | "resolveGained" | "discardGained") => {
    const value = record[fieldName];
    if (value !== undefined && typeof value !== "boolean") {
      errors.push({ level: "fatal", row, field, message: `Invalid ${fieldName} at ${path}.${fieldName}: ${String(value)}` });
      fatal = true;
    }
  };

  if (["bot_gain_resource", "bot_gain_resource_per_in_play", "bot_spend_resource", "bot_pay_resource_then", "bot_add_resource_to_market_slot", "human_gain_resource"].includes(op)) {
    requiredResource("resource");
  }
  if (op === "bot_flip_state_table") {
    optionalNonEmptyString("nextSide");
    optionalNonEmptyString("nextTableId");
  }
  if (op === "bot_flip_merchant_state" && (typeof record.nextState !== "string" || !merchantStates.has(record.nextState))) {
    errors.push({ level: "fatal", row, field, message: `Invalid nextState at ${path}.nextState: ${String(record.nextState)}` });
    fatal = true;
  }
  if (op === "bot_trigger_trade_route") optionalString("cardId");
  if (op === "bot_acquire") optionalBoolean("fromExile");
  if (op === "bot_break_through") {
    optionalBoolean("resolveGained");
    optionalBoolean("discardGained");
  }
  if (op === "log" && (typeof record.message !== "string" || record.message.trim().length === 0)) {
    errors.push({ level: "fatal", row, field, message: `Invalid message at ${path}.message: ${String(record.message)}` });
    fatal = true;
  }
  return fatal;
}

function validateBotStateEffects(errors: BotStateTableImportError[], row: number, effects: unknown, path = "effects_json", validateResources = true): boolean {
  if (!Array.isArray(effects)) {
    errors.push({ level: "fatal", row, field: "effects_json", message: `${path} must parse to array` });
    return true;
  }
  let fatal = false;
  if (effects.length === 0) {
    errors.push({ level: "fatal", row, field: "effects_json", message: `${path} must contain at least one effect` });
    fatal = true;
  }
  if (validateResources) {
    collectInvalidResourceNames(effects, "effects_json").forEach((invalid) => {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid resource '${invalid.resource}' at ${invalid.path}` });
      fatal = true;
    });
  }
  effects.forEach((effect, index) => {
    if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `${path}[${index}] must be an object` });
      fatal = true;
      return;
    }
    const op = (effect as { op?: unknown }).op;
    Object.keys(effect as Record<string, unknown>).forEach((fieldName) => {
      if (!botEffectFields.has(fieldName)) {
        errors.push({ level: "fatal", row, field: "effects_json", message: `Unsupported bot effect field at ${path}[${index}]: ${fieldName}` });
        fatal = true;
      }
    });
    if (typeof op !== "string" || !botStateOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Unsupported bot effect op: ${String(op ?? "missing")}` });
      fatal = true;
    }
    const filter = (effect as { filter?: unknown }).filter;
    const marketFilter = (effect as { marketFilter?: unknown }).marketFilter;
    fatal = validateBotStateEffectSuitFilter(errors, row, filter, `${path}[${index}].filter`) || fatal;
    fatal = validateBotStateEffectSuitFilter(errors, row, marketFilter, `${path}[${index}].marketFilter`) || fatal;
    fatal = validateBotStateEffectNumericPayload(errors, row, effect as Record<string, unknown>, `${path}[${index}]`) || fatal;
    fatal = validateBotStateEffectRequiredPayloads(errors, row, effect as Record<string, unknown>, `${path}[${index}]`) || fatal;
    if (op === "bot_pay_resource_then") {
      fatal = validateBotStateEffects(errors, row, (effect as { effects?: unknown }).effects, `${path}[${index}].effects`, false) || fatal;
    }
    const ifUnable = (effect as { ifUnable?: unknown }).ifUnable;
    if (ifUnable !== undefined) {
      fatal = validateBotStateEffects(errors, row, ifUnable, `${path}[${index}].ifUnable`, false) || fatal;
    }
    const ifVp = (effect as { ifVp?: unknown }).ifVp;
    if (ifVp !== undefined) {
      if (!ifVp || typeof ifVp !== "object" || Array.isArray(ifVp)) {
        errors.push({ level: "fatal", row, field: "effects_json", message: `${path}[${index}].ifVp must be an object` });
        fatal = true;
      } else {
        const condition = ifVp as Record<string, unknown> & { value?: unknown; effects?: unknown };
        Object.keys(condition).forEach((fieldName) => {
          if (!botIfVpFields.has(fieldName)) {
            errors.push({ level: "fatal", row, field: "effects_json", message: `Unsupported ifVp field at ${path}[${index}].ifVp: ${fieldName}` });
            fatal = true;
          }
        });
        if (typeof condition.value !== "number") {
          errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid ifVp.value at ${path}[${index}].ifVp.value: ${String(condition.value)}` });
          fatal = true;
        }
        fatal = validateBotStateEffects(errors, row, condition.effects, `${path}[${index}].ifVp.effects`, false) || fatal;
      }
    }
  });
  return fatal;
}

function validateParsedBotTradeEffects(
  errors: BotTradeRoutesTableImportError[],
  row: number,
  field: string,
  effects: unknown,
  path = field,
  validateResources = true
): boolean {
  if (!Array.isArray(effects)) {
    errors.push({ level: "fatal", row, field, message: `${path} must parse to array` });
    return true;
  }
  let fatal = false;
  if (effects.length === 0) {
    errors.push({ level: "fatal", row, field, message: `${path} must contain at least one effect` });
    fatal = true;
  }
  if (validateResources) {
    collectInvalidResourceNames(effects, field).forEach((invalid) => {
      errors.push({ level: "fatal", row, field, message: `Invalid resource '${invalid.resource}' at ${invalid.path}` });
      fatal = true;
    });
  }
  effects.forEach((effect, index) => {
    if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
      errors.push({ level: "fatal", row, field, message: `${path}[${index}] must be an object` });
      fatal = true;
      return;
    }
    const op = (effect as { op?: unknown }).op;
    Object.keys(effect as Record<string, unknown>).forEach((fieldName) => {
      if (!botEffectFields.has(fieldName)) {
        errors.push({ level: "fatal", row, field, message: `Unsupported bot effect field at ${path}[${index}]: ${fieldName}` });
        fatal = true;
      }
    });
    if (typeof op !== "string" || !botTradeOps.has(op)) {
      errors.push({ level: "fatal", row, field, message: `Unsupported bot effect op: ${String(op ?? "missing")}` });
      fatal = true;
    }
    const filter = (effect as { filter?: unknown }).filter;
    const marketFilter = (effect as { marketFilter?: unknown }).marketFilter;
    fatal = validateBotTradeEffectSuitFilter(errors, row, field, filter, `${path}[${index}].filter`) || fatal;
    fatal = validateBotTradeEffectSuitFilter(errors, row, field, marketFilter, `${path}[${index}].marketFilter`) || fatal;
    fatal = validateBotTradeEffectNumericPayload(errors, row, field, effect as Record<string, unknown>, `${path}[${index}]`) || fatal;
    fatal = validateBotTradeEffectRequiredPayloads(errors, row, field, effect as Record<string, unknown>, `${path}[${index}]`) || fatal;
    if (op === "bot_pay_resource_then") {
      fatal = validateParsedBotTradeEffects(errors, row, field, (effect as { effects?: unknown }).effects, `${path}[${index}].effects`, false) || fatal;
    }
    const ifUnable = (effect as { ifUnable?: unknown }).ifUnable;
    if (ifUnable !== undefined) {
      fatal = validateParsedBotTradeEffects(errors, row, field, ifUnable, `${path}[${index}].ifUnable`, false) || fatal;
    }
    const ifVp = (effect as { ifVp?: unknown }).ifVp;
    if (ifVp !== undefined) {
      if (!ifVp || typeof ifVp !== "object" || Array.isArray(ifVp)) {
        errors.push({ level: "fatal", row, field, message: `${path}[${index}].ifVp must be an object` });
        fatal = true;
      } else {
        const condition = ifVp as Record<string, unknown> & { value?: unknown; effects?: unknown };
        Object.keys(condition).forEach((fieldName) => {
          if (!botIfVpFields.has(fieldName)) {
            errors.push({ level: "fatal", row, field, message: `Unsupported ifVp field at ${path}[${index}].ifVp: ${fieldName}` });
            fatal = true;
          }
        });
        if (typeof condition.value !== "number") {
          errors.push({ level: "fatal", row, field, message: `Invalid ifVp.value at ${path}[${index}].ifVp.value: ${String(condition.value)}` });
          fatal = true;
        }
        fatal = validateParsedBotTradeEffects(errors, row, field, condition.effects, `${path}[${index}].ifVp.effects`, false) || fatal;
      }
    }
  });
  return fatal;
}

function validateBotTradeEffects(errors: BotTradeRoutesTableImportError[], row: number, field: string, raw: string): boolean {
  let parsed: unknown;
  try {
    parsed = raw.trim() ? JSON.parse(raw) : [];
  } catch {
    errors.push({ level: "fatal", row, field, message: "Invalid JSON" });
    return true;
  }
  return validateParsedBotTradeEffects(errors, row, field, parsed);
}

export function validatePrivateBotStateTableRows(rows: PrivateBotStateTableCsvRow[]): BotStateTableImportReport {
  const errors: BotStateTableImportError[] = [];
  const seen = new Set<string>();
  let validRows = 0;
  let implemented = 0;
  let tested = 0;

  rows.forEach((record, index) => {
    const row = index + 2;
    let fatal = false;
    for (const field of botStateRequired) {
      if (!(record[field as keyof PrivateBotStateTableCsvRow] ?? "").trim()) {
        errors.push({ level: "fatal", row, field, message: "Required field missing" });
        fatal = true;
      }
    }
    const key = `${record.table_id.trim()}|${record.table_side.trim()}|${record.row_id.trim()}`;
    if (seen.has(key)) {
      errors.push({ level: "fatal", row, field: "row_id", message: "Duplicate row for table side" });
      fatal = true;
    } else {
      seen.add(key);
    }
    if (!/^\d+$/.test(record.priority.trim())) {
      errors.push({ level: "fatal", row, field: "priority", message: "Priority must be a non-negative integer" });
      fatal = true;
    }
    const triggerKind = record.trigger_kind.trim();
    if (!triggerKinds.has(triggerKind)) {
      errors.push({ level: "fatal", row, field: "trigger_kind", message: "Invalid trigger_kind" });
      fatal = true;
    }
    if (triggerKindsRequiringValue.has(triggerKind) && !record.trigger_value.trim()) {
      errors.push({ level: "fatal", row, field: "trigger_value", message: `${triggerKind} trigger requires trigger_value` });
      fatal = true;
    }
    if (triggerKind === "suit" && !suitTriggerIcons.has(record.trigger_value.trim())) {
      errors.push({ level: "fatal", row, field: "trigger_value", message: `Invalid suit trigger_value: ${record.trigger_value.trim()}` });
      fatal = true;
    }
    if (!bools.has(record.implemented.trim().toLowerCase())) {
      errors.push({ level: "fatal", row, field: "implemented", message: "implemented must be true/false" });
      fatal = true;
    }
    if (!bools.has(record.tested.trim().toLowerCase())) {
      errors.push({ level: "fatal", row, field: "tested", message: "tested must be true/false" });
      fatal = true;
    }
    try {
      fatal = validateBotStateEffects(errors, row, JSON.parse(record.effects_json || "[]")) || fatal;
    } catch {
      errors.push({ level: "fatal", row, field: "effects_json", message: "Invalid JSON" });
      fatal = true;
    }
    if (record.implemented.trim().toLowerCase() === "true" && record.tested.trim().toLowerCase() === "false") {
      errors.push({ level: "warning", row, field: "tested", message: "implemented=true but tested=false" });
    }
    if (record.implemented.trim().toLowerCase() === "true") implemented += 1;
    if (record.tested.trim().toLowerCase() === "true") tested += 1;
    if (!fatal) validRows += 1;
  });

  const fatal = errors.filter((error) => error.level === "fatal").length;
  const warnings = errors.filter((error) => error.level === "warning").length;
  return { errors, counts: { rows: rows.length, validRows, fatal, warnings }, coverage: { implemented, tested } };
}

export function validatePrivateBotTradeRoutesTableRows(rows: PrivateBotTradeRoutesTableCsvRow[]): BotTradeRoutesTableImportReport {
  const errors: BotTradeRoutesTableImportError[] = [];
  const seenRoutes = new Set<string>();
  let validRows = 0;
  let implemented = 0;
  let tested = 0;

  rows.forEach((record, index) => {
    const row = index + 2;
    let fatal = false;
    if (!record.table_id?.trim()) {
      errors.push({ level: "fatal", row, field: "table_id", message: "Required field missing" });
      fatal = true;
    }
    const rowType = record.row_type?.trim();
    if (!rowTypes.has(rowType)) {
      errors.push({ level: "fatal", row, field: "row_type", message: "Invalid row_type" });
      fatal = true;
    }
    if (rowType === "route") {
      for (const field of ["trade_route_card_id", "public_placeholder_name", "commerce_effects_json", "profit_effects_json"]) {
        if (!(record[field as keyof PrivateBotTradeRoutesTableCsvRow] ?? "").trim()) {
          errors.push({ level: "fatal", row, field, message: "Required field missing" });
          fatal = true;
        }
      }
      const key = `${record.table_id.trim()}|${record.trade_route_card_id.trim()}`;
      if (seenRoutes.has(key)) {
        errors.push({ level: "fatal", row, field: "trade_route_card_id", message: "Duplicate trade route row for table" });
        fatal = true;
      } else {
        seenRoutes.add(key);
      }
      fatal = validateBotTradeEffects(errors, row, "commerce_effects_json", record.commerce_effects_json || "") || fatal;
      fatal = validateBotTradeEffects(errors, row, "profit_effects_json", record.profit_effects_json || "") || fatal;
    }
    if (rowType === "end_of_turn") {
      for (const field of ["merchant_state", "priority", "end_of_turn_effects_json"]) {
        if (!(record[field as keyof PrivateBotTradeRoutesTableCsvRow] ?? "").trim()) {
          errors.push({ level: "fatal", row, field, message: "Required field missing" });
          fatal = true;
        }
      }
      if (!merchantStates.has(record.merchant_state.trim())) {
        errors.push({ level: "fatal", row, field: "merchant_state", message: "Invalid merchant_state" });
        fatal = true;
      }
      if (!/^\d+$/.test(record.priority.trim())) {
        errors.push({ level: "fatal", row, field: "priority", message: "Priority must be a non-negative integer" });
        fatal = true;
      }
      fatal = validateBotTradeEffects(errors, row, "end_of_turn_effects_json", record.end_of_turn_effects_json || "") || fatal;
    }
    if (!bools.has(record.implemented.trim().toLowerCase())) {
      errors.push({ level: "fatal", row, field: "implemented", message: "implemented must be true/false" });
      fatal = true;
    }
    if (!bools.has(record.tested.trim().toLowerCase())) {
      errors.push({ level: "fatal", row, field: "tested", message: "tested must be true/false" });
      fatal = true;
    }
    if (record.implemented.trim().toLowerCase() === "true" && record.tested.trim().toLowerCase() === "false") {
      errors.push({ level: "warning", row, field: "tested", message: "implemented=true but tested=false" });
    }
    if (record.implemented.trim().toLowerCase() === "true") implemented += 1;
    if (record.tested.trim().toLowerCase() === "true") tested += 1;
    if (!fatal) validRows += 1;
  });

  const fatal = errors.filter((error) => error.level === "fatal").length;
  const warnings = errors.filter((error) => error.level === "warning").length;
  return { errors, counts: { rows: rows.length, validRows, fatal, warnings }, coverage: { implemented, tested } };
}
