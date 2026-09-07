import { CURRENT_RULES_VERSION, importLocalGameExport, inspectLocalGameExport, LOCAL_GAME_SAVE_STORAGE_KEY, type LocalGameRecoverySummary, type SavedLocalGameEnvelope } from "./localGameSave";

export const SAVE_LIBRARY_KEY = "polity-engine.saveLibrary.v2";
export const SAVE_LIBRARY_BACKUP_KEY = "polity-engine.saveLibrary.recovery-backup.v1";
export const MAX_SAVE_LIBRARY_BYTES = 16 * 1024 * 1024;
export type SaveSlot = { id: string; envelope: SavedLocalGameEnvelope; sourceIndex?: number };
export type RecoverableSaveSlot = {
  id: string;
  sourceIndex: number;
  kind: "legacy-incompatible" | "future-version" | "corrupt" | "unsupported-format";
  reason: string;
  summary: LocalGameRecoverySummary;
  storedSlot: unknown;
};
export type SaveLibrary = {
  version: 2;
  stateVersion: 1;
  rulesVersion: SavedLocalGameEnvelope["rulesVersion"];
  revision: number;
  slots: SaveSlot[];
  recoverableSlots?: RecoverableSaveSlot[];
  sourceSlots?: unknown[];
  rawSource?: string;
  legacyImported?: boolean;
};
type SaveStorage = Pick<Storage, "getItem" | "setItem">;

function validateEnvelope(value: unknown): SavedLocalGameEnvelope {
  const result = importLocalGameExport(JSON.stringify(value));
  if (result.kind !== "valid") throw new Error(result.reason);
  return { ...result.envelope, stateVersion: 1 };
}

export function readSaveLibrary(storage: SaveStorage): SaveLibrary {
  const raw = storage.getItem(SAVE_LIBRARY_KEY);
  if (!raw) return { version: 2, stateVersion: 1, rulesVersion: CURRENT_RULES_VERSION, revision: 0, slots: [] };
  if (new TextEncoder().encode(raw).byteLength > MAX_SAVE_LIBRARY_BYTES) {
    throw new Error(`Saved-game library exceeds the ${MAX_SAVE_LIBRARY_BYTES / (1024 * 1024)} MB recovery limit. Export the raw library before resetting it.`);
  }
  const parsed = JSON.parse(raw);
  if (![1, 2].includes(parsed?.version) || (parsed.stateVersion !== undefined && parsed.stateVersion !== 1)) {
    throw new Error("Unsupported saved-game library version. Export or reopen with a compatible app.");
  }
  if (!Array.isArray(parsed.slots) || !Number.isSafeInteger(parsed.revision) || parsed.revision < 0) {
    throw new Error("Saved-game library is damaged. Stored data has been preserved.");
  }
  const ids = new Set<string>();
  const slots: SaveSlot[] = [];
  const recoverableSlots: RecoverableSaveSlot[] = [];
  parsed.slots.forEach((storedSlot: unknown, sourceIndex: number) => {
    const slot = storedSlot && typeof storedSlot === "object" ? storedSlot as Record<string, unknown> : undefined;
    const candidateId = typeof slot?.id === "string" && slot.id.trim() ? slot.id.slice(0, 120) : `recovery-${sourceIndex + 1}`;
    if (!slot || typeof slot.id !== "string" || !slot.id.trim() || ids.has(slot.id)) {
      recoverableSlots.push({
        id: candidateId,
        sourceIndex,
        kind: "corrupt",
        reason: ids.has(String(slot?.id)) ? "Duplicate saved-game slot ID." : "Invalid saved-game slot ID.",
        summary: { slotName: "Unreadable save slot" },
        storedSlot
      });
      return;
    }
    ids.add(slot.id);
    const inspection = inspectLocalGameExport(JSON.stringify(slot.envelope));
    if (inspection.kind === "playable") {
      slots.push({ id: slot.id, envelope: inspection.envelope, sourceIndex });
      return;
    }
    recoverableSlots.push({
      id: candidateId,
      sourceIndex,
      kind: inspection.kind,
      reason: inspection.reason,
      summary: inspection.summary,
      storedSlot
    });
  });
  return {
    version: 2,
    stateVersion: 1,
    rulesVersion: CURRENT_RULES_VERSION,
    revision: parsed.revision,
    slots,
    recoverableSlots,
    sourceSlots: parsed.slots,
    rawSource: raw,
    legacyImported: parsed.legacyImported === true
  };
}

