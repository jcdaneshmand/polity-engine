import { describe, expect, it } from "vitest";
import { validateGameOptions } from "../options/optionValidation";

describe("game options", () => {
  it("multiplayer rejects playerCount 1", () => expect(validateGameOptions({ playerCount:1, mode:"multiplayer", enabledExpansions:[], enabledVariants:[] }).issues.some(i=>i.level==="fatal")).toBe(true));
  it("solo rejects >1", () => expect(validateGameOptions({ playerCount:2, mode:"solo", enabledExpansions:[], enabledVariants:[], soloDifficulty:"chieftain" }).issues.some(i=>i.level==="fatal")).toBe(true));
  it("practice rejects >1", () => expect(validateGameOptions({ playerCount:2, mode:"practice", enabledExpansions:[], enabledVariants:[] }).issues.some(i=>i.level==="fatal")).toBe(true));
  it("soloDifficulty outside solo warns", () => expect(validateGameOptions({ playerCount:2, mode:"multiplayer", enabledExpansions:[], enabledVariants:[], soloDifficulty:"chieftain" }).issues.some(i=>i.level==="warning")).toBe(true));
});
