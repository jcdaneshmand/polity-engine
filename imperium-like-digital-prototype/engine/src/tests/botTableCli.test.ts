import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeBotStateTables } from "../../../tools/card-import/normalizeBotStateTable";
import { normalizeBotTradeRoutesTables } from "../../../tools/card-import/normalizeBotTradeRoutesTable";
import { validatePrivateBotStateTableRows } from "../../../tools/card-import/validatePrivateBotStateTables";
import { validatePrivateBotTradeRoutesTableRows } from "../../../tools/card-import/validatePrivateBotTradeRoutesTables";

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
