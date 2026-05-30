import type { BotEffectOp } from "../../engine/src/solo/botEffectOps";
import type { BotTradeRoutesTable } from "../../engine/src/solo/botTradeRoutesTypes";
import type { PrivateBotTradeRoutesTableCsvRow } from "./botTradeRoutesTableCsvTypes";

export function normalizeBotTradeRoutesTables(rows: PrivateBotTradeRoutesTableCsvRow[]): Record<string, BotTradeRoutesTable> {
  const tables: Record<string, BotTradeRoutesTable> = {};
  for (const row of rows) {
    const tableId = row.table_id.trim();
    tables[tableId] ??= { id: tableId, rows: [], endOfTurnRows: [] };
    if (row.row_type.trim() === "route") {
      tables[tableId].rows.push({
        tradeRouteId: row.trade_route_card_id.trim(),
        publicPlaceholderName: row.public_placeholder_name.trim(),
        privateName: row.private_name.trim() || undefined,
        commerceEffects: JSON.parse(row.commerce_effects_json || "[]") as BotEffectOp[],
        profitEffects: JSON.parse(row.profit_effects_json || "[]") as BotEffectOp[]
      });
    } else {
      tables[tableId].endOfTurnRows.push({
        merchantState: row.merchant_state.trim() as "merchants" | "merchant_empire",
        priority: Number(row.priority.trim()),
        effects: JSON.parse(row.end_of_turn_effects_json || "[]") as BotEffectOp[]
      });
    }
  }
  for (const table of Object.values(tables)) {
    table.endOfTurnRows.sort((a, b) => a.priority - b.priority);
  }
  return tables;
}
