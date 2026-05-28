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
