import type { NationStrategyProfile } from "./nationStrategyTypes";
import { getNodeFs, resolveFromCwd } from "../local/nodeBuiltins";

const placeholder: NationStrategyProfile[] = [
  { nationId:"test_nation_sun_coast", displayName:"Sun Coast Strategy", complexity:2, aggression:"moderate", publicPlaceholderSummary:"Balanced placeholder nation for demos.", implemented:true, tested:false },
];

export function loadNationStrategyProfiles(opts?: {usePrivate?: boolean; privatePath?: string}): Record<string, NationStrategyProfile> {
  const out = Object.fromEntries(placeholder.map((r) => [r.nationId, r]));
  if (!opts?.usePrivate) return out;
  const fs = getNodeFs();
  if (!fs) return out;
  const p = opts.privatePath ?? resolveFromCwd("generated-private/nation-strategy.normalized.json");
  if (!fs.existsSync(p)) return out;
  for (const r of JSON.parse(fs.readFileSync(p, "utf8")) as NationStrategyProfile[]) out[r.nationId] = r;
  return out;
}
