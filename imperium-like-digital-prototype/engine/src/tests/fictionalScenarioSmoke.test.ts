import { describe, expect, it } from "vitest";
import {
  loadFictionalScenarioCatalog,
  REQUIRED_FICTIONAL_SCENARIO_IDS,
  runFictionalScenario,
  runFictionalScenarioCatalog,
  validateFictionalScenarioCatalog
} from "./helpers/fictionalScenarioRunner";

describe("executable fictional scenario catalog", () => {
  it("executes every required public-safe scenario and emits complete reports", () => {
    const catalog = loadFictionalScenarioCatalog();
    const reports = runFictionalScenarioCatalog(catalog);

    expect(reports.map((report) => report.id)).toEqual(catalog.scenarios.map((scenario) => scenario.id));
    expect(REQUIRED_FICTIONAL_SCENARIO_IDS.every((id) => reports.some((report) => report.id === id))).toBe(true);
    expect(reports.every((report) => report.checkpoints > 0 && report.failures.length === 0)).toBe(true);
    expect(reports.filter((report) => report.kind === "full_game").every((report) => report.terminalReason && report.actualScores)).toBe(true);
  });

  it("keeps complete games, executable sequences, and constructed boundaries explicit", () => {
    const catalog = loadFictionalScenarioCatalog();
    expect(new Set(catalog.scenarios.map((scenario) => scenario.kind))).toEqual(new Set([
      "executable_sequence",
      "full_game",
      "constructed_boundary"
    ]));
    expect(catalog.scenarios.filter((scenario) => scenario.kind === "constructed_boundary").map((scenario) => scenario.id)).toEqual(["F08-3P", "F08-4P"]);
  });

  it("fails closed when a required scenario is absent", () => {
    const catalog = structuredClone(loadFictionalScenarioCatalog());
    catalog.scenarios = catalog.scenarios.filter((scenario) => scenario.id !== "F07-SOLO");
    expect(() => validateFictionalScenarioCatalog(catalog)).toThrow(/required scenario F07-SOLO is missing/);
  });

  it("fails closed on an unknown step type", () => {
    const catalog = structuredClone(loadFictionalScenarioCatalog()) as any;
    catalog.scenarios[0].steps.push({ type: "silently_accept_unknown_step" });
    expect(() => validateFictionalScenarioCatalog(catalog)).toThrow(/unknown step type silently_accept_unknown_step/);
  });

  it("fails when an independently expected score is perturbed", () => {
    const catalog = structuredClone(loadFictionalScenarioCatalog());
    const scenario = catalog.scenarios.find((candidate) => candidate.id === "F05")!;
    scenario.expectedTerminal!.scores["1"] = 999;
    expect(() => runFictionalScenario(scenario)).toThrow(/score mismatch/);
  });
});
