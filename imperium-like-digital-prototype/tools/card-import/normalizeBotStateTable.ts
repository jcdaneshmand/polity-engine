import type { BotStateTable, BotRowTrigger } from "../../engine/src/solo/botStateTableTypes";
import type { BotEffectOp } from "../../engine/src/solo/botEffectOps";
import type { PrivateBotStateTableCsvRow } from "./botStateTableCsvTypes";

const bool = (value: string) => value.trim().toLowerCase() === "true";

function triggerFromRow(row: PrivateBotStateTableCsvRow): BotRowTrigger {
  const value = row.trigger_value.trim();
  switch (row.trigger_kind.trim()) {
    case "card_id":
      return { kind: "card_id", cardId: value };
    case "card_name_private":
      return { kind: "card_name_private", value };
    case "suit":
      return { kind: "suit", suit: value as any };
    case "card_type":
      return { kind: "card_type", cardType: value as any };
    case "tag":
      return { kind: "tag", tag: value };
    case "unrest":
      return { kind: "unrest" };
    default:
      return { kind: "other" };
  }
}

export function normalizeBotStateTables(rows: PrivateBotStateTableCsvRow[]): Record<string, BotStateTable> {
  const tables: Record<string, BotStateTable> = {};
  for (const row of rows) {
    const tableId = row.table_id.trim();
    const side = row.table_side.trim();
    const key = `${tableId}_${side}`;
    tables[key] ??= {
      id: tableId,
      botNationId: row.bot_nation_id.trim(),
      displayName: tableId,
      side,
      rows: []
    };
    tables[key].rows.push({
      id: row.row_id.trim(),
      priority: Number(row.priority.trim()),
      trigger: triggerFromRow(row),
      effects: JSON.parse(row.effects_json || "[]") as BotEffectOp[],
      privateTriggerLabel: row.private_trigger_label.trim() || undefined,
      privateEffectText: row.private_effect_text.trim() || undefined,
      publicPlaceholderLabel: row.public_placeholder_label.trim() || undefined,
      implemented: bool(row.implemented),
      tested: bool(row.tested)
    });
  }
  for (const table of Object.values(tables)) {
    table.rows.sort((a, b) => a.priority - b.priority);
  }
  return tables;
}
