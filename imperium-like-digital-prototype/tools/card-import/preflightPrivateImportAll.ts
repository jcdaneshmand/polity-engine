import fs from "node:fs";
import path from "node:path";
import { privateImportSources } from "./privateImportSources";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function firstLine(filePath: string): string {
  return fs.readFileSync(filePath, "utf8").split(/\r?\n/, 1)[0]?.trimEnd() ?? "";
}

const root = path.resolve(arg("--root") ?? ".");
const reportPath = arg("--report");
const checkOutputs = process.argv.includes("--check-outputs");
const statusOnly = process.argv.includes("--status");
const missing = privateImportSources.filter((source) => !fs.existsSync(path.join(root, source.input)));
const missingTemplates = privateImportSources.filter((source) => !fs.existsSync(path.join(root, source.template)));
const headerMismatches = privateImportSources.filter((source) => {
  const inputPath = path.join(root, source.input);
  const templatePath = path.join(root, source.template);
  if (!fs.existsSync(inputPath) || !fs.existsSync(templatePath)) return false;
  return firstLine(inputPath) !== firstLine(templatePath);
});
const empty = privateImportSources.filter((source) => {
  const inputPath = path.join(root, source.input);
  if (!fs.existsSync(inputPath)) return false;
  const lines = fs.readFileSync(inputPath, "utf8").split(/\r?\n/);
  return !lines.slice(1).some((line) => line.trim().length > 0);
});
const missingOutputs = checkOutputs
  ? privateImportSources.filter((source) => !fs.existsSync(path.join(root, source.output)))
  : [];
const staleOutputs = checkOutputs
  ? privateImportSources.filter((source) => {
    const inputPath = path.join(root, source.input);
    const outputPath = path.join(root, source.output);
    if (!fs.existsSync(inputPath) || !fs.existsSync(outputPath)) return false;
    return fs.statSync(outputPath).mtimeMs + 1 < fs.statSync(inputPath).mtimeMs;
  })
  : [];
const failed = missing.length > 0
  || missingTemplates.length > 0
  || empty.length > 0
  || headerMismatches.length > 0
  || missingOutputs.length > 0
  || staleOutputs.length > 0;
const sourceReports = privateImportSources.map((source) => {
  const inputPath = path.join(root, source.input);
  const templatePath = path.join(root, source.template);
  const outputPath = path.join(root, source.output);
  const inputExists = fs.existsSync(inputPath);
  const templateExists = fs.existsSync(templatePath);
  const outputExists = fs.existsSync(outputPath);
  const dataRows = inputExists
    ? fs.readFileSync(inputPath, "utf8").split(/\r?\n/).slice(1).filter((line) => line.trim().length > 0).length
    : 0;
  const outputFresh = inputExists && outputExists
    ? fs.statSync(outputPath).mtimeMs + 1 >= fs.statSync(inputPath).mtimeMs
    : false;
  const checks = {
    inputExists,
    templateExists,
    hasDataRows: dataRows > 0,
    headerMatchesTemplate: inputExists && templateExists ? firstLine(inputPath) === firstLine(templatePath) : false,
    outputExists,
    outputFresh
  };
  const sourceReady = checks.inputExists
    && checks.templateExists
    && checks.hasDataRows
    && checks.headerMatchesTemplate
    && (!checkOutputs || (checks.outputExists && checks.outputFresh));
  const sourceNextStep = !checks.templateExists
    ? `Restore ${source.template}.`
    : !checks.inputExists
      ? `Run \`npm.cmd run private:scaffold\` to create ${source.input}.`
      : !checks.headerMatchesTemplate
        ? `Repair ${source.input} so its header matches ${source.template}.`
        : !checks.hasDataRows
          ? `Enter at least one data row in ${source.input}.`
          : checkOutputs && !checks.outputExists
            ? `Run \`npm.cmd run private:import-all\` to create ${source.output}.`
            : checkOutputs && !checks.outputFresh
              ? `Run \`npm.cmd run private:import-all\` to refresh ${source.output}.`
              : "Ready.";
  return {
    input: source.input,
    template: source.template,
    output: source.output,
    rows: dataRows,
    status: sourceReady ? "ready" : "blocked",
    nextStep: sourceNextStep,
    checks
  };
});
function buildNextStep(): string {
  if (!failed && !checkOutputs) return "Run `npm.cmd run private:gate`.";
  if (!failed && checkOutputs) return "Generated private outputs are fresh; continue local playtesting.";
  if (missingTemplates.length > 0) return "Restore missing committed private CSV templates.";
  if (headerMismatches.length > 0) return "Repair private CSV headers to match the committed templates.";
  if (missing.length > 0) return "Run `npm.cmd run private:scaffold`, then enter private rows.";
  if (empty.length > 0) return "Enter at least one data row in each header-only private CSV.";
  if (missingOutputs.length > 0 || staleOutputs.length > 0) return "Run `npm.cmd run private:import-all`.";
  return "Review blocked checks before continuing.";
}
const nextStep = buildNextStep();
const report = {
  kind: "private-import-preflight",
  generatedAtIso: new Date().toISOString(),
  status: failed ? "blocked" : "ready",
  privacy: "public-safe: filenames, output paths, row counts, and check statuses only",
  recommendedCommands: checkOutputs
    ? ["npm.cmd run private:import-all", "npm.cmd run private:artifacts:verify"]
    : ["npm.cmd run private:status", "npm.cmd run private:scaffold", "npm.cmd run private:gate"],
  nextStep,
  counts: {
    sources: privateImportSources.length,
    ready: sourceReports.filter((source) => source.status === "ready").length,
    blocked: sourceReports.filter((source) => source.status === "blocked").length,
    missingInputs: missing.length,
    missingTemplates: missingTemplates.length,
    headerOnlyInputs: empty.length,
    headerMismatches: headerMismatches.length,
    missingOutputs: missingOutputs.length,
    staleOutputs: staleOutputs.length
  },
  sources: sourceReports
};

