import fs from "node:fs";
import Papa from "papaparse";

export function parseCsvFile(path:string): Array<Record<string,string>> {
  const raw = fs.readFileSync(path, "utf8");
  const parsed = Papa.parse<Record<string,string>>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(`CSV parse error: ${parsed.errors[0].message}`);
  return parsed.data;
}
