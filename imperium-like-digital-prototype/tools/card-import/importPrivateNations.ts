import fs from "node:fs";
import { parseCsvFile } from "./csvParser";
import { validatePrivateNationsRows } from "./validatePrivateNations";
import { normalizeNation } from "./normalizeNation";

const arg=(n:string)=>{const i=process.argv.indexOf(n);return i>=0?process.argv[i+1]:undefined;};
const cards=arg("--cards")||"generated-private/cards.normalized.json";
const input=arg("--input")||"private-card-data/imperium_nations_private.csv";
const output=arg("--output")||"generated-private/nations.normalized.json";
const reportPath=arg("--report")||"generated-private/nation-import-report.json";
const allow=(arg("--allow-missing-card-refs")||"false")==="true";

const cardDb = fs.existsSync(cards) ? JSON.parse(fs.readFileSync(cards,"utf8")) : [];
const known = new Set(cardDb.map((c:any)=>c.id));
const rows=parseCsvFile(input);
const report=validatePrivateNationsRows(rows, known, allow);
fs.writeFileSync(reportPath, JSON.stringify(report,null,2));
if(report.counts.fatal===0){ fs.writeFileSync(output, JSON.stringify(rows.map(normalizeNation),null,2)); }
console.log(`Nation import: rows=${report.counts.rows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
if(report.counts.fatal>0) process.exitCode=1;
