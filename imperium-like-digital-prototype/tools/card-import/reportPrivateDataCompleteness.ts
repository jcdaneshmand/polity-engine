import fs from "node:fs";
import { parseCsvFile } from "./csvParser";
import { normalizeNation } from "./normalizeNation";
import { normalizeNationRuleset } from "./normalizeNationRuleset";
import { normalizeNationStrategy } from "./normalizeNationStrategy";
import { normalizeBotStateTables } from "./normalizeBotStateTable";
import { normalizeBotTradeRoutesTables } from "./normalizeBotTradeRoutesTable";
import { buildPrivateDataCompletenessReport, formatPrivateDataCompletenessReport } from "./privateDataCompleteness";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function optionalRows(path: string | undefined): Array<Record<string, string>> {
  if (!path || !fs.existsSync(path)) return [];
  return parseCsvFile(path);
}

const nationPath = arg("--nations") ?? "private-card-data/imperium_nations_private.csv";
const cardPath = arg("--cards") ?? "private-card-data/imperium_cards_private.csv";
const rulesetPath = arg("--rulesets") ?? "private-card-data/imperium_nation_rulesets_private.csv";
const strategyPath = arg("--strategy") ?? "private-card-data/imperium_nation_strategy_private.csv";
const botTablesPath = arg("--bot-tables") ?? "private-card-data/imperium_bot_state_tables_private.csv";
const botTradePath = arg("--bot-trade") ?? "private-card-data/imperium_bot_trade_routes_private.csv";
const sources = [
  ["cards", cardPath],
  ["nations", nationPath],
  ["rulesets", rulesetPath],
  ["strategy", strategyPath],
  ["bot-tables", botTablesPath],
  ["bot-trade", botTradePath],
] as const;
const missingSources = sources.filter(([, sourcePath]) => !fs.existsSync(sourcePath));

const nations = optionalRows(nationPath).map((row) => normalizeNation(row as any));
const rulesets = optionalRows(rulesetPath).map((row) => normalizeNationRuleset(row as any));
const strategies = optionalRows(strategyPath).map((row) => normalizeNationStrategy(row as any));
const botStateTables = normalizeBotStateTables(optionalRows(botTablesPath) as any);
const botTradeRoutesTables = normalizeBotTradeRoutesTables(optionalRows(botTradePath) as any);

if (nations.length === 0) {
  const ids = new Set<string>();
  rulesets.forEach((ruleset) => ids.add(ruleset.nationId));
  strategies.forEach((strategy) => ids.add(strategy.nationId));
  Object.values(botStateTables).forEach((table) => ids.add(table.botNationId));
  nations.push(...[...ids].sort().map((id) => ({
    id,
    displayName: id,
    powerCardIds: [],
    stateCardIds: [],
    startingDeckCardIds: [],
    nationDeckCardIds: [],
    developmentCardIds: [],
    setupRules: [],
    passiveRules: [],
    actionTokensBase: 0,
    exhaustTokensBase: 0,
    requiredExpansions: [],
    implemented: false,
    tested: false
  })));
}

const report = buildPrivateDataCompletenessReport({
  nations,
  rulesets,
  strategies,
  botStateTables,
  botTradeRoutesTables
});

if (missingSources.length > 0) {
  process.stdout.write("Missing private data sources:\n");
  for (const [label, sourcePath] of missingSources) process.stdout.write(`- ${label}: ${sourcePath}\n`);
}
process.stdout.write(formatPrivateDataCompletenessReport(report));