if (reportPath) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
}

const issueStream = statusOnly ? process.stdout : process.stderr;

if (statusOnly) {
  process.stdout.write(`Private data status: ${report.status}\n`);
}

if (missing.length > 0) {
  issueStream.write("Missing private import sources:\n");
  for (const source of missing) issueStream.write(`- ${source.input} (copy from ${source.template})\n`);
  issueStream.write("Run `npm.cmd run private:scaffold` to create missing header-only work files, then enter private rows before import.\n");
}

if (missingTemplates.length > 0) {
  issueStream.write("Missing private import templates:\n");
  for (const source of missingTemplates) issueStream.write(`- ${source.template}\n`);
}

if (empty.length > 0) {
  issueStream.write("Header-only private import sources need at least one data row before import:\n");
  for (const source of empty) issueStream.write(`- ${source.input}\n`);
}

if (headerMismatches.length > 0) {
  issueStream.write("Private import source headers do not match their committed templates:\n");
  for (const source of headerMismatches) issueStream.write(`- ${source.input} (expected header from ${source.template})\n`);
}

if (missingOutputs.length > 0) {
  issueStream.write("Missing generated private outputs; run `npm.cmd run private:import-all` after preflight passes:\n");
  for (const source of missingOutputs) issueStream.write(`- ${source.output}\n`);
}

if (staleOutputs.length > 0) {
  issueStream.write("Stale generated private outputs; rerun `npm.cmd run private:import-all`:\n");
  for (const source of staleOutputs) issueStream.write(`- ${source.output} (older than ${source.input})\n`);
}

if (statusOnly) {
  process.stdout.write(`Ready sources: ${report.counts.ready}/${report.counts.sources}\n`);
  process.stdout.write(`Next step: ${nextStep}\n`);
  if (reportPath) process.stdout.write(`Status report: ${reportPath}\n`);
  process.exit(0);
}

if (failed) {
  process.exit(1);
}

process.stdout.write("Private import preflight: ok\n");
for (const source of privateImportSources) {
  const dataRows = sourceReports.find((item) => item.input === source.input)?.rows ?? 0;
  process.stdout.write(`- ${path.basename(source.input)} (${dataRows} row${dataRows === 1 ? "" : "s"}) -> ${source.output}\n`);
}
if (reportPath) process.stdout.write(`Preflight report: ${reportPath}\n`);
