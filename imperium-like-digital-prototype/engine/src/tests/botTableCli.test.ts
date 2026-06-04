import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeBotStateTables } from "../../../tools/card-import/normalizeBotStateTable";
import { normalizeBotTradeRoutesTables } from "../../../tools/card-import/normalizeBotTradeRoutesTable";
import { validatePrivateBotStateTableRows } from "../../../tools/card-import/validatePrivateBotStateTables";
import { validatePrivateBotTradeRoutesTableRows } from "../../../tools/card-import/validatePrivateBotTradeRoutesTables";
import {
  validatePrivateBotStateTableRows as validatePrivateBotStateTableRowsForEntry,
  validatePrivateBotTradeRoutesTableRows as validatePrivateBotTradeRoutesTableRowsForEntry
} from "../../../tools/card-import/botTableValidation";

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (!fs.existsSync(path.join(current, "tools", "card-import"))) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Could not locate workspace root");
    current = parent;
  }
  return current;
}

const workspaceRoot = findWorkspaceRoot(process.cwd());
const tsxCli = path.join(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs");

function runTool(scriptName: string, args: string[] = []) {
  return execFileSync(process.execPath, [tsxCli, path.join("tools", "card-import", scriptName), ...args], {
    cwd: workspaceRoot,
    stdio: "pipe"
  }).toString("utf8");
}

describe("bot table CLI tools", () => {
  it("normalizes rulebook resource names in Bot state table effects", () => {
    const imported = normalizeBotStateTables([{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_resource",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Resource row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([
        { op: "bot_gain_resource", resource: "progress", count: 1 },
        { op: "bot_pay_resource_then", resource: "population", count: 1, effects: [
          { op: "human_gain_resource", resource: "progress", count: 1 }
        ] },
        { op: "bot_spend_resource_to_state_card", spendResource: "population", spendCount: 1, placeResource: "progress", placeCount: 1 }
      ]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    expect(imported.test_table_S.rows[0].effects).toEqual([
      { op: "bot_gain_resource", resource: "knowledge", count: 1 },
      { op: "bot_pay_resource_then", resource: "influence", count: 1, effects: [
        { op: "human_gain_resource", resource: "knowledge", count: 1 }
      ] },
      { op: "bot_spend_resource_to_state_card", spendResource: "influence", spendCount: 1, placeResource: "knowledge", placeCount: 1 }
    ]);
  });

  it("normalizes rulebook resource names in Bot Trade Routes effects", () => {
    const imported = normalizeBotTradeRoutesTables([
      {
        table_id: "trade_table",
        row_type: "route",
        merchant_state: "",
        priority: "",
        trade_route_card_id: "route_1",
        public_placeholder_name: "Route One",
        private_name: "",
        commerce_effects_json: JSON.stringify([{ op: "bot_gain_resource", resource: "progress", count: 1 }]),
        profit_effects_json: JSON.stringify([{ op: "human_gain_resource", resource: "population", count: 1 }]),
        end_of_turn_effects_json: "",
        implemented: "true",
        tested: "true",
        notes: ""
      },
      {
        table_id: "trade_table",
        row_type: "end_of_turn",
        merchant_state: "merchants",
        priority: "1",
        trade_route_card_id: "",
        public_placeholder_name: "",
        private_name: "",
        commerce_effects_json: "",
        profit_effects_json: "",
        end_of_turn_effects_json: JSON.stringify([{ op: "bot_pay_resource_then", resource: "progress", count: 1, effects: [
          { op: "bot_gain_resource", resource: "population", count: 1 }
        ] }]),
        implemented: "true",
        tested: "true",
        notes: ""
      }
    ]);

    expect(imported.trade_table.rows[0].commerceEffects).toEqual([{ op: "bot_gain_resource", resource: "knowledge", count: 1 }]);
    expect(imported.trade_table.rows[0].profitEffects).toEqual([{ op: "human_gain_resource", resource: "influence", count: 1 }]);
    expect(imported.trade_table.endOfTurnRows[0].effects).toEqual([{ op: "bot_pay_resource_then", resource: "knowledge", count: 1, effects: [
      { op: "bot_gain_resource", resource: "influence", count: 1 }
    ] }]);
  });

  it("allows rulebook resource names but rejects unknown Bot state table resources", () => {
    const validReport = validatePrivateBotStateTableRows([{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_valid",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Resource row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([
        { op: "bot_gain_resource", resource: "progress", count: 1 },
        { op: "bot_pay_resource_then", resource: "population", count: 1, effects: [
          { op: "human_gain_resource", resource: "goods", count: 1 }
        ] }
      ]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    const invalidReport = validatePrivateBotStateTableRows([{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_invalid",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Resource row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([{ op: "bot_gain_resource", resource: "stone", count: 1 }]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    expect(validReport.counts.fatal).toBe(0);
    expect(invalidReport.counts.fatal).toBeGreaterThan(0);
    expect(invalidReport.errors.some((e)=>e.field==="effects_json" && e.message.includes("stone"))).toBe(true);
  });

  it("accepts all runtime Bot state table effect ops used by the resolver", () => {
    const report = validatePrivateBotStateTableRows([{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_runtime_ops",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Runtime ops row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([
        { op: "bot_exile_market" },
        { op: "bot_put_revealed_card_on_bottom_of_deck" }
      ]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    expect(report.counts.fatal).toBe(0);
  });

  it("accepts runtime Bot state table effect ops through the private entry validator", () => {
    const report = validatePrivateBotStateTableRowsForEntry([{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_runtime_ops",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Runtime ops row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([
        { op: "bot_exile_market" },
        { op: "bot_put_revealed_card_on_bottom_of_deck" }
      ]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    expect(report.counts.fatal).toBe(0);
  });

  it("rejects Bot state table suit triggers outside real suit icons", () => {
    const rows = [
      {
        table_id: "test_table",
        bot_nation_id: "test_bot",
        table_side: "S",
        row_id: "row_none",
        priority: "1",
        trigger_kind: "suit",
        trigger_value: "none",
        public_placeholder_label: "Bad suit row",
        private_trigger_label: "",
        private_effect_text: "",
        effects_json: JSON.stringify([{ op: "bot_discard_revealed_card" }]),
        implemented: "true",
        tested: "true",
        notes: ""
      },
      {
        table_id: "test_table",
        bot_nation_id: "test_bot",
        table_side: "S",
        row_id: "row_multi",
        priority: "2",
        trigger_kind: "suit",
        trigger_value: "multi",
        public_placeholder_label: "Bad suit row",
        private_trigger_label: "",
        private_effect_text: "",
        effects_json: JSON.stringify([{ op: "bot_discard_revealed_card" }]),
        implemented: "true",
        tested: "true",
        notes: ""
      }
    ];

    const importReport = validatePrivateBotStateTableRows(rows);
    const entryReport = validatePrivateBotStateTableRowsForEntry(rows);

    expect(importReport.counts.fatal).toBe(2);
    expect(entryReport.counts.fatal).toBe(2);
    expect(importReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid suit trigger_value: none",
      "Invalid suit trigger_value: multi"
    ]));
    expect(entryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid suit trigger_value: none",
      "Invalid suit trigger_value: multi"
    ]));
  });

  it("rejects Bot table effect suit filters outside real suit icons", () => {
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_filter",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad filter row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([
        { op: "bot_acquire", filter: { suits: ["none"] } },
        { op: "bot_swap_market", marketFilter: { suits: ["multi"] } }
      ]),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify([{ op: "bot_acquire", filter: { suits: ["none"] } }]),
      profit_effects_json: JSON.stringify([{ op: "bot_swap_market", marketFilter: { suits: ["multi"] } }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    expect(stateImportReport.counts.fatal).toBe(2);
    expect(stateEntryReport.counts.fatal).toBe(2);
    expect(tradeImportReport.counts.fatal).toBe(2);
    expect(tradeEntryReport.counts.fatal).toBe(2);
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid suit filter at effects_json[0].filter.suits[0]: none",
      "Invalid suit filter at effects_json[1].marketFilter.suits[0]: multi"
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid suit filter at effects_json[0].filter.suits[0]: none",
      "Invalid suit filter at effects_json[1].marketFilter.suits[0]: multi"
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid suit filter at commerce_effects_json[0].filter.suits[0]: none",
      "Invalid suit filter at profit_effects_json[0].marketFilter.suits[0]: multi"
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid suit filter at commerce_effects_json[0].filter.suits[0]: none",
      "Invalid suit filter at profit_effects_json[0].marketFilter.suits[0]: multi"
    ]));
  });

  it("rejects Bot table effect filter fields outside runtime vocabulary", () => {
    const invalidFilter = {
      cardTypes: ["artifact"],
      hasMarketResource: "stone",
      slotNumbers: [0, "1"]
    };
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_filter_fields",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad filter row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([{ op: "bot_acquire", filter: invalidFilter }]),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify([{ op: "bot_acquire", filter: invalidFilter }]),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    for (const report of [stateImportReport, stateEntryReport, tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(4);
    }
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardType filter at effects_json[0].filter.cardTypes[0]: artifact",
      "Invalid hasMarketResource at effects_json[0].filter.hasMarketResource: stone",
      "Invalid slotNumber filter at effects_json[0].filter.slotNumbers[0]: 0",
      "Invalid slotNumber filter at effects_json[0].filter.slotNumbers[1]: 1"
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardType filter at effects_json[0].filter.cardTypes[0]: artifact",
      "Invalid hasMarketResource at effects_json[0].filter.hasMarketResource: stone",
      "Invalid slotNumber filter at effects_json[0].filter.slotNumbers[0]: 0",
      "Invalid slotNumber filter at effects_json[0].filter.slotNumbers[1]: 1"
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardType filter at commerce_effects_json[0].filter.cardTypes[0]: artifact",
      "Invalid hasMarketResource at commerce_effects_json[0].filter.hasMarketResource: stone",
      "Invalid slotNumber filter at commerce_effects_json[0].filter.slotNumbers[0]: 0",
      "Invalid slotNumber filter at commerce_effects_json[0].filter.slotNumbers[1]: 1"
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardType filter at commerce_effects_json[0].filter.cardTypes[0]: artifact",
      "Invalid hasMarketResource at commerce_effects_json[0].filter.hasMarketResource: stone",
      "Invalid slotNumber filter at commerce_effects_json[0].filter.slotNumbers[0]: 0",
      "Invalid slotNumber filter at commerce_effects_json[0].filter.slotNumbers[1]: 1"
    ]));
  });

  it("rejects malformed Bot table tag and VP filter fields", () => {
    const invalidFilter = {
      tags: [4, false],
      minVp: "1",
      maxVp: "high"
    };
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_tag_vp_filter",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad tag and VP filter row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([{ op: "bot_return_from_discard", filter: invalidFilter }]),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify([{ op: "bot_return_from_discard", filter: invalidFilter }]),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    for (const report of [stateImportReport, stateEntryReport, tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(4);
    }
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid tag filter at effects_json[0].filter.tags[0]: 4",
      "Invalid tag filter at effects_json[0].filter.tags[1]: false",
      "Invalid minVp at effects_json[0].filter.minVp: 1",
      "Invalid maxVp at effects_json[0].filter.maxVp: high"
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid tag filter at effects_json[0].filter.tags[0]: 4",
      "Invalid tag filter at effects_json[0].filter.tags[1]: false",
      "Invalid minVp at effects_json[0].filter.minVp: 1",
      "Invalid maxVp at effects_json[0].filter.maxVp: high"
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid tag filter at commerce_effects_json[0].filter.tags[0]: 4",
      "Invalid tag filter at commerce_effects_json[0].filter.tags[1]: false",
      "Invalid minVp at commerce_effects_json[0].filter.minVp: 1",
      "Invalid maxVp at commerce_effects_json[0].filter.maxVp: high"
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid tag filter at commerce_effects_json[0].filter.tags[0]: 4",
      "Invalid tag filter at commerce_effects_json[0].filter.tags[1]: false",
      "Invalid minVp at commerce_effects_json[0].filter.minVp: 1",
      "Invalid maxVp at commerce_effects_json[0].filter.maxVp: high"
    ]));
  });

  it("rejects invalid nested Bot fallback effects before runtime", () => {
    const effects = [
      {
        op: "bot_acquire",
        ifUnable: [
          { op: "bot_unknown_fallback" },
          { op: "bot_swap_market", marketFilter: { suits: ["multi"] } }
        ]
      },
      {
        op: "bot_resolve_top_main_deck",
        ifVp: {
          value: 5,
          effects: [{ op: "bot_unknown_vp_branch" }]
        }
      }
    ];
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_nested_effects",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad nested effects row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify(effects),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify(effects),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    for (const report of [stateImportReport, stateEntryReport, tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(3);
    }
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported bot effect op: bot_unknown_fallback",
      "Invalid suit filter at effects_json[0].ifUnable[1].marketFilter.suits[0]: multi",
      "Unsupported bot effect op: bot_unknown_vp_branch"
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported bot effect op: bot_unknown_fallback",
      "Invalid suit filter at effects_json[0].ifUnable[1].marketFilter.suits[0]: multi",
      "Unsupported bot effect op: bot_unknown_vp_branch"
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported bot effect op: bot_unknown_fallback",
      "Invalid suit filter at commerce_effects_json[0].ifUnable[1].marketFilter.suits[0]: multi",
      "Unsupported bot effect op: bot_unknown_vp_branch"
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported bot effect op: bot_unknown_fallback",
      "Invalid suit filter at commerce_effects_json[0].ifUnable[1].marketFilter.suits[0]: multi",
      "Unsupported bot effect op: bot_unknown_vp_branch"
    ]));
  });

  it("rejects Bot if-unable branches on effects that cannot resolve fallbacks", () => {
    const effects = [
      {
        op: "bot_gain_resource",
        resource: "knowledge",
        count: 1,
        ifUnable: [{ op: "bot_gain_resource", resource: "materials", count: 1 }]
      }
    ];
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_if_unable_host",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad ifUnable host row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify(effects),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify(effects),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    for (const report of [stateImportReport, stateEntryReport, tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(1);
    }
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported ifUnable branch on bot_gain_resource at effects_json[0]"
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported ifUnable branch on bot_gain_resource at effects_json[0]"
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported ifUnable branch on bot_gain_resource at commerce_effects_json[0]"
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Unsupported ifUnable branch on bot_gain_resource at commerce_effects_json[0]"
    ]));
  });

  it("rejects malformed Bot ifVp payloads before runtime", () => {
    const effects = [
      { op: "bot_resolve_top_main_deck", ifVp: "five" },
      { op: "bot_resolve_top_main_deck", ifVp: { value: "5", effects: [{ op: "log", message: "ok" }] } },
      { op: "bot_resolve_top_main_deck", ifVp: { value: 5 } }
    ];
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_if_vp",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad ifVp row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify(effects),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify(effects),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    for (const report of [stateImportReport, stateEntryReport, tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(3);
    }
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "effects_json[0].ifVp must be an object",
      "Invalid ifVp.value at effects_json[1].ifVp.value: 5",
      "effects_json[2].ifVp.effects must parse to array"
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "effects_json[0].ifVp must be an object",
      "Invalid ifVp.value at effects_json[1].ifVp.value: 5",
      "effects_json[2].ifVp.effects must parse to array"
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "commerce_effects_json[0].ifVp must be an object",
      "Invalid ifVp.value at commerce_effects_json[1].ifVp.value: 5",
      "commerce_effects_json[2].ifVp.effects must parse to array"
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "commerce_effects_json[0].ifVp must be an object",
      "Invalid ifVp.value at commerce_effects_json[1].ifVp.value: 5",
      "commerce_effects_json[2].ifVp.effects must parse to array"
    ]));
  });

  it("rejects malformed Bot numeric effect payloads before runtime", () => {
    const effects = [
      { op: "bot_gain_resource", resource: "materials", count: "1" },
      { op: "bot_gain_resource_per_in_play", resource: "knowledge", countPerCard: 0 },
      { op: "bot_add_resource_to_market_slot", resource: "goods", slot: 7, count: -1 },
      { op: "bot_discard_top_bot_deck", count: "2" },
      { op: "human_gain_resource", resource: "influence" }
    ];
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_numeric_payloads",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad numeric payload row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify(effects),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify(effects),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    for (const report of [stateImportReport, stateEntryReport, tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(6);
    }
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid count at effects_json[0].count: 1",
      "Invalid countPerCard at effects_json[1].countPerCard: 0",
      "Invalid count at effects_json[2].count: -1",
      "Invalid slot at effects_json[2].slot: 7",
      "Invalid count at effects_json[3].count: 2",
      "Invalid count at effects_json[4].count: undefined"
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid count at effects_json[0].count: 1",
      "Invalid countPerCard at effects_json[1].countPerCard: 0",
      "Invalid count at effects_json[2].count: -1",
      "Invalid slot at effects_json[2].slot: 7",
      "Invalid count at effects_json[3].count: 2",
      "Invalid count at effects_json[4].count: undefined"
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid count at commerce_effects_json[0].count: 1",
      "Invalid countPerCard at commerce_effects_json[1].countPerCard: 0",
      "Invalid count at commerce_effects_json[2].count: -1",
      "Invalid slot at commerce_effects_json[2].slot: 7",
      "Invalid count at commerce_effects_json[3].count: 2",
      "Invalid count at commerce_effects_json[4].count: undefined"
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid count at commerce_effects_json[0].count: 1",
      "Invalid countPerCard at commerce_effects_json[1].countPerCard: 0",
      "Invalid count at commerce_effects_json[2].count: -1",
      "Invalid slot at commerce_effects_json[2].slot: 7",
      "Invalid count at commerce_effects_json[3].count: 2",
      "Invalid count at commerce_effects_json[4].count: undefined"
    ]));
  });

  it("rejects malformed Bot string and resource effect payloads before runtime", () => {
    const effects = [
      { op: "bot_gain_resource", count: 1 },
      { op: "bot_gain_resource_per_in_play", countPerCard: 1 },
      { op: "bot_spend_resource", count: 1 },
      { op: "bot_pay_resource_then", count: 1, effects: [{ op: "log", message: "ok" }] },
      { op: "bot_add_resource_to_market_slot", count: 1, slot: "rolled" },
      { op: "human_gain_resource", count: 1 },
      { op: "bot_flip_state_table", nextSide: "", nextTableId: 3 },
      { op: "bot_flip_merchant_state", nextState: "traders" },
      { op: "log", message: "" }
    ];
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_string_payloads",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad string payload row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify(effects),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify(effects),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    for (const report of [stateImportReport, stateEntryReport, tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(10);
    }
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Missing required resource at effects_json[0].resource",
      "Missing required resource at effects_json[1].resource",
      "Missing required resource at effects_json[2].resource",
      "Missing required resource at effects_json[3].resource",
      "Missing required resource at effects_json[4].resource",
      "Missing required resource at effects_json[5].resource",
      "Invalid nextSide at effects_json[6].nextSide: ",
      "Invalid nextTableId at effects_json[6].nextTableId: 3",
      "Invalid nextState at effects_json[7].nextState: traders",
      "Invalid message at effects_json[8].message: "
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Missing required resource at effects_json[0].resource",
      "Missing required resource at effects_json[1].resource",
      "Missing required resource at effects_json[2].resource",
      "Missing required resource at effects_json[3].resource",
      "Missing required resource at effects_json[4].resource",
      "Missing required resource at effects_json[5].resource",
      "Invalid nextSide at effects_json[6].nextSide: ",
      "Invalid nextTableId at effects_json[6].nextTableId: 3",
      "Invalid nextState at effects_json[7].nextState: traders",
      "Invalid message at effects_json[8].message: "
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Missing required resource at commerce_effects_json[0].resource",
      "Missing required resource at commerce_effects_json[1].resource",
      "Missing required resource at commerce_effects_json[2].resource",
      "Missing required resource at commerce_effects_json[3].resource",
      "Missing required resource at commerce_effects_json[4].resource",
      "Missing required resource at commerce_effects_json[5].resource",
      "Invalid nextSide at commerce_effects_json[6].nextSide: ",
      "Invalid nextTableId at commerce_effects_json[6].nextTableId: 3",
      "Invalid nextState at commerce_effects_json[7].nextState: traders",
      "Invalid message at commerce_effects_json[8].message: "
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Missing required resource at commerce_effects_json[0].resource",
      "Missing required resource at commerce_effects_json[1].resource",
      "Missing required resource at commerce_effects_json[2].resource",
      "Missing required resource at commerce_effects_json[3].resource",
      "Missing required resource at commerce_effects_json[4].resource",
      "Missing required resource at commerce_effects_json[5].resource",
      "Invalid nextSide at commerce_effects_json[6].nextSide: ",
      "Invalid nextTableId at commerce_effects_json[6].nextTableId: 3",
      "Invalid nextState at commerce_effects_json[7].nextState: traders",
      "Invalid message at commerce_effects_json[8].message: "
    ]));
  });

  it("rejects malformed Bot optional identifier and boolean effect payloads before runtime", () => {
    const effects = [
      { op: "bot_trigger_trade_route", cardId: [] },
      { op: "bot_acquire", fromExile: "yes" },
      { op: "bot_break_through", resolveGained: "true", discardGained: 1 }
    ];
    const stateRows = [{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_bad_optional_payloads",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Bad optional payload row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify(effects),
      implemented: "true",
      tested: "true",
      notes: ""
    }];
    const tradeRows = [{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify(effects),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }];

    const stateImportReport = validatePrivateBotStateTableRows(stateRows);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry(stateRows);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows(tradeRows);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry(tradeRows);

    for (const report of [stateImportReport, stateEntryReport, tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(4);
    }
    expect(stateImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardId at effects_json[0].cardId: ",
      "Invalid fromExile at effects_json[1].fromExile: yes",
      "Invalid resolveGained at effects_json[2].resolveGained: true",
      "Invalid discardGained at effects_json[2].discardGained: 1"
    ]));
    expect(stateEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardId at effects_json[0].cardId: ",
      "Invalid fromExile at effects_json[1].fromExile: yes",
      "Invalid resolveGained at effects_json[2].resolveGained: true",
      "Invalid discardGained at effects_json[2].discardGained: 1"
    ]));
    expect(tradeImportReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardId at commerce_effects_json[0].cardId: ",
      "Invalid fromExile at commerce_effects_json[1].fromExile: yes",
      "Invalid resolveGained at commerce_effects_json[2].resolveGained: true",
      "Invalid discardGained at commerce_effects_json[2].discardGained: 1"
    ]));
    expect(tradeEntryReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "Invalid cardId at commerce_effects_json[0].cardId: ",
      "Invalid fromExile at commerce_effects_json[1].fromExile: yes",
      "Invalid resolveGained at commerce_effects_json[2].resolveGained: true",
      "Invalid discardGained at commerce_effects_json[2].discardGained: 1"
    ]));
  });

  it("rejects empty Bot table effect branches through the private entry validator", () => {
    const stateReport = validatePrivateBotStateTableRowsForEntry([{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_empty",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Empty row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: "[]",
      implemented: "true",
      tested: "true",
      notes: ""
    }, {
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_empty_nested",
      priority: "2",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Empty nested row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([{ op: "bot_pay_resource_then", resource: "materials", count: 1, effects: [] }]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);
    const tradeReport = validatePrivateBotTradeRoutesTableRowsForEntry([{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: "[]",
      profit_effects_json: "[]",
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }, {
      table_id: "trade_table",
      row_type: "end_of_turn",
      merchant_state: "merchants",
      priority: "1",
      trade_route_card_id: "",
      public_placeholder_name: "",
      private_name: "",
      commerce_effects_json: "",
      profit_effects_json: "",
      end_of_turn_effects_json: JSON.stringify([{ op: "bot_pay_resource_then", resource: "materials", count: 1, effects: [] }]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    expect(stateReport.counts.fatal).toBe(2);
    expect(stateReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "effects_json must contain at least one effect",
      "effects_json[0].effects must contain at least one effect"
    ]));
    expect(tradeReport.counts.fatal).toBe(3);
    expect(tradeReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "commerce_effects_json must contain at least one effect",
      "profit_effects_json must contain at least one effect",
      "end_of_turn_effects_json[0].effects must contain at least one effect"
    ]));
  });

  it("keeps Bot Trade Routes private entry ops scoped to trade-route effects", () => {
    const report = validatePrivateBotTradeRoutesTableRowsForEntry([{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify([{ op: "bot_move_resource_to_state_card", resource: "materials", count: 1 }]),
      profit_effects_json: JSON.stringify([{ op: "log", message: "ok" }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    expect(report.counts.fatal).toBe(1);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "commerce_effects_json", message: "Unsupported bot effect op: bot_move_resource_to_state_card" })
    ]));
  });

  it("rejects unknown Bot table effect metadata fields before runtime", () => {
    const stateRow = {
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_unknown",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Unknown row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([
        { op: "bot_gain_resource", resource: "materials", count: 1, bonus: "ignored" },
        { op: "bot_acquire", filter: { suits: ["civilized"], bonus: "ignored" } },
        { op: "bot_resolve_top_main_deck", ifVp: { value: 3, effects: [{ op: "bot_gain_fame", count: 1 }], bonus: "ignored" } },
      ]),
      implemented: "true",
      tested: "true",
      notes: ""
    };
    const tradeRow = {
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify([{ op: "bot_gain_resource", resource: "materials", count: 1, bonus: "ignored" }]),
      profit_effects_json: JSON.stringify([{ op: "bot_acquire", filter: { suits: ["civilized"], bonus: "ignored" } }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    };

    const stateImportReport = validatePrivateBotStateTableRows([stateRow]);
    const stateEntryReport = validatePrivateBotStateTableRowsForEntry([stateRow]);
    const tradeImportReport = validatePrivateBotTradeRoutesTableRows([tradeRow]);
    const tradeEntryReport = validatePrivateBotTradeRoutesTableRowsForEntry([tradeRow]);

    for (const report of [stateImportReport, stateEntryReport]) {
      expect(report.counts.fatal).toBe(3);
      expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
        "Unsupported bot effect field at effects_json[0]: bonus",
        "Unsupported filter field at effects_json[1].filter: bonus",
        "Unsupported ifVp field at effects_json[2].ifVp: bonus"
      ]));
    }
    for (const report of [tradeImportReport, tradeEntryReport]) {
      expect(report.counts.fatal).toBe(2);
      expect(report.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
        "Unsupported bot effect field at commerce_effects_json[0]: bonus",
        "Unsupported filter field at profit_effects_json[0].filter: bonus"
      ]));
    }
  });

  it("rejects empty Bot table effect branches before runtime", () => {
    const stateReport = validatePrivateBotStateTableRows([{
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_empty",
      priority: "1",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Empty row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: "[]",
      implemented: "true",
      tested: "true",
      notes: ""
    }, {
      table_id: "test_table",
      bot_nation_id: "test_bot",
      table_side: "S",
      row_id: "row_empty_nested",
      priority: "2",
      trigger_kind: "other",
      trigger_value: "",
      public_placeholder_label: "Empty nested row",
      private_trigger_label: "",
      private_effect_text: "",
      effects_json: JSON.stringify([{ op: "bot_pay_resource_then", resource: "materials", count: 1, effects: [] }]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);
    const tradeReport = validatePrivateBotTradeRoutesTableRows([{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: "[]",
      profit_effects_json: "[]",
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }, {
      table_id: "trade_table",
      row_type: "end_of_turn",
      merchant_state: "merchants",
      priority: "1",
      trade_route_card_id: "",
      public_placeholder_name: "",
      private_name: "",
      commerce_effects_json: "",
      profit_effects_json: "",
      end_of_turn_effects_json: JSON.stringify([{ op: "bot_pay_resource_then", resource: "materials", count: 1, effects: [] }]),
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    expect(stateReport.counts.fatal).toBe(2);
    expect(stateReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "effects_json must contain at least one effect",
      "effects_json[0].effects must contain at least one effect"
    ]));
    expect(tradeReport.counts.fatal).toBe(3);
    expect(tradeReport.errors.map((e)=>e.message)).toEqual(expect.arrayContaining([
      "commerce_effects_json must contain at least one effect",
      "profit_effects_json must contain at least one effect",
      "end_of_turn_effects_json[0].effects must contain at least one effect"
    ]));
  });

  it("allows rulebook resource names but rejects unknown Bot Trade Routes resources", () => {
    const validReport = validatePrivateBotTradeRoutesTableRows([{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify([{ op: "bot_gain_resource", resource: "progress", count: 1 }]),
      profit_effects_json: JSON.stringify([{ op: "human_gain_resource", resource: "population", count: 1 }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    const invalidReport = validatePrivateBotTradeRoutesTableRows([{
      table_id: "trade_table",
      row_type: "route",
      merchant_state: "",
      priority: "",
      trade_route_card_id: "route_1",
      public_placeholder_name: "Route One",
      private_name: "",
      commerce_effects_json: JSON.stringify([{ op: "bot_gain_resource", resource: "science", count: 1 }]),
      profit_effects_json: JSON.stringify([{ op: "human_gain_resource", resource: "population", count: 1 }]),
      end_of_turn_effects_json: "",
      implemented: "true",
      tested: "true",
      notes: ""
    }]);

    expect(validReport.counts.fatal).toBe(0);
    expect(invalidReport.counts.fatal).toBeGreaterThan(0);
    expect(invalidReport.errors.some((e)=>e.field==="commerce_effects_json" && e.message.includes("science"))).toBe(true);
  });

  it("validates and imports private bot state table CSV rows", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-bot-table-"));
    try {
      const input = path.join(tmp, "bot-state.csv");
      const output = path.join(tmp, "bot-state.normalized.json");
      const report = path.join(tmp, "bot-state.report.json");
      fs.writeFileSync(input, [
        "table_id,bot_nation_id,table_side,row_id,priority,trigger_kind,trigger_value,public_placeholder_label,private_trigger_label,private_effect_text,effects_json,implemented,tested,notes",
        "test_table,test_bot,S,row_unrest,1,unrest,,Unrest row,,,\"[{\"\"op\"\":\"\"bot_put_revealed_card_into_history\"\"}]\",true,true,",
        "test_table,test_bot,S,row_other,99,other,,Fallback,,,\"[{\"\"op\"\":\"\"bot_discard_revealed_card\"\"}]\",true,false,"
      ].join("\n"));

      expect(runTool("validatePrivateBotStateTables.ts", ["--input", input])).toContain("fatal=0");
      expect(runTool("importPrivateBotStateTables.ts", ["--input", input, "--output", output, "--report", report])).toContain("fatal=0");

      const imported = JSON.parse(fs.readFileSync(output, "utf8"));
      expect(imported.test_table_S).toMatchObject({
        id: "test_table",
        botNationId: "test_bot",
        side: "S",
        rows: [
          { id: "row_unrest", trigger: { kind: "unrest" } },
          { id: "row_other", trigger: { kind: "other" } }
        ]
      });
      expect(JSON.parse(fs.readFileSync(report, "utf8")).counts).toMatchObject({ rows: 2, fatal: 0, warnings: 1 });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("validates and imports private bot Trade Routes table CSV rows", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-bot-trade-"));
    try {
      const input = path.join(tmp, "bot-trade.csv");
      const output = path.join(tmp, "bot-trade.normalized.json");
      const report = path.join(tmp, "bot-trade.report.json");
      fs.writeFileSync(input, [
        "table_id,row_type,merchant_state,priority,trade_route_card_id,public_placeholder_name,private_name,commerce_effects_json,profit_effects_json,end_of_turn_effects_json,implemented,tested,notes",
        "trade_table,route,,,route_1,Route One,,\"[{\"\"op\"\":\"\"bot_gain_resource\"\",\"\"resource\"\":\"\"goods\"\",\"\"count\"\":1}]\",\"[{\"\"op\"\":\"\"bot_gain_resource\"\",\"\"resource\"\":\"\"knowledge\"\",\"\"count\"\":1}]\",,true,true,",
        "trade_table,end_of_turn,merchants,1,,,,,,\"[{\"\"op\"\":\"\"log\"\",\"\"message\"\":\"\"merchant eot\"\"}]\",true,false,"
      ].join("\n"));

      expect(runTool("validatePrivateBotTradeRoutesTables.ts", ["--input", input])).toContain("fatal=0");
      expect(runTool("importPrivateBotTradeRoutesTables.ts", ["--input", input, "--output", output, "--report", report])).toContain("fatal=0");

      const imported = JSON.parse(fs.readFileSync(output, "utf8"));
      expect(imported.trade_table).toMatchObject({
        id: "trade_table",
        rows: [
          { tradeRouteId: "route_1", publicPlaceholderName: "Route One" }
        ],
        endOfTurnRows: [
          { merchantState: "merchants", priority: 1 }
        ]
      });
      expect(JSON.parse(fs.readFileSync(report, "utf8")).counts).toMatchObject({ rows: 2, fatal: 0, warnings: 1 });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
