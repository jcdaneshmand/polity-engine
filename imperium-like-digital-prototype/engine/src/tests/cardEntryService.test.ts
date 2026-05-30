import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commonsBatchProfiles } from "../../../tools/card-entry/batchProfiles";
import { applyVariableVpDraftDetails, createBlankCardDraft, getCardEntryShortcutAction, toggleDraftSuitIcon } from "../../../tools/card-entry/cardDraft";
import { createCardEntryService } from "../../../tools/card-entry/cardEntryService";

const fixtureRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

function makeService() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "card-entry-service-"));
  fs.mkdirSync(path.join(root, "private-card-data"), { recursive: true });
  fs.copyFileSync(
    path.join(fixtureRoot, "private-card-data/card-data-template.csv"),
    path.join(root, "private-card-data/card-data-template.csv")
  );
  return createCardEntryService({ root });
}

describe("card entry service", () => {
  it("returns profiles and creates blank drafts", () => {
    const service = makeService();
    const session = service.getSession();
    expect(session.profiles.map((profile) => profile.id)).toContain("commons-classics");
    expect(session.draft.cardId).toBe("");
  });

  it("saves valid rows and reports validation warnings", () => {
    const service = makeService();
    const draft = {
      ...createBlankCardDraft(commonsBatchProfiles[0]),
      cardId: "classics_a",
      privateName: "Private A",
      publicPlaceholderName: "Placeholder A",
      suit: "region" as const,
      cardType: "action" as const,
      startingLocation: "market" as const,
      playerCountRequirement: "2+" as const,
      vpMode: "none" as const,
      rawEffectTextPrivate: "private text",
      effectOpsJson: ""
    };

    const result = service.saveDraft(draft);

    expect(result.ok).toBe(true);
    expect(result.report.counts.rows).toBe(1);
    expect(result.report.counts.warnings).toBeGreaterThan(0);
    expect(service.getSession().rows[0].card_id).toBe("classics_a");
  });

  it("blocks invalid rows without writing them", () => {
    const service = makeService();
    const draft = { ...createBlankCardDraft(commonsBatchProfiles[0]), cardId: "", publicPlaceholderName: "" };

    const result = service.saveDraft(draft);

    expect(result.ok).toBe(false);
    expect(result.report.counts.fatal).toBeGreaterThan(0);
    expect(service.getSession().rows).toHaveLength(0);
  });

  it("toggles suit icons as a stable pipe-delimited list", () => {
    const draft = createBlankCardDraft(commonsBatchProfiles[0]);
    const withIcons = toggleDraftSuitIcon(toggleDraftSuitIcon(draft, "civilized"), "uncivilized");
    const withoutDuplicate = toggleDraftSuitIcon(withIcons, "civilized");

    expect(withIcons.suitIcons).toBe("civilized|uncivilized");
    expect(withoutDuplicate.suitIcons).toBe("uncivilized");
  });

  it("applies variable VP builder details to compatible draft fields", () => {
    const draft = createBlankCardDraft(commonsBatchProfiles[0]);
    const updated = applyVariableVpDraftDetails(draft, {
      formula: "per_resource",
      amountEach: "1",
      target: "goods",
      cap: "5",
      note: "Score goods in history."
    });

    expect(updated.vpMode).toBe("variable");
    expect(updated.vpValue).toBe("1");
    expect(updated.tags).toBe("vp_variable|vp_per_resource");
    expect(updated.notes).toContain("[Variable VP] 1 VP per_resource goods; cap 5. Score goods in history.");
  });

  it("maps card entry keyboard shortcuts to actions", () => {
    expect(getCardEntryShortcutAction({ key: "Enter", ctrlKey: true })).toBe("save_card");
    expect(getCardEntryShortcutAction({ key: "s", altKey: true })).toBe("focus_suit");
    expect(getCardEntryShortcutAction({ key: "v", altKey: true })).toBe("apply_variable_vp");
    expect(getCardEntryShortcutAction({ key: "3", altKey: true })).toEqual({ type: "toggle_nation_role", index: 2 });
    expect(getCardEntryShortcutAction({ key: "Enter" })).toBeNull();
  });
});
