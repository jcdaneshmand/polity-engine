import type { PrivateNationRulesetCsvRow, NationRuleset } from "./nationRulesetCsvTypes";
const arr=(v:string)=>v.split("|").map(x=>x.trim()).filter(Boolean);
const bool=(v:string)=>v.trim().toLowerCase()==="true";
const jarr=(v:string)=>v.trim()?JSON.parse(v):[];
export function normalizeNationRuleset(r: PrivateNationRulesetCsvRow): NationRuleset { return {
  nationId:r.nation_id.trim(), displayName:r.public_placeholder_name.trim(), privateName:r.nation_name_private.trim()||undefined,
  rulesetTags:arr(r.ruleset_tags||"") as any, requiredExpansions:arr(r.required_expansions||"") as any, excludedExpansions:arr(r.excluded_expansions||"") as any,
  allowedModes:arr(r.allowed_modes||"") as any, disallowedModes:arr(r.disallowed_modes||"") as any, requiredVariants:arr(r.required_variants||"") as any, excludedVariants:arr(r.excluded_variants||"") as any,
  setupOverrides:jarr(r.setup_overrides_json||""), zoneOverrides:jarr(r.zone_overrides_json||""), stateOverrides:jarr(r.state_overrides_json||""), reshuffleOverrides:jarr(r.reshuffle_overrides_json||""), cleanupOverrides:jarr(r.cleanup_overrides_json||""), solsticeOverrides:jarr(r.solstice_overrides_json||""), scoringOverrides:jarr(r.scoring_overrides_json||""), collapseOverrides:jarr(r.collapse_overrides_json||""), botOverrides:jarr(r.bot_overrides_json||""), shortGameOverrides:jarr(r.short_game_overrides_json||""), hookRules:jarr(r.hook_rules_json||""),
  publicSummary:r.public_summary?.trim()||undefined, privateNotes:r.private_notes?.trim()||undefined, implemented:bool(r.implemented), tested:bool(r.tested)
}; }
