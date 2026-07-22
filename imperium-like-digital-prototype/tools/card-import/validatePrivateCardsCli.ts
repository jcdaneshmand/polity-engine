import { parseCsvFile } from "./csvParser";
import { validatePrivateCardsRows } from "./validatePrivateCards";

const input = process.argv[process.argv.indexOf("--input") + 1];
if (!input) throw new Error("Usage: --input <csv>");

const report = validatePrivateCardsRows(parseCsvFile(input));
console.log(`rows=${report.counts.rows} valid=${report.counts.validRows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
if (report.counts.fatal > 0) process.exitCode = 1;
