import { parseCsvFile } from "./csvParser";
import type { BotStateTableImportError, BotStateTableImportReport, PrivateBotStateTableCsvRow } from "./botStateTableCsvTypes";

const triggerKinds = new Set(["card_id", "card_name_private", "suit", "card_type", "tag", "unrest", "other"]);
const triggerKindsRequiringValue = new Set(["card_id", "card_name_private", "suit", "card_type", "tag"]);
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

const required = ["table_id", "bot_nation_id", "table_side", "row_id", "priority", "trigger_kind", "effects_json", "implemented", "tested"];

function validateEffects(errors: BotStateTableImportError[], row: number, effects: unknown): boolean {
  if (!Array.isArray(effects)) {
    errors.push({ level: "fatal", row, field: "effects_json", message: "effects_json must parse to array" });
    return true;
  }
  let fatal = false;
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

export function validatePrivateBotStateTableRows(rows: PrivateBotStateTableCsvRow[]): BotStateTableImportReport {
  const errors: BotStateTableImportError[] = [];
  const seen = new Set<string>();
  let validRows = 0;
  let implemented = 0;
  let tested = 0;

  rows.forEach((record, index) => {
    const row = index + 2;
    let fatal = false;
    for (const field of required) {
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
      fatal = validateEffects(errors, row, JSON.parse(record.effects_json || "[]")) || fatal;
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

if (process.argv[1]?.endsWith("validatePrivateBotStateTables.ts")) {
  const inputIndex = process.argv.indexOf("--input");
  const input = inputIndex >= 0 ? process.argv[inputIndex + 1] : "private-card-data/bot-state-table-template.csv";
  const report = validatePrivateBotStateTableRows(parseCsvFile(input) as PrivateBotStateTableCsvRow[]);
  console.log(`bot state tables rows=${report.counts.rows} valid=${report.counts.validRows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
  if (report.counts.fatal > 0) process.exitCode = 1;
}
