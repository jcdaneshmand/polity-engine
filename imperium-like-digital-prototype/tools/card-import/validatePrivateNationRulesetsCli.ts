import { parseCsvFile } from "./csvParser";
import type { PrivateNationRulesetCsvRow } from "./nationRulesetCsvTypes";
import { validatePrivateNationRulesetsRows } from "./validatePrivateNationRulesets";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, value, index, values) => (
  value.startsWith("--") ? [...acc, [value.slice(2), values[index + 1]]] : acc
), [] as Array<[string, string | undefined]>));
const input = args.input || "private-card-data/nation-ruleset-template.csv";
const rows = parseCsvFile(input) as PrivateNationRulesetCsvRow[];
const report = validatePrivateNationRulesetsRows(rows);

console.log(JSON.stringify(report, null, 2));
if (report.counts.fatal > 0) process.exitCode = 1;
