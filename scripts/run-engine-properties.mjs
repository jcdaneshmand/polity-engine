import { spawnSync } from "node:child_process";
import path from "node:path";

const workspace = path.resolve(import.meta.dirname, "../imperium-like-digital-prototype");
const vitest = path.join(workspace, "node_modules/vitest/vitest.mjs");
const result = spawnSync(process.execPath, [vitest, "run", "--root", "engine", "src/tests/propertyAssurance.test.ts"], {
  cwd: workspace,
  env: { ...process.env, POLITY_PROPERTY_RUNS: process.env.POLITY_PROPERTY_RUNS ?? "1000" },
  stdio: "inherit",
  shell: false
});
process.exitCode = result.status ?? 1;
