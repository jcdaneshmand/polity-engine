import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { privateImportSources } from "../../../tools/card-import/privateImportSources";

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
  for (const source of privateImportSources) {
    fs.copyFileSync(path.join(workspaceRoot, source.template), path.join(root, source.template));
    const name = path.basename(source.input);
    if (omit.includes(name)) continue;
    const templateHeader = fs.readFileSync(path.join(workspaceRoot, source.template), "utf8").split(/\r?\n/, 1)[0];
    fs.writeFileSync(path.join(root, source.input), `${templateHeader}\nfixture-row\n`, "utf8");
  }
}

function writeGeneratedOutputs(root: string) {
  for (const source of privateImportSources) {
    const outputPath = path.join(root, source.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, "[]\n", "utf8");
  }
}

describe("private import preflight", () => {
  it("prints the required source and output filenames when all inputs exist", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-ok-"));
    try {
      writeRequiredCsvs(tmp);
      const reportPath = path.join(tmp, "generated-private", "private-preflight-report.json");
      const output = execFileSync(process.execPath, [tsxCli, script, "--root", tmp, "--report", reportPath], { cwd: workspaceRoot }).toString("utf8");

      expect(output).toContain("Private import preflight: ok");
      expect(output).toContain("imperium_bot_state_tables_private.csv (1 row) -> generated-private/bot-state-tables.normalized.json");
      expect(output).toContain("imperium_bot_trade_routes_private.csv (1 row) -> generated-private/bot-trade-routes-tables.normalized.json");
      expect(output).toContain("Preflight report:");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      expect(report).toMatchObject({
        kind: "private-import-preflight",
        status: "ready",
        privacy: "public-safe: filenames, output paths, row counts, and check statuses only",
        recommendedCommands: ["npm.cmd run private:status", "npm.cmd run private:scaffold", "npm.cmd run private:gate"],
        nextStep: "Run `npm.cmd run private:gate`.",
        counts: {
          sources: 6,
          ready: 6,
          blocked: 0,
          missingInputs: 0,
          missingTemplates: 0,
          headerOnlyInputs: 0,
          headerMismatches: 0
        }
      });
      expect(report.sources[0]).toMatchObject({
        input: "private-card-data/imperium_cards_private.csv",
        rows: 1,
        status: "ready",
        nextStep: "Ready.",
        checks: {
          inputExists: true,
          templateExists: true,
          hasDataRows: true,
          headerMatchesTemplate: true
        }
      });
      expect(JSON.stringify(report)).not.toContain("fixture-row");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails before import when required private source files are missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-missing-"));
    try {
      writeRequiredCsvs(tmp, ["imperium_bot_state_tables_private.csv", "imperium_bot_trade_routes_private.csv"]);
      const reportPath = path.join(tmp, "generated-private", "private-preflight-report.json");
      const result = spawnSync(process.execPath, [tsxCli, script, "--root", tmp, "--report", reportPath], { cwd: workspaceRoot, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing private import sources");
      expect(result.stderr).toContain("imperium_bot_state_tables_private.csv");
      expect(result.stderr).toContain("imperium_bot_trade_routes_private.csv");
      expect(result.stderr).toContain("copy from private-card-data/bot-state-table-template.csv");
      expect(result.stderr).toContain("copy from private-card-data/bot-trade-routes-table-template.csv");
      expect(result.stderr).toContain("private:scaffold");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      expect(report).toMatchObject({
        kind: "private-import-preflight",
        status: "blocked",
        recommendedCommands: ["npm.cmd run private:status", "npm.cmd run private:scaffold", "npm.cmd run private:gate"],
        nextStep: "Run `npm.cmd run private:scaffold`, then enter private rows.",
        counts: {
          missingInputs: 2,
          blocked: 2
        }
      });
      expect(report.sources.find((source: any) => source.input.endsWith("imperium_bot_state_tables_private.csv"))).toMatchObject({
        status: "blocked",
        nextStep: "Run `npm.cmd run private:scaffold` to create private-card-data/imperium_bot_state_tables_private.csv."
      });
      expect(JSON.stringify(report)).not.toContain("fixture-row");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("prints a public-safe blocked status without failing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-status-"));
    try {
      writeRequiredCsvs(tmp, ["imperium_bot_state_tables_private.csv"]);
      const reportPath = path.join(tmp, "generated-private", "private-status-report.json");
      const result = spawnSync(process.execPath, [tsxCli, script, "--root", tmp, "--status", "--report", reportPath], { cwd: workspaceRoot, encoding: "utf8" });

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Private data status: blocked");
      expect(result.stdout).toContain("Ready sources: 5/6");
      expect(result.stdout).toContain("Next step: Run `npm.cmd run private:scaffold`, then enter private rows.");
      expect(result.stdout).toContain("Status report:");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      expect(report).toMatchObject({
        kind: "private-import-preflight",
        status: "blocked",
        privacy: "public-safe: filenames, output paths, row counts, and check statuses only",
        recommendedCommands: ["npm.cmd run private:status", "npm.cmd run private:scaffold", "npm.cmd run private:gate"],
        nextStep: "Run `npm.cmd run private:scaffold`, then enter private rows.",
        counts: {
          ready: 5,
          blocked: 1,
          missingInputs: 1
        }
      });
      expect(JSON.stringify(report)).not.toContain("fixture-row");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails before import when private sources are only scaffold headers", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-empty-"));
    try {
      writeRequiredCsvs(tmp);
      const templateHeader = fs.readFileSync(path.join(workspaceRoot, "private-card-data", "card-data-template.csv"), "utf8").split(/\r?\n/, 1)[0];
      fs.writeFileSync(path.join(tmp, "private-card-data", "imperium_cards_private.csv"), `${templateHeader}\n`, "utf8");
      const result = spawnSync(process.execPath, [tsxCli, script, "--root", tmp], { cwd: workspaceRoot, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Header-only private import sources need at least one data row before import");
      expect(result.stderr).toContain("imperium_cards_private.csv");
      const reportPath = path.join(tmp, "generated-private", "private-preflight-report.json");
      const reportResult = spawnSync(process.execPath, [tsxCli, script, "--root", tmp, "--report", reportPath], { cwd: workspaceRoot, encoding: "utf8" });
      expect(reportResult.status).toBe(1);
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      expect(report.sources.find((source: any) => source.input.endsWith("imperium_cards_private.csv"))).toMatchObject({
        status: "blocked",
        nextStep: "Enter at least one data row in private-card-data/imperium_cards_private.csv."
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails before import when private source headers drift from templates", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-header-"));
    try {
      writeRequiredCsvs(tmp);
      fs.writeFileSync(path.join(tmp, "private-card-data", "imperium_cards_private.csv"), "wrong,header\nfixture-row\n", "utf8");
      const result = spawnSync(process.execPath, [tsxCli, script, "--root", tmp], { cwd: workspaceRoot, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Private import source headers do not match their committed templates");
      expect(result.stderr).toContain("imperium_cards_private.csv");
      expect(result.stderr).toContain("expected header from private-card-data/card-data-template.csv");
      const reportPath = path.join(tmp, "generated-private", "private-preflight-report.json");
      const reportResult = spawnSync(process.execPath, [tsxCli, script, "--root", tmp, "--report", reportPath], { cwd: workspaceRoot, encoding: "utf8" });
      expect(reportResult.status).toBe(1);
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      expect(report.nextStep).toBe("Repair private CSV headers to match the committed templates.");
      expect(report.sources.find((source: any) => source.input.endsWith("imperium_cards_private.csv"))).toMatchObject({
        status: "blocked",
        nextStep: "Repair private-card-data/imperium_cards_private.csv so its header matches private-card-data/card-data-template.csv."
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails before import when committed private templates are missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-template-"));
    try {
      writeRequiredCsvs(tmp);
      fs.rmSync(path.join(tmp, "private-card-data", "card-data-template.csv"));
      const result = spawnSync(process.execPath, [tsxCli, script, "--root", tmp], { cwd: workspaceRoot, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing private import templates");
      expect(result.stderr).toContain("private-card-data/card-data-template.csv");
      const reportPath = path.join(tmp, "generated-private", "private-preflight-report.json");
      const reportResult = spawnSync(process.execPath, [tsxCli, script, "--root", tmp, "--report", reportPath], { cwd: workspaceRoot, encoding: "utf8" });
      expect(reportResult.status).toBe(1);
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      expect(report.nextStep).toBe("Restore missing committed private CSV templates.");
      expect(report.sources.find((source: any) => source.template.endsWith("card-data-template.csv"))).toMatchObject({
        status: "blocked",
        nextStep: "Restore private-card-data/card-data-template.csv."
      });
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails output verification when generated private artifacts are missing", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-output-missing-"));
    try {
      writeRequiredCsvs(tmp);
      const reportPath = path.join(tmp, "generated-private", "private-artifacts-report.json");
      const result = spawnSync(process.execPath, [tsxCli, script, "--root", tmp, "--check-outputs", "--report", reportPath], { cwd: workspaceRoot, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Missing generated private outputs");
      expect(result.stderr).toContain("generated-private/cards.normalized.json");
      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      expect(report).toMatchObject({
        status: "blocked",
        recommendedCommands: ["npm.cmd run private:import-all", "npm.cmd run private:artifacts:verify"],
        nextStep: "Run `npm.cmd run private:import-all`.",
        counts: {
          missingOutputs: 6,
          staleOutputs: 0
        }
      });
      expect(report.sources[0].checks.outputExists).toBe(false);
      expect(report.sources[0].checks.outputFresh).toBe(false);
      expect(report.sources[0].nextStep).toBe("Run `npm.cmd run private:import-all` to create generated-private/cards.normalized.json.");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails output verification when generated private artifacts are stale", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-output-stale-"));
    try {
      writeRequiredCsvs(tmp);
      writeGeneratedOutputs(tmp);
      const oldTime = new Date("2026-01-01T00:00:00.000Z");
      const newTime = new Date("2026-01-02T00:00:00.000Z");
      const first = privateImportSources[0];
      fs.utimesSync(path.join(tmp, first.output), oldTime, oldTime);
      fs.utimesSync(path.join(tmp, first.input), newTime, newTime);
      const result = spawnSync(process.execPath, [tsxCli, script, "--root", tmp, "--check-outputs"], { cwd: workspaceRoot, encoding: "utf8" });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Stale generated private outputs");
      expect(result.stderr).toContain("generated-private/cards.normalized.json");
      expect(result.stderr).toContain("older than private-card-data/imperium_cards_private.csv");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("passes output verification when generated private artifacts are fresh", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "polity-preflight-output-fresh-"));
    try {
      writeRequiredCsvs(tmp);
      writeGeneratedOutputs(tmp);
      const output = execFileSync(process.execPath, [tsxCli, script, "--root", tmp, "--check-outputs"], { cwd: workspaceRoot }).toString("utf8");

      expect(output).toContain("Private import preflight: ok");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
