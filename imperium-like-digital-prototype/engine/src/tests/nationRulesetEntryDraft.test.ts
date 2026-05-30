import { describe, expect, it } from "vitest";
import {
  appendOrReplaceNationRulesetRow,
  createBlankNationRulesetDraft,
  nationRulesetDraftToCsvRow,
  nationRulesetTagOptions,
  nationRulesetRowToDraft,
  toggleNationRulesetTag
} from "../../../tools/card-entry/nationRulesetDraft";

describe("nation ruleset entry drafts", () => {
  it("offers programmed ruleset tags for the nation builder", () => {
    expect(nationRulesetTagOptions).toContain("default_nation_deck");
    expect(nationRulesetTagOptions).toContain("trade_routes_required");
    expect(nationRulesetTagOptions).toContain("no_history");
  });

  it("creates a blank ruleset draft with array JSON defaults", () => {
    const draft = createBlankNationRulesetDraft("romans");

    expect(draft.nationId).toBe("romans");
    expect(draft.rulesetTags).toEqual(["default_nation_deck"]);
    expect(draft.setupOverridesJson).toBe("[]");
    expect(draft.hookRulesJson).toBe("[]");
  });

  it("round-trips selected tags through ruleset CSV rows", () => {
    const row = nationRulesetDraftToCsvRow({
      ...createBlankNationRulesetDraft("romans"),
      publicPlaceholderName: "Roman Rules",
      rulesetTags: ["default_nation_deck", "fame_focus"]
    });

    expect(row.ruleset_tags).toBe("default_nation_deck|fame_focus");
    expect(nationRulesetRowToDraft(row).rulesetTags).toEqual(["default_nation_deck", "fame_focus"]);
  });

  it("toggles ruleset tags without duplicating selections", () => {
    expect(toggleNationRulesetTag(["default_nation_deck"], "fame_focus")).toEqual(["default_nation_deck", "fame_focus"]);
    expect(toggleNationRulesetTag(["default_nation_deck", "fame_focus"], "fame_focus")).toEqual(["default_nation_deck"]);
  });

  it("replaces existing ruleset rows by nation_id", () => {
    const original = nationRulesetDraftToCsvRow({ ...createBlankNationRulesetDraft("romans"), publicPlaceholderName: "Old" });
    const replacement = nationRulesetDraftToCsvRow({ ...createBlankNationRulesetDraft("romans"), publicPlaceholderName: "New" });

    expect(appendOrReplaceNationRulesetRow([original], replacement)).toEqual([replacement]);
  });
});
