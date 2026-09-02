import { describe, expect, it } from "vitest";
import { validateGameOptions } from "../options/optionValidation";

describe("custom Commons options", () => {
  it("normalizes duplicate and blank custom Commons ids", () => {
    const report = validateGameOptions({
      playerCount: 2,
      mode: "multiplayer",
      enabledExpansions: [],
      enabledVariants: [],
      commonsSetId: "custom",
      customCommonsCardIds: ["custom_a", " ", "custom_a", "custom_b"]
    });

    expect(report.options.customCommonsCardIds).toEqual(["custom_a", "custom_b"]);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "warning", message: "Duplicate or blank custom Commons card ids were normalized." })
    ]));
  });

  it("warns when custom Commons ids are supplied for a standard set", () => {
    const report = validateGameOptions({
      playerCount: 2,
      mode: "multiplayer",
      enabledExpansions: [],
      enabledVariants: [],
      commonsSetId: "classics",
      customCommonsCardIds: ["custom_a"]
    });

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ level: "warning", message: "customCommonsCardIds ignored unless commonsSetId is custom." })
    ]));
  });
});