// One localStorage write commits the whole library. Web Locks serialize cooperating tabs.
export function writeSaveLibrary(storage: SaveStorage, expected: SaveLibrary, slots: SaveSlot[], legacyImported = expected.legacyImported): SaveLibrary {
  const current = readSaveLibrary(storage);
  if (current.revision !== expected.revision) throw new Error("Saved games changed in another tab. Refresh and retry.");
  const ids = new Set<string>();
  const currentSourceIndexById = new Map(current.slots.map((slot) => [slot.id, slot.sourceIndex]));
  const validated = slots.map((slot) => {
    if (!slot.id || ids.has(slot.id)) throw new Error("Duplicate saved-game slot ID.");
    ids.add(slot.id);
    return { id: slot.id, envelope: validateEnvelope(slot.envelope), sourceIndex: slot.sourceIndex ?? currentSourceIndexById.get(slot.id) };
  });
  const bySourceIndex = new Map(validated.filter((slot) => slot.sourceIndex !== undefined).map((slot) => [slot.sourceIndex!, slot]));
  const recoveryBySourceIndex = new Map((current.recoverableSlots ?? []).map((slot) => [slot.sourceIndex, slot.storedSlot]));
  const persistedSlots: unknown[] = [];
  for (let sourceIndex = 0; sourceIndex < (current.sourceSlots?.length ?? 0); sourceIndex += 1) {
    if (recoveryBySourceIndex.has(sourceIndex)) {
      persistedSlots.push(recoveryBySourceIndex.get(sourceIndex));
      continue;
    }
    const slot = bySourceIndex.get(sourceIndex);
    if (slot) persistedSlots.push({ id: slot.id, envelope: slot.envelope });
  }
  for (const slot of validated.filter((candidate) => candidate.sourceIndex === undefined)) {
    persistedSlots.push({ id: slot.id, envelope: slot.envelope });
  }
  const persisted = {
    version: 2,
    stateVersion: 1,
    rulesVersion: CURRENT_RULES_VERSION,
    revision: current.revision + 1,
    slots: persistedSlots,
    ...(legacyImported !== undefined ? { legacyImported } : {})
  };
  const currentRaw = storage.getItem(SAVE_LIBRARY_KEY);
  if (currentRaw && !storage.getItem(SAVE_LIBRARY_BACKUP_KEY)) storage.setItem(SAVE_LIBRARY_BACKUP_KEY, currentRaw);
  storage.setItem(SAVE_LIBRARY_KEY, JSON.stringify(persisted));
  return readSaveLibrary(storage);
}

export function migrateLegacySave(storage: SaveStorage): SaveLibrary {
  const library = readSaveLibrary(storage);
  if (library.legacyImported) return library;
  const raw = storage.getItem(LOCAL_GAME_SAVE_STORAGE_KEY);
  if (!raw) return library;
  const result = importLocalGameExport(raw);
  if (result.kind !== "valid") return library;
  const envelope = { ...result.envelope, metadata: { ...result.envelope.metadata, slotName: "Recovered Autosave" } };
  return writeSaveLibrary(storage, library, [...library.slots, { id: crypto.randomUUID(), envelope }], true);
}

export async function withSaveLibraryLock<T>(action: () => T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(SAVE_LIBRARY_KEY, action);
  return action();
}

export function readRawSaveLibrary(storage: Pick<Storage, "getItem">): string | null {
  return storage.getItem(SAVE_LIBRARY_KEY);
}

export function readSaveLibraryBackup(storage: Pick<Storage, "getItem">): string | null {
  return storage.getItem(SAVE_LIBRARY_BACKUP_KEY);
}

export function resetSaveLibraryAfterBackup(storage: Pick<Storage, "getItem" | "setItem" | "removeItem">): void {
  const raw = storage.getItem(SAVE_LIBRARY_KEY);
  if (raw) storage.setItem(SAVE_LIBRARY_BACKUP_KEY, raw);
  storage.removeItem(SAVE_LIBRARY_KEY);
}
