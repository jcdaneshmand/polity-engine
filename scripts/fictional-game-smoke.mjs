import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const projectRoot = fileURLToPath(new URL("../imperium-like-digital-prototype", import.meta.url));
const scenariosPath = fileURLToPath(new URL("../imperium-like-digital-prototype/data/fictional-regression/scenarios.json", import.meta.url));
const testArgs = ["run", "test", "-w", "engine", "--", "fictionalRegressionData.test.ts", "fictionalScenarioSmoke.test.ts"];
const command = process.platform === "win32" ? "cmd.exe" : npmCommand;
const args = process.platform === "win32" ? ["/d", "/s", "/c", npmCommand, ...testArgs] : testArgs;
const result = spawnSync(
  command,
  args,
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false
  }
);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const scenarios = JSON.parse(readFileSync(scenariosPath, "utf8"));
const tagCounts = {};
for (const scenario of scenarios) {
  for (const tag of scenario.tags ?? []) {
    tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
  }
}

console.log(JSON.stringify({
  ok: true,
  smoke: "fictional-game",
  scenarios: scenarios.length,
  tagCounts
}));
