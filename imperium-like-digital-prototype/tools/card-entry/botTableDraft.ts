import type { PrivateBotStateTableCsvRow } from "../card-import/botStateTableCsvTypes";
import type { PrivateBotTradeRoutesTableCsvRow } from "../card-import/botTradeRoutesTableCsvTypes";
import type { PrivateNationCsvRow } from "../card-import/nationCsvTypes";

export const botStateTableCsvColumns = [
  "table_id",
  "bot_nation_id",
  "table_side",
  "row_id",
  "priority",
  "trigger_kind",
  "trigger_value",
  "public_placeholder_label",
  "private_trigger_label",
  "private_effect_text",
  "effects_json",
  "implemented",
  "tested",
  "notes"
];

export const botTradeRoutesTableCsvColumns = [
  "table_id",
  "row_type",
  "merchant_state",
  "priority",
  "trade_route_card_id",
  "public_placeholder_name",
  "private_name",
  "commerce_effects_json",
  "profit_effects_json",
  "end_of_turn_effects_json",
  "implemented",
  "tested",
  "notes"
];

export type BotStateTableEntryDraft = {
  tableId: string;
  botNationId: string;
  tableSide: string;
  rowId: string;
  priority: string;
  triggerKind: string;
  triggerValue: string;
  publicPlaceholderLabel: string;
  privateTriggerLabel: string;
  privateEffectText: string;
  effectsJson: string;
  implemented: string;
  tested: string;
  notes: string;
};

export type BotTradeRoutesTableEntryDraft = {
  tableId: string;
  rowType: string;
  merchantState: string;
  priority: string;
  tradeRouteCardId: string;
  publicPlaceholderName: string;
  privateName: string;
  commerceEffectsJson: string;
  profitEffectsJson: string;
  endOfTurnEffectsJson: string;
  implemented: string;
  tested: string;
  notes: string;
};

