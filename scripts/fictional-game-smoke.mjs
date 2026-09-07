import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../imperium-like-digital-prototype", import.meta.url));
const vitestCli = fileURLToPath(new URL("../imperium-like-digital-prototype/node_modules/vitest/vitest.mjs", import.meta.url));
const tsxCli = fileURLToPath(new URL("../imperium-like-digital-prototype/node_modules/tsx/dist/cli.mjs", import.meta.url));

const testResult = spawnSync(process.execPath, [
  vitestCli,
  "run",
  "--root",
  "engine",
  "src/tests/fictionalRegressionData.test.ts",
  "src/tests/fictionalScenarioSmoke.test.ts"
], { cwd: projectRoot, stdio: "inherit", shell: false });

if (testResult.error) {
  console.error(testResult.error.message);
  process.exit(1);
}

if (testResult.status !== 0) {
  process.exit(testResult.status ?? 1);
}

const reportResult = spawnSync(process.execPath, [tsxCli, "engine/scripts/run-fictional-scenarios.ts"], {
  cwd: projectRoot,
  stdio: "inherit",
  shell: false
});
if (reportResult.error) {
  console.error(reportResult.error.message);
  process.exit(1);
}
process.exit(reportResult.status ?? 1);
