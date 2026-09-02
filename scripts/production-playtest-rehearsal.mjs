import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.join(repoRoot, "imperium-like-digital-prototype");

export const REQUIRED_CHECKS = [
  {
    id: "pre-invite-local-proof",
    label: "Public-safe local proof",
    docs: ["npm.cmd run verify:pre-private"],
    scripts: ["verify:pre-private"]
  },
  {
    id: "render-build-proof",
    label: "Render build-shape proof",
    docs: ["npm.cmd run render:verify"],
    scripts: ["render:verify"]
  },
  {
    id: "commit-pinned-hosted-smoke",
    label: "Commit-pinned hosted smoke",
    docs: ["POLITY_EXPECTED_COMMIT", "npm.cmd run smoke:hosted"],
    scripts: ["smoke:hosted"]
  },
  {
    id: "hosted-browser-qa",
    label: "Hosted browser QA",
    docs: ["npm.cmd run qa:hosted-browser"],
    scripts: ["qa:hosted-browser"]
  },
  {
    id: "admin-cleanup",
    label: "Admin cleanup rehearsal",
    docs: ["Close Lobby", "End Game", "Clear All Games"]
  },
  {
    id: "support-intake",
    label: "Public-safe bug intake",
    docs: ["Copied bug-report summary", "polity-playtest-diagnostics"]
  },
  {
    id: "storage-recovery",
    label: "Persistent storage and backup expectations",
    docs: ["POLITY_STORAGE_PATH", "boardgame/", "accounts.json", "pregame-lobbies.json"]
  },
  {
    id: "private-boundary",
    label: "Private-data boundary",
    docs: ["do not collect private CSVs", "Private data remains local-only"]
  }
];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readPackageScripts(packagePath = path.join(workspaceRoot, "package.json")) {
  const packageJson = JSON.parse(readText(packagePath));
  return packageJson.scripts ?? {};
}

export function buildProductionPlaytestRehearsal(options = {}) {
  const root = options.workspaceRoot ?? workspaceRoot;
  const docsRoot = path.join(root, "docs");
  const runbook = readText(path.join(docsRoot, "production-playtest-runbook.md"));
  const deployment = readText(path.join(docsRoot, "deployment.md"));
  const handoff = readText(path.join(docsRoot, "hosted-release-handoff.md"));
  const scripts = readPackageScripts(path.join(root, "package.json"));
  const docsCorpus = `${runbook}\n${deployment}\n${handoff}`;

  const checks = REQUIRED_CHECKS.map((check) => {
    const missingDocs = (check.docs ?? []).filter((needle) => !docsCorpus.includes(needle));
    const missingScripts = (check.scripts ?? []).filter((scriptName) => typeof scripts[scriptName] !== "string");
    return {
      id: check.id,
      label: check.label,
      status: missingDocs.length === 0 && missingScripts.length === 0 ? "ready" : "blocked",
      missingDocs,
      missingScripts
    };
  });

  const recommendedCommands = [
    "npm.cmd run verify:pre-private",
    "npm.cmd run render:verify",
    "$env:POLITY_HOSTED_BASE_URL=\"https://polity-engine.onrender.com\"",
    "$env:POLITY_EXPECTED_COMMIT=\"<short-or-full-git-sha>\"",
    "npm.cmd run smoke:hosted",
    "npm.cmd run qa:hosted-browser"
  ];

  return {
    ok: checks.every((check) => check.status === "ready"),
    rehearsal: "production-playtest",
    privacyClassification: "public-safe",
    nextStep: "Run the recommended commands, then manually rehearse admin close/end, stuck-room recovery, support intake, and storage backup before inviting playtesters.",
    recommendedCommands,
    checks
  };
}

export function formatRehearsalSummary(report) {
  const lines = [
    `Production Playtest Rehearsal: ${report.ok ? "ready" : "blocked"}`,
    `Privacy: ${report.privacyClassification}`,
    "Checks:"
  ];
  for (const check of report.checks) {
    lines.push(`- ${check.status.toUpperCase()} ${check.id}: ${check.label}`);
    if (check.missingDocs.length > 0) lines.push(`  missing docs: ${check.missingDocs.join(", ")}`);
    if (check.missingScripts.length > 0) lines.push(`  missing scripts: ${check.missingScripts.join(", ")}`);
  }
  lines.push("Recommended commands:");
  for (const command of report.recommendedCommands) lines.push(`- ${command}`);
  lines.push(`Next step: ${report.nextStep}`);
  return `${lines.join("\n")}\n`;
}

async function main() {
  const report = buildProductionPlaytestRehearsal();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(formatRehearsalSummary(report));
  }
  if (!report.ok) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
