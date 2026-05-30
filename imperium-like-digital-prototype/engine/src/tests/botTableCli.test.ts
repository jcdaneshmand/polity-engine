import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

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
