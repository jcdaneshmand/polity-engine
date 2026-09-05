import { importLocalGameExport, LOCAL_GAME_SAVE_STORAGE_KEY, type SavedLocalGameEnvelope } from "./localGameSave";

export const SAVE_LIBRARY_KEY = "polity-engine.saveLibrary.v2";
export type SaveSlot = { id: string; envelope: SavedLocalGameEnvelope };
export type SaveLibrary = { version: 2; stateVersion: 1; revision: number; slots: SaveSlot[]; legacyImported?: boolean };
type SaveStorage = Pick<Storage, "getItem" | "setItem">;

function validateEnvelope(value: unknown): SavedLocalGameEnvelope {
  const result = importLocalGameExport(JSON.stringify(value));
  if (result.kind !== "valid") throw new Error(result.reason);
  return { ...result.envelope, stateVersion: 1 };
}

export function readSaveLibrary(storage: SaveStorage): SaveLibrary {
  const raw = storage.getItem(SAVE_LIBRARY_KEY);
  if (!raw) return { version: 2, stateVersion: 1, revision: 0, slots: [] };
  const parsed = JSON.parse(raw);
  if (![1, 2].includes(parsed?.version) || (parsed.stateVersion !== undefined && parsed.stateVersion !== 1)) {
    throw new Error("Unsupported saved-game library version. Export or reopen with a compatible app.");
  }
  if (!Array.isArray(parsed.slots) || !Number.isSafeInteger(parsed.revision) || parsed.revision < 0) {
    throw new Error("Saved-game library is damaged. Stored data has been preserved.");
  }
  const ids = new Set<string>();
  const slots = parsed.slots.map((slot: SaveSlot) => {
    if (typeof slot.id !== "string" || !slot.id || ids.has(slot.id)) throw new Error("Invalid saved-game slot ID.");
    ids.add(slot.id);
    return { id: slot.id, envelope: validateEnvelope(slot.envelope) };
  });
  return { version: 2, stateVersion: 1, revision: parsed.revision, slots, legacyImported: parsed.legacyImported === true };
}

// One localStorage write commits the whole library. Web Locks serialize cooperating tabs.
export function writeSaveLibrary(storage: SaveStorage, expected: SaveLibrary, slots: SaveSlot[], legacyImported = expected.legacyImported): SaveLibrary {
  const current = readSaveLibrary(storage);
  if (current.revision !== expected.revision) throw new Error("Saved games changed in another tab. Refresh and retry.");
  const ids = new Set<string>();
  const validated = slots.map((slot) => {
    if (!slot.id || ids.has(slot.id)) throw new Error("Duplicate saved-game slot ID.");
    ids.add(slot.id);
    return { id: slot.id, envelope: validateEnvelope(slot.envelope) };
  });
  const next: SaveLibrary = { version: 2, stateVersion: 1, revision: current.revision + 1, slots: validated, legacyImported };
  storage.setItem(SAVE_LIBRARY_KEY, JSON.stringify(next));
  return next;
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
