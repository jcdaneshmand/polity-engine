import fs from "node:fs";
import path from "node:path";
import type { NationStrategyProfile } from "./nationStrategyTypes";

const placeholder: NationStrategyProfile[] = [
  { nationId:"test_nation_sun_coast", displayName:"Sun Coast Strategy", complexity:2, aggression:"moderate", publicPlaceholderSummary:"Balanced placeholder nation for demos.", implemented:true, tested:false },
];

export function loadNationStrategyProfiles(opts?: {usePrivate?: boolean; privatePath?: string}): Record<string, NationStrategyProfile> {
  const out = Object.fromEntries(placeholder.map((r) => [r.nationId, r]));
  if (!opts?.usePrivate) return out;
  const p = opts.privatePath ?? path.resolve(process.cwd(), "generated-private/nation-strategy.normalized.json");
  if (!fs.existsSync(p)) return out;
  for (const r of JSON.parse(fs.readFileSync(p, "utf8")) as NationStrategyProfile[]) out[r.nationId] = r;
  return out;
}
