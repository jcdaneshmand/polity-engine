import fs from "node:fs";
import { parseCsvFile } from "./csvParser";
import { validatePrivateNationsRows } from "./validatePrivateNations";

const input = process.argv[process.argv.indexOf("--input") + 1];
const cards = process.argv[process.argv.indexOf("--cards") + 1];
const allow = (process.argv[process.argv.indexOf("--allow-missing-card-refs") + 1] || "false") === "true";

if (!input || !cards) throw new Error("Usage: --input <csv> --cards <json>");

const known = new Set<string>((JSON.parse(fs.readFileSync(cards, "utf8")) as Array<{ id: string }>).map((card) => card.id));
const report = validatePrivateNationsRows(parseCsvFile(input), known, allow);

console.log(`rows=${report.counts.rows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
if (report.counts.fatal > 0) process.exitCode = 1;
