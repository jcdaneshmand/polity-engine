import type { NationRuleset } from "./nationRulesetTypes";
import { assertValidNationRuleset } from "./nationRulesetValidation";
import { getNodeFs, resolveFromCwd } from "../local/nodeBuiltins";

const placeholder: NationRuleset[] = [
  { nationId:"test_nation_sun_coast", displayName:"Sun Coast Ruleset", rulesetTags:["default_nation_deck"], requiredExpansions:[], setupOverrides:[], zoneOverrides:[], stateOverrides:[], reshuffleOverrides:[], cleanupOverrides:[], solsticeOverrides:[], scoringOverrides:[], collapseOverrides:[], botOverrides:[], shortGameOverrides:[], hookRules:[], publicSummary:"Default placeholder ruleset.", implemented:true, tested:false },
];

export function loadNationRulesets(opts?: {usePrivate?: boolean; privatePath?: string}): Record<string, NationRuleset> {
  placeholder.forEach(assertValidNationRuleset);
  const out = Object.fromEntries(placeholder.map((r) => [r.nationId, r]));
  if (!opts?.usePrivate) return out;
  const fs = getNodeFs();
  if (!fs) return out;
  const p = opts.privatePath ?? resolveFromCwd("generated-private/nation-rulesets.normalized.json");
  if (!fs.existsSync(p)) return out;
  for (const r of JSON.parse(fs.readFileSync(p, "utf8")) as NationRuleset[]) {
    assertValidNationRuleset(r);
    out[r.nationId] = r;
  }
  return out;
}
