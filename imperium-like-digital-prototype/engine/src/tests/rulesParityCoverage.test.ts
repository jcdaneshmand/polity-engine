import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

type CoverageStatus = "covered" | "weak-evidence" | "runtime-gap" | "private-data-only";

type CoverageMapEntry = {
  id: string;
  contractArea: string;
  status: CoverageStatus;
  evidenceTests: string[];
  scenarioFixtures: string[];
  minimumPublicScenarioNeeded?: string;
  runtimeGapReproductionPlan?: string;
};

type CoverageMap = {
  version: 1;
  updated: string;
  entries: CoverageMapEntry[];
};

const coverageMapPath = path.resolve(__dirname, "../../../data/fictional-regression/coverage-map.json");

function readCoverageMap(): CoverageMap {
  return JSON.parse(fs.readFileSync(coverageMapPath, "utf8")) as CoverageMap;
}

describe("rules parity coverage map", () => {
  it("keeps every non-private parity contract tied to public-safe evidence", () => {
    const coverageMap = readCoverageMap();

    expect(coverageMap.version).toBe(1);
    expect(coverageMap.entries.length).toBeGreaterThan(0);

    const ids = new Set<string>();
    for (const entry of coverageMap.entries) {
      expect(entry.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(entry.id)).toBe(false);
      ids.add(entry.id);
      expect(entry.contractArea.trim()).not.toBe("");

      if (entry.status !== "private-data-only") {
        expect(entry.evidenceTests.length, `${entry.id} must cite public-safe test evidence`).toBeGreaterThan(0);
      }

      if (entry.status === "covered") {
        expect(
          entry.evidenceTests.length + entry.scenarioFixtures.length,
          `${entry.id} is covered but has no evidence`
        ).toBeGreaterThan(0);
      }

      if (entry.status === "runtime-gap") {
        expect(entry.runtimeGapReproductionPlan?.trim(), `${entry.id} needs a public-safe reproduction plan`).toBeTruthy();
      }
    }
  });
});
