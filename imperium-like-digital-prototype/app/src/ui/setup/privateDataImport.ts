import Papa from "papaparse";
import type { PrivateDataBundle } from "../../../../engine/src/setup/privateDataBundle";
import { normalizeBotStateTables } from "../../../../tools/card-import/normalizeBotStateTable";
import { normalizeBotTradeRoutesTables } from "../../../../tools/card-import/normalizeBotTradeRoutesTable";
import { normalizeCard } from "../../../../tools/card-import/normalizeCard";
import { normalizeNation } from "../../../../tools/card-import/normalizeNation";
import { normalizeNationRuleset } from "../../../../tools/card-import/normalizeNationRuleset";
import { normalizeNationStrategy } from "../../../../tools/card-import/normalizeNationStrategy";

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
};

export type PrivateDataRecordCount = {
  label: string;
  count: number;
};

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

function normalizeCsv(role: PrivateDataRole, text: string): unknown {
  const rows = parseCsv(text);
  switch (role) {
    case "cards":
      return rows.map((row) => normalizeCard(row));
    case "nations":
      return rows.map((row) => normalizeNation(row));
    case "nationRulesets":
      return rows.map((row) => normalizeNationRuleset(row));
    case "nationStrategy":
      return rows.map((row) => normalizeNationStrategy(row));
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

export async function importPrivateDataFiles(files: PrivateDataFileInput[]): Promise<PrivateDataImportResult> {
  const privateData: PrivateDataBundle = {};
  const statuses: PrivateDataFileStatus[] = [];
  for (const file of files) {
    const role = roleFromFileName(file.name);
    const format = formatFromFileName(file.name);
    if (!role || !format) {
      statuses.push({ name: file.name, role, format, status: "skipped", message: "Unrecognized private data file name or extension." });
      continue;
    }
    try {
      const text = await inputText(file);
      const value = format === "json" ? parseJsonRole(role, text) : normalizeCsv(role, text);
      const count = assignRole(privateData, role, value);
      statuses.push({ name: file.name, role, format, status: "loaded", message: `Loaded ${count} ${count === 1 ? "record" : "records"}.` });
    } catch (error) {
      statuses.push({ name: file.name, role, format, status: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { privateData, files: statuses };
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
