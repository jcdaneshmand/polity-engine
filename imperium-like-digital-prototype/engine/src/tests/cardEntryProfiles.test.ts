import { describe, expect, it } from "vitest";
import { commonsBatchProfiles, createNationBatchProfile } from "../../../tools/card-entry/batchProfiles";
import { createBlankCardDraft, duplicateCardDraft, draftToCsvRow } from "../../../tools/card-entry/cardDraft";

describe("card entry batch profiles", () => {
  it("defines the commons batches in the transcription order", () => {
    expect(commonsBatchProfiles.map((profile) => profile.id)).toEqual([
      "commons-classics",
      "commons-legends",
      "commons-horizons",
      "commons-trade-routes",
      "commons-replacements"
    ]);
  });

  it("creates commons drafts with safe identity-pass defaults", () => {
    const draft = createBlankCardDraft(commonsBatchProfiles[0]);
    expect(draft.ownership).toBe("commons");
    expect(draft.setOrNation).toBe("classics");
    expect(draft.commonsSetId).toBe("classics");
    expect(draft.implemented).toBe("false");
    expect(draft.tested).toBe("false");
    expect(draft.effectOpsJson).toBe("");
  });

  it("creates Trade Routes drafts with expansion defaults", () => {
    const draft = createBlankCardDraft(commonsBatchProfiles[3]);
    expect(draft.setOrNation).toBe("trade_routes");
    expect(draft.commonsSetId).toBe("horizons");
    expect(draft.isTradeRouteExpansion).toBe("true");
    expect(draft.requiredExpansions).toBe("trade_routes");
  });

  it("creates nation profiles with the selected nation as set_or_nation", () => {
    const profile = createNationBatchProfile("romans");
    const row = draftToCsvRow(createBlankCardDraft(profile));
    expect(row.ownership).toBe("nation");
    expect(row.set_or_nation).toBe("romans");
    expect(row.commons_set_id).toBe("");
  });

  it("duplicates safe structure without private text by default", () => {
    const original = {
      ...createBlankCardDraft(commonsBatchProfiles[0]),
      cardId: "card_a",
      privateName: "Private A",
      publicPlaceholderName: "Placeholder A",
      rawEffectTextPrivate: "private text",
      implemented: "true",
      tested: "true",
      notes: "private note"
    };

    const duplicate = duplicateCardDraft(original, { includePrivateText: false });

    expect(duplicate.cardId).toBe("");
    expect(duplicate.privateName).toBe("");
    expect(duplicate.publicPlaceholderName).toBe("");
    expect(duplicate.rawEffectTextPrivate).toBe("");
    expect(duplicate.implemented).toBe("false");
    expect(duplicate.tested).toBe("false");
    expect(duplicate.notes).toBe("private note");
    expect(duplicate.suit).toBe(original.suit);
  });

  it("duplicates full drafts when requested", () => {
    const original = {
      ...createBlankCardDraft(commonsBatchProfiles[0]),
      rawEffectTextPrivate: "same variant text"
    };

    const duplicate = duplicateCardDraft(original, { includePrivateText: true });

    expect(duplicate.rawEffectTextPrivate).toBe("same variant text");
  });
});
