import { existsSync, readFileSync } from "node:fs";
import { writeJsonFileSync } from "./jsonFileStore";

export type MonthlySupportStatus = {
  month: string;
  isCovered: boolean;
  coveredAt?: string;
};

type SupportStoreOptions = {
  now?: () => string;
  storageFile?: string;
};

type SupportStoreSnapshot = {
  coveredMonths: Record<string, { coveredAt: string }>;
};

function currentMonth(now: () => string): string {
  return now().slice(0, 7);
}

function loadSnapshot(storageFile: string | undefined): SupportStoreSnapshot {
  if (!storageFile || !existsSync(storageFile)) return { coveredMonths: {} };
  return JSON.parse(readFileSync(storageFile, "utf8")) as SupportStoreSnapshot;
}

export function createSupportStore(options: SupportStoreOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  const snapshot = loadSnapshot(options.storageFile);

  function persist(): void {
    if (!options.storageFile) return;
    writeJsonFileSync(options.storageFile, snapshot);
  }

  function statusForMonth(month = currentMonth(now)): MonthlySupportStatus {
    const covered = snapshot.coveredMonths[month];
    return {
      month,
      isCovered: Boolean(covered),
      ...(covered ? { coveredAt: covered.coveredAt } : {})
    };
  }

  return {
    currentStatus(): MonthlySupportStatus {
      return statusForMonth();
    },

    markCurrentMonthCovered(): MonthlySupportStatus {
      const month = currentMonth(now);
      snapshot.coveredMonths[month] = { coveredAt: now() };
      persist();
      return statusForMonth(month);
    }
  };
}

export type SupportStore = ReturnType<typeof createSupportStore>;
