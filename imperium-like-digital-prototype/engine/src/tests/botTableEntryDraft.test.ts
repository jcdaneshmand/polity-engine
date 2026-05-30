import { describe, expect, it } from "vitest";
import {
  appendOrReplaceBotStateTableRow,
  appendOrReplaceBotTradeRoutesTableRow,
  botStateTableDraftToCsvRow,
  botStateTableRowToDraft,
  botTradeRoutesTableDraftToCsvRow,
  botTradeRoutesTableRowToDraft,
  createBlankBotStateTableDraft,
  createBlankBotTradeRoutesTableDraft
} from "../../../tools/card-entry/botTableDraft";

describe("bot table entry drafts", () => {
  it("round-trips bot state table drafts through the CSV schema", () => {
    const row = botStateTableDraftToCsvRow({
      ...createBlankBotStateTableDraft(),
      tableId: "macedonians_state",
      botNationId: "macedonians",
      tableSide: "S",
      rowId: "unrest_row",
      triggerKind: "unrest",
      publicPlaceholderLabel: "Unrest trigger",
      effectsJson: "[{\"op\":\"bot_put_revealed_card_into_history\"}]"
    });

    expect(row).toMatchObject({
      table_id: "macedonians_state",
      bot_nation_id: "macedonians",
      table_side: "S",
      row_id: "unrest_row",
      trigger_kind: "unrest"
    });
    expect(botStateTableRowToDraft(row).effectsJson).toBe("[{\"op\":\"bot_put_revealed_card_into_history\"}]");
  });

  it("replaces bot state rows by table, side, and row id", () => {
    const original = botStateTableDraftToCsvRow({ ...createBlankBotStateTableDraft(), tableId: "t", tableSide: "S", rowId: "r", publicPlaceholderLabel: "Old" });
    const replacement = botStateTableDraftToCsvRow({ ...createBlankBotStateTableDraft(), tableId: "t", tableSide: "S", rowId: "r", publicPlaceholderLabel: "New" });

    expect(appendOrReplaceBotStateTableRow([original], replacement)).toEqual([replacement]);
  });

  it("round-trips bot trade route table drafts through the CSV schema", () => {
    const row = botTradeRoutesTableDraftToCsvRow({
      ...createBlankBotTradeRoutesTableDraft(),
      tableId: "trade_routes",
      rowType: "route",
      tradeRouteCardId: "route_1",
      publicPlaceholderName: "Route 1",
      commerceEffectsJson: "[{\"op\":\"bot_trade\"}]",
      profitEffectsJson: "[{\"op\":\"bot_resolve_profits_where_able\"}]"
    });

    expect(row).toMatchObject({
      table_id: "trade_routes",
      row_type: "route",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route 1"
    });
    expect(botTradeRoutesTableRowToDraft(row).profitEffectsJson).toBe("[{\"op\":\"bot_resolve_profits_where_able\"}]");
  });

  it("replaces bot trade route rows by route or end-of-turn identity", () => {
    const route = botTradeRoutesTableDraftToCsvRow({ ...createBlankBotTradeRoutesTableDraft(), tableId: "t", rowType: "route", tradeRouteCardId: "route_1", publicPlaceholderName: "Old" });
    const routeReplacement = botTradeRoutesTableDraftToCsvRow({ ...createBlankBotTradeRoutesTableDraft(), tableId: "t", rowType: "route", tradeRouteCardId: "route_1", publicPlaceholderName: "New" });
    const eot = botTradeRoutesTableDraftToCsvRow({ ...createBlankBotTradeRoutesTableDraft(), tableId: "t", rowType: "end_of_turn", merchantState: "merchants", priority: "1" });
    const eotReplacement = botTradeRoutesTableDraftToCsvRow({ ...createBlankBotTradeRoutesTableDraft(), tableId: "t", rowType: "end_of_turn", merchantState: "merchants", priority: "1", notes: "Updated" });

    expect(appendOrReplaceBotTradeRoutesTableRow([route], routeReplacement)).toEqual([routeReplacement]);
    expect(appendOrReplaceBotTradeRoutesTableRow([eot], eotReplacement)).toEqual([eotReplacement]);
  });
});
