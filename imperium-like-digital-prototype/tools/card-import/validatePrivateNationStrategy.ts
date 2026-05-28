import { parseCsvFile } from "./csvParser";
import type { NationStrategyImportReport, PrivateNationStrategyCsvRow } from "./nationStrategyCsvTypes";
const aggr = new Set(["peaceful","moderate","aggressive","ruthless","unknown",""]);
export function validatePrivateNationStrategyRows(rows: PrivateNationStrategyCsvRow[]): NationStrategyImportReport {
  const errors: NationStrategyImportReport["errors"] = [];
  rows.forEach((r, i) => {
    const row=i+2;
    if (!r.nation_id?.trim()) errors.push({level:"fatal",row,field:"nation_id",message:"nation_id is required"});
    if (!r.public_placeholder_name?.trim()) errors.push({level:"fatal",row,field:"public_placeholder_name",message:"public_placeholder_name is required"});
    if (r.complexity?.trim() && !(Number(r.complexity)>=1 && Number(r.complexity)<=5)) errors.push({level:"fatal",row,field:"complexity",message:"complexity must be 1-5"});
    if (!aggr.has((r.aggression||"").trim())) errors.push({level:"fatal",row,field:"aggression",message:"invalid aggression enum"});
  });
  return { errors, counts:{ rows:rows.length, fatal:errors.filter(e=>e.level==='fatal').length, warnings:errors.filter(e=>e.level==='warning').length } };
}


if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).reduce((acc,v,i,a)=>v.startsWith("--")?[...acc,[v.slice(2),a[i+1]]]:acc,[] as any));
  const input = (args.input as string) || "private-card-data/nation-strategy-template.csv";
  const rows = parseCsvFile(input) as PrivateNationStrategyCsvRow[];
  const report = validatePrivateNationStrategyRows(rows);
  console.log(JSON.stringify(report, null, 2));
  if (report.counts.fatal > 0) process.exitCode = 1;
}
