import fs from "node:fs";
import path from "node:path";
import { parseCsvFile } from "./csvParser";
import { normalizeBotStateTables } from "./normalizeBotStateTable";
import type { PrivateBotStateTableCsvRow } from "./botStateTableCsvTypes";
import { validatePrivateBotStateTableRows } from "./validatePrivateBotStateTables";

const arg = (name: string) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const input = arg("--input") || "private-card-data/bot-state-table-template.csv";
const output = arg("--output") || "generated-private/bot-state-tables.normalized.json";
const reportPath = arg("--report") || "generated-private/bot-state-table-import-report.json";
const rows = parseCsvFile(input) as PrivateBotStateTableCsvRow[];
const report = validatePrivateBotStateTableRows(rows);

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
if (report.counts.fatal === 0) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(normalizeBotStateTables(rows), null, 2));
}

console.log(`bot state tables rows=${report.counts.rows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
if (report.counts.fatal > 0) process.exitCode = 1;
