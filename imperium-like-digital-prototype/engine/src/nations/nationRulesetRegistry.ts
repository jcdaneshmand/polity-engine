import type { NationDefinition } from "./nationSchema";
import type { NationRuleset } from "./nationRulesetTypes";
import type { GameOptions } from "../options/gameOptions";

export function getNationRuleset(db: Record<string, NationRuleset>, nationId: string): NationRuleset | undefined { return db[nationId]; }

export function validateNationRulesetCompatibility(nation: NationDefinition, ruleset: NationRuleset, options: GameOptions): string[] {
  const errs: string[] = [];
  if (ruleset.nationId !== nation.id) errs.push(`Ruleset ${ruleset.nationId} does not match nation ${nation.id}`);
  for (const ex of ruleset.requiredExpansions) if (!options.enabledExpansions.includes(ex)) errs.push(`Ruleset requires disabled expansion ${ex}`);
  for (const ex of ruleset.excludedExpansions ?? []) if (options.enabledExpansions.includes(ex)) errs.push(`Ruleset excluded by enabled expansion ${ex}`);
  for (const v of ruleset.requiredVariants ?? []) if (!options.enabledVariants.includes(v)) errs.push(`Ruleset requires disabled variant ${v}`);
  for (const v of ruleset.excludedVariants ?? []) if (options.enabledVariants.includes(v)) errs.push(`Ruleset excluded by enabled variant ${v}`);
  if (options.enabledVariants.includes("short_game") && ruleset.shortGameOverrides.some((ov) => ov.op === "excluded_from_short_game")) errs.push("Ruleset excluded by enabled variant short_game");
  if (ruleset.disallowedModes?.includes(options.mode)) errs.push(`Ruleset disallows mode ${options.mode}`);
  return errs;
}
