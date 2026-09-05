import { redactGameStateForPlayer } from "../../engine/src/game/playerView";

export const LOCAL_GAME_SAVE_STORAGE_KEY = "polity-engine.localGame.v1";

export type LocalSaveMetadata = {
  slotName: string;
  mode: string;
  playerCount?: number;
  commonsSetId?: string;
  round?: number;
  currentPlayer?: string;
  enabledExpansions: string[];
  enabledVariants: string[];
  dataSource: "placeholder" | "private";
};

export type SavedLocalGameEnvelope = {
  version: 1;
  stateVersion?: 1;
  snapshotSource?: "authoritative-local";
  savedAtIso: string;
  privateDataFingerprint: string;
  metadata: LocalSaveMetadata;
  state: unknown;
};

export type SavedLocalGameRecord =
  | { kind: "none" }
  | { kind: "valid"; envelope: SavedLocalGameEnvelope }
  | { kind: "corrupt"; reason: string };

export type ImportedLocalGameExport =
  | { kind: "valid"; envelope: SavedLocalGameEnvelope }
  | { kind: "invalid"; reason: string };

type StorageReader = Pick<Storage, "getItem">;

type ParseSavedLocalGameResult =
  | { kind: "valid"; envelope: SavedLocalGameEnvelope }
  | { kind: "invalid"; reason: string };

const PRIVATE_FIELD_NAMES = new Set([
  "card_name_private",
  "private_effect_text",
  "private_notes",
  "private_trigger_label",
  "privateName",
  "privateEffectText",
  "rawEffectTextPrivate",
  "raw_effect_text_private",
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
  slotName?: string;
  snapshotSource?: "authoritative-local";
}): string {
  if (containsPrivateField(input.state)) {
    throw new Error("Local game save contains private fields.");
  }
  const savedAtIso = (input.now ?? new Date()).toISOString();
  return JSON.stringify({
    version: 1,
    stateVersion: 1,
    ...(input.snapshotSource ? { snapshotSource: input.snapshotSource } : {}),
    savedAtIso,
    privateDataFingerprint: input.privateDataFingerprint,
    metadata: createLocalSaveMetadata(input),
    state: input.state
  } satisfies SavedLocalGameEnvelope);
}

export function createLocalSaveMetadata(input: {
  privateDataFingerprint: string;
  state: unknown;
  slotName?: string;
}): LocalSaveMetadata {
  const state = input.state as any;
  const G = state?.G && typeof state.G === "object" ? state.G : {};
  const ctx = state?.ctx && typeof state.ctx === "object" ? state.ctx : {};
  const options = G.options && typeof G.options === "object" ? G.options : state?.options && typeof state.options === "object" ? state.options : {};
  return {
    slotName: input.slotName?.trim() || "Autosave",
    mode: typeof options.mode === "string" ? options.mode : "unknown",
    ...(typeof options.playerCount === "number" ? { playerCount: options.playerCount } : {}),
    ...(typeof options.commonsSetId === "string" ? { commonsSetId: options.commonsSetId } : {}),
    ...(typeof G.round === "number" ? { round: G.round } : {}),
    ...(ctx.currentPlayer !== undefined ? { currentPlayer: String(ctx.currentPlayer) } : {}),
    enabledExpansions: Array.isArray(options.enabledExpansions) ? options.enabledExpansions.filter((item: unknown): item is string => typeof item === "string") : [],
    enabledVariants: Array.isArray(options.enabledVariants) ? options.enabledVariants.filter((item: unknown): item is string => typeof item === "string") : [],
    dataSource: input.privateDataFingerprint === "placeholder" ? "placeholder" : "private"
  };
}

