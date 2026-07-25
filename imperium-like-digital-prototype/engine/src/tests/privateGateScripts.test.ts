import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (!fs.existsSync(path.join(current, "package.json")) || !fs.existsSync(path.join(current, "tools", "card-import"))) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Could not locate workspace root");
    current = parent;
  }
  return current;
}

const workspaceRoot = findWorkspaceRoot(process.cwd());
const packageJson = JSON.parse(fs.readFileSync(path.join(workspaceRoot, "package.json"), "utf8"));
const scripts = packageJson.scripts as Record<string, string>;

describe("private final gate scripts", () => {
  it("keeps verify:pre-private as the public-safe pre-private gate", () => {
    expect(scripts["verify:pre-private"]).toBe("npm run test:local-qa-scripts && npm run typecheck && npm run test -w app && npm run test -w server && npm run private:status && npm run smoke:fictional-game && npm run smoke:multiplayer && npm run qa:local-browser");
    expect(scripts["verify:pre-private"].startsWith("npm run test:local-qa-scripts")).toBe(true);
    expect(scripts["verify:pre-private"]).toContain("&& npm run typecheck &&");
    expect(scripts["verify:pre-private"]).toContain("&& npm run test -w app &&");
    expect(scripts["verify:pre-private"]).toContain("&& npm run test -w server &&");
    expect(scripts["verify:pre-private"]).toContain("&& npm run private:status &&");
    expect(scripts["verify:pre-private"]).toContain("&& npm run smoke:fictional-game &&");
    expect(scripts["verify:pre-private"]).toContain("&& npm run smoke:multiplayer &&");
    expect(scripts["verify:pre-private"].endsWith("npm run qa:local-browser")).toBe(true);
    expect(scripts["verify:pre-private"]).not.toContain("private:gate");
    expect(scripts["verify:pre-private"]).not.toContain("private:import-all");
    expect(scripts["verify:pre-private"]).not.toContain("private:preflight");
  });

  it("keeps private:gate as a fail-fast public-safe proof chain", () => {
    expect(scripts["private:gate"]).toBe("npm run private:preflight:report && npm run private:import-all && npm run private:artifacts:verify");
    expect(scripts["private:gate"].startsWith("npm run private:preflight:report")).toBe(true);
    expect(scripts["private:gate"]).toContain("&& npm run private:import-all &&");
    expect(scripts["private:gate"].endsWith("npm run private:artifacts:verify")).toBe(true);
  });

  it("keeps private:status as a non-importing progress check", () => {
    expect(scripts["private:status"]).toBe("tsx tools/card-import/preflightPrivateImportAll.ts --status --report generated-private/private-status-report.json");
    expect(scripts["private:status"]).toContain("--status");
    expect(scripts["private:status"]).toContain("private-status-report.json");
    expect(scripts["private:status"]).not.toContain("private:import-all");
    expect(scripts["private:status"]).not.toContain("cards:import");
    expect(scripts["private:status"]).not.toContain("nations:import");
  });

  it("keeps completeness inside import-all instead of duplicating it in private:gate", () => {
    expect(scripts["private:import-all"]).toContain("npm run private:preflight &&");
    expect(scripts["private:import-all"]).toContain("npm run private:completeness");
    expect(scripts["private:gate"]).not.toContain("private:completeness");
  });
});
