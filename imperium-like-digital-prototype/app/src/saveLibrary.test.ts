import { describe, expect, it } from "vitest";
import { CURRENT_RULES_VERSION, serializeLocalGame, LOCAL_GAME_SAVE_STORAGE_KEY, importLocalGameExport } from "./localGameSave";
import { migrateLegacySave, readRawSaveLibrary, readSaveLibrary, readSaveLibraryBackup, resetSaveLibraryAfterBackup, SAVE_LIBRARY_BACKUP_KEY, SAVE_LIBRARY_KEY, writeSaveLibrary } from "./saveLibrary";
function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); }
  };
}
const raw = serializeLocalGame({ privateDataFingerprint: "placeholder", state: { G: { rulesVersion: CURRENT_RULES_VERSION, stateVersion: 1, options: { mode: "practice" }, round: 2 }, ctx: { currentPlayer: "0" } } });
describe("saved-game library", () => {
  it("migrates once and retains the legacy source", () => {
    const store = storage(); store.setItem(LOCAL_GAME_SAVE_STORAGE_KEY, raw);
    expect(migrateLegacySave(store).slots).toHaveLength(1);
    expect(migrateLegacySave(store).slots).toHaveLength(1);
    expect(store.getItem(LOCAL_GAME_SAVE_STORAGE_KEY)).toBe(raw);
  });
  it("preserves independent slots and portable exports", () => {
    const store = storage(); const a = JSON.parse(raw); const b = JSON.parse(raw); b.state.G.round = 8;
    const first = writeSaveLibrary(store, readSaveLibrary(store), [{ id: "a", envelope: a }, { id: "b", envelope: b }]);
    a.metadata.slotName = "Renamed";
    const next = writeSaveLibrary(store, first, [{ id: "a", envelope: a }, first.slots[1]]);
    expect((next.slots[1].envelope.state as any).G.round).toBe(8);
    expect(importLocalGameExport(JSON.stringify(next.slots[0].envelope)).kind).toBe("valid");
  });
  it("rejects stale tab edits", () => {
    const store = storage(); const old = readSaveLibrary(store);
    writeSaveLibrary(store, old, [{ id: "a", envelope: JSON.parse(raw) }]);
    expect(() => writeSaveLibrary(store, old, [])).toThrow("another tab");
    expect(readSaveLibrary(store).slots).toHaveLength(1);
  });
  it("preserves recovery data after quota failure", () => {
    const store = storage(); store.setItem(LOCAL_GAME_SAVE_STORAGE_KEY, raw);
    expect(() => migrateLegacySave({ ...store, setItem: () => { throw new Error("Quota exceeded"); } })).toThrow("Quota");
    expect(store.getItem(LOCAL_GAME_SAVE_STORAGE_KEY)).toBe(raw);
    expect(store.getItem(SAVE_LIBRARY_KEY)).toBeNull();
  });
  it.each(["{bad", JSON.stringify({ version: 99 }), JSON.stringify({ version: 2, stateVersion: 7, slots: [], revision: 0 })])("preserves damaged or unsupported libraries", (content) => {
    const store = storage(); store.setItem(SAVE_LIBRARY_KEY, content);
    expect(() => migrateLegacySave(store)).toThrow();
    expect(store.getItem(SAVE_LIBRARY_KEY)).toBe(content);
  });
  it("validates privacy and duplicate IDs before writes", () => {
    const store = storage(); const initial = readSaveLibrary(store); const envelope = JSON.parse(raw);
    envelope.state.G.privateName = "fictional secret";
    expect(() => writeSaveLibrary(store, initial, [{ id: "a", envelope }])).toThrow("private");
    expect(() => writeSaveLibrary(store, initial, [{ id: "a", envelope: JSON.parse(raw) }, { id: "a", envelope: JSON.parse(raw) }])).toThrow("Duplicate");
    expect(store.getItem(SAVE_LIBRARY_KEY)).toBeNull();
  });
  it("normalizes v1 libraries without rewriting on reads", () => {
    const store = storage(); const old = JSON.stringify({ version: 1, revision: 2, slots: [{ id: "a", envelope: JSON.parse(raw) }] });
    store.setItem(SAVE_LIBRARY_KEY, old);
    expect(readSaveLibrary(store).version).toBe(2);
    expect(store.getItem(SAVE_LIBRARY_KEY)).toBe(old);
  });

  it("keeps healthy slots usable beside legacy, future, malformed, and duplicate slots", () => {
    const store = storage();
    const healthy = JSON.parse(raw);
    const legacy = { ...JSON.parse(raw), rulesVersion: healthy.rulesVersion - 1 };
    const future = { ...JSON.parse(raw), rulesVersion: healthy.rulesVersion + 1 };
    future.state.G.rulesVersion = healthy.rulesVersion + 1;
    const original = JSON.stringify({
      version: 2,
      stateVersion: 1,
      revision: 4,
      slots: [
        { id: "healthy", envelope: healthy },
        { id: "legacy", envelope: legacy },
        { id: "future", envelope: future },
        { id: "broken", envelope: { version: 1 } },
        { id: "healthy", envelope: healthy }
      ]
    });
    store.setItem(SAVE_LIBRARY_KEY, original);

    const library = readSaveLibrary(store);
    expect(library.slots.map((slot) => slot.id)).toEqual(["healthy"]);
    expect(library.recoverableSlots?.map((slot) => slot.kind)).toEqual([
      "legacy-incompatible",
      "future-version",
      "legacy-incompatible",
      "corrupt"
    ]);
    expect(store.getItem(SAVE_LIBRARY_KEY)).toBe(original);

    const renamed = { ...library.slots[0], envelope: { ...library.slots[0].envelope, metadata: { ...library.slots[0].envelope.metadata, slotName: "Healthy renamed" } } };
    const written = writeSaveLibrary(store, library, [renamed]);
    expect(written.slots[0].envelope.metadata.slotName).toBe("Healthy renamed");
    expect(written.recoverableSlots).toHaveLength(4);
    expect(readSaveLibraryBackup(store)).toBe(original);
    expect(JSON.parse(store.getItem(SAVE_LIBRARY_KEY)!).slots.slice(1)).toEqual(JSON.parse(original).slots.slice(1));
  });

  it("backs up exact malformed library bytes before an explicit reset", () => {
    const store = storage();
    const malformed = "{malformed library bytes";
    store.setItem(SAVE_LIBRARY_KEY, malformed);
    expect(() => readSaveLibrary(store)).toThrow();
    expect(readRawSaveLibrary(store)).toBe(malformed);

    resetSaveLibraryAfterBackup(store);

    expect(store.getItem(SAVE_LIBRARY_KEY)).toBeNull();
    expect(store.getItem(SAVE_LIBRARY_BACKUP_KEY)).toBe(malformed);
    expect(readSaveLibrary(store).slots).toEqual([]);
  });

  it("leaves the current library intact when a post-backup write fails", () => {
    const store = storage();
    const initial = writeSaveLibrary(store, readSaveLibrary(store), [{ id: "healthy", envelope: JSON.parse(raw) }]);
    const original = store.getItem(SAVE_LIBRARY_KEY)!;
    const failing = {
      getItem: store.getItem,
      setItem: (key: string, value: string) => {
        if (key === SAVE_LIBRARY_KEY) throw new Error("Quota exceeded");
        store.setItem(key, value);
      }
    };

    expect(() => writeSaveLibrary(failing, initial, [])).toThrow("Quota");
    expect(store.getItem(SAVE_LIBRARY_KEY)).toBe(original);
    expect(store.getItem(SAVE_LIBRARY_BACKUP_KEY)).toBe(original);
  });
});
