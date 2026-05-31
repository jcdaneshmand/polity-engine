import type { BotStateTableImportError, BotStateTableImportReport, PrivateBotStateTableCsvRow } from "./botStateTableCsvTypes";
import type { BotTradeRoutesTableImportError, BotTradeRoutesTableImportReport, PrivateBotTradeRoutesTableCsvRow } from "./botTradeRoutesTableCsvTypes";
import { collectInvalidResourceNames } from "./normalizeResources";

const triggerKinds = new Set(["card_id", "card_name_private", "suit", "card_type", "tag", "unrest", "other"]);
const triggerKindsRequiringValue = new Set(["card_id", "card_name_private", "suit", "card_type", "tag"]);
const rowTypes = new Set(["route", "end_of_turn"]);
const merchantStates = new Set(["merchants", "merchant_empire"]);
const bools = new Set(["true", "false"]);
const botOps = new Set([
  "bot_return_revealed_card_to_unrest",
  "bot_discard_revealed_card",
  "bot_put_revealed_card_into_history",
  "bot_play_revealed_card",
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
  "bot_resolve_top_bot_deck",
  "bot_resolve_top_dynasty_deck",
  "bot_resolve_top_main_deck",
  "bot_discard_top_bot_deck",
  "bot_discard_top_dynasty_deck",
  "bot_return_from_discard",
  "bot_recall_in_play",
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

const botStateRequired = ["table_id", "bot_nation_id", "table_side", "row_id", "priority", "trigger_kind", "effects_json", "implemented", "tested"];

function validateBotStateEffects(errors: BotStateTableImportError[], row: number, effects: unknown): boolean {
  if (!Array.isArray(effects)) {
    errors.push({ level: "fatal", row, field: "effects_json", message: "effects_json must parse to array" });
    return true;
  }
  let fatal = false;
  collectInvalidResourceNames(effects, "effects_json").forEach((invalid) => {
    errors.push({ level: "fatal", row, field: "effects_json", message: `Invalid resource '${invalid.resource}' at ${invalid.path}` });
    fatal = true;
  });
  effects.forEach((effect, index) => {
    if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `effects_json[${index}] must be an object` });
      fatal = true;
      return;
    }
    const op = (effect as { op?: unknown }).op;
    if (typeof op !== "string" || !botOps.has(op)) {
      errors.push({ level: "fatal", row, field: "effects_json", message: `Unsupported bot effect op: ${String(op ?? "missing")}` });
      fatal = true;
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
  if (!Array.isArray(parsed)) {
    errors.push({ level: "fatal", row, field, message: `${field} must parse to array` });
    return true;
  }
  let fatal = false;
  collectInvalidResourceNames(parsed, field).forEach((invalid) => {
    errors.push({ level: "fatal", row, field, message: `Invalid resource '${invalid.resource}' at ${invalid.path}` });
    fatal = true;
  });
  parsed.forEach((effect, index) => {
    if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
      errors.push({ level: "fatal", row, field, message: `${field}[${index}] must be an object` });
      fatal = true;
      return;
    }
    const op = (effect as { op?: unknown }).op;
    if (typeof op !== "string" || !botOps.has(op)) {
      errors.push({ level: "fatal", row, field, message: `Unsupported bot effect op: ${String(op ?? "missing")}` });
      fatal = true;
    }
  });
  return fatal;
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
