import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildPrivateDataCompletenessReport, formatPrivateDataCompletenessReport } from "../../../tools/card-import/privateDataCompleteness";

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

describe("private data completeness report", () => {
  it("summarizes nation, ruleset, strategy, bot table, and trade-route gaps per nation", () => {
    const report = buildPrivateDataCompletenessReport({
      nations: [
        { id: "cultists", displayName: "Cultists", implemented: true, tested: false } as any,
        { id: "martians", displayName: "Martians", implemented: false, tested: false } as any
      ],
      rulesets: [
        {
          nationId: "cultists",
          displayName: "Cultists Rules",
          implemented: true,
          tested: true,
          shortGameOverrides: [{ op: "excluded_from_short_game" }],
          botOverrides: [{ op: "initial_bot_state_table", tableId: "cultists_research_ceremony", side: "S" }]
        } as any
      ],
      strategies: [
        { nationId: "cultists", displayName: "Cultists Strategy", implemented: true, tested: true } as any
      ],
      botStateTables: {
        cultists_research_ceremony_S: {
          id: "cultists_research_ceremony",
          botNationId: "cultists",
          displayName: "Research Ceremony",
          side: "S",
          rows: [
            { id: "row_1", priority: 1, trigger: { kind: "other" }, effects: [], implemented: true, tested: true },
            { id: "row_2", priority: 2, trigger: { kind: "other" }, effects: [], implemented: false, tested: false, privateEffectText: "TODO_PRIVATE cultist row" }
          ]
        } as any,
        cultists_ceremonial_gathering_F: {
          id: "cultists_ceremonial_gathering",
          botNationId: "cultists",
          displayName: "Ceremonial Gathering",
          side: "F",
          rows: [
            { id: "row_1", priority: 1, trigger: { kind: "other" }, effects: [], implemented: true, tested: false }
          ]
        } as any
      },
      botTradeRoutesTables: {
        trade_routes: {
          id: "trade_routes",
          rows: [
            { tradeRouteId: "route_1", publicPlaceholderName: "Route 1", commerceEffects: [], profitEffects: [] }
          ],
          endOfTurnRows: [
            { merchantState: "merchants", priority: 1, effects: [] }
          ]
        }
      }
    });

    expect(report.summary).toEqual({ nations: 2, complete: 0, incomplete: 2 });
    expect(report.nations[0]).toMatchObject({
      nationId: "cultists",
      checks: {
        nationData: "incomplete",
        ruleset: "complete",
        strategy: "complete",
        botStateTables: "incomplete",
        botTradeRoutes: "incomplete",
        shortGame: "complete"
      },
      botStateTableSides: ["F", "S"]
    });
    expect(report.nations[0].issues).toEqual(expect.arrayContaining([
      "nation_data_not_tested",
      "bot_state_rows_not_implemented:1",
      "bot_state_rows_not_tested:2",
      "bot_state_todo_markers:1",
      "bot_trade_routes_missing_merchant_empire_eot"
    ]));
    expect(report.nations[1].issues).toEqual(expect.arrayContaining([
      "nation_data_not_implemented",
      "missing_ruleset",
      "missing_strategy",
      "missing_bot_state_tables"
    ]));
  });

  it("formats a compact checklist for CLI output", () => {
    const text = formatPrivateDataCompletenessReport({
      summary: { nations: 1, complete: 0, incomplete: 1 },
      nations: [{
        nationId: "cultists",
        displayName: "Cultists",
        checks: {
          nationData: "complete",
          ruleset: "complete",
          strategy: "missing",
          botStateTables: "incomplete",
          botTradeRoutes: "missing",
          shortGame: "complete"
        },
        botStateTableSides: ["S"],
        issues: ["missing_strategy", "missing_bot_state_side:F"]
      }]
    });

    expect(text).toContain("Private Data Completeness: 0/1 complete");
    expect(text).toContain("[ ] Cultists (cultists)");
    expect(text).toContain("botStateTables=incomplete sides=S");
    expect(text).toContain("missing_strategy, missing_bot_state_side:F");
  });

  it("prints a checklist from private CSV inputs", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-completeness-"));
    try {
      const nations = path.join(tmp, "nations.csv");
      const rulesets = path.join(tmp, "rulesets.csv");
      const strategies = path.join(tmp, "strategy.csv");
      const botTables = path.join(tmp, "bot-tables.csv");
      const botTrade = path.join(tmp, "bot-trade.csv");
      fs.writeFileSync(nations, [
        "nation_id,source_box,nation_name_private,public_placeholder_name,complexity,power_card_ids,state_card_ids,starting_deck_card_ids,nation_deck_card_ids,accession_card_id,development_card_ids,special_setup_json,passive_rules_json,action_tokens_base,exhaust_tokens_base,required_expansions,excluded_expansions,notes,implemented,tested",
        "cultists,horizons,Cultists,Cultists,3,,,,,,,[],[],1,1,,,notes,true,true",
        "martians,horizons,Martians,Martians,3,,,,,,,[],[],1,1,,,notes,false,false"
      ].join("\n"));
      fs.writeFileSync(rulesets, [
        "nation_id,nation_name_private,public_placeholder_name,ruleset_tags,required_expansions,excluded_expansions,allowed_modes,disallowed_modes,required_variants,excluded_variants,setup_overrides_json,zone_overrides_json,state_overrides_json,reshuffle_overrides_json,cleanup_overrides_json,solstice_overrides_json,scoring_overrides_json,collapse_overrides_json,bot_overrides_json,short_game_overrides_json,hook_rules_json,public_summary,private_notes,implemented,tested",
        "cultists,Cultists,Cultists Rules,short_game_excluded,,,,,,,[],[],[],[],[],[],[],[],[],[],[],summary,notes,true,true"
      ].join("\n"));
      fs.writeFileSync(strategies, [
        "nation_id,nation_name_private,public_placeholder_name,complexity,aggression,public_placeholder_summary,private_core_gameplan,private_early_game,private_mid_game,private_late_game,private_key_mechanics,private_market_priorities,private_risk_notes,private_rules_engine_notes,implemented,tested",
        "cultists,Cultists,Cultists Strategy,3,moderate,summary,core,early,mid,late,chaos,market,risk,notes,true,true"
      ].join("\n"));
      fs.writeFileSync(botTables, [
        "table_id,bot_nation_id,table_side,row_id,priority,trigger_kind,trigger_value,public_placeholder_label,private_trigger_label,private_effect_text,effects_json,implemented,tested,notes",
        "cultists_research_ceremony,cultists,S,row_1,1,other,,Fallback,,,[],true,true,"
      ].join("\n"));
      fs.writeFileSync(botTrade, [
        "table_id,row_type,merchant_state,priority,trade_route_card_id,public_placeholder_name,private_name,commerce_effects_json,profit_effects_json,end_of_turn_effects_json,implemented,tested,notes",
        "trade_routes,end_of_turn,merchants,1,,,,,,[],true,true,"
      ].join("\n"));

      const output = runTool("reportPrivateDataCompleteness.ts", [
        "--nations", nations,
        "--rulesets", rulesets,
        "--strategy", strategies,
        "--bot-tables", botTables,
        "--bot-trade", botTrade
      ]);

      expect(output).toContain("Private Data Completeness: 0/2 complete");
      expect(output).toContain("[ ] Cultists (cultists)");
      expect(output).toContain("missing_bot_state_side:F");
      expect(output).toContain("[ ] Martians (martians)");
      expect(output).toContain("missing_ruleset");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
