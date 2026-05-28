import fs from "node:fs";
import { parseCsvFile } from "./csvParser";
import { normalizeNationRuleset } from "./normalizeNationRuleset";
import { validatePrivateNationRulesetsRows } from "./validatePrivateNationRulesets";
import { validateNationRuleset } from "../../engine/src/nations/nationRulesetValidation";
const args = Object.fromEntries(process.argv.slice(2).reduce((acc,v,i,a)=>v.startsWith('--')?[...acc,[v.slice(2),a[i+1]]]:acc,[] as any));
const rows = parseCsvFile((args.input as string) || "private-card-data/nation-ruleset-template.csv") as any[];
const report = validatePrivateNationRulesetsRows(rows);
fs.writeFileSync((args.report as string)||"generated-private/nation-ruleset-import-report.json", JSON.stringify(report,null,2));
if (report.counts.fatal===0) {
  const normalized = rows.map(normalizeNationRuleset);
  const validationErrors = normalized.flatMap((ruleset) =>
    validateNationRuleset(ruleset).map((issue) => ({
      level: "fatal" as const,
      row: -1,
      field: issue.field,
      message: `[${issue.nationId}] ${issue.reason}`,
    })),
  );
  report.errors.push(...validationErrors);
  report.counts.fatal = report.errors.filter((e) => e.level === "fatal").length;
  report.counts.warnings = report.errors.filter((e) => e.level === "warning").length;
  if (report.counts.fatal===0) fs.writeFileSync((args.output as string)||"generated-private/nation-rulesets.normalized.json", JSON.stringify(normalized,null,2));
}
console.log(`rulesets rows=${report.counts.rows} fatal=${report.counts.fatal} warnings=${report.counts.warnings}`);
if (report.counts.fatal>0) process.exitCode = 1;