function normalizeSavedLocalGameMetadata(value: unknown, fallback: { privateDataFingerprint: string; state: unknown }): LocalSaveMetadata {
  if (!value || typeof value !== "object") return createLocalSaveMetadata(fallback);
  const metadata = value as Partial<LocalSaveMetadata>;
  return {
    ...createLocalSaveMetadata(fallback),
    ...(typeof metadata.slotName === "string" && metadata.slotName.trim() ? { slotName: metadata.slotName } : {}),
    ...(typeof metadata.mode === "string" ? { mode: metadata.mode } : {}),
    ...(typeof metadata.playerCount === "number" ? { playerCount: metadata.playerCount } : {}),
    ...(typeof metadata.commonsSetId === "string" ? { commonsSetId: metadata.commonsSetId } : {}),
    ...(typeof metadata.round === "number" ? { round: metadata.round } : {}),
    ...(metadata.currentPlayer !== undefined ? { currentPlayer: String(metadata.currentPlayer) } : {}),
    enabledExpansions: Array.isArray(metadata.enabledExpansions) ? metadata.enabledExpansions.filter((item: unknown): item is string => typeof item === "string") : [],
    enabledVariants: Array.isArray(metadata.enabledVariants) ? metadata.enabledVariants.filter((item: unknown): item is string => typeof item === "string") : [],
    dataSource: metadata.dataSource === "placeholder" || metadata.dataSource === "private"
      ? metadata.dataSource
      : fallback.privateDataFingerprint === "placeholder" ? "placeholder" : "private"
  };
}

function recoverLegacySnapshot(envelope: SavedLocalGameEnvelope): SavedLocalGameEnvelope {
  if (envelope.snapshotSource) return envelope;
  const state = envelope.state as any;
  const checkpoint = Array.isArray(state?._undo) ? state._undo.at(-1) : undefined;
  if (!checkpoint?.G?.players || !checkpoint.plugins || JSON.stringify(checkpoint.ctx) !== JSON.stringify(state.ctx)) return envelope;
  // Old player views omitted shared object references. Scalar values, arrays, log and context must still match.
  const sameView = (saved: any, candidate: any): boolean => {
    if (saved === null || candidate === null || typeof saved !== "object" || typeof candidate !== "object") return saved === candidate;
    if (Array.isArray(saved) || Array.isArray(candidate)) return Array.isArray(saved) && Array.isArray(candidate) && saved.length === candidate.length && saved.every((item, index) => sameView(item, candidate[index]));
    return Object.keys(saved).every((key) => Object.hasOwn(candidate, key) && sameView(saved[key], candidate[key]))
      && Object.keys(candidate).every((key) => Object.hasOwn(saved, key) || (candidate[key] !== null && typeof candidate[key] === "object"));
  };
  if (!Array.isArray(state.G?.log) || JSON.stringify(state.G.log) !== JSON.stringify(checkpoint.G.log)) return envelope;
  try {
    const matches = JSON.stringify(state.G) === JSON.stringify(checkpoint.G) || Object.keys(checkpoint.G.players).some((id) => sameView(state.G, redactGameStateForPlayer(checkpoint.G, id)));
    if (!matches) return envelope;
    return { ...envelope, snapshotSource: "authoritative-local", state: { ...state, G: checkpoint.G, plugins: checkpoint.plugins } };
  } catch { return envelope; }
}

function parseSavedLocalGameDetailed(raw: string): ParseSavedLocalGameResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "invalid", reason: "Local game export is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") return { kind: "invalid", reason: "Local game export is not an object." };
  const envelope = parsed as Partial<SavedLocalGameEnvelope>;
  if (envelope.version !== 1) return { kind: "invalid", reason: "Unsupported local game export version." };
  if (envelope.stateVersion !== undefined && envelope.stateVersion !== 1) return { kind: "invalid", reason: "Unsupported game-state version." };
  if (typeof envelope.savedAtIso !== "string" || Number.isNaN(Date.parse(envelope.savedAtIso))) {
    return { kind: "invalid", reason: "Local game export is missing a valid saved timestamp." };
  }
  if (typeof envelope.privateDataFingerprint !== "string") {
    return { kind: "invalid", reason: "Local game export is missing a private-data fingerprint." };
  }
  if (!("state" in envelope)) return { kind: "invalid", reason: "Local game export is missing game state." };
  if (containsPrivateField(envelope.state)) return { kind: "invalid", reason: "Local game export contains private fields." };
  return {
    kind: "valid",
    envelope: recoverLegacySnapshot({
      version: 1,
      stateVersion: 1,
      ...(envelope.snapshotSource === "authoritative-local" ? { snapshotSource: envelope.snapshotSource } : {}),
      savedAtIso: envelope.savedAtIso,
      privateDataFingerprint: envelope.privateDataFingerprint,
      metadata: normalizeSavedLocalGameMetadata(envelope.metadata, {
        privateDataFingerprint: envelope.privateDataFingerprint,
        state: envelope.state
      }),
      state: envelope.state
    })
  };
}

