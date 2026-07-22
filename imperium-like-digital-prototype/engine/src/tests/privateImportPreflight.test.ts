import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

function findWorkspaceRoot(start: string): string {
  let current = start;
  while (!fs.existsSync(path.join(current, "tools", "card-import"))) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Could not locate workspace root");
    current = parent;
  }
  return current;
}

const workspaceRoot = findWorkspaceRoot(process.cwd());
const tsxCli = path.join(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs");
const script = path.join("tools", "card-import", "preflightPrivateImportAll.ts");

function writeRequiredCsvs(root: string, omit: string[] = []) {
  const dir = path.join(root, "private-card-data");
  fs.mkdirSync(dir, { recursive: true });
  for (const name of [
    "imperium_cards_private.csv",
    "imperium_nations_private.csv",
    "imperium_nation_rulesets_private.csv",
    "imperium_nation_strategy_private.csv",
    "imperium_bot_state_tables_private.csv",
    "imperium_bot_trade_routes_private.csv"
  ]) {
    if (!omit.includes(name)) fs.writeFileSync(path.join(dir, name), "header\n");
  }
}

describe("private import preflight", () => {
  it("prints the required source and output filenames when all inputs exist", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-ok-"));
    try {
      writeRequiredCsvs(tmp);
      const output = execFileSync(process.execPath, [tsxCli, script, "--root", tmp], { cwd: workspaceRoot }).toString("utf8");

      expect(output).toContain("Private import preflight: ok");
      expect(output).toContain("imperium_bot_state_tables_private.csv -> generated-private/bot-state-tables.normalized.json");
      expect(output).toContain("imperium_bot_trade_routes_private.csv -> generated-private/bot-trade-routes-tables.normalized.json");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails before import when required private source files are missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-missing-"));
    try {
      writeRequiredCsvs(tmp, ["imperium_bot_state_tables_private.csv", "imperium_bot_trade_routes_private.csv"]);
      const result = spawnSync(process.execPath, [tsxCli, script, "--root", tmp], { cwd: workspaceRoot, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing private import sources");
      expect(result.stderr).toContain("imperium_bot_state_tables_private.csv");
      expect(result.stderr).toContain("imperium_bot_trade_routes_private.csv");
      expect(result.stderr).toContain("copy from private-card-data/bot-state-table-template.csv");
      expect(result.stderr).toContain("copy from private-card-data/bot-trade-routes-table-template.csv");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
