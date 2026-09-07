import { CURRENT_RULES_VERSION } from "../../engine/src/game/version";
import { validateGameOptions } from "../../engine/src/options/optionValidation";
import type { CampaignMode, CommonsReplacementPolicy, CommonsSetId, ExpansionId, GameMode, GameOptions, SoloDifficulty, VariantId } from "../../engine/src/options/gameOptions";

export const SETUP_PRESETS_KEY = "polity-engine.setupPresets.v1";
export const SETUP_PRESETS_BACKUP_KEY = "polity-engine.setupPresets.backup.v1";
export const MAX_SETUP_PRESET_BYTES = 512 * 1024;
export const MAX_SETUP_PRESETS = 100;

export type SetupPresetSettings = {
  mode: GameMode;
  playerCount: 1 | 2 | 3 | 4;
  commonsSetId: CommonsSetId;
  customCommonsCardIds?: string[];
  enabledExpansions: ExpansionId[];
  enabledVariants: VariantId[];
  replacementPolicy: CommonsReplacementPolicy;
  soloDifficulty?: SoloDifficulty;
  campaignMode?: CampaignMode;
  playerNationIds: Record<string, string>;
  soloBotNationId?: string;
};

export type SetupPreset = {
  version: 1;
  id: string;
  name: string;
  rulesVersion: typeof CURRENT_RULES_VERSION;
  settings: SetupPresetSettings;
};

export type SetupPresetLibrary = {
  version: 1;
  revision: number;
  presets: SetupPreset[];
  rawSource?: string;
};

export type SetupPresetInspection =
  | { kind: "valid"; preset: SetupPreset }
  | { kind: "incompatible"; reason: string; raw: string }
  | { kind: "invalid"; reason: string };

export type UnavailableSetupReferences = { playerIds: string[]; botNationId?: string };

type SetupPresetStorage = Pick<Storage, "getItem" | "setItem">;
const idPattern = /^[a-zA-Z0-9_.:-]{1,200}$/;
const modes = new Set<GameMode>(["multiplayer", "solo", "practice"]);
const commonsSets = new Set<CommonsSetId>(["classics", "legends", "horizons", "custom"]);
const expansions = new Set<ExpansionId>(["trade_routes"]);
const variants = new Set<VariantId>(["lowered_aggression", "quick_setup", "precious_cards", "short_game"]);
const difficulties = new Set<SoloDifficulty>(["chieftain", "warlord", "imperator", "sovereign", "overlord", "supreme_ruler"]);
const campaignModes = new Set<CampaignMode>(["standard", "supreme_ruler"]);
const replacementPolicies = new Set<CommonsReplacementPolicy>(["none", "use_replacements", "prefer_latest"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) throw new Error(`${label} contains unsupported fields.`);
}

