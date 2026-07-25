import Papa from "papaparse";
import type { PrivateDataBundle } from "../../../../engine/src/setup/privateDataBundle";
import { normalizeBotStateTables } from "../../../../tools/card-import/normalizeBotStateTable";
import { normalizeBotTradeRoutesTables } from "../../../../tools/card-import/normalizeBotTradeRoutesTable";
import { normalizeCard } from "../../../../tools/card-import/normalizeCard";
import { normalizeNation } from "../../../../tools/card-import/normalizeNation";
import { normalizeNationRuleset } from "../../../../tools/card-import/normalizeNationRuleset";
import { normalizeNationStrategy } from "../../../../tools/card-import/normalizeNationStrategy";
import { validatePrivateBotStateTableRows, validatePrivateBotTradeRoutesTableRows } from "../../../../tools/card-import/botTableValidation";
import { validatePrivateCardsRows } from "../../../../tools/card-import/validatePrivateCards";
import { validatePrivateNationsRows } from "../../../../tools/card-import/validatePrivateNations";
import { validatePrivateNationRulesetsRows } from "../../../../tools/card-import/validatePrivateNationRulesets";
import { validatePrivateNationStrategyRows } from "../../../../tools/card-import/validatePrivateNationStrategy";

type PrivateDataRole = "cards" | "nations" | "nationRulesets" | "nationStrategy" | "botStateTables" | "botTradeRoutesTables";
type PrivateDataFormat = "json" | "csv";

export type PrivateDataFileInput = {
  name: string;
  text: string | (() => Promise<string>);
};

export type PrivateDataFileStatus = {
  name: string;
  role?: PrivateDataRole;
  format?: PrivateDataFormat;
  status: "loaded" | "error" | "skipped";
  message: string;
};

export type PrivateDataImportResult = {
  privateData: PrivateDataBundle;
  files: PrivateDataFileStatus[];
  dryRunReport: PrivateDataDryRunReport;
};

export type PrivateDataRecordCount = {
  label: string;
  count: number;
};

export type PrivateDataDryRunMessage = {
  level: "fatal" | "warning";
  scope: PrivateDataRole | "bundle" | "file";
  row?: number;
  field?: string;
  message: string;
};

export type PrivateDataReadinessCheck = {
  id: "fatal-free" | "cards" | "nations" | "references" | "rulesets" | "solo-bot" | "coverage";
  label: string;
  status: "ready" | "warning" | "blocked";
  detail: string;
};

export type PrivateDataDryRunReport = {
  schemaVersion: 1;
  status: "empty" | "ready" | "warning" | "fatal";
  generatedAtIso: string;
  fatal: number;
  warnings: number;
  counts: PrivateDataRecordCount[];
  coverage: {
    implemented: number;
    tested: number;
  };
  messages: PrivateDataDryRunMessage[];
  readinessChecks: PrivateDataReadinessCheck[];
};

type CsvRowsByRole = Partial<Record<PrivateDataRole, Record<string, string>[]>>;

const privateDataCountLabels: Array<{ key: keyof PrivateDataBundle; label: string; singular: string }> = [
  { key: "cards", label: "cards", singular: "card" },
  { key: "nations", label: "nations", singular: "nation" },
  { key: "nationRulesets", label: "rulesets", singular: "ruleset" },
  { key: "nationStrategy", label: "strategy notes", singular: "strategy note" },
  { key: "botStateTables", label: "bot state tables", singular: "bot state table" },
  { key: "botTradeRoutesTables", label: "bot trade route tables", singular: "bot trade route table" }
];

function roleFromFileName(name: string): PrivateDataRole | undefined {
  const lower = name.toLowerCase();
  if (lower.includes("bot-trade") || lower.includes("bot_trade")) return "botTradeRoutesTables";
  if (lower.includes("bot-state") || lower.includes("bot_state")) return "botStateTables";
  if (lower.includes("nation-ruleset") || lower.includes("nation_ruleset")) return "nationRulesets";
  if (lower.includes("nation-strategy") || lower.includes("nation_strategy")) return "nationStrategy";
  if (lower.includes("nation")) return "nations";
  if (lower.includes("card")) return "cards";
  return undefined;
}

