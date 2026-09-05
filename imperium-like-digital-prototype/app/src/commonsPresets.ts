export const COMMONS_PRESETS_KEY = "polity-engine.commonsPresets.v1";
export type CommonsPreset = { version: 1; id: string; name: string; cardIds: string[]; setId: "custom" };
export function parseCommonsPreset(raw: string): CommonsPreset {
  const value = JSON.parse(raw);
  if (!value || value.version !== 1 || value.setId !== "custom") throw new Error("Unsupported Commons preset version or set.");
  if (Object.keys(value).some((key) => !["version", "id", "name", "cardIds", "setId"].includes(key))) throw new Error("Preset contains unsupported fields.");
  if (typeof value.id !== "string" || !value.id || typeof value.name !== "string" || !value.name.trim() || value.name.length > 80) throw new Error("Preset needs a valid ID and name.");
  if (!Array.isArray(value.cardIds) || value.cardIds.length > 10000 || value.cardIds.some((id: unknown) => typeof id !== "string" || !/^[a-zA-Z0-9_.:-]{1,200}$/.test(id as string))) throw new Error("Preset contains invalid card IDs.");
  if (new Set(value.cardIds).size !== value.cardIds.length) throw new Error("Preset contains duplicate card IDs.");
  return { version: 1, id: value.id, name: value.name.trim(), setId: "custom", cardIds: [...value.cardIds] };
}
export function readCommonsPresets(raw: string | null): CommonsPreset[] {
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error("Invalid preset library.");
  const presets = value.map((item) => parseCommonsPreset(JSON.stringify(item)));
  if (new Set(presets.map((p) => p.id)).size !== presets.length) throw new Error("Duplicate preset IDs.");
  return presets;
}

export function writeCommonsPresets(storage: Pick<Storage, "getItem" | "setItem">, snapshot: string | null, presets: CommonsPreset[]): string {
  if (storage.getItem(COMMONS_PRESETS_KEY) !== snapshot) throw new Error("Presets changed in another tab. Refresh presets before saving.");
  const raw = JSON.stringify(presets);
  readCommonsPresets(raw);
  storage.setItem(COMMONS_PRESETS_KEY, raw);
  return raw;
}

export async function withCommonsPresetLock<T>(action: () => T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(COMMONS_PRESETS_KEY, action);
  return action();
}
export function commonsComposition(ids: string[], cards: Array<{ id: string; group: string }>) {
  const available = new Map(cards.map((card) => [card.id, card]));
  const missing = ids.filter((id) => !available.has(id));
  const groups: Record<string, number> = {};
  for (const id of ids) { const card = available.get(id); if (card) groups[card.group] = (groups[card.group] ?? 0) + 1; }
  return { missing, groups, valid: ids.length > 0 && missing.length === 0 && new Set(ids).size === ids.length };
}
