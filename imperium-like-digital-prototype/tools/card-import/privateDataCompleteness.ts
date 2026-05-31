type CheckStatus = "complete" | "incomplete" | "missing";

interface CompletenessInput {
  nations: any[];
  rulesets: any[];
  strategies: any[];
  botStateTables: Record<string, any>;
  botTradeRoutesTables: Record<string, any>;
}

interface NationCompleteness {
  nationId: string;
  displayName: string;
  checks: {
    nationData: CheckStatus;
    ruleset: CheckStatus;
    strategy: CheckStatus;
    botStateTables: CheckStatus;
    botTradeRoutes: CheckStatus;
    shortGame: CheckStatus;
  };
  botStateTableSides: string[];
  issues: string[];
}

export interface PrivateDataCompletenessReport {
  summary: { nations: number; complete: number; incomplete: number };
  nations: NationCompleteness[];
}

function implementationStatus(entity: any): CheckStatus {
  if (!entity) return "missing";
  return entity.implemented === true && entity.tested === true ? "complete" : "incomplete";
}

function sideKey(side: unknown): string {
  return String(side ?? "").toUpperCase();
}

function botStateTableIssues(tables: any[], sides: string[]): string[] {
  const rows = tables.flatMap((table) => table.rows ?? []);
  const notImplemented = rows.filter((row) => row.implemented !== true).length;
  const notTested = rows.filter((row) => row.tested !== true).length;
  const todoMarkers = rows.filter((row) => JSON.stringify(row).includes("TODO_PRIVATE")).length;
  const issues: string[] = [];
  if (notImplemented > 0) issues.push(`bot_state_rows_not_implemented:${notImplemented}`);
  if (notTested > 0) issues.push(`bot_state_rows_not_tested:${notTested}`);
  if (todoMarkers > 0) issues.push(`bot_state_todo_markers:${todoMarkers}`);
  for (const side of ["F", "S"]) {
    if (!sides.includes(side)) issues.push(`missing_bot_state_side:${side}`);
  }
  return issues;
}

function hasMerchantEmpireEndOfTurn(table: any): boolean {
  return (table?.endOfTurnRows ?? []).some((row: any) => String(row.merchantState ?? "").toLowerCase().includes("empire"));
}

function requiresNationSpecificShortGameRule(nationId: string, ruleset: any): boolean {
  const tags = ruleset?.rulesetTags ?? [];
  if (tags.includes("short_game_exception") || tags.includes("short_game_excluded")) return true;
  const exceptions = new Set(["atlanteans", "arthurians", "cultists", "inuit", "martians", "polynesians", "utopians"]);
  return exceptions.has(String(nationId).toLowerCase());
}

export function buildPrivateDataCompletenessReport(input: CompletenessInput): PrivateDataCompletenessReport {
  const rulesetsByNation = new Map(input.rulesets.map((ruleset) => [ruleset.nationId, ruleset]));
  const strategiesByNation = new Map(input.strategies.map((strategy) => [strategy.nationId, strategy]));
  const botTables = Object.values(input.botStateTables ?? {});
  const botTradeRoutesTables = Object.values(input.botTradeRoutesTables ?? {});

  const nations = input.nations.map((nation): NationCompleteness => {
    const nationId = nation.id;
    const ruleset = rulesetsByNation.get(nationId);
    const strategy = strategiesByNation.get(nationId);
    const nationBotTables = botTables.filter((table) => table.botNationId === nationId);
    const botStateTableSides = [...new Set(nationBotTables.map((table) => sideKey(table.side)).filter(Boolean))].sort();
    const issues: string[] = [];

    const checks: NationCompleteness["checks"] = {
      nationData: implementationStatus(nation),
      ruleset: implementationStatus(ruleset),
      strategy: implementationStatus(strategy),
      botStateTables: "missing",
      botTradeRoutes: botTradeRoutesTables.length > 0 ? "complete" : "missing",
      shortGame: "missing"
    };

    if (checks.nationData === "incomplete") {
      if (nation.implemented !== true) issues.push("nation_data_not_implemented");
      if (nation.tested !== true) issues.push("nation_data_not_tested");
    }
    if (checks.ruleset === "missing") issues.push("missing_ruleset");
    if (checks.strategy === "missing") issues.push("missing_strategy");

    if (nationBotTables.length === 0) {
      issues.push("missing_bot_state_tables");
    } else {
      const stateIssues = botStateTableIssues(nationBotTables, botStateTableSides);
      checks.botStateTables = stateIssues.length === 0 ? "complete" : "incomplete";
      issues.push(...stateIssues);
    }

    if (botTradeRoutesTables.length === 0) {
      issues.push("missing_bot_trade_routes");
    } else if (!botTradeRoutesTables.some(hasMerchantEmpireEndOfTurn)) {
      checks.botTradeRoutes = "incomplete";
      issues.push("bot_trade_routes_missing_merchant_empire_eot");
    }

    if (!ruleset) {
      checks.shortGame = "missing";
    } else if (!requiresNationSpecificShortGameRule(nationId, ruleset)) {
      checks.shortGame = "complete";
    } else {
      checks.shortGame = (ruleset.shortGameOverrides ?? []).length > 0 ? "complete" : "incomplete";
      if (checks.shortGame === "incomplete") issues.push("missing_short_game_rule");
    }

    return {
      nationId,
      displayName: nation.displayName ?? nationId,
      checks,
      botStateTableSides,
      issues
    };
  });

  const complete = nations.filter((nation) => Object.values(nation.checks).every((status) => status === "complete")).length;
  return {
    summary: { nations: nations.length, complete, incomplete: nations.length - complete },
    nations
  };
}

export function formatPrivateDataCompletenessReport(report: PrivateDataCompletenessReport): string {
  const lines = [`Private Data Completeness: ${report.summary.complete}/${report.summary.nations} complete`];
  for (const nation of report.nations) {
    const marker = Object.values(nation.checks).every((status) => status === "complete") ? "x" : " ";
    const sides = nation.botStateTableSides.length > 0 ? ` sides=${nation.botStateTableSides.join(",")}` : "";
    const checks = [
      `nationData=${nation.checks.nationData}`,
      `ruleset=${nation.checks.ruleset}`,
      `strategy=${nation.checks.strategy}`,
      `botStateTables=${nation.checks.botStateTables}${sides}`,
      `botTradeRoutes=${nation.checks.botTradeRoutes}`,
      `shortGame=${nation.checks.shortGame}`
    ].join(" ");
    const issues = nation.issues.length > 0 ? ` issues=${nation.issues.join(", ")}` : "";
    lines.push(`[${marker}] ${nation.displayName} (${nation.nationId}) ${checks}${issues}`);
  }
  return lines.join("\n");
}
