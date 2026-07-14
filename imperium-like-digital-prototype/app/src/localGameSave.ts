export const LOCAL_GAME_SAVE_STORAGE_KEY = "polity-engine.localGame.v1";

export type SavedLocalGameEnvelope = {
  version: 1;
  savedAtIso: string;
  privateDataFingerprint: string;
  state: unknown;
};

export type SavedLocalGameRecord =
  | { kind: "none" }
  | { kind: "valid"; envelope: SavedLocalGameEnvelope }
  | { kind: "corrupt" };

type StorageReader = Pick<Storage, "getItem">;

const PRIVATE_FIELD_NAMES = new Set([
  "rawEffectTextPrivate",
  "officialName",
  "officialText",
  "officialRulesText"
]);

function containsPrivateField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPrivateField);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    PRIVATE_FIELD_NAMES.has(key) || containsPrivateField(nested)
  );
}

export function serializeLocalGame(input: {
  privateDataFingerprint: string;
  state: unknown;
  now?: Date;
}): string {
  if (containsPrivateField(input.state)) {
    throw new Error("Local game save contains private fields.");
  }
  return JSON.stringify({
    version: 1,
    savedAtIso: (input.now ?? new Date()).toISOString(),
    privateDataFingerprint: input.privateDataFingerprint,
    state: input.state
  } satisfies SavedLocalGameEnvelope);
}

export function parseSavedLocalGame(raw: string): SavedLocalGameEnvelope | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const envelope = parsed as Partial<SavedLocalGameEnvelope>;
  if (envelope.version !== 1) return null;
  if (typeof envelope.savedAtIso !== "string" || Number.isNaN(Date.parse(envelope.savedAtIso))) return null;
  if (typeof envelope.privateDataFingerprint !== "string") return null;
  if (!("state" in envelope)) return null;
  if (containsPrivateField(envelope.state)) return null;
  return envelope as SavedLocalGameEnvelope;
}

export function loadSavedLocalGameRecord(storage: StorageReader | undefined): SavedLocalGameRecord {
  if (!storage) return { kind: "none" };
  const raw = storage.getItem(LOCAL_GAME_SAVE_STORAGE_KEY);
  if (!raw) return { kind: "none" };
  const envelope = parseSavedLocalGame(raw);
  return envelope ? { kind: "valid", envelope } : { kind: "corrupt" };
}

export function createLocalGameRestoreEnhancer(envelope: SavedLocalGameEnvelope | undefined) {
  return (createStore: any) => (reducer: any, preloadedState: unknown, enhancer?: any) =>
    createStore(reducer, envelope?.state ?? preloadedState, enhancer);
}
