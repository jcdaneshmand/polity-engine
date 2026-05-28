import fs from "node:fs";
import path from "node:path";
import type { NationRuleset } from "./nationRulesetTypes";
import { assertValidNationRuleset } from "./nationRulesetValidation";

const placeholder: NationRuleset[] = [
  { nationId:"test_nation_sun_coast", displayName:"Sun Coast Ruleset", rulesetTags:["default_nation_deck"], requiredExpansions:[], setupOverrides:[], zoneOverrides:[], stateOverrides:[], reshuffleOverrides:[], cleanupOverrides:[], solsticeOverrides:[], scoringOverrides:[], collapseOverrides:[], botOverrides:[], shortGameOverrides:[], hookRules:[], publicSummary:"Default placeholder ruleset.", implemented:true, tested:false },
];

export function loadNationRulesets(opts?: {usePrivate?: boolean; privatePath?: string}): Record<string, NationRuleset> {
  placeholder.forEach(assertValidNationRuleset);
  const out = Object.fromEntries(placeholder.map((r) => [r.nationId, r]));
  if (!opts?.usePrivate) return out;
  const p = opts.privatePath ?? path.resolve(process.cwd(), "generated-private/nation-rulesets.normalized.json");
  if (!fs.existsSync(p)) return out;
  for (const r of JSON.parse(fs.readFileSync(p, "utf8")) as NationRuleset[]) {
    assertValidNationRuleset(r);
    out[r.nationId] = r;
  }
  return out;
}
