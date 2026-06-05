import { describe, expect, it } from "vitest";
import {
  appendOrReplaceBotStateTableRow,
  appendOrReplaceBotTradeRoutesTableRow,
  botStateTableDraftToCsvRow,
  botStateTableRowToDraft,
  botTradeRoutesTableDraftToCsvRow,
  botTradeRoutesTableRowToDraft,
  buildBotNationOptions,
  createBlankBotStateTableDraft,
  createBlankBotTradeRoutesTableDraft,
  getNextBotStateTableId,
  getNextBotTradeRoutesTableId
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

  it("builds bot nation dropdown options from private nation rows", () => {
    expect(buildBotNationOptions([
      { nation_id: "persians", public_placeholder_name: "Persians", nation_name_private: "", source_box: "", complexity: "", power_card_ids: "", state_card_ids: "", starting_deck_card_ids: "", nation_deck_card_ids: "", accession_card_id: "", development_card_ids: "", action_tokens_base: "", exhaust_tokens_base: "", required_expansions: "", special_setup_json: "", passive_rules_json: "", implemented: "false", tested: "false", notes: "" },
      { nation_id: "macedonians", public_placeholder_name: "Macedonians", nation_name_private: "Macedonians Private", source_box: "", complexity: "", power_card_ids: "", state_card_ids: "", starting_deck_card_ids: "", nation_deck_card_ids: "", accession_card_id: "", development_card_ids: "", action_tokens_base: "", exhaust_tokens_base: "", required_expansions: "", special_setup_json: "", passive_rules_json: "", implemented: "false", tested: "false", notes: "" }
    ])).toEqual([
      { id: "macedonians", label: "Macedonians Private (macedonians)" },
      { id: "persians", label: "Persians (persians)" }
    ]);
  });

  it("increments generated bot state table IDs by selected nation", () => {
    const rows = [
      botStateTableDraftToCsvRow({ ...createBlankBotStateTableDraft(), tableId: "bot_state_macedonians_1", botNationId: "macedonians", rowId: "a" }),
      botStateTableDraftToCsvRow({ ...createBlankBotStateTableDraft(), tableId: "bot_state_macedonians_2", botNationId: "macedonians", rowId: "b" }),
      botStateTableDraftToCsvRow({ ...createBlankBotStateTableDraft(), tableId: "bot_state_persians_1", botNationId: "persians", rowId: "a" })
    ];

    expect(getNextBotStateTableId(rows, "macedonians")).toBe("bot_state_macedonians_3");
    expect(getNextBotStateTableId(rows, "persians")).toBe("bot_state_persians_2");
  });

  it("increments generated bot Trade Routes table IDs by selected nation", () => {
    const rows = [
      botTradeRoutesTableDraftToCsvRow({ ...createBlankBotTradeRoutesTableDraft(), tableId: "bot_trade_macedonians_1", tradeRouteCardId: "route_a" }),
      botTradeRoutesTableDraftToCsvRow({ ...createBlankBotTradeRoutesTableDraft(), tableId: "bot_trade_macedonians_2", tradeRouteCardId: "route_b" }),
      botTradeRoutesTableDraftToCsvRow({ ...createBlankBotTradeRoutesTableDraft(), tableId: "bot_trade_persians_1", tradeRouteCardId: "route_a" })
    ];

    expect(getNextBotTradeRoutesTableId(rows, "macedonians")).toBe("bot_trade_macedonians_3");
    expect(getNextBotTradeRoutesTableId(rows, "persians")).toBe("bot_trade_persians_2");
  });
});