function requiredId(value: unknown, label: string): string {
  if (typeof value !== "string" || !idPattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function stringList<T extends string>(value: unknown, allowed: Set<T>, label: string, max = 20): T[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !allowed.has(item as T))) {
    throw new Error(`${label} is invalid.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates.`);
  return [...value] as T[];
}

function idList(value: unknown, label: string, max = 10000): string[] {
  if (!Array.isArray(value) || value.length > max || value.some((item) => typeof item !== "string" || !idPattern.test(item))) {
    throw new Error(`${label} is invalid.`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates.`);
  return [...value];
}

function enumValue<T extends string>(value: unknown, allowed: Set<T>, label: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) throw new Error(`${label} is invalid.`);
  return value as T;
}

function optionalEnum<T extends string>(value: unknown, allowed: Set<T>, label: string): T | undefined {
  return value === undefined ? undefined : enumValue(value, allowed, label);
}

export function parseSetupPresetSettings(value: unknown): SetupPresetSettings {
  if (!isRecord(value)) throw new Error("Preset settings are invalid.");
  assertOnlyKeys(value, [
    "mode", "playerCount", "commonsSetId", "customCommonsCardIds", "enabledExpansions", "enabledVariants",
    "replacementPolicy", "soloDifficulty", "campaignMode", "playerNationIds", "soloBotNationId"
  ], "Preset settings");
  const mode = enumValue(value.mode, modes, "Preset mode");
  if (![1, 2, 3, 4].includes(value.playerCount as number)) throw new Error("Preset player count is invalid.");
  const playerCount = value.playerCount as 1 | 2 | 3 | 4;
  const commonsSetId = enumValue(value.commonsSetId, commonsSets, "Preset Commons set");
  const customCommonsCardIds = value.customCommonsCardIds === undefined ? undefined : idList(value.customCommonsCardIds, "Preset Commons IDs");
  if (commonsSetId === "custom" && customCommonsCardIds === undefined) throw new Error("Custom preset needs explicit Commons IDs.");
  if (commonsSetId !== "custom" && customCommonsCardIds !== undefined) throw new Error("Standard preset cannot include custom Commons IDs.");
  const enabledExpansions = stringList(value.enabledExpansions, expansions, "Preset expansions");
  const enabledVariants = stringList(value.enabledVariants, variants, "Preset variants");
  const replacementPolicy = enumValue(value.replacementPolicy, replacementPolicies, "Preset replacement policy");
  const soloDifficulty = optionalEnum(value.soloDifficulty, difficulties, "Preset solo difficulty");
  const campaignMode = optionalEnum(value.campaignMode, campaignModes, "Preset campaign mode");
  if (mode !== "solo" && (soloDifficulty !== undefined || campaignMode !== undefined || value.soloBotNationId !== undefined)) {
    throw new Error("Solo preset fields require solo mode.");
  }
  const soloBotNationId = value.soloBotNationId === undefined ? undefined : value.soloBotNationId === "random" ? "random" : requiredId(value.soloBotNationId, "Preset Bot nation ID");
  if (mode === "solo" && !soloDifficulty) throw new Error("Solo preset needs a difficulty.");
  if (campaignMode === "supreme_ruler" && soloDifficulty !== "supreme_ruler") throw new Error("Supreme Ruler preset needs Supreme Ruler difficulty.");
  if (!isRecord(value.playerNationIds)) throw new Error("Preset nation seats are invalid.");
  const seatRecord = value.playerNationIds;
  assertOnlyKeys(seatRecord, Array.from({ length: playerCount }, (_, index) => String(index + 1)), "Preset nation seats");
  const expectedSeatIds = Array.from({ length: playerCount }, (_, index) => String(index + 1));
  if (Object.keys(seatRecord).length !== expectedSeatIds.length) throw new Error("Preset nation seats are incomplete.");
  const playerNationIds = Object.fromEntries(expectedSeatIds.map((seatId) => [seatId, requiredId(seatRecord[seatId], `Preset nation for player ${seatId}`)]));
  const options: GameOptions = {
    mode,
    playerCount,
    commonsSetId,
    ...(customCommonsCardIds ? { customCommonsCardIds } : {}),
    enabledExpansions,
    enabledVariants,
    replacementPolicy,
    ...(soloDifficulty ? { soloDifficulty } : {}),
    ...(campaignMode ? { campaignMode } : {})
  };
  const fatal = validateGameOptions(options).issues.find((issue) => issue.level === "fatal");
  if (fatal) throw new Error(`Preset options are invalid: ${fatal.message}`);
  return {
    mode, playerCount, commonsSetId,
    ...(customCommonsCardIds ? { customCommonsCardIds } : {}),
    enabledExpansions, enabledVariants, replacementPolicy,
    ...(soloDifficulty ? { soloDifficulty } : {}),
    ...(campaignMode ? { campaignMode } : {}),
    playerNationIds,
    ...(soloBotNationId ? { soloBotNationId } : {})
  };
}

export function getUnavailableSetupReferences(
  input: { mode: GameMode; playerCount: 1 | 2 | 3 | 4; playerNationIds: Record<string, string>; soloBotNationId?: string },
  availableNationIds: ReadonlySet<string>
): UnavailableSetupReferences {
  const playerIds = Array.from({ length: input.playerCount }, (_, index) => String(index + 1))
    .filter((playerId) => !availableNationIds.has(input.playerNationIds[playerId]));
  const botNationId = input.mode === "solo" && input.soloBotNationId && input.soloBotNationId !== "random" && !availableNationIds.has(input.soloBotNationId)
    ? input.soloBotNationId
    : undefined;
  return { playerIds, ...(botNationId ? { botNationId } : {}) };
}

export function parseSetupPreset(raw: string): SetupPreset {
  if (new TextEncoder().encode(raw).byteLength > MAX_SETUP_PRESET_BYTES) throw new Error("Setup preset file is too large.");
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error("Setup preset is invalid.");
  assertOnlyKeys(value, ["version", "id", "name", "rulesVersion", "settings"], "Setup preset");
  if (value.version !== 1) throw new Error("Unsupported setup preset version.");
  if (value.rulesVersion !== CURRENT_RULES_VERSION) throw new Error("Setup preset uses an incompatible rules version.");
  const id = requiredId(value.id, "Setup preset ID");
  if (typeof value.name !== "string" || !value.name.trim() || value.name.trim().length > 80) throw new Error("Setup preset needs a valid name.");
  return { version: 1, id, name: value.name.trim(), rulesVersion: CURRENT_RULES_VERSION, settings: parseSetupPresetSettings(value.settings) };
}

export function inspectSetupPreset(raw: string): SetupPresetInspection {
  try {
    if (new TextEncoder().encode(raw).byteLength > MAX_SETUP_PRESET_BYTES) return { kind: "invalid", reason: "Setup preset file is too large." };
    const value: unknown = JSON.parse(raw);
    if (isRecord(value) && value.version !== 1) return { kind: "incompatible", reason: "Unsupported setup preset version.", raw };
    if (isRecord(value) && value.rulesVersion !== CURRENT_RULES_VERSION) return { kind: "incompatible", reason: "Setup preset uses an incompatible rules version.", raw };
    return { kind: "valid", preset: parseSetupPreset(raw) };
  } catch (error) {
    return { kind: "invalid", reason: error instanceof Error ? error.message : "Setup preset is invalid." };
  }
}

export function createSetupPresetSettings(input: { options: GameOptions; playerNationIds: Record<string, string>; soloBotNationId?: string }): SetupPresetSettings {
  const playerCount = input.options.playerCount as 1 | 2 | 3 | 4;
  const settings = {
    mode: input.options.mode,
    playerCount,
    commonsSetId: input.options.commonsSetId ?? "classics",
    ...(input.options.commonsSetId === "custom" ? { customCommonsCardIds: [...(input.options.customCommonsCardIds ?? [])] } : {}),
    enabledExpansions: [...input.options.enabledExpansions],
    enabledVariants: [...input.options.enabledVariants],
    replacementPolicy: input.options.replacementPolicy ?? "use_replacements",
    ...(input.options.mode === "solo" ? { soloDifficulty: input.options.soloDifficulty ?? "chieftain" } : {}),
    ...(input.options.mode === "solo" && input.options.campaignMode ? { campaignMode: input.options.campaignMode } : {}),
    playerNationIds: Object.fromEntries(Array.from({ length: playerCount }, (_, index) => {
      const seatId = String(index + 1);
      return [seatId, input.playerNationIds[seatId]];
    })),
    ...(input.options.mode === "solo" ? { soloBotNationId: input.soloBotNationId ?? "random" } : {})
  };
  return parseSetupPresetSettings(settings);
}

export function readSetupPresetLibrary(storage: Pick<Storage, "getItem">): SetupPresetLibrary {
  const raw = storage.getItem(SETUP_PRESETS_KEY);
  if (!raw) return { version: 1, revision: 0, presets: [] };
  if (new TextEncoder().encode(raw).byteLength > MAX_SETUP_PRESET_BYTES) throw new Error("Setup preset library is too large. Stored data was preserved.");
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value)) throw new Error("Setup preset library is damaged. Stored data was preserved.");
  assertOnlyKeys(value, ["version", "revision", "presets"], "Setup preset library");
  if (value.version !== 1) throw new Error("Unsupported setup preset library version. Stored data was preserved.");
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !Array.isArray(value.presets) || value.presets.length > MAX_SETUP_PRESETS) {
    throw new Error("Setup preset library is damaged. Stored data was preserved.");
  }
  const presets = value.presets.map((preset) => parseSetupPreset(JSON.stringify(preset)));
  if (new Set(presets.map((preset) => preset.id)).size !== presets.length) throw new Error("Setup preset library contains duplicate IDs.");
  return { version: 1, revision: value.revision as number, presets, rawSource: raw };
}

export function writeSetupPresetLibrary(storage: SetupPresetStorage, expected: SetupPresetLibrary, presets: SetupPreset[]): SetupPresetLibrary {
  if (presets.length > MAX_SETUP_PRESETS) throw new Error(`Setup preset library supports at most ${MAX_SETUP_PRESETS} presets.`);
  const current = readSetupPresetLibrary(storage);
  if (current.revision !== expected.revision) throw new Error("Setup presets changed in another tab. Refresh and retry.");
  const ids = new Set<string>();
  const validated = presets.map((preset) => {
    const parsed = parseSetupPreset(JSON.stringify(preset));
    if (ids.has(parsed.id)) throw new Error("Setup preset library contains duplicate IDs.");
    ids.add(parsed.id);
    return parsed;
  });
  const raw = JSON.stringify({ version: 1, revision: current.revision + 1, presets: validated });
  if (new TextEncoder().encode(raw).byteLength > MAX_SETUP_PRESET_BYTES) throw new Error("Setup preset library is too large.");
  const currentRaw = storage.getItem(SETUP_PRESETS_KEY);
  if (currentRaw && !storage.getItem(SETUP_PRESETS_BACKUP_KEY)) storage.setItem(SETUP_PRESETS_BACKUP_KEY, currentRaw);
  storage.setItem(SETUP_PRESETS_KEY, raw);
  return readSetupPresetLibrary(storage);
}

export async function withSetupPresetLock<T>(action: () => T): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(SETUP_PRESETS_KEY, action);
  return action();
}
