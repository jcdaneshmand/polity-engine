import fs from "node:fs";
import { parseCsvFile } from "./csvParser";
import { normalizeCard } from "./normalizeCard";
import { validatePrivateCardsRows } from "./validatePrivateCards";

const arg=(name:string)=>{const i=process.argv.indexOf(name);return i>=0?process.argv[i+1]:undefined;};
const printReportPath=arg("--print-report");
if(printReportPath){ if(fs.existsSync(printReportPath)) console.log(fs.readFileSync(printReportPath,"utf8")); else console.log("No report found."); process.exit(0); }

const input=arg("--input")||"private-card-data/imperium_cards_private.csv";
const output=arg("--output")||"generated-private/cards.normalized.json";
const reportPath=arg("--report")||"generated-private/card-import-report.json";

const rows=parseCsvFile(input);
const report=validatePrivateCardsRows(rows);
fs.writeFileSync(reportPath, JSON.stringify(report,null,2));
if(report.counts.fatal===0){ const normalized=rows.map(normalizeCard); fs.writeFileSync(output, JSON.stringify(normalized,null,2)); }
console.log(`Card import: rows=${report.counts.rows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
if(report.counts.fatal>0) process.exitCode=1;
