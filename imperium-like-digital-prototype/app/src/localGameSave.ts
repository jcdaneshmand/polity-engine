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
  savedAtIso: string;
  privateDataFingerprint: string;
  metadata: LocalSaveMetadata;
  state: unknown;
};

export type SavedLocalGameRecord =
  | { kind: "none" }
  | { kind: "valid"; envelope: SavedLocalGameEnvelope }
  | { kind: "corrupt" };

export type ImportedLocalGameExport =
  | { kind: "valid"; envelope: SavedLocalGameEnvelope }
  | { kind: "invalid"; reason: string };

type StorageReader = Pick<Storage, "getItem">;

type ParseSavedLocalGameResult =
  | { kind: "valid"; envelope: SavedLocalGameEnvelope }
  | { kind: "invalid"; reason: string };

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
  slotName?: string;
}): string {
  if (containsPrivateField(input.state)) {
    throw new Error("Local game save contains private fields.");
  }
  const savedAtIso = (input.now ?? new Date()).toISOString();
  return JSON.stringify({
    version: 1,
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
    envelope: {
      version: 1,
      savedAtIso: envelope.savedAtIso,
      privateDataFingerprint: envelope.privateDataFingerprint,
      metadata: normalizeSavedLocalGameMetadata(envelope.metadata, {
        privateDataFingerprint: envelope.privateDataFingerprint,
        state: envelope.state
      }),
      state: envelope.state
    }
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
  const envelope = parseSavedLocalGame(raw);
  return envelope ? { kind: "valid", envelope } : { kind: "corrupt" };
}

export function createLocalGameRestoreEnhancer(envelope: SavedLocalGameEnvelope | undefined) {
  return (createStore: any) => (reducer: any, preloadedState: unknown, enhancer?: any) =>
    createStore(reducer, envelope?.state ?? preloadedState, enhancer);
}
