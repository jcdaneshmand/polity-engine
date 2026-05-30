import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { commonsBatchProfiles } from "../../../tools/card-entry/batchProfiles";
import { createBlankCardDraft } from "../../../tools/card-entry/cardDraft";
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
      suit: "region",
      cardType: "action",
      startingLocation: "market",
      playerCountRequirement: "2+",
      vpMode: "none",
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
});
