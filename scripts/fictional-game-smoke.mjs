import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const projectRoot = fileURLToPath(new URL("../imperium-like-digital-prototype", import.meta.url));
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

console.log(JSON.stringify({ ok: true, smoke: "fictional-game" }));