function formatFromFileName(name: string): PrivateDataFormat | undefined {
  const lower = name.toLowerCase();
  if (lower.endsWith(".json")) return "json";
  if (lower.endsWith(".csv")) return "csv";
  return undefined;
}

function parseCsv(text: string): Record<string, string>[] {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function assignRole(privateData: PrivateDataBundle, role: PrivateDataRole, value: unknown): number {
  switch (role) {
    case "cards":
      privateData.cards = value as PrivateDataBundle["cards"];
      return privateData.cards?.length ?? 0;
    case "nations":
      privateData.nations = value as PrivateDataBundle["nations"];
      return privateData.nations?.length ?? 0;
    case "nationRulesets":
      privateData.nationRulesets = value as PrivateDataBundle["nationRulesets"];
      return privateData.nationRulesets?.length ?? 0;
    case "nationStrategy":
      privateData.nationStrategy = value as PrivateDataBundle["nationStrategy"];
      return privateData.nationStrategy?.length ?? 0;
    case "botStateTables":
      privateData.botStateTables = value as PrivateDataBundle["botStateTables"];
      return Object.keys(privateData.botStateTables ?? {}).length;
    case "botTradeRoutesTables":
      privateData.botTradeRoutesTables = value as PrivateDataBundle["botTradeRoutesTables"];
      return Object.keys(privateData.botTradeRoutesTables ?? {}).length;
  }
}

function withEmptyStringDefaults<T extends Record<string, string>>(row: T): T {
  return new Proxy(row, {
    get(target, prop, receiver) {
      if (typeof prop === "string") return target[prop] ?? "";
      return Reflect.get(target, prop, receiver);
    }
  });
}

function normalizeCsvRows(role: PrivateDataRole, rows: Record<string, string>[]): unknown {
  switch (role) {
    case "cards":
      return rows.map((row) => normalizeCard(withEmptyStringDefaults(row)));
    case "nations":
      return rows.map((row) => normalizeNation(withEmptyStringDefaults(row)));
    case "nationRulesets":
      return rows.map((row) => normalizeNationRuleset(withEmptyStringDefaults(row)));
    case "nationStrategy":
      return rows.map((row) => normalizeNationStrategy(withEmptyStringDefaults(row)));
    case "botStateTables":
      return normalizeBotStateTables(rows as any);
    case "botTradeRoutesTables":
      return normalizeBotTradeRoutesTables(rows as any);
  }
}

function parseJsonRole(role: PrivateDataRole, text: string): unknown {
  const parsed = JSON.parse(text);
  if (Array.isArray(parsed)) return parsed;
  if (role === "cards") return parsed.cards ?? parsed;
  if (role === "nations") return parsed.nations ?? parsed;
  if (role === "nationRulesets") return parsed.nationRulesets ?? parsed.rulesets ?? parsed;
  if (role === "nationStrategy") return parsed.nationStrategy ?? parsed.strategy ?? parsed;
  if (role === "botStateTables") return parsed.botStateTables ?? parsed;
  if (role === "botTradeRoutesTables") return parsed.botTradeRoutesTables ?? parsed;
  return parsed;
}

async function inputText(file: PrivateDataFileInput): Promise<string> {
  return typeof file.text === "function" ? file.text() : file.text;
}

function mapReportMessages(
  scope: PrivateDataRole,
  errors: Array<{ level: "fatal" | "warning"; row?: number; field?: string; message: string }>
): PrivateDataDryRunMessage[] {
  return errors.map((error) => ({
    level: error.level,
    scope,
    row: error.row,
    field: error.field,
    message: error.row ? `Row ${error.row}: ${sanitizePrivateDataPreviewMessage(error)}` : sanitizePrivateDataPreviewMessage(error)
  }));
}

function sanitizePrivateDataPreviewMessage(error: { field?: string; message: string }): string {
  const message = error.message;
  if (error.field === "card_ref" || /^Missing card id:/i.test(message)) {
    return "Missing referenced card id.";
  }
  return message
    .replace(/^\[[^\]]+\]\s+/, "[private row] ")
    .replace(/(Invalid message at [^:]+):\s*.+$/i, "$1.")
    .replace(/(Invalid .*?_id at [^:]+):\s*.+$/i, "$1.");
}