export function parseSavedLocalGame(raw: string): SavedLocalGameEnvelope | null {
  const parsed = parseSavedLocalGameDetailed(raw);
  return parsed.kind === "valid" ? parsed.envelope : null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatLocalGameExportFilename(date: Date): string {
  return [
    "polity-local-game-",
    date.getUTCFullYear(),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
    "-",
    pad2(date.getUTCHours()),
    pad2(date.getUTCMinutes()),
    pad2(date.getUTCSeconds()),
    ".json"
  ].join("");
}

function hasResumableGameState(envelope: SavedLocalGameEnvelope): boolean {
  const state = envelope.state as any;
  return Boolean(
    state
    && typeof state === "object"
    && state.G
    && typeof state.G === "object"
    && state.ctx
    && typeof state.ctx === "object"
  );
}

export function createLocalGameExport(input: {
  privateDataFingerprint: string;
  state: unknown;
  now?: Date;
  snapshotSource?: "authoritative-local";
}): { fileName: string; content: string } {
  const now = input.now ?? new Date();
  return {
    fileName: formatLocalGameExportFilename(now),
    content: serializeLocalGame({ ...input, now })
  };
}

export function importLocalGameExport(raw: string, options: { expectedPrivateDataFingerprint?: string } = {}): ImportedLocalGameExport {
  const parsed = parseSavedLocalGameDetailed(raw);
  if (parsed.kind !== "valid") return parsed;
  if (
    options.expectedPrivateDataFingerprint
    && parsed.envelope.privateDataFingerprint !== options.expectedPrivateDataFingerprint
  ) {
    return { kind: "invalid", reason: "Local game export was saved with different private data." };
  }
  if (!hasResumableGameState(parsed.envelope)) {
    return { kind: "invalid", reason: "Local game export does not contain a resumable game state." };
  }
  return { kind: "valid", envelope: parsed.envelope };
}

export function upsertLocalGameSlot(slots: SavedLocalGameEnvelope[], envelope: SavedLocalGameEnvelope): SavedLocalGameEnvelope[] {
  return [envelope, ...slots.filter((slot) => slot.metadata.slotName !== envelope.metadata.slotName)]
    .sort((a, b) => Date.parse(b.savedAtIso) - Date.parse(a.savedAtIso));
}

export function loadSavedLocalGameRecord(storage: StorageReader | undefined): SavedLocalGameRecord {
  if (!storage) return { kind: "none" };
  const raw = storage.getItem(LOCAL_GAME_SAVE_STORAGE_KEY);
  if (!raw) return { kind: "none" };
  const parsed = parseSavedLocalGameDetailed(raw);
  return parsed.kind === "valid" ? { kind: "valid", envelope: parsed.envelope } : { kind: "corrupt", reason: parsed.reason };
}

export function createLocalGameRestoreEnhancer(envelope: SavedLocalGameEnvelope | undefined, onState?: (state: unknown) => void) {
  return (createStore: any) => (reducer: any, preloadedState: unknown, enhancer?: any) => {
    const store = createStore(reducer, envelope?.state ?? preloadedState, enhancer);
    if (onState) {
      const persist = () => onState(store.getState());
      store.subscribe(persist);
      persist();
    }
    return store;
  };
}