export type BotNationOption = {
  id: string;
  label: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nextGeneratedId(existingIds: string[], prefix: string): string {
  const pattern = new RegExp(`^${escapeRegExp(prefix)}_(\\d+)$`);
  const max = existingIds.reduce((currentMax, id) => {
    const match = id.trim().match(pattern);
    return match ? Math.max(currentMax, Number(match[1])) : currentMax;
  }, 0);
  return `${prefix}_${max + 1}`;
}

export function buildBotNationOptions(rows: PrivateNationCsvRow[]): BotNationOption[] {
  return rows
    .map((row) => {
      const id = row.nation_id?.trim() ?? "";
      const name = row.nation_name_private?.trim() || row.public_placeholder_name?.trim() || id;
      return id ? { id, label: `${name} (${id})` } : undefined;
    })
    .filter((option): option is BotNationOption => Boolean(option))
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function getNextBotStateTableId(rows: PrivateBotStateTableCsvRow[], nationId: string): string {
  const normalizedNationId = nationId.trim() || "bot";
  return nextGeneratedId(
    rows.map((row) => row.table_id ?? ""),
    `bot_state_${normalizedNationId}`
  );
}

export function getNextBotTradeRoutesTableId(rows: PrivateBotTradeRoutesTableCsvRow[], nationId: string): string {
  const normalizedNationId = nationId.trim() || "bot";
  return nextGeneratedId(
    rows.map((row) => row.table_id ?? ""),
    `bot_trade_${normalizedNationId}`
  );
}

export function createBlankBotStateTableDraft(): BotStateTableEntryDraft {
  return {
    tableId: "",
    botNationId: "",
    tableSide: "S",
    rowId: "",
    priority: "1",
    triggerKind: "other",
    triggerValue: "",
    publicPlaceholderLabel: "",
    privateTriggerLabel: "",
    privateEffectText: "",
    effectsJson: "[]",
    implemented: "false",
    tested: "false",
    notes: ""
  };
}

export function createBlankBotTradeRoutesTableDraft(): BotTradeRoutesTableEntryDraft {
  return {
    tableId: "",
    rowType: "route",
    merchantState: "",
    priority: "",
    tradeRouteCardId: "",
    publicPlaceholderName: "",
    privateName: "",
    commerceEffectsJson: "[]",
    profitEffectsJson: "[]",
    endOfTurnEffectsJson: "[]",
    implemented: "false",
    tested: "false",
    notes: ""
  };
}

export function botStateTableDraftToCsvRow(draft: BotStateTableEntryDraft): PrivateBotStateTableCsvRow {
  return {
    table_id: draft.tableId,
    bot_nation_id: draft.botNationId,
    table_side: draft.tableSide,
    row_id: draft.rowId,
    priority: draft.priority,
    trigger_kind: draft.triggerKind,
    trigger_value: draft.triggerValue,
    public_placeholder_label: draft.publicPlaceholderLabel,
    private_trigger_label: draft.privateTriggerLabel,
    private_effect_text: draft.privateEffectText,
    effects_json: draft.effectsJson,
    implemented: draft.implemented,
    tested: draft.tested,
    notes: draft.notes
  };
}

export function botStateTableRowToDraft(row: PrivateBotStateTableCsvRow): BotStateTableEntryDraft {
  return {
    tableId: row.table_id ?? "",
    botNationId: row.bot_nation_id ?? "",
    tableSide: row.table_side ?? "S",
    rowId: row.row_id ?? "",
    priority: row.priority ?? "1",
    triggerKind: row.trigger_kind ?? "other",
    triggerValue: row.trigger_value ?? "",
    publicPlaceholderLabel: row.public_placeholder_label ?? "",
    privateTriggerLabel: row.private_trigger_label ?? "",
    privateEffectText: row.private_effect_text ?? "",
    effectsJson: row.effects_json ?? "[]",
    implemented: row.implemented ?? "false",
    tested: row.tested ?? "false",
    notes: row.notes ?? ""
  };
}

export function botTradeRoutesTableDraftToCsvRow(draft: BotTradeRoutesTableEntryDraft): PrivateBotTradeRoutesTableCsvRow {
  return {
    table_id: draft.tableId,
    row_type: draft.rowType,
    merchant_state: draft.merchantState,
    priority: draft.priority,
    trade_route_card_id: draft.tradeRouteCardId,
    public_placeholder_name: draft.publicPlaceholderName,
    private_name: draft.privateName,
    commerce_effects_json: draft.commerceEffectsJson,
    profit_effects_json: draft.profitEffectsJson,
    end_of_turn_effects_json: draft.endOfTurnEffectsJson,
    implemented: draft.implemented,
    tested: draft.tested,
    notes: draft.notes
  };
}

export function botTradeRoutesTableRowToDraft(row: PrivateBotTradeRoutesTableCsvRow): BotTradeRoutesTableEntryDraft {
  return {
    tableId: row.table_id ?? "",
    rowType: row.row_type ?? "route",
    merchantState: row.merchant_state ?? "",
    priority: row.priority ?? "",
    tradeRouteCardId: row.trade_route_card_id ?? "",
    publicPlaceholderName: row.public_placeholder_name ?? "",
    privateName: row.private_name ?? "",
    commerceEffectsJson: row.commerce_effects_json ?? "[]",
    profitEffectsJson: row.profit_effects_json ?? "[]",
    endOfTurnEffectsJson: row.end_of_turn_effects_json ?? "[]",
    implemented: row.implemented ?? "false",
    tested: row.tested ?? "false",
    notes: row.notes ?? ""
  };
}

export function appendOrReplaceBotStateTableRow(rows: PrivateBotStateTableCsvRow[], row: PrivateBotStateTableCsvRow): PrivateBotStateTableCsvRow[] {
  const key = `${row.table_id.trim()}|${row.table_side.trim()}|${row.row_id.trim()}`;
  const matches = (existing: PrivateBotStateTableCsvRow) => `${existing.table_id.trim()}|${existing.table_side.trim()}|${existing.row_id.trim()}` === key;
  return rows.some(matches) ? rows.map((existing) => (matches(existing) ? row : existing)) : [...rows, row];
}

export function appendOrReplaceBotTradeRoutesTableRow(rows: PrivateBotTradeRoutesTableCsvRow[], row: PrivateBotTradeRoutesTableCsvRow): PrivateBotTradeRoutesTableCsvRow[] {
  const rowType = row.row_type.trim();
  const routeKey = `${row.table_id.trim()}|route|${row.trade_route_card_id.trim()}`;
  const eotKey = `${row.table_id.trim()}|end_of_turn|${row.merchant_state.trim()}|${row.priority.trim()}`;
  const key = rowType === "end_of_turn" ? eotKey : routeKey;
  const matches = (existing: PrivateBotTradeRoutesTableCsvRow) => {
    if (existing.row_type.trim() === "end_of_turn") {
      return `${existing.table_id.trim()}|end_of_turn|${existing.merchant_state.trim()}|${existing.priority.trim()}` === key;
    }
    return `${existing.table_id.trim()}|route|${existing.trade_route_card_id.trim()}` === key;
  };
  return rows.some(matches) ? rows.map((existing) => (matches(existing) ? row : existing)) : [...rows, row];
}
