import { describe, expect, it } from "vitest";
import { CURRENT_RULES_VERSION } from "../../engine/src/game/version";
import { createSetupPresetSettings, getUnavailableSetupReferences, inspectSetupPreset, parseSetupPreset, readSetupPresetLibrary, SETUP_PRESETS_BACKUP_KEY, SETUP_PRESETS_KEY, writeSetupPresetLibrary, type SetupPreset } from "./setupPresets";

function storage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); }
  };
}

const preset: SetupPreset = {
  version: 1,
  id: "preset-1",
  name: "Solo Trade",
  rulesVersion: CURRENT_RULES_VERSION,
  settings: {
    mode: "solo",
    playerCount: 1,
    commonsSetId: "custom",
    customCommonsCardIds: ["commons-a", "commons-b"],
    enabledExpansions: ["trade_routes"],
    enabledVariants: ["quick_setup"],
    replacementPolicy: "prefer_latest",
    soloDifficulty: "imperator",
    campaignMode: "standard",
    playerNationIds: { "1": "nation-a" },
    soloBotNationId: "nation-b"
  }
};

describe("whole-setup presets", () => {
  it("round-trips every supported setting without private or campaign records", () => {
    expect(parseSetupPreset(JSON.stringify(preset))).toEqual(preset);
    expect(JSON.stringify(preset)).not.toContain("privateData");
    expect(JSON.stringify(preset)).not.toContain("campaignProgress");
  });

  it("creates a strict settings snapshot from launch options", () => {
    expect(createSetupPresetSettings({
      options: { ...preset.settings, campaignProgress: { private: "not allowed" } as any },
      playerNationIds: preset.settings.playerNationIds,
      soloBotNationId: preset.settings.soloBotNationId
    })).toEqual(preset.settings);
  });

  it.each([
    { ...preset, accountID: "account-1" },
    { ...preset, settings: { ...preset.settings, credentials: "secret" } },
    { ...preset, settings: { ...preset.settings, enabledVariants: ["quick_setup", "quick_setup"] } },
    { ...preset, settings: { ...preset.settings, playerNationIds: { "1": "nation-a", "2": "nation-b" } } },
    { ...preset, settings: { ...preset.settings, customCommonsCardIds: ["bad id"] } }
  ])("rejects unsupported, duplicate, extra-seat, or malformed input", (value) => {
    expect(() => parseSetupPreset(JSON.stringify(value))).toThrow();
  });

  it("keeps future versions and rules recoverable but unapplied", () => {
    const futureSchema = JSON.stringify({ ...preset, version: 2 });
    const futureRules = JSON.stringify({ ...preset, rulesVersion: CURRENT_RULES_VERSION + 1 });
    expect(inspectSetupPreset(futureSchema)).toMatchObject({ kind: "incompatible", raw: futureSchema });
    expect(inspectSetupPreset(futureRules)).toMatchObject({ kind: "incompatible", raw: futureRules });
  });

  it("preserves unavailable nation references for exact blocking feedback", () => {
    const parsed = parseSetupPreset(JSON.stringify(preset));
    expect(getUnavailableSetupReferences(parsed.settings, new Set(["nation-a"]))).toEqual({ playerIds: [], botNationId: "nation-b" });
    expect(getUnavailableSetupReferences({ ...parsed.settings, playerNationIds: { "1": "missing-nation" } }, new Set(["nation-a"]))).toEqual({ playerIds: ["1"], botNationId: "nation-b" });
    expect(parsed.settings.playerNationIds["1"]).toBe("nation-a");
  });

  it("rejects incoherent Supreme Ruler setup without normalizing it", () => {
    expect(() => parseSetupPreset(JSON.stringify({
      ...preset,
      settings: { ...preset.settings, campaignMode: "supreme_ruler", soloDifficulty: "chieftain" }
    }))).toThrow("Supreme Ruler difficulty");
  });

  it("rejects stale writes and leaves the current library intact", () => {
    const store = storage();
    const old = readSetupPresetLibrary(store);
    writeSetupPresetLibrary(store, old, [preset]);
    const currentRaw = store.getItem(SETUP_PRESETS_KEY);
    expect(() => writeSetupPresetLibrary(store, old, [])).toThrow("another tab");
    expect(store.getItem(SETUP_PRESETS_KEY)).toBe(currentRaw);
  });

  it("preserves the prior library and backup when storage quota fails", () => {
    const store = storage();
    const current = writeSetupPresetLibrary(store, readSetupPresetLibrary(store), [preset]);
    const original = store.getItem(SETUP_PRESETS_KEY);
    const failing = {
      getItem: store.getItem,
      setItem: (key: string, value: string) => {
        if (key === SETUP_PRESETS_KEY) throw new Error("Quota exceeded");
        store.setItem(key, value);
      }
    };
    expect(() => writeSetupPresetLibrary(failing, current, [])).toThrow("Quota");
    expect(store.getItem(SETUP_PRESETS_KEY)).toBe(original);
    expect(store.getItem(SETUP_PRESETS_BACKUP_KEY)).toBe(original);
  });

  it("preserves malformed libraries on read", () => {
    const store = storage();
    store.setItem(SETUP_PRESETS_KEY, "{broken");
    expect(() => readSetupPresetLibrary(store)).toThrow();
    expect(store.getItem(SETUP_PRESETS_KEY)).toBe("{broken");
  });
});
