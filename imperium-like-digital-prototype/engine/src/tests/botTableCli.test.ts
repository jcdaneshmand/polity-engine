import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = path.resolve(process.cwd(), "..");
const tsxCli = path.join(workspaceRoot, "node_modules", "tsx", "dist", "cli.mjs");

function runTool(scriptName: string) {
  execFileSync(process.execPath, [tsxCli, path.join("tools", "card-import", scriptName)], {
    cwd: workspaceRoot,
    stdio: "pipe"
  });
}

describe("bot table CLI tools", () => {
  it("fails loudly while bot state table validation and import are unsupported", () => {
    expect(() => runTool("validatePrivateBotStateTables.ts")).toThrow();
    expect(() => runTool("importPrivateBotStateTables.ts")).toThrow();
  });
});
