import { parseCsvFile } from "./csvParser";
import type { NationRulesetImportReport, PrivateNationRulesetCsvRow } from "./nationRulesetCsvTypes";

export function validatePrivateNationRulesetsRows(rows: PrivateNationRulesetCsvRow[]): NationRulesetImportReport {
  const errors: NationRulesetImportReport["errors"] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    const row=i+2;
    if (!r.nation_id?.trim()) errors.push({level:"fatal",row,field:"nation_id",message:"nation_id is required"});
    if (!r.public_placeholder_name?.trim()) errors.push({level:"fatal",row,field:"public_placeholder_name",message:"public_placeholder_name is required"});
    if (seen.has(r.nation_id)) errors.push({level:"fatal",row,field:"nation_id",message:"duplicate nation_id"});
    seen.add(r.nation_id);
    if ((r.implemented||"").toLowerCase()==="true" && (r.tested||"").toLowerCase()!=="true") errors.push({level:"warning",row,field:"tested",message:"implemented=true but tested=false"});
  });
  return { errors, counts:{ rows:rows.length, fatal:errors.filter(e=>e.level==='fatal').length, warnings:errors.filter(e=>e.level==='warning').length } };
}
if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc,v,i,a)=>v.startsWith("--")?[...acc,[v.slice(2),a[i+1]]]:acc,[] as any));
  const input = (args.input as string) || "private-card-data/nation-ruleset-template.csv";
  const rows = parseCsvFile(input) as PrivateNationRulesetCsvRow[];
  const report = validatePrivateNationRulesetsRows(rows);
  console.log(JSON.stringify(report, null, 2));
  if (report.counts.fatal > 0) process.exitCode = 1;
}
