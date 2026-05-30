import fs from "node:fs";
import path from "node:path";

type ImportSource = {
  input: string;
  output: string;
};

const sources: ImportSource[] = [
  { input: "private-card-data/imperium_cards_private.csv", output: "generated-private/cards.normalized.json" },
  { input: "private-card-data/imperium_nations_private.csv", output: "generated-private/nations.normalized.json" },
  { input: "private-card-data/imperium_nation_rulesets_private.csv", output: "generated-private/nation-rulesets.normalized.json" },
  { input: "private-card-data/imperium_nation_strategy_private.csv", output: "generated-private/nation-strategy.normalized.json" },
  { input: "private-card-data/imperium_bot_state_tables_private.csv", output: "generated-private/bot-state-tables.normalized.json" },
  { input: "private-card-data/imperium_bot_trade_routes_private.csv", output: "generated-private/bot-trade-routes-tables.normalized.json" }
];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const root = path.resolve(arg("--root") ?? ".");
const missing = sources.filter((source) => !fs.existsSync(path.join(root, source.input)));

if (missing.length > 0) {
  process.stderr.write("Missing private import sources:\n");
  for (const source of missing) process.stderr.write(`- ${source.input}\n`);
  process.exit(1);
}

process.stdout.write("Private import preflight: ok\n");
for (const source of sources) {
  process.stdout.write(`- ${path.basename(source.input)} -> ${source.output}\n`);
}
