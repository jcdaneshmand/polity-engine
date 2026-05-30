import type { BotStateTable } from "../../../../engine/src/solo/botStateTableTypes";

export type NationOption = { id: string; label: string };
export type BotNationSetupStatus = "ready" | "partial" | "missing";
export type BotNationSetupOption = NationOption & {
  status: BotNationSetupStatus;
  statusLabel: string;
};

function statusLabel(status: BotNationSetupStatus): string {
  if (status === "ready") return "Ready";
  if (status === "partial") return "Incomplete bot table";
  return "Missing bot table";
}

function statusForTables(tables: BotStateTable[]): BotNationSetupStatus {
  if (tables.length === 0) return "missing";
  const sides = new Set(tables.map((table) => String(table.side ?? "").toUpperCase()));
  const rows = tables.flatMap((table) => table.rows ?? []);
  const allRowsReady = rows.length > 0 && rows.every((row) => row.implemented && row.tested);
  return sides.has("S") && sides.has("F") && allRowsReady ? "ready" : "partial";
}

export function getBotNationSetupOptions(nations: NationOption[], botStateTables: Record<string, BotStateTable>): BotNationSetupOption[] {
  const tablesByNation = new Map<string, BotStateTable[]>();
  for (const table of Object.values(botStateTables)) {
    const current = tablesByNation.get(table.botNationId) ?? [];
    current.push(table);
    tablesByNation.set(table.botNationId, current);
  }
  return nations.map((nation) => {
    const status = statusForTables(tablesByNation.get(nation.id) ?? []);
    return { ...nation, status, statusLabel: statusLabel(status) };
  });
}
