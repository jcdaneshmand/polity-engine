import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function findRepoRoot(start: string): string {
  let current = start;
  while (!fs.existsSync(path.join(current, ".git"))) {
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Could not locate repository root");
    current = parent;
  }
  return current;
}

const repoRoot = findRepoRoot(process.cwd());

function gitCheckIgnore(filePath: string) {
  return spawnSync("git", ["check-ignore", "-v", filePath], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

describe("private data ignore rules", () => {
  it("keeps local private CSV sources and generated reports ignored", () => {
    const ignoredPaths = [
      "imperium-like-digital-prototype/private-card-data/imperium_cards_private.csv",
      "imperium-like-digital-prototype/private-card-data/imperium_nations_private.csv",
      "imperium-like-digital-prototype/private-card-data/imperium_nation_rulesets_private.csv",
      "imperium-like-digital-prototype/private-card-data/imperium_nation_strategy_private.csv",
      "imperium-like-digital-prototype/private-card-data/imperium_bot_state_tables_private.csv",
      "imperium-like-digital-prototype/private-card-data/imperium_bot_trade_routes_private.csv",
      "imperium-like-digital-prototype/generated-private/private-status-report.json",
      "imperium-like-digital-prototype/generated-private/private-preflight-report.json",
      "imperium-like-digital-prototype/generated-private/private-artifacts-report.json"
    ];

    for (const filePath of ignoredPaths) {
      const result = gitCheckIgnore(filePath);
      expect(result.status, `${filePath} should be ignored`).toBe(0);
      expect(result.stdout, `${filePath} should have a matching ignore rule`).toContain(filePath);
    }
  });

  it("keeps committed private-data templates and docs trackable", () => {
    const trackedTemplatePaths = [
      "imperium-like-digital-prototype/private-card-data/card-data-template.csv",
      "imperium-like-digital-prototype/private-card-data/nation-data-template.csv",
      "imperium-like-digital-prototype/private-card-data/nation-ruleset-template.csv",
      "imperium-like-digital-prototype/private-card-data/nation-strategy-template.csv",
      "imperium-like-digital-prototype/private-card-data/bot-state-table-template.csv",
      "imperium-like-digital-prototype/private-card-data/bot-trade-routes-table-template.csv",
      "imperium-like-digital-prototype/private-card-data/README.md"
    ];

    for (const filePath of trackedTemplatePaths) {
      const result = gitCheckIgnore(filePath);
      expect(result.status, `${filePath} should not be ignored`).toBe(1);
      expect(result.stdout).toBe("");
    }
  });
});