function coverageFromReport(report: { coverage?: { implemented?: number; tested?: number } }) {
  return {
    implemented: report.coverage?.implemented ?? 0,
    tested: report.coverage?.tested ?? 0
  };
}

function countFor(counts: PrivateDataRecordCount[], label: string): number {
  return counts.find((item) => item.label === label)?.count ?? 0;
}

function buildReadinessChecks(args: {
  counts: PrivateDataRecordCount[];
  fatal: number;
  warnings: number;
  coverage: PrivateDataDryRunReport["coverage"];
  messages: PrivateDataDryRunMessage[];
}): PrivateDataReadinessCheck[] {
  const cardCount = countFor(args.counts, "cards");
  const nationCount = countFor(args.counts, "nations");
  const rulesetCount = countFor(args.counts, "rulesets");
  const botStateCount = countFor(args.counts, "bot state tables");
  const botTradeCount = countFor(args.counts, "bot trade route tables");
  const anyCoverage = args.coverage.implemented > 0 || args.coverage.tested > 0;
  const referenceMessages = args.messages.filter((message) => message.field === "card_ref");
  const fatalReferenceCount = referenceMessages.filter((message) => message.level === "fatal").length;
  const warningReferenceCount = referenceMessages.filter((message) => message.level === "warning").length;
  return [
    {
      id: "fatal-free",
      label: "Validator Gate",
      status: args.fatal > 0 ? "blocked" : args.warnings > 0 ? "warning" : "ready",
      detail: args.fatal > 0
        ? `${args.fatal} fatal issue${args.fatal === 1 ? "" : "s"} must be fixed before setup can use this data.`
        : args.warnings > 0
          ? `${args.warnings} warning${args.warnings === 1 ? "" : "s"} remain; review before playtest.`
          : "No fatal or warning validator messages."
    },
    {
      id: "cards",
      label: "Cards",
      status: cardCount > 0 ? "ready" : "blocked",
      detail: cardCount > 0 ? `${cardCount} card${cardCount === 1 ? "" : "s"} loaded.` : "No private cards loaded."
    },
    {
      id: "nations",
      label: "Nations",
      status: nationCount > 0 ? "ready" : "blocked",
      detail: nationCount > 0 ? `${nationCount} nation${nationCount === 1 ? "" : "s"} loaded.` : "No private nations loaded."
    },
    {
      id: "references",
      label: "Card References",
      status: fatalReferenceCount > 0 ? "blocked" : warningReferenceCount > 0 ? "warning" : cardCount > 0 && nationCount > 0 ? "ready" : "warning",
      detail: fatalReferenceCount > 0
        ? `${fatalReferenceCount} missing card reference${fatalReferenceCount === 1 ? "" : "s"} must be fixed before setup can use this data.`
        : warningReferenceCount > 0
          ? `${warningReferenceCount} missing card reference warning${warningReferenceCount === 1 ? "" : "s"} remain; confirm all source files were uploaded.`
          : cardCount > 0 && nationCount > 0
            ? "Uploaded nations only reference loaded private card ids."
            : "Upload both cards and nations to check cross-file card references."
    },
    {
      id: "rulesets",
      label: "Nation Rulesets",
      status: rulesetCount > 0 ? "ready" : "warning",
      detail: rulesetCount > 0 ? `${rulesetCount} ruleset${rulesetCount === 1 ? "" : "s"} loaded.` : "No nation rulesets loaded; default nation rules will be used where available."
    },
    {
      id: "solo-bot",
      label: "Solo Bot Tables",
      status: botStateCount > 0 && botTradeCount > 0 ? "ready" : "warning",
      detail: botStateCount > 0 && botTradeCount > 0
        ? `${botStateCount} bot state table${botStateCount === 1 ? "" : "s"} and ${botTradeCount} bot trade table${botTradeCount === 1 ? "" : "s"} loaded.`
        : "Solo/private bot coverage may be incomplete without both bot state and bot trade tables."
    },
    {
      id: "coverage",
      label: "Implemented/Tested Coverage",
      status: !anyCoverage ? "warning" : args.coverage.implemented === args.coverage.tested ? "ready" : "warning",
      detail: `${args.coverage.implemented} implemented / ${args.coverage.tested} tested records across validated card and bot tables.`
    }
  ];
}

