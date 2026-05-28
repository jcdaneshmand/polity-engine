import type { NationDefinition } from "./nationSchema";
import type { NationRuleset } from "./nationRulesetTypes";
import type { GameOptions } from "../options/gameOptions";

export function getNationRuleset(db: Record<string, NationRuleset>, nationId: string): NationRuleset | undefined { return db[nationId]; }

export function validateNationRulesetCompatibility(nation: NationDefinition, ruleset: NationRuleset, options: GameOptions): string[] {
  const errs: string[] = [];
  if (ruleset.nationId !== nation.id) errs.push(`Ruleset ${ruleset.nationId} does not match nation ${nation.id}`);
  for (const ex of ruleset.requiredExpansions) if (!options.enabledExpansions.includes(ex)) errs.push(`Ruleset requires disabled expansion ${ex}`);
  for (const ex of ruleset.excludedExpansions ?? []) if (options.enabledExpansions.includes(ex)) errs.push(`Ruleset excluded by enabled expansion ${ex}`);
  if (ruleset.disallowedModes?.includes(options.mode)) errs.push(`Ruleset disallows mode ${options.mode}`);
  return errs;
}
