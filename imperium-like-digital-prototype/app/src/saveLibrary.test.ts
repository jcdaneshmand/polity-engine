import { describe, expect, it } from "vitest";
import { serializeLocalGame, LOCAL_GAME_SAVE_STORAGE_KEY, importLocalGameExport } from "./localGameSave";
import { migrateLegacySave, readSaveLibrary, SAVE_LIBRARY_KEY, writeSaveLibrary } from "./saveLibrary";
function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
const raw = serializeLocalGame({ privateDataFingerprint: "placeholder", state: { G: { options: { mode: "practice" }, round: 2 }, ctx: { currentPlayer: "0" } } });
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
});