export function buildPrivateDataDryRunReport(
  privateData: PrivateDataBundle,
  csvRowsByRole: CsvRowsByRole = {},
  fileStatuses: PrivateDataFileStatus[] = [],
  now = new Date()
): PrivateDataDryRunReport {
  const messages: PrivateDataDryRunMessage[] = [];
  const coverage = { implemented: 0, tested: 0 };
  const counts = getPrivateDataRecordCounts(privateData);

  fileStatuses
    .filter((file) => file.status === "error")
    .forEach((file) => messages.push({ level: "fatal", scope: "file", message: `${file.name}: ${file.message}` }));

  fileStatuses
    .filter((file) => file.status === "skipped")
    .forEach((file) => messages.push({ level: "warning", scope: "file", message: `${file.name}: ${file.message}` }));

  if (csvRowsByRole.cards) {
    const report = validatePrivateCardsRows(csvRowsByRole.cards as any);
    coverage.implemented += coverageFromReport(report).implemented;
    coverage.tested += coverageFromReport(report).tested;
    messages.push(...mapReportMessages("cards", report.errors));
  }

  const knownCardIds = new Set<string>([
    ...(csvRowsByRole.cards ?? []).map((row) => row.card_id?.trim()).filter((cardId): cardId is string => Boolean(cardId)),
    ...(privateData.cards ?? []).map((card) => card.id).filter(Boolean)
  ]);

  if (csvRowsByRole.nations) {
    const report = validatePrivateNationsRows(csvRowsByRole.nations, knownCardIds, knownCardIds.size === 0);
    messages.push(...mapReportMessages("nations", report.errors));
  }
  if (csvRowsByRole.nationRulesets) {
    const report = validatePrivateNationRulesetsRows(csvRowsByRole.nationRulesets as any);
    messages.push(...mapReportMessages("nationRulesets", report.errors));
  }
  if (csvRowsByRole.nationStrategy) {
    const report = validatePrivateNationStrategyRows(csvRowsByRole.nationStrategy as any);
    messages.push(...mapReportMessages("nationStrategy", report.errors));
  }
  if (csvRowsByRole.botStateTables) {
    const report = validatePrivateBotStateTableRows(csvRowsByRole.botStateTables as any);
    coverage.implemented += coverageFromReport(report).implemented;
    coverage.tested += coverageFromReport(report).tested;
    messages.push(...mapReportMessages("botStateTables", report.errors));
  }
  if (csvRowsByRole.botTradeRoutesTables) {
    const report = validatePrivateBotTradeRoutesTableRows(csvRowsByRole.botTradeRoutesTables as any);
    coverage.implemented += coverageFromReport(report).implemented;
    coverage.tested += coverageFromReport(report).tested;
    messages.push(...mapReportMessages("botTradeRoutesTables", report.errors));
  }

  if (!counts.length) {
    messages.push({ level: "warning", scope: "bundle", message: "No usable private data records were loaded." });
  }
  if (counts.length && !(privateData.cards?.length)) {
    messages.push({ level: "warning", scope: "bundle", message: "No private cards were loaded; private nations may not be playable yet." });
  }
  if (counts.length && !(privateData.nations?.length)) {
    messages.push({ level: "warning", scope: "bundle", message: "No private nations were loaded; setup will fall back to demo nations." });
  }

  const fatal = messages.filter((message) => message.level === "fatal").length;
  const warnings = messages.filter((message) => message.level === "warning").length;
  const status = fatal > 0 ? "fatal" : counts.length === 0 ? "empty" : warnings > 0 ? "warning" : "ready";
  return {
    schemaVersion: 1,
    status,
    generatedAtIso: now.toISOString(),
    fatal,
    warnings,
    counts,
    coverage,
    messages,
    readinessChecks: buildReadinessChecks({ counts, fatal, warnings, coverage, messages })
  };
}

