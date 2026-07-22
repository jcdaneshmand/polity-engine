import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ruleProvenanceLabels } from "../../../app/src/ui/controller/selectionModel";

type CoverageStatus = "covered" | "weak-evidence" | "runtime-gap" | "private-data-only";

type CoverageMapEntry = {
  id: string;
  contractArea: string;
  status: CoverageStatus;
  evidenceTests: string[];
  scenarioFixtures: string[];
  uiExplanations?: {
    currentTaskTitles?: string[];
    ruleProvenanceLabels?: string[];
    blockedReasonPatterns?: string[];
    zoneKinds?: string[];
  };
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

  it("keeps playable-rulebook UI explanations tied to public-safe evidence", () => {
    const coverageMap = readCoverageMap();
    const entry = coverageMap.entries.find((item) => item.id === "ui-playable-rulebook-explanations");

    expect(entry, "ui-playable-rulebook-explanations coverage row is required").toBeDefined();
    expect(entry?.status).toBe("covered");
    expect(entry?.evidenceTests).toEqual(expect.arrayContaining([
      "uiSelectionModel.test.ts",
      "BoardLayout.test.tsx",
      "local-browser-qa.test.mjs"
    ]));

    const explanations = entry?.uiExplanations;
    expect(explanations?.currentTaskTitles).toEqual(expect.arrayContaining([
      "Ready",
      "Pending Cleanup Resource",
      "Pending Cleanup Discard"
    ]));
    expect(explanations?.ruleProvenanceLabels).toEqual(expect.arrayContaining(Object.values(ruleProvenanceLabels)));
    expect(explanations?.blockedReasonPatterns).toEqual(expect.arrayContaining([
      "Resolve cleanup market resource first",
      "No Action tokens available",
      "Select a card to pin details"
    ]));
    expect(explanations?.zoneKinds).toEqual(expect.arrayContaining([
      "public-shared",
      "market-shared",
      "own-private",
      "pending-choice"
    ]));

    const serialized = JSON.stringify(entry);
    expect(serialized).not.toMatch(/official card|official rulebook|privateName|rawEffectTextPrivate/i);
  });
});
