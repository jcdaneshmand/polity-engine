import { parseCsvFile } from "./csvParser";
import type { PrivateNationStrategyCsvRow } from "./nationStrategyCsvTypes";
import { validatePrivateNationStrategyRows } from "./validatePrivateNationStrategy";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, value, index, all) =>
  value.startsWith("--") ? [...acc, [value.slice(2), all[index + 1]]] : acc, [] as any
));
const input = (args.input as string) || "private-card-data/nation-strategy-template.csv";
const rows = parseCsvFile(input) as PrivateNationStrategyCsvRow[];
const report = validatePrivateNationStrategyRows(rows);
console.log(JSON.stringify(report, null, 2));
if (report.counts.fatal > 0) process.exitCode = 1;
