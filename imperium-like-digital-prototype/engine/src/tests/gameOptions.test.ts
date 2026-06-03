import { describe, expect, it } from "vitest";
import { validateGameOptions } from "../options/optionValidation";

describe("game options", () => {
  it("multiplayer rejects playerCount 1", () => expect(validateGameOptions({ playerCount:1, mode:"multiplayer", enabledExpansions:[], enabledVariants:[] }).issues.some(i=>i.level==="fatal")).toBe(true));
  it("solo rejects >1", () => expect(validateGameOptions({ playerCount:2, mode:"solo", enabledExpansions:[], enabledVariants:[], soloDifficulty:"chieftain" }).issues.some(i=>i.level==="fatal")).toBe(true));
  it("practice rejects >1", () => expect(validateGameOptions({ playerCount:2, mode:"practice", enabledExpansions:[], enabledVariants:[] }).issues.some(i=>i.level==="fatal")).toBe(true));
  it("soloDifficulty outside solo warns", () => expect(validateGameOptions({ playerCount:2, mode:"multiplayer", enabledExpansions:[], enabledVariants:[], soloDifficulty:"chieftain" }).issues.some(i=>i.level==="warning")).toBe(true));
  it("rejects unknown soloDifficulty values", () => expect(validateGameOptions({ playerCount:1, mode:"solo", enabledExpansions:[], enabledVariants:[], soloDifficulty:"sovereign_plus" as any }).issues.some(i=>i.level==="fatal" && i.message.includes("soloDifficulty"))).toBe(true));
  it("supreme ruler campaign normalizes solo difficulty to Supreme Ruler", () => {
    const result = validateGameOptions({ playerCount:1, mode:"solo", enabledExpansions:[], enabledVariants:[], soloDifficulty:"chieftain", campaignMode:"supreme_ruler" } as any);
    expect(result.options.soloDifficulty).toBe("supreme_ruler");
    expect(result.issues.some((i) => i.level === "warning" && i.message.includes("campaignMode"))).toBe(true);
  });
});
