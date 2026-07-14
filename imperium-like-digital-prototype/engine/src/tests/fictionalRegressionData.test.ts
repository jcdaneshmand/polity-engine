import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";

const fixtureRoot = path.resolve(__dirname, "../../../data/fictional-regression");

function readJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, fileName), "utf8")) as T;
}

describe("fictional regression data", () => {
  it("uses only public-safe fixture identifiers and names", () => {
    const cards = readJson<Array<{ id: string; displayName: string; rawEffectTextPrivate?: string }>>("cards.json");
    const nations = readJson<Array<{ id: string; displayName: string }>>("nations.json");
    const allRecords = [...cards, ...nations];

    expect(allRecords.length).toBeGreaterThan(0);
    for (const record of allRecords) {
      expect(record.id).toMatch(/^fixture_/);
      expect(record.displayName).not.toMatch(/imperium|classics|legends|horizons/i);
    }
    expect(cards.every((card) => card.rawEffectTextPrivate === undefined)).toBe(true);
  });

  it("can create a two-player game from fictional fixture cards and nations", () => {
    const cards = readJson<any[]>("cards.json");
    const nations = readJson<any[]>("nations.json");
    const nationRulesets = readJson<any[]>("rulesets.json");
    const G = createInitialGameState({
      options: {
        playerCount: 2,
        mode: "multiplayer",
        enabledExpansions: [],
        enabledVariants: [],
        commonsSetId: "custom"
      },
      playerNationIds: {
        "1": "fixture_nation_surveyors",
        "2": "fixture_nation_archivists"
      },
      privateData: { cards, nations, nationRulesets }
    });

    expect(Object.keys(G.players)).toEqual(["1", "2"]);
    expect(G.players["1"].hand.length).toBeGreaterThan(0);
    expect(G.players["2"].hand.length).toBeGreaterThan(0);
    expect(G.market.length).toBeGreaterThan(0);
    expect(G.unrestPile?.length ?? 0).toBeGreaterThan(0);
  });
});
