import {
  loadFictionalScenarioCatalog,
  runFictionalScenario,
  type FictionalScenarioReport
} from "../src/tests/helpers/fictionalScenarioRunner";

const catalog = loadFictionalScenarioCatalog();
const reports: FictionalScenarioReport[] = [];
const failures: Array<{ id: string; message: string }> = [];

for (const scenario of catalog.scenarios) {
  try {
    reports.push(runFictionalScenario(scenario));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push({ id: scenario.id, message });
    reports.push({
      id: scenario.id,
      kind: scenario.kind,
      seed: scenario.seed,
      checkpoints: 0,
      expectedScores: scenario.expectedTerminal?.scores,
      failures: [message]
    });
  }
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  smoke: "fictional-game",
  fixtureVersion: catalog.fixtureVersion,
  rulesVersion: catalog.rulesVersion,
  executedIds: reports.filter((report) => report.failures.length === 0).map((report) => report.id),
  checkpointCount: reports.reduce((sum, report) => sum + report.checkpoints, 0),
  scenarios: reports,
  failures
}, null, 2));

if (failures.length > 0) process.exitCode = 1;
