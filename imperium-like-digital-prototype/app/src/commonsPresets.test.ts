import { describe, expect, it } from "vitest";
import { commonsComposition, parseCommonsPreset, readCommonsPresets, writeCommonsPresets } from "./commonsPresets";
const preset = { version: 1, id: "fixture", name: "Fictional pool", setId: "custom", cardIds: ["fixture_a", "fixture_b"] };
describe("Commons presets", () => {
  it("preserves the newer library on stale edits and quota failure", () => {
    const current = JSON.stringify([preset]);
    const storage = { getItem: () => current, setItem: () => { throw new Error("Quota exceeded"); } };
    expect(() => writeCommonsPresets(storage, null, [])).toThrow("another tab");
    expect(() => writeCommonsPresets(storage, current, [])).toThrow("Quota");
    expect(storage.getItem()).toBe(current);
  });
  it("round-trips IDs without card payloads", () => {
    expect(parseCommonsPreset(JSON.stringify(preset))).toEqual(preset);
    expect(readCommonsPresets(JSON.stringify([preset]))).toEqual([preset]);
  });
  it("detects removed cards and counts composition without mutating selections", () => {
    const cards = [{ id: "fixture_a", group: "region" }];
    expect(commonsComposition(preset.cardIds, cards)).toEqual({ missing: ["fixture_b"], groups: { region: 1 }, valid: false });
    expect(preset.cardIds).toHaveLength(2);
    expect(commonsComposition([], cards).valid).toBe(false);
  });
  it.each([{ ...preset, version: 2 }, { ...preset, rawEffectTextPrivate: "secret" }, { ...preset, cardIds: ["a", "a"] }, { ...preset, cardIds: [null] }])("rejects incompatible or unsafe imports", (value) => {
    expect(() => parseCommonsPreset(JSON.stringify(value))).toThrow();
  });
  it("rejects damaged and duplicate libraries", () => {
    expect(() => readCommonsPresets("{broken")).toThrow();
    expect(() => readCommonsPresets(JSON.stringify([preset, preset]))).toThrow("Duplicate");
  });
});