export function buildPrivateDataDryRunIssueSummary(report: PrivateDataDryRunReport): string {
  const counts = report.counts.map((item) => `${item.count} ${item.label}`).join(", ") || "0 records";
  const nextStep = report.fatal > 0
    ? "Fix fatal preview issues, export corrected CSVs, then rerun npm run private:status."
    : "Run npm run private:status after exporting CSVs; run npm run private:gate once all required local files have rows.";
  const lines = [
    "Polity Engine private-data import preview",
    `Status: ${report.status}`,
    `Generated: ${report.generatedAtIso}`,
    `Records: ${counts}`,
    `Issues: ${report.fatal} fatal / ${report.warnings} warnings`,
    `Coverage: ${report.coverage.implemented} implemented / ${report.coverage.tested} tested`,
    `Next step: ${nextStep}`,
    "Readiness checks:",
    ...report.readinessChecks.map((check) => `- ${check.status.toUpperCase()} ${check.label}: ${check.detail}`),
    "Top messages:",
    ...(report.messages.slice(0, 12).map((message) => {
      const location = [
        message.scope,
        message.row === undefined ? undefined : `row ${message.row}`,
        message.field
      ].filter(Boolean).join(" / ");
      return `- ${message.level.toUpperCase()} ${location}: ${message.message}`;
    }))
  ];
  if (report.messages.length > 12) lines.push(`- ${report.messages.length - 12} more message(s) in the downloaded validation report.`);
  lines.push("");
  lines.push("No private card text, private names, or parsed private payloads are included in this summary.");
  return lines.join("\n");
}

export function buildPrivateDataDryRunDownload(report: PrivateDataDryRunReport) {
  return {
    kind: "polity-private-data-import-preview",
    privacy: "public-safe: counts, filenames, roles, row numbers, fields, and validator messages only",
    recommendedCommands: ["npm run private:status", "npm run private:gate"],
    nextStep: report.fatal > 0
      ? "Fix fatal preview issues before applying private data or running the strict private gate."
      : "Run npm run private:status after exporting CSVs, then npm run private:gate once all required local private CSV files have rows.",
    report
  };
}

export async function importPrivateDataFiles(files: PrivateDataFileInput[]): Promise<PrivateDataImportResult> {
  const privateData: PrivateDataBundle = {};
  const statuses: PrivateDataFileStatus[] = [];
  const csvRowsByRole: CsvRowsByRole = {};
  for (const file of files) {
    const role = roleFromFileName(file.name);
    const format = formatFromFileName(file.name);
    if (!role || !format) {
      statuses.push({ name: file.name, role, format, status: "skipped", message: "Unrecognized private data file name or extension." });
      continue;
    }
    try {
      const text = await inputText(file);
      const value = format === "json" ? parseJsonRole(role, text) : (() => {
        const rows = parseCsv(text);
        csvRowsByRole[role] = rows;
        return normalizeCsvRows(role, rows);
      })();
      const count = assignRole(privateData, role, value);
      statuses.push({ name: file.name, role, format, status: "loaded", message: `Loaded ${count} ${count === 1 ? "record" : "records"}.` });
    } catch (error) {
      statuses.push({ name: file.name, role, format, status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { privateData, files: statuses, dryRunReport: buildPrivateDataDryRunReport(privateData, csvRowsByRole, statuses) };
}

export function hasPrivateData(privateData: PrivateDataBundle): boolean {
  return Boolean(
    privateData.cards?.length
    || privateData.nations?.length
    || privateData.nationRulesets?.length
    || privateData.nationStrategy?.length
    || Object.keys(privateData.botStateTables ?? {}).length
    || Object.keys(privateData.botTradeRoutesTables ?? {}).length
  );
}

export function getPrivateDataRecordCounts(privateData: PrivateDataBundle): PrivateDataRecordCount[] {
  return privateDataCountLabels
    .map(({ key, label }) => {
      const value = privateData[key];
      return {
        label,
        count: Array.isArray(value) ? value.length : Object.keys(value ?? {}).length
      };
    })
    .filter((item) => item.count > 0);
}

export function getPrivateDataReadyMessage(counts: PrivateDataRecordCount[]): string {
  if (!counts.length) return "No private data loaded yet.";
  const labels = counts.map((item) => {
    const meta = privateDataCountLabels.find((entry) => entry.label === item.label);
    const label = item.count === 1 ? meta?.singular ?? item.label : item.label;
    return `${item.count} ${label}`;
  });
  return `Private data loaded for this game: ${labels.join(", ")}.`;
}
