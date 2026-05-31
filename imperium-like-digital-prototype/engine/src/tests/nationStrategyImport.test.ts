import { describe, expect, it } from "vitest";
import path from "node:path";
import { parseCsvFile } from "../../../tools/card-import/csvParser";
import { normalizeNationStrategy } from "../../../tools/card-import/normalizeNationStrategy";

const privateStrategyCsvPath = path.resolve(import.meta.dirname, "../../../private-card-data/imperium_nation_strategy_private.csv");

describe("private nation strategy import", () => {
  it("imports the Cultists ceremony/chaos strategy profile as tested private metadata", () => {
    const rows = parseCsvFile(privateStrategyCsvPath);
    const cultists = rows.find((row) => row.nation_id === "cultists");

    expect(cultists).toBeDefined();
    const normalized = normalizeNationStrategy(cultists as any);

    expect(normalized.nationId).toBe("cultists");
    expect(normalized.complexity).toBe(5);
    expect(normalized.aggression).toBe("ruthless");
    expect(normalized.privateKeyMechanics).toContain("ceremony/chaos side system");
    expect(normalized.privateRiskNotes).toContain("can push or exploit collapse; needs special game-end testing");
    expect(normalized.implemented).toBe(true);
    expect(normalized.tested).toBe(true);
  });
});
