import { describe, expect, it } from "vitest";
import {
  appendOrReplaceNationRow,
  appendCardIdToNationDraftRoles,
  createBlankNationDraft,
  nationDraftToCsvRow,
  nationRowToDraft,
  sortNationRowsByName
} from "../../../tools/card-entry/nationDraft";

describe("nation entry drafts", () => {
  it("creates a blank nation definition draft with import-safe defaults", () => {
    const draft = createBlankNationDraft("romans");

    expect(draft.nationId).toBe("romans");
    expect(draft.specialSetupJson).toBe("[]");
    expect(draft.passiveRulesJson).toBe("[]");
    expect(draft.actionTokensBase).toBe("3");
    expect(draft.exhaustTokensBase).toBe("5");
    expect(draft.implemented).toBe("false");
    expect(draft.tested).toBe("false");
  });

  it("round-trips nation draft fields to the nation CSV schema", () => {
    const row = nationDraftToCsvRow({
      ...createBlankNationDraft("romans"),
      privateName: "Private Romans",
      publicPlaceholderName: "Placeholder Romans",
      nationDeckCardIds: "romans_card_a|romans_card_b"
    });

    expect(row).toMatchObject({
      nation_id: "romans",
      nation_name_private: "Private Romans",
      public_placeholder_name: "Placeholder Romans",
      nation_deck_card_ids: "romans_card_a|romans_card_b"
    });
    expect(nationRowToDraft(row).nationDeckCardIds).toBe("romans_card_a|romans_card_b");
  });

  it("replaces existing nation rows by nation_id", () => {
    const original = nationDraftToCsvRow({ ...createBlankNationDraft("romans"), publicPlaceholderName: "Old Romans" });
    const replacement = nationDraftToCsvRow({ ...createBlankNationDraft("romans"), publicPlaceholderName: "New Romans" });

    expect(appendOrReplaceNationRow([original], replacement)).toEqual([replacement]);
  });

  it("sorts loaded nation rows by display label for dropdowns", () => {
    const rows = [
      nationDraftToCsvRow({ ...createBlankNationDraft("zeta"), publicPlaceholderName: "Zeta" }),
      nationDraftToCsvRow({ ...createBlankNationDraft("alpha"), publicPlaceholderName: "Alpha" })
    ];

    expect(sortNationRowsByName(rows).map((row) => row.nation_id)).toEqual(["alpha", "zeta"]);
  });

  it("adds a saved card id to selected nation definition roles without duplicates", () => {
    const draft = appendCardIdToNationDraftRoles(createBlankNationDraft("romans"), "romans_card_a", ["power", "state", "development"]);
    const duplicate = appendCardIdToNationDraftRoles(draft, "romans_card_a", ["power", "state", "development"]);

    expect(duplicate.powerCardIds).toBe("romans_card_a");
    expect(duplicate.stateCardIds).toBe("romans_card_a");
    expect(duplicate.developmentCardIds).toBe("romans_card_a");
  });

  it("sets singleton nation definition roles from a saved card id", () => {
    const draft = appendCardIdToNationDraftRoles(createBlankNationDraft("romans"), "romans_accession", ["accession"]);

    expect(draft.accessionCardId).toBe("romans_accession");
  });
});
