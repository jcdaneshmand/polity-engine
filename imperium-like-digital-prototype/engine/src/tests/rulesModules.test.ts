import { describe, expect, it } from "vitest";
import { getEnabledRulesModules } from "../options/rulesModuleRegistry";

describe("rules module registry", () => {
  it("returns mode+variant+expansion modules", () => {
    const mods = getEnabledRulesModules({ playerCount:2, mode:"multiplayer", enabledExpansions:["trade_routes"], enabledVariants:["quick_setup"] });
    expect(mods.map(m=>m.id)).toContain("trade_routes");
    expect(mods.map(m=>m.id)).toContain("quick_setup");
  });
});
