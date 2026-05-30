import { describe, expect, it } from "vitest";
import {
  appendOrReplaceNationRow,
  appendCardIdToNationDraftRoles,
  createBlankNationDraft,
  getNextNumericNationId,
  insertNationJsonTemplate,
  nationDraftToCsvRow,
  nationRowToDraft,
  summarizeNationDeckProgress,
  summarizeNationRowsDeckProgress,
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

  it("inserts special setup and passive rule JSON templates into array fields", () => {
    const withSetup = insertNationJsonTemplate(createBlankNationDraft("romans"), "specialSetupJson", {
      op: "gain_resource",
      resource: "materials",
      count: 2
    });
    const withPassive = insertNationJsonTemplate(withSetup, "passiveRulesJson", {
      trigger: "on_develop",
      effects: [{ op: "gain_resource", resource: "goods", amount: 1 }]
    });

    expect(JSON.parse(withPassive.specialSetupJson)).toEqual([{ op: "gain_resource", resource: "materials", count: 2 }]);
    expect(JSON.parse(withPassive.passiveRulesJson)).toEqual([
      { trigger: "on_develop", effects: [{ op: "gain_resource", resource: "goods", amount: 1 }] }
    ]);
  });

  it("summarizes deck progress for the current nation draft", () => {
    const summary = summarizeNationDeckProgress({
      ...createBlankNationDraft("romans"),
      powerCardIds: "power_a",
      stateCardIds: "state_a|state_b",
      startingDeckCardIds: "start_a|start_b",
      nationDeckCardIds: "nation_a",
      accessionCardId: "accession_a",
      developmentCardIds: "dev_a|dev_b|dev_c"
    });

    expect(summary.slots.map((slot) => [slot.id, slot.count])).toEqual([
      ["power", 1],
      ["state", 2],
      ["starting", 2],
      ["nation", 1],
      ["accession", 1],
      ["development", 3]
    ]);
  });

  it("summarizes loaded nation rows by deck counts", () => {
    const rows = [
      nationDraftToCsvRow({ ...createBlankNationDraft("romans"), privateName: "Actual Romans", publicPlaceholderName: "Romans", startingDeckCardIds: "a|b", nationDeckCardIds: "c" }),
      nationDraftToCsvRow({ ...createBlankNationDraft("celts"), privateName: "Actual Celts", publicPlaceholderName: "Celts", developmentCardIds: "d|e" })
    ];

    expect(summarizeNationRowsDeckProgress(rows).map((summary) => summary.label)).toEqual(["Actual Celts", "Actual Romans"]);
    expect(summarizeNationRowsDeckProgress(rows).find((summary) => summary.nationId === "romans")?.totalCards).toBe(3);
  });

  it("finds the next numeric nation id while ignoring legacy non-numeric ids", () => {
    expect(getNextNumericNationId([
      { nation_id: "1" } as any,
      { nation_id: "legacy_nation" } as any,
      { nation_id: "004" } as any
    ])).toBe("5");
    expect(getNextNumericNationId([])).toBe("1");
  });
});
