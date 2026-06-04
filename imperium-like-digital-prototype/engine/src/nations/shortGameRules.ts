import type { NationRuleset } from "./nationRulesetTypes";

export function skipsShortGameAccessionDevelopmentExile(ruleset?: Pick<NationRuleset, "shortGameOverrides">): boolean {
  return (ruleset?.shortGameOverrides ?? []).some((override) =>
    override.op === "skip_accession_development_exile"
      || override.op === "garrison_development_and_add_nation_to_starting_deck"
      || override.op === "move_one_advanced_nation_card_to_side_area"
  );
}
