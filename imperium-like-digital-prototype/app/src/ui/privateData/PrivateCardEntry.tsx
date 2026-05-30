import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import type { PrivateCardCsvRow } from "../../../../tools/card-import/cardCsvTypes";
import type { NationRuleHook, PrivateNationCsvRow, SetupRule } from "../../../../tools/card-import/nationCsvTypes";
import type { NationRulesetTag } from "../../../../engine/src/nations/nationRulesetTypes";
import type { PrivateNationRulesetCsvRow } from "../../../../tools/card-import/nationRulesetCsvTypes";
import type { PrivateBotStateTableCsvRow } from "../../../../tools/card-import/botStateTableCsvTypes";
import type { PrivateBotTradeRoutesTableCsvRow } from "../../../../tools/card-import/botTradeRoutesTableCsvTypes";
import { validatePrivateBotStateTableRows, validatePrivateBotTradeRoutesTableRows } from "../../../../tools/card-import/botTableValidation";
import { commonsBatchProfiles, createNationBatchProfile } from "../../../../tools/card-entry/batchProfiles";
import {
  appendOrReplaceBotStateTableRow,
  appendOrReplaceBotTradeRoutesTableRow,
  botStateTableCsvColumns,
  botStateTableDraftToCsvRow,
  botStateTableRowToDraft,
  botTradeRoutesTableCsvColumns,
  botTradeRoutesTableDraftToCsvRow,
  botTradeRoutesTableRowToDraft,
  createBlankBotStateTableDraft,
  createBlankBotTradeRoutesTableDraft,
  type BotStateTableEntryDraft,
  type BotTradeRoutesTableEntryDraft
} from "../../../../tools/card-entry/botTableDraft";
import {
  applyVariableVpDraftDetails,
  createBlankCardDraft,
  csvRowToDraft,
  draftToCsvRow,
  duplicateCardDraft,
  getCardEntryShortcutAction,
  getNextNumericCardId,
  toggleDraftSuitIcon,
  type VariableVpDraftDetails,
  type VariableVpFormula
} from "../../../../tools/card-entry/cardDraft";
import type { CardEntryBatchProfile, CardEntryDraft } from "../../../../tools/card-entry/cardEntryTypes";
import {
  appendOrReplaceNationRow,
  appendCardIdToNationDraftRoles,
  createBlankNationDraft,
  getNextNumericNationId,
  insertNationJsonTemplate,
  nationCsvColumns,
  nationDraftToCsvRow,
  nationRowToDraft,
  summarizeNationDeckProgress,
  summarizeNationRowsDeckProgress,
  sortNationRowsByName,
  type NationCardRole,
  type NationEntryDraft
} from "../../../../tools/card-entry/nationDraft";
import {
  appendOrReplaceNationRulesetRow,
  buildNationRulesetName,
  createBlankNationRulesetDraft,
  nationRulesetCsvColumns,
  nationRulesetDraftToCsvRow,
  nationRulesetRowToDraft,
  nationRulesetTagOptions,
  toggleNationRulesetTag,
  type NationRulesetEntryDraft
} from "../../../../tools/card-entry/nationRulesetDraft";

type PrivateCardEntryProps = {
  onBack: () => void;
};

type FileSystemFileHandleLike = {
  getFile: () => Promise<File>;
  createWritable: () => Promise<{ write: (value: string) => Promise<void>; close: () => Promise<void> }>;
};

type WindowWithFilePicker = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleLike[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandleLike>;
};

type ValidationMessage = {
  level: "fatal" | "warning";
  field: string;
  message: string;
};

type PrivateEntryMode = "cards" | "nations" | "bot-state" | "bot-trade";

const csvColumns = [
  "card_id",
  "source_box",
  "set_or_nation",
  "card_name_private",
  "public_placeholder_name",
  "suit",
  "suit_icons",
  "card_type",
  "state_requirement",
  "cost_materials",
  "cost_population",
  "cost_progress",
  "cost_goods",
  "development_cost_materials",
  "development_cost_population",
  "development_cost_progress",
  "development_cost_goods",
  "vp_mode",
  "vp_value",
  "starting_location",
  "player_count_requirement",
  "is_trade_route_expansion",
  "raw_effect_text_private",
  "effect_ops_json",
  "tags",
  "notes",
  "implemented",
  "tested",
  "required_expansions",
  "excluded_expansions",
  "allowed_modes",
  "disallowed_modes",
  "ownership",
  "commons_set_id",
  "setup_banner_suit",
  "commons_group",
  "replacement_for_card_id",
  "replacement_group_id",
  "conflicts_with_nation_ids",
  "delayable_in_lowered_aggression",
  "market_eligible",
  "small_deck_eligible",
  "main_deck_eligible",
  "unrest_pile_eligible",
  "fame_deck_eligible"
];

const suitOptions = ["", "region", "uncivilized", "civilized", "tributary", "fame", "unrest", "power", "trade_route", "none", "multi"];
const suitIconOptions = ["region", "uncivilized", "civilized", "tributary", "fame", "unrest", "power", "trade_route"];
const cardTypeOptions = ["", "action", "in_play", "attack", "power", "state", "development", "accession", "nation", "region", "unrest", "fame", "trade_route", "bot_state", "other"];
const startOptions = ["draw_deck", "nation_deck", "accession", "development_area", "in_play", "supply", "market", "fame_deck", "unrest_pile", "bot_deck", "box", "other"];
const playerCountOptions: Array<{ value: CardEntryDraft["playerCountRequirement"]; label: string }> = [
  { value: "", label: "Any" },
  { value: "1+", label: "1+" },
  { value: "2+", label: "2+" },
  { value: "3+", label: "3+" },
  { value: "4+", label: "4+" }
];
const expansionRequirementOptions = [
  { value: "", label: "None" },
  { value: "trade_routes", label: "Trade Routes" }
];
const vpModeOptions = ["none", "fixed", "variable", "negative", "conditional"];
const variableVpFormulaOptions: Array<{ value: VariableVpFormula; label: string }> = [
  { value: "per_card", label: "Per card" },
  { value: "per_resource", label: "Per resource" },
  { value: "per_region", label: "Per region" },
  { value: "per_development", label: "Per development" },
  { value: "per_unrest_or_fame", label: "Per unrest/fame" },
  { value: "set_collection", label: "Set collection" },
  { value: "threshold", label: "Threshold" },
  { value: "custom", label: "Custom" }
];
const nationCardRoleOptions: Array<{ id: NationCardRole; label: string; cardType?: CardEntryDraft["cardType"]; startingLocation?: CardEntryDraft["startingLocation"] }> = [
  { id: "power", label: "Power", cardType: "power" },
  { id: "state", label: "State", cardType: "state" },
  { id: "starting", label: "Starting Deck", startingLocation: "draw_deck" },
  { id: "nation", label: "Nation Deck", cardType: "nation", startingLocation: "nation_deck" },
  { id: "accession", label: "Accession", cardType: "accession", startingLocation: "accession" },
  { id: "development", label: "Development", cardType: "development", startingLocation: "development_area" }
];
const specialSetupTemplates: Array<{ label: string; value: SetupRule }> = [
  { label: "Gain 2 materials", value: { op: "gain_resource", resource: "materials", count: 2 } },
  { label: "Create side area", value: { op: "create_side_area", areaId: "vault", displayName: "Vault" } },
  { label: "Card to history", value: { op: "place_card_in_area", cardId: "card_id_here", area: "history" } }
];
const passiveRuleTemplates: Array<{ label: string; value: NationRuleHook }> = [
  { label: "On develop: gain goods", value: { trigger: "on_develop", effects: [{ op: "gain_resource", resource: "goods", amount: 1 }] } },
  { label: "On acquire: gain materials", value: { trigger: "on_acquire", effects: [{ op: "gain_resource", resource: "materials", amount: 1 }] } },
  { label: "On scoring hook", value: { trigger: "on_scoring", effects: [{ op: "gain_resource", resource: "progress", amount: 1 }] } }
];
const botTriggerKindOptions = ["card_id", "card_name_private", "suit", "card_type", "tag", "unrest", "other"];
const botTableSideOptions = ["S", "A", "B"];
const botTradeRowTypeOptions = ["route", "end_of_turn"];
const botMerchantStateOptions = ["", "merchants", "merchant_empire"];

function profileFromSelection(profileId: string, nationId: string): CardEntryBatchProfile {
  if (profileId === "nation-custom") return createNationBatchProfile(nationId.trim());
  return commonsBatchProfiles.find((profile) => profile.id === profileId) ?? commonsBatchProfiles[0];
}

function rowWithColumns(row: PrivateCardCsvRow): PrivateCardCsvRow {
  return Object.fromEntries(csvColumns.map((column) => [column, row[column] ?? ""])) as PrivateCardCsvRow;
}

function nationRowWithColumns(row: PrivateNationCsvRow): PrivateNationCsvRow {
  return Object.fromEntries(nationCsvColumns.map((column) => [column, row[column] ?? ""])) as PrivateNationCsvRow;
}

function nationRulesetRowWithColumns(row: PrivateNationRulesetCsvRow): PrivateNationRulesetCsvRow {
  return Object.fromEntries(nationRulesetCsvColumns.map((column) => [column, row[column] ?? ""])) as PrivateNationRulesetCsvRow;
}

function botStateTableRowWithColumns(row: PrivateBotStateTableCsvRow): PrivateBotStateTableCsvRow {
  return Object.fromEntries(botStateTableCsvColumns.map((column) => [column, row[column as keyof PrivateBotStateTableCsvRow] ?? ""])) as PrivateBotStateTableCsvRow;
}

function botTradeRoutesTableRowWithColumns(row: PrivateBotTradeRoutesTableCsvRow): PrivateBotTradeRoutesTableCsvRow {
  return Object.fromEntries(botTradeRoutesTableCsvColumns.map((column) => [column, row[column as keyof PrivateBotTradeRoutesTableCsvRow] ?? ""])) as PrivateBotTradeRoutesTableCsvRow;
}

function parseCsv(text: string): PrivateCardCsvRow[] {
  const parsed = Papa.parse<PrivateCardCsvRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function parseNationCsv(text: string): PrivateNationCsvRow[] {
  const parsed = Papa.parse<PrivateNationCsvRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function parseNationRulesetCsv(text: string): PrivateNationRulesetCsvRow[] {
  const parsed = Papa.parse<PrivateNationRulesetCsvRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function parseBotStateTableCsv(text: string): PrivateBotStateTableCsvRow[] {
  const parsed = Papa.parse<PrivateBotStateTableCsvRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function parseBotTradeRoutesTableCsv(text: string): PrivateBotTradeRoutesTableCsvRow[] {
  const parsed = Papa.parse<PrivateBotTradeRoutesTableCsvRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function toCsv(rows: PrivateCardCsvRow[]): string {
  return `${Papa.unparse(rows.map(rowWithColumns), { columns: csvColumns, newline: "\n" })}\n`;
}

function toNationCsv(rows: PrivateNationCsvRow[]): string {
  return `${Papa.unparse(rows.map(nationRowWithColumns), { columns: [...nationCsvColumns], newline: "\n" })}\n`;
}

function toNationRulesetCsv(rows: PrivateNationRulesetCsvRow[]): string {
  return `${Papa.unparse(rows.map(nationRulesetRowWithColumns), { columns: [...nationRulesetCsvColumns], newline: "\n" })}\n`;
}

function toBotStateTableCsv(rows: PrivateBotStateTableCsvRow[]): string {
  return `${Papa.unparse(rows.map(botStateTableRowWithColumns), { columns: [...botStateTableCsvColumns], newline: "\n" })}\n`;
}

function toBotTradeRoutesTableCsv(rows: PrivateBotTradeRoutesTableCsvRow[]): string {
  return `${Papa.unparse(rows.map(botTradeRoutesTableRowWithColumns), { columns: [...botTradeRoutesTableCsvColumns], newline: "\n" })}\n`;
}

function validateRows(rows: PrivateCardCsvRow[]): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const cardId = row.card_id?.trim();
    for (const field of ["card_id", "public_placeholder_name", "suit", "card_type", "starting_location", "vp_mode", "implemented", "tested"]) {
      if (!row[field]?.trim()) messages.push({ level: "fatal", field, message: `Row ${rowNumber}: required field missing` });
    }
    if (cardId) {
      if (seen.has(cardId)) messages.push({ level: "fatal", field: "card_id", message: `Row ${rowNumber}: duplicate card_id` });
      seen.add(cardId);
    }
    if (row.raw_effect_text_private?.trim() && !row.effect_ops_json?.trim()) {
      messages.push({ level: "warning", field: "effect_ops_json", message: `Row ${rowNumber}: raw private text present but effect ops are blank` });
    }
    if (row.card_name_private?.trim() && row.card_name_private.trim() === row.public_placeholder_name?.trim()) {
      messages.push({ level: "warning", field: "public_placeholder_name", message: `Row ${rowNumber}: placeholder matches private name` });
    }
  });
  return messages;
}

function isIntegerOrBlank(value: string | undefined): boolean {
  return !value?.trim() || /^\d+$/.test(value.trim());
}

function isBoolean(value: string | undefined): boolean {
  return ["true", "false"].includes((value || "").trim().toLowerCase());
}

function validateNationRows(rows: PrivateNationCsvRow[]): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const nationId = row.nation_id?.trim();
    if (!nationId) messages.push({ level: "fatal", field: "nation_id", message: `Row ${rowNumber}: required field missing` });
    if (nationId && seen.has(nationId)) messages.push({ level: "fatal", field: "nation_id", message: `Row ${rowNumber}: duplicate nation_id` });
    if (nationId) seen.add(nationId);
    if (!row.public_placeholder_name?.trim()) messages.push({ level: "fatal", field: "public_placeholder_name", message: `Row ${rowNumber}: required field missing` });
    for (const field of ["complexity", "action_tokens_base", "exhaust_tokens_base"]) {
      if (!isIntegerOrBlank(row[field])) messages.push({ level: "fatal", field, message: `Row ${rowNumber}: must be a non-negative integer or blank` });
    }
    for (const field of ["implemented", "tested"]) {
      if (!isBoolean(row[field])) messages.push({ level: "fatal", field, message: `Row ${rowNumber}: must be true or false` });
    }
    for (const field of ["special_setup_json", "passive_rules_json"]) {
      if (row[field]?.trim()) {
        try {
          if (!Array.isArray(JSON.parse(row[field]))) messages.push({ level: "fatal", field, message: `Row ${rowNumber}: must parse to an array` });
        } catch {
          messages.push({ level: "fatal", field, message: `Row ${rowNumber}: invalid JSON` });
        }
      }
    }
    if (row.nation_name_private?.trim() && row.nation_name_private.trim() === row.public_placeholder_name?.trim()) {
      messages.push({ level: "warning", field: "public_placeholder_name", message: `Row ${rowNumber}: placeholder matches private name` });
    }
  });
  return messages;
}

function validateJsonArrayField(rowNumber: number, field: string, value: string | undefined, messages: ValidationMessage[]) {
  if (!value?.trim()) return;
  try {
    if (!Array.isArray(JSON.parse(value))) messages.push({ level: "fatal", field, message: `Row ${rowNumber}: must parse to an array` });
  } catch {
    messages.push({ level: "fatal", field, message: `Row ${rowNumber}: invalid JSON` });
  }
}

function validateNationRulesetRows(rows: PrivateNationRulesetCsvRow[]): ValidationMessage[] {
  const messages: ValidationMessage[] = [];
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const nationId = row.nation_id?.trim();
    if (!nationId) messages.push({ level: "fatal", field: "nation_id", message: `Row ${rowNumber}: required field missing` });
    if (nationId && seen.has(nationId)) messages.push({ level: "fatal", field: "nation_id", message: `Row ${rowNumber}: duplicate nation_id` });
    if (nationId) seen.add(nationId);
    if (!row.public_placeholder_name?.trim()) messages.push({ level: "fatal", field: "public_placeholder_name", message: `Row ${rowNumber}: required field missing` });
    for (const tag of (row.ruleset_tags || "").split("|").map((value) => value.trim()).filter(Boolean)) {
      if (!nationRulesetTagOptions.includes(tag as NationRulesetTag)) messages.push({ level: "fatal", field: "ruleset_tags", message: `Row ${rowNumber}: unsupported tag ${tag}` });
    }
    for (const field of [
      "setup_overrides_json",
      "zone_overrides_json",
      "state_overrides_json",
      "reshuffle_overrides_json",
      "cleanup_overrides_json",
      "solstice_overrides_json",
      "scoring_overrides_json",
      "collapse_overrides_json",
      "bot_overrides_json",
      "short_game_overrides_json",
      "hook_rules_json"
    ]) {
      validateJsonArrayField(rowNumber, field, row[field], messages);
    }
    for (const field of ["implemented", "tested"]) {
      if (!isBoolean(row[field])) messages.push({ level: "fatal", field, message: `Row ${rowNumber}: must be true or false` });
    }
  });
  return messages;
}

function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function PrivateCardEntry({ onBack }: PrivateCardEntryProps) {
  const [entryMode, setEntryMode] = useState<PrivateEntryMode>("cards");
  const [profileId, setProfileId] = useState(commonsBatchProfiles[0].id);
  const [nationId, setNationId] = useState("");
  const [rows, setRows] = useState<PrivateCardCsvRow[]>([]);
  const [draft, setDraft] = useState<CardEntryDraft>({ ...createBlankCardDraft(commonsBatchProfiles[0]), cardId: "1" });
  const [previousDraft, setPreviousDraft] = useState<CardEntryDraft | null>(null);
  const [fileName, setFileName] = useState("imperium_cards_private.csv");
  const [status, setStatus] = useState("No private CSV loaded. New saves stay in this browser until exported.");
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [cardDirty, setCardDirty] = useState(false);
  const [variableVpDetails, setVariableVpDetails] = useState<VariableVpDraftDetails>({
    formula: "per_card",
    amountEach: "1",
    target: "",
    cap: "",
    note: ""
  });
  const [nationRows, setNationRows] = useState<PrivateNationCsvRow[]>([]);
  const [nationDraft, setNationDraft] = useState<NationEntryDraft>(createBlankNationDraft("1"));
  const [nationFileName, setNationFileName] = useState("imperium_nations_private.csv");
  const [nationStatus, setNationStatus] = useState("No private nation CSV loaded. New nation rows stay in this browser until exported.");
  const [nationFileHandle, setNationFileHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [nationDirty, setNationDirty] = useState(false);
  const [selectedNationCardRoles, setSelectedNationCardRoles] = useState<NationCardRole[]>(["nation"]);
  const [rulesetRows, setRulesetRows] = useState<PrivateNationRulesetCsvRow[]>([]);
  const [rulesetDraft, setRulesetDraft] = useState<NationRulesetEntryDraft>(createBlankNationRulesetDraft());
  const [rulesetFileName, setRulesetFileName] = useState("imperium_nation_rulesets_private.csv");
  const [rulesetStatus, setRulesetStatus] = useState("No private ruleset CSV loaded. Builder traits stay in this browser until exported.");
  const [rulesetFileHandle, setRulesetFileHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [rulesetDirty, setRulesetDirty] = useState(false);
  const [botStateRows, setBotStateRows] = useState<PrivateBotStateTableCsvRow[]>([]);
  const [botStateDraft, setBotStateDraft] = useState<BotStateTableEntryDraft>(createBlankBotStateTableDraft());
  const [botStateFileName, setBotStateFileName] = useState("imperium_bot_state_tables_private.csv");
  const [botStateStatus, setBotStateStatus] = useState("No bot state table CSV loaded. New rows stay in this browser until exported.");
  const [botStateFileHandle, setBotStateFileHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [botStateDirty, setBotStateDirty] = useState(false);
  const [botTradeRows, setBotTradeRows] = useState<PrivateBotTradeRoutesTableCsvRow[]>([]);
  const [botTradeDraft, setBotTradeDraft] = useState<BotTradeRoutesTableEntryDraft>(createBlankBotTradeRoutesTableDraft());
  const [botTradeFileName, setBotTradeFileName] = useState("imperium_bot_trade_routes_private.csv");
  const [botTradeStatus, setBotTradeStatus] = useState("No bot trade route table CSV loaded. New rows stay in this browser until exported.");
  const [botTradeFileHandle, setBotTradeFileHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [botTradeDirty, setBotTradeDirty] = useState(false);
  const [suitSelectElement, setSuitSelectElement] = useState<HTMLSelectElement | null>(null);

  const selectedProfile = useMemo(() => profileFromSelection(profileId, nationId), [profileId, nationId]);
  const isNationBatch = profileId === "nation-custom";
  const sortedNationRows = useMemo(() => sortNationRowsByName(nationRows), [nationRows]);
  const currentNationDeckProgress = useMemo(() => summarizeNationDeckProgress(nationDraft), [nationDraft]);
  const allNationDeckProgress = useMemo(() => summarizeNationRowsDeckProgress(nationRows), [nationRows]);
  const generatedRulesetName = useMemo(
    () => buildNationRulesetName(rulesetDraft.rulesetTags, nationDraft.privateName || nationDraft.publicPlaceholderName || nationId),
    [nationDraft.privateName, nationDraft.publicPlaceholderName, nationId, rulesetDraft.rulesetTags]
  );
  const cardIdOptions = useMemo(() => {
    const ids = new Set<string>();
    rows.forEach((row) => { if (row.card_id?.trim()) ids.add(row.card_id.trim()); });
    currentNationDeckProgress.slots.forEach((slot) => slot.cardIds.forEach((cardId) => ids.add(cardId)));
    allNationDeckProgress.forEach((summary) => summary.slots.forEach((slot) => slot.cardIds.forEach((cardId) => ids.add(cardId))));
    return [...ids].sort();
  }, [allNationDeckProgress, currentNationDeckProgress, rows]);
  const validation = useMemo(() => validateRows(rows), [rows]);
  const nationValidation = useMemo(() => validateNationRows(nationRows), [nationRows]);
  const rulesetValidation = useMemo(() => validateNationRulesetRows(rulesetRows), [rulesetRows]);
  const botStateReport = useMemo(() => validatePrivateBotStateTableRows(botStateRows), [botStateRows]);
  const botTradeReport = useMemo(() => validatePrivateBotTradeRoutesTableRows(botTradeRows), [botTradeRows]);
  const fatalCount = validation.filter((message) => message.level === "fatal").length;
  const warningCount = validation.filter((message) => message.level === "warning").length;
  const nationFatalCount = nationValidation.filter((message) => message.level === "fatal").length;
  const nationWarningCount = nationValidation.filter((message) => message.level === "warning").length;
  const rulesetFatalCount = rulesetValidation.filter((message) => message.level === "fatal").length;
  const rulesetWarningCount = rulesetValidation.filter((message) => message.level === "warning").length;
  const botStateFatalCount = botStateReport.counts.fatal;
  const botStateWarningCount = botStateReport.counts.warnings;
  const botTradeFatalCount = botTradeReport.counts.fatal;
  const botTradeWarningCount = botTradeReport.counts.warnings;

  const updateDraft = (field: keyof CardEntryDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const updateNationDraft = (field: keyof NationEntryDraft, value: string) => {
    setNationDraft((current) => ({ ...current, [field]: value }));
    if (field === "nationId") setNationId(value);
    if (field === "nationId") setRulesetDraft((current) => ({ ...current, nationId: value }));
    if (field === "privateName") setRulesetDraft((current) => ({ ...current, privateName: value }));
    if (field === "publicPlaceholderName") setRulesetDraft((current) => ({ ...current, publicPlaceholderName: value }));
  };

  const updateRulesetDraft = (field: keyof NationRulesetEntryDraft, value: string) => {
    setRulesetDraft((current) => ({ ...current, [field]: value }));
  };

  const updateBotStateDraft = (field: keyof BotStateTableEntryDraft, value: string) => {
    setBotStateDraft((current) => ({ ...current, [field]: value }));
  };

  const updateBotTradeDraft = (field: keyof BotTradeRoutesTableEntryDraft, value: string) => {
    setBotTradeDraft((current) => ({ ...current, [field]: value }));
  };

  const draftChange = (field: keyof CardEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateDraft(field, event.target.value);
  };

  const nationDraftChange = (field: keyof NationEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateNationDraft(field, event.target.value);
  };

  const nationNameChange = (event: { target: HTMLInputElement }) => {
    const value = event.target.value;
    setNationDraft((current) => ({ ...current, privateName: value, publicPlaceholderName: value }));
    setRulesetDraft((current) => ({ ...current, privateName: value, publicPlaceholderName: value }));
  };

  const rulesetDraftChange = (field: keyof NationRulesetEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateRulesetDraft(field, event.target.value);
  };

  const botStateDraftChange = (field: keyof BotStateTableEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateBotStateDraft(field, event.target.value);
  };

  const botTradeDraftChange = (field: keyof BotTradeRoutesTableEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateBotTradeDraft(field, event.target.value);
  };

  const applyNationCardRoleDefaults = (role: NationCardRole) => {
    const option = nationCardRoleOptions.find((item) => item.id === role);
    if (option?.cardType) updateDraft("cardType", option.cardType);
    if (option?.startingLocation) updateDraft("startingLocation", option.startingLocation);
  };

  const toggleNationCardRole = (role: NationCardRole) => {
    const isSelected = selectedNationCardRoles.includes(role);
    setSelectedNationCardRoles((current) => current.includes(role) ? current.filter((value) => value !== role) : [...current, role]);
    if (!isSelected) {
      applyNationCardRoleDefaults(role);
    }
  };

  const toggleSuitIcon = (suitIcon: string) => {
    setDraft((current) => toggleDraftSuitIcon(current, suitIcon));
  };

  const updateVariableVpDetail = (field: keyof VariableVpDraftDetails, value: string) => {
    setVariableVpDetails((current) => ({ ...current, [field]: value }));
  };

  const applyVariableVpDetails = () => {
    setDraft((current) => applyVariableVpDraftDetails(current, variableVpDetails));
  };

  const insertSpecialSetupTemplate = (template: typeof specialSetupTemplates[number]["value"]) => {
    setNationDraft((current) => insertNationJsonTemplate(current, "specialSetupJson", template));
  };

  const insertPassiveRuleTemplate = (template: typeof passiveRuleTemplates[number]["value"]) => {
    setNationDraft((current) => insertNationJsonTemplate(current, "passiveRulesJson", template));
  };

  const createAutoNumberedDraft = (profile: CardEntryBatchProfile, availableRows = rows): CardEntryDraft => ({
    ...createBlankCardDraft(profile),
    cardId: getNextNumericCardId(availableRows)
  });

  const createAutoNumberedNationDraft = (availableRows = nationRows): NationEntryDraft =>
    createBlankNationDraft(getNextNumericNationId(availableRows));

  const resetDraftForProfile = (profile: CardEntryBatchProfile, availableRows = rows) => {
    setDraft(createAutoNumberedDraft(profile, availableRows));
  };

  const changeProfile = (nextProfileId: string) => {
    setProfileId(nextProfileId);
    resetDraftForProfile(profileFromSelection(nextProfileId, nationId));
  };

  const changeEntryMode = (mode: PrivateEntryMode) => {
    setEntryMode(mode);
    if (mode === "nations" && profileId !== "nation-custom") {
      changeProfile("nation-custom");
    }
  };

  const selectRulesetForNation = (nextNationId: string, availableRows = rulesetRows, selectedNationDraft?: NationEntryDraft) => {
    const row = availableRows.find((rulesetRow) => rulesetRow.nation_id?.trim() === nextNationId);
    if (row) {
      setRulesetDraft(nationRulesetRowToDraft(row));
      return;
    }
    const fallback = selectedNationDraft ?? nationDraft;
    setRulesetDraft({
      ...createBlankNationRulesetDraft(nextNationId),
      privateName: fallback.privateName,
      publicPlaceholderName: fallback.publicPlaceholderName
    });
  };

  const selectNation = (nextNationId: string, availableRows = nationRows, availableRulesetRows = rulesetRows) => {
    if (nextNationId === "__new__") {
      const blankNation = createAutoNumberedNationDraft(availableRows);
      setNationId(blankNation.nationId);
      setNationDraft(blankNation);
      setRulesetDraft(createBlankNationRulesetDraft(blankNation.nationId));
      resetDraftForProfile(createNationBatchProfile(blankNation.nationId));
      setNationStatus("Started a new nation definition row.");
      return;
    }
    const row = availableRows.find((nationRow) => nationRow.nation_id?.trim() === nextNationId);
    const nextNationDraft = row ? nationRowToDraft(row) : createBlankNationDraft(nextNationId);
    setNationId(nextNationId);
    setNationDraft(nextNationDraft);
    selectRulesetForNation(nextNationId, availableRulesetRows, nextNationDraft);
    resetDraftForProfile(createNationBatchProfile(nextNationId));
    setNationStatus(`Selected ${nextNationId}.`);
  };

  const openCsv = async () => {
    const picker = window as WindowWithFilePicker;
    if (picker.showOpenFilePicker) {
      const [handle] = await picker.showOpenFilePicker({
        types: [{ description: "Private card CSV", accept: { "text/csv": [".csv"] } }],
        multiple: false
      });
      const file = await handle.getFile();
      const nextRows = parseCsv(await file.text());
      setFileHandle(handle);
      setFileName(file.name);
      setRows(nextRows);
      resetDraftForProfile(selectedProfile, nextRows);
      setCardDirty(false);
      setStatus(`Loaded ${file.name}.`);
      return;
    }
    document.getElementById("private-card-file")?.click();
  };

  const importCsvFile = async (file: File | undefined) => {
    if (!file) return;
    const nextRows = parseCsv(await file.text());
    setFileHandle(null);
    setFileName(file.name);
    setRows(nextRows);
    resetDraftForProfile(selectedProfile, nextRows);
    setCardDirty(false);
    setStatus(`Loaded ${file.name}. Saving will download a replacement CSV.`);
  };

  const openNationCsv = async () => {
    const picker = window as WindowWithFilePicker;
    if (picker.showOpenFilePicker) {
      const [handle] = await picker.showOpenFilePicker({
        types: [{ description: "Private nation CSV", accept: { "text/csv": [".csv"] } }],
        multiple: false
      });
      const file = await handle.getFile();
      const nextRows = parseNationCsv(await file.text());
      setNationFileHandle(handle);
      setNationFileName(file.name);
      setNationRows(nextRows);
      setNationDirty(false);
      const firstNation = sortNationRowsByName(nextRows)[0];
      if (firstNation?.nation_id) selectNation(firstNation.nation_id, nextRows);
      else setNationDraft(createAutoNumberedNationDraft(nextRows));
      setNationStatus(`Loaded ${file.name}.`);
      return;
    }
    document.getElementById("private-nation-file")?.click();
  };

  const importNationCsvFile = async (file: File | undefined) => {
    if (!file) return;
    const nextRows = parseNationCsv(await file.text());
    setNationFileHandle(null);
    setNationFileName(file.name);
    setNationRows(nextRows);
    setNationDirty(false);
    const firstNation = sortNationRowsByName(nextRows)[0];
    if (firstNation?.nation_id) selectNation(firstNation.nation_id, nextRows);
    else setNationDraft(createAutoNumberedNationDraft(nextRows));
    setNationStatus(`Loaded ${file.name}. Saving will download a replacement CSV.`);
  };

  const openRulesetCsv = async () => {
    const picker = window as WindowWithFilePicker;
    if (picker.showOpenFilePicker) {
      const [handle] = await picker.showOpenFilePicker({
        types: [{ description: "Private nation ruleset CSV", accept: { "text/csv": [".csv"] } }],
        multiple: false
      });
      const file = await handle.getFile();
      const nextRows = parseNationRulesetCsv(await file.text());
      setRulesetFileHandle(handle);
      setRulesetFileName(file.name);
      setRulesetRows(nextRows);
      setRulesetDirty(false);
      if (nationId) selectRulesetForNation(nationId, nextRows);
      setRulesetStatus(`Loaded ${file.name}.`);
      return;
    }
    document.getElementById("private-ruleset-file")?.click();
  };

  const importRulesetCsvFile = async (file: File | undefined) => {
    if (!file) return;
    const nextRows = parseNationRulesetCsv(await file.text());
    setRulesetFileHandle(null);
    setRulesetFileName(file.name);
    setRulesetRows(nextRows);
    setRulesetDirty(false);
    if (nationId) selectRulesetForNation(nationId, nextRows);
    setRulesetStatus(`Loaded ${file.name}. Saving will download a replacement CSV.`);
  };

  const openBotStateCsv = async () => {
    const picker = window as WindowWithFilePicker;
    if (picker.showOpenFilePicker) {
      const [handle] = await picker.showOpenFilePicker({
        types: [{ description: "Private bot state table CSV", accept: { "text/csv": [".csv"] } }],
        multiple: false
      });
      const file = await handle.getFile();
      const nextRows = parseBotStateTableCsv(await file.text());
      setBotStateFileHandle(handle);
      setBotStateFileName(file.name);
      setBotStateRows(nextRows);
      setBotStateDraft(nextRows[0] ? botStateTableRowToDraft(nextRows[0]) : createBlankBotStateTableDraft());
      setBotStateDirty(false);
      setBotStateStatus(`Loaded ${file.name}.`);
      return;
    }
    document.getElementById("private-bot-state-file")?.click();
  };

  const importBotStateCsvFile = async (file: File | undefined) => {
    if (!file) return;
    const nextRows = parseBotStateTableCsv(await file.text());
    setBotStateFileHandle(null);
    setBotStateFileName(file.name);
    setBotStateRows(nextRows);
    setBotStateDraft(nextRows[0] ? botStateTableRowToDraft(nextRows[0]) : createBlankBotStateTableDraft());
    setBotStateDirty(false);
    setBotStateStatus(`Loaded ${file.name}. Saving will download a replacement CSV.`);
  };

  const openBotTradeCsv = async () => {
    const picker = window as WindowWithFilePicker;
    if (picker.showOpenFilePicker) {
      const [handle] = await picker.showOpenFilePicker({
        types: [{ description: "Private bot trade route table CSV", accept: { "text/csv": [".csv"] } }],
        multiple: false
      });
      const file = await handle.getFile();
      const nextRows = parseBotTradeRoutesTableCsv(await file.text());
      setBotTradeFileHandle(handle);
      setBotTradeFileName(file.name);
      setBotTradeRows(nextRows);
      setBotTradeDraft(nextRows[0] ? botTradeRoutesTableRowToDraft(nextRows[0]) : createBlankBotTradeRoutesTableDraft());
      setBotTradeDirty(false);
      setBotTradeStatus(`Loaded ${file.name}.`);
      return;
    }
    document.getElementById("private-bot-trade-file")?.click();
  };

  const importBotTradeCsvFile = async (file: File | undefined) => {
    if (!file) return;
    const nextRows = parseBotTradeRoutesTableCsv(await file.text());
    setBotTradeFileHandle(null);
    setBotTradeFileName(file.name);
    setBotTradeRows(nextRows);
    setBotTradeDraft(nextRows[0] ? botTradeRoutesTableRowToDraft(nextRows[0]) : createBlankBotTradeRoutesTableDraft());
    setBotTradeDirty(false);
    setBotTradeStatus(`Loaded ${file.name}. Saving will download a replacement CSV.`);
  };

  const saveCurrentCard = () => {
    const draftForSave = draft.cardId.trim() ? draft : { ...draft, cardId: getNextNumericCardId(rows) };
    const row = draftToCsvRow(draftForSave);
    const nextRows = rows.some((existing) => existing.card_id?.trim() === row.card_id.trim())
      ? rows.map((existing) => (existing.card_id?.trim() === row.card_id.trim() ? row : existing))
      : [...rows, row];
    const messages = validateRows(nextRows);
    const firstFatal = messages.find((message) => message.level === "fatal");
    if (firstFatal) {
      setStatus(`${firstFatal.field}: ${firstFatal.message}`);
      return;
    }
    setRows(nextRows);
    setCardDirty(true);
    setPreviousDraft(draftForSave);
    setDraft(createAutoNumberedDraft(selectedProfile, nextRows));
    if (isNationBatch && selectedNationCardRoles.length > 0 && row.card_id.trim()) {
      if (!nationDraft.nationId.trim()) {
        setNationStatus("Choose or add a nation before assigning card roles.");
      } else {
        const nextNationDraft = appendCardIdToNationDraftRoles(nationDraft, row.card_id.trim(), selectedNationCardRoles);
        const nextNationRows = appendOrReplaceNationRow(nationRows, nationDraftToCsvRow(nextNationDraft));
        setNationDraft(nextNationDraft);
        setNationRows(nextNationRows);
        setNationDirty(true);
        setNationStatus(`Added ${row.card_id} to ${nextNationDraft.nationId || "new nation"} definition roles.`);
      }
    }
    setStatus(`Saved ${row.card_id}. Rows: ${nextRows.length}.`);
  };

  const saveNationRow = () => {
    const nationDraftForSave = nationDraft.nationId.trim()
      ? nationDraft
      : { ...nationDraft, nationId: getNextNumericNationId(nationRows) };
    const nationName = nationDraftForSave.privateName.trim() || nationDraftForSave.publicPlaceholderName.trim();
    const row = nationDraftToCsvRow({
      ...nationDraftForSave,
      privateName: nationName,
      publicPlaceholderName: nationName
    });
    const nextRows = appendOrReplaceNationRow(nationRows, row);
    const messages = validateNationRows(nextRows);
    const firstFatal = messages.find((message) => message.level === "fatal");
    if (firstFatal) {
      setNationStatus(`${firstFatal.field}: ${firstFatal.message}`);
      return;
    }
    setNationRows(nextRows);
    setNationDirty(true);
    setNationId(row.nation_id.trim());
    setNationDraft(nationRowToDraft(row));
    resetDraftForProfile(createNationBatchProfile(row.nation_id.trim()));
    setRulesetDraft((current) => ({
      ...current,
      nationId: row.nation_id.trim(),
      privateName: row.nation_name_private || current.privateName,
      publicPlaceholderName: row.public_placeholder_name || current.publicPlaceholderName
    }));
    setNationStatus(`Saved nation ${row.nation_id}. Rows: ${nextRows.length}.`);
  };

  const saveRulesetRow = () => {
    const linkedNationId = nationDraft.nationId.trim() || nationId.trim();
    const row = nationRulesetDraftToCsvRow({
      ...rulesetDraft,
      nationId: linkedNationId,
      privateName: generatedRulesetName,
      publicPlaceholderName: generatedRulesetName
    });
    const nextRows = appendOrReplaceNationRulesetRow(rulesetRows, row);
    const messages = validateNationRulesetRows(nextRows);
    const firstFatal = messages.find((message) => message.level === "fatal");
    if (firstFatal) {
      setRulesetStatus(`${firstFatal.field}: ${firstFatal.message}`);
      return;
    }
    setRulesetRows(nextRows);
    setRulesetDirty(true);
    setRulesetDraft((current) => ({ ...current, nationId: row.nation_id.trim() }));
    setRulesetStatus(`Saved ruleset ${row.nation_id}. Rows: ${nextRows.length}.`);
  };

  const saveBotStateRow = () => {
    const row = botStateTableDraftToCsvRow(botStateDraft);
    const nextRows = appendOrReplaceBotStateTableRow(botStateRows, row);
    const report = validatePrivateBotStateTableRows(nextRows);
    const firstFatal = report.errors.find((message) => message.level === "fatal");
    if (firstFatal) {
      setBotStateStatus(`${firstFatal.field}: Row ${firstFatal.row}: ${firstFatal.message}`);
      return;
    }
    setBotStateRows(nextRows);
    setBotStateDirty(true);
    setBotStateStatus(`Saved bot state row ${row.row_id}. Rows: ${nextRows.length}.`);
  };

  const saveBotTradeRow = () => {
    const row = botTradeRoutesTableDraftToCsvRow(botTradeDraft);
    const nextRows = appendOrReplaceBotTradeRoutesTableRow(botTradeRows, row);
    const report = validatePrivateBotTradeRoutesTableRows(nextRows);
    const firstFatal = report.errors.find((message) => message.level === "fatal");
    if (firstFatal) {
      setBotTradeStatus(`${firstFatal.field}: Row ${firstFatal.row}: ${firstFatal.message}`);
      return;
    }
    setBotTradeRows(nextRows);
    setBotTradeDirty(true);
    setBotTradeStatus(`Saved bot trade ${row.row_type} row. Rows: ${nextRows.length}.`);
  };

  const saveCsv = async () => {
    const content = toCsv(rows);
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setCardDirty(false);
      setStatus(`Saved ${fileName}.`);
      return;
    }
    downloadCsv(fileName, content);
    setCardDirty(false);
    setStatus(`Downloaded ${fileName}.`);
  };

  const saveNationCsv = async () => {
    const content = toNationCsv(nationRows);
    if (nationFileHandle) {
      const writable = await nationFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setNationDirty(false);
      setNationStatus(`Saved ${nationFileName}.`);
      return;
    }
    downloadCsv(nationFileName, content);
    setNationDirty(false);
    setNationStatus(`Downloaded ${nationFileName}.`);
  };

  const saveRulesetCsv = async () => {
    const content = toNationRulesetCsv(rulesetRows);
    if (rulesetFileHandle) {
      const writable = await rulesetFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setRulesetDirty(false);
      setRulesetStatus(`Saved ${rulesetFileName}.`);
      return;
    }
    downloadCsv(rulesetFileName, content);
    setRulesetDirty(false);
    setRulesetStatus(`Downloaded ${rulesetFileName}.`);
  };

  const saveBotStateCsv = async () => {
    const content = toBotStateTableCsv(botStateRows);
    if (botStateFileHandle) {
      const writable = await botStateFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setBotStateDirty(false);
      setBotStateStatus(`Saved ${botStateFileName}.`);
      return;
    }
    downloadCsv(botStateFileName, content);
    setBotStateDirty(false);
    setBotStateStatus(`Downloaded ${botStateFileName}.`);
  };

  const saveBotTradeCsv = async () => {
    const content = toBotTradeRoutesTableCsv(botTradeRows);
    if (botTradeFileHandle) {
      const writable = await botTradeFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setBotTradeDirty(false);
      setBotTradeStatus(`Saved ${botTradeFileName}.`);
      return;
    }
    downloadCsv(botTradeFileName, content);
    setBotTradeDirty(false);
    setBotTradeStatus(`Downloaded ${botTradeFileName}.`);
  };

  const toggleRulesetTrait = (tag: NationRulesetTag) => {
    setRulesetDraft((current) => ({ ...current, rulesetTags: toggleNationRulesetTag(current.rulesetTags, tag) }));
  };

  const duplicatePrevious = (includePrivateText: boolean) => {
    if (!previousDraft) {
      setStatus("No previous card to duplicate.");
      return;
    }
    setDraft({ ...duplicateCardDraft(previousDraft, { includePrivateText }), cardId: getNextNumericCardId(rows) });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = getCardEntryShortcutAction(event);
      if (!action) return;
      event.preventDefault();

      if (action === "save_card") {
        saveCurrentCard();
        return;
      }
      if (action === "focus_suit") {
        suitSelectElement?.focus();
        return;
      }
      if (action === "apply_variable_vp") {
        if (draft.vpMode === "variable") applyVariableVpDetails();
        return;
      }
      if (isNationBatch) {
        const role = nationCardRoleOptions[action.index]?.id;
        if (role) toggleNationCardRole(role);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [applyVariableVpDetails, draft.vpMode, isNationBatch, saveCurrentCard, suitSelectElement, toggleNationCardRole]);

  return (
    <main className="private-entry-screen">
      <section className="private-entry-panel" aria-labelledby="private-entry-title">
        <div className="private-entry-heading">
          <div>
            <p className="private-entry-kicker">Local private data</p>
            <h1 id="private-entry-title">Card and Nation Transcription Tool</h1>
          </div>
          <div className="private-entry-actions">
            <button type="button" onClick={onBack}>Back</button>
          </div>
        </div>

        <input id="private-card-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importCsvFile(event.target.files?.[0])} />
        <input id="private-nation-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importNationCsvFile(event.target.files?.[0])} />
        <input id="private-ruleset-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importRulesetCsvFile(event.target.files?.[0])} />
        <input id="private-bot-state-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importBotStateCsvFile(event.target.files?.[0])} />
        <input id="private-bot-trade-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importBotTradeCsvFile(event.target.files?.[0])} />
        <datalist id="private-card-id-options">
          {cardIdOptions.map((cardId) => <option key={cardId} value={cardId} />)}
        </datalist>

        <div className="private-entry-mode-tabs" role="tablist" aria-label="Private data entry sections">
          <button type="button" className={entryMode === "cards" ? "is-active" : ""} onClick={() => changeEntryMode("cards")}>Cards</button>
          <button type="button" className={entryMode === "nations" ? "is-active" : ""} onClick={() => changeEntryMode("nations")}>Nations</button>
          <button type="button" className={entryMode === "bot-state" ? "is-active" : ""} onClick={() => changeEntryMode("bot-state")}>Bot State</button>
          <button type="button" className={entryMode === "bot-trade" ? "is-active" : ""} onClick={() => changeEntryMode("bot-trade")}>Bot Trade Routes</button>
        </div>

        {entryMode === "cards" || entryMode === "nations" ? (
          <>
            <div className="private-entry-section-actions">
              <button type="button" onClick={openCsv}>Open Card CSV</button>
              <button className="primary-action" type="button" onClick={saveCsv}>Save Card CSV</button>
            </div>

            <div className={`private-entry-status ${fatalCount > 0 ? "is-error" : ""}`}>
              <span>{status}</span>
              <span>{cardDirty ? <strong className="private-entry-unsaved">Card CSV changed</strong> : null}{rows.length} rows / {fatalCount} fatal / {warningCount} warnings</span>
            </div>

            <div className="private-entry-shortcuts">
              <span>Ctrl+Enter save card</span>
              <span>Alt+S suit</span>
              <span>Alt+V apply VP</span>
              <span>Alt+1-6 slots</span>
            </div>

            <div className="private-entry-batch">
              <label>
                Batch
                <select value={profileId} onChange={(event: { target: HTMLSelectElement }) => changeProfile(event.target.value)}>
                  {commonsBatchProfiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>{profile.label}</option>
                  ))}
                  <option value="nation-custom">Nation Deck</option>
                </select>
              </label>
              {profileId === "nation-custom" ? (
                <label>
                  Current Nation
                  <select value={sortedNationRows.some((row) => row.nation_id === nationId) ? nationId : "__new__"} onChange={(event: { target: HTMLSelectElement }) => selectNation(event.target.value)}>
                    <option value="__new__">Add new nation...</option>
                    {sortedNationRows.map((row) => (
                      <option key={row.nation_id} value={row.nation_id}>
                        {row.nation_name_private || row.public_placeholder_name || row.nation_id}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                File
                <input value={fileName} onChange={(event: { target: HTMLInputElement }) => setFileName(event.target.value)} />
              </label>
            </div>
          </>
        ) : null}

        {entryMode === "nations" && isNationBatch ? (
          <>
            <section className="private-entry-nation-panel" aria-labelledby="private-nation-title">
              <div className="private-entry-subheading">
                <div>
                  <h2 id="private-nation-title">Nation Definition CSV</h2>
                </div>
                <div className="private-entry-actions">
                  <button type="button" onClick={openNationCsv}>Open Nation CSV</button>
                  <button type="button" onClick={saveNationRow}>Save Nation Row</button>
                  <button className="primary-action" type="button" onClick={saveNationCsv}>Save Nation CSV</button>
                </div>
              </div>

              <div className={`private-entry-status ${nationFatalCount > 0 ? "is-error" : ""}`}>
                <span>{nationStatus}</span>
                <span>{nationDirty ? <strong className="private-entry-unsaved">Nation CSV changed</strong> : null}{nationRows.length} nations / {nationFatalCount} fatal / {nationWarningCount} warnings</span>
              </div>

              <div className="private-entry-progress-panel">
                <div className="private-entry-progress-current">
                  <div className="private-entry-progress-heading">
                    <h3>{currentNationDeckProgress.label}</h3>
                    <span>{currentNationDeckProgress.totalCards} cards assigned</span>
                  </div>
                  <div className="private-entry-progress-slots">
                    {currentNationDeckProgress.slots.map((slot) => (
                      <div key={slot.id} className="private-entry-progress-slot">
                        <div>
                          <strong>{slot.label}</strong>
                          <span>{slot.count}</span>
                        </div>
                        <p>{slot.cardIds.length > 0 ? slot.cardIds.join(", ") : "No cards yet"}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="private-entry-progress-all">
                  <h3>All Nations</h3>
                  {allNationDeckProgress.length > 0 ? (
                    <ul>
                      {allNationDeckProgress.map((summary) => (
                        <li key={summary.nationId || summary.label}>
                          <strong>{summary.label}</strong>
                          <span>
                            start {summary.slots.find((slot) => slot.id === "starting")?.count ?? 0}
                            {" / "}nation {summary.slots.find((slot) => slot.id === "nation")?.count ?? 0}
                            {" / "}dev {summary.slots.find((slot) => slot.id === "development")?.count ?? 0}
                            {" / "}total {summary.totalCards}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No saved nation rows yet.</p>
                  )}
                </div>
              </div>

              <div className="private-entry-nation-grid">
                <label>Nation ID (auto) <input value={nationDraft.nationId} readOnly /></label>
                <label>Nation Name <input value={nationDraft.privateName || nationDraft.publicPlaceholderName} onChange={nationNameChange} /></label>
                <label>Source Box <input value={nationDraft.sourceBox} onChange={nationDraftChange("sourceBox")} /></label>
                <label>Complexity <input value={nationDraft.complexity} onChange={nationDraftChange("complexity")} /></label>
                <label>Power Card IDs <input list="private-card-id-options" value={nationDraft.powerCardIds} onChange={nationDraftChange("powerCardIds")} /></label>
                <label>State Card IDs <input list="private-card-id-options" value={nationDraft.stateCardIds} onChange={nationDraftChange("stateCardIds")} /></label>
                <label>Starting Deck IDs <input list="private-card-id-options" value={nationDraft.startingDeckCardIds} onChange={nationDraftChange("startingDeckCardIds")} /></label>
                <label>Nation Deck IDs <input list="private-card-id-options" value={nationDraft.nationDeckCardIds} onChange={nationDraftChange("nationDeckCardIds")} /></label>
                <label>Accession Card ID <input list="private-card-id-options" value={nationDraft.accessionCardId} onChange={nationDraftChange("accessionCardId")} /></label>
                <label>Development IDs <input list="private-card-id-options" value={nationDraft.developmentCardIds} onChange={nationDraftChange("developmentCardIds")} /></label>
                <label>Action Tokens <input value={nationDraft.actionTokensBase} onChange={nationDraftChange("actionTokensBase")} /></label>
                <label>Exhaust Tokens <input value={nationDraft.exhaustTokensBase} onChange={nationDraftChange("exhaustTokensBase")} /></label>
                <label>Required Expansions <select value={nationDraft.requiredExpansions} onChange={nationDraftChange("requiredExpansions")}>{expansionRequirementOptions.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}</select></label>
                <label>Implemented <select value={nationDraft.implemented} onChange={nationDraftChange("implemented")}><option value="false">false</option><option value="true">true</option></select></label>
                <label>Tested <select value={nationDraft.tested} onChange={nationDraftChange("tested")}><option value="false">false</option><option value="true">true</option></select></label>
                <fieldset className="private-entry-choice-fieldset private-entry-wide">
                  <legend>Advanced Nation JSON</legend>
                  <p className="private-entry-help">Keep these as [] for ordinary nations. Use Special Setup only for setup exceptions like starting resources, side areas, or cards placed outside normal slots. Use Passive Rules for executable nation-wide hooks; Nation Builder Traits are the safer readable classification layer.</p>
                  <label>Special Setup JSON <textarea rows={3} value={nationDraft.specialSetupJson} onChange={nationDraftChange("specialSetupJson")} /></label>
                  <div className="private-entry-template-row">
                    {specialSetupTemplates.map((template) => <button type="button" key={template.label} onClick={() => insertSpecialSetupTemplate(template.value)}>{template.label}</button>)}
                  </div>
                  <p className="private-entry-example">Examples: [{"{\"op\":\"gain_resource\",\"resource\":\"materials\",\"count\":2}"}, {"{\"op\":\"create_side_area\",\"areaId\":\"vault\",\"displayName\":\"Vault\"}"}]</p>
                  <label>Passive Rules JSON <textarea rows={3} value={nationDraft.passiveRulesJson} onChange={nationDraftChange("passiveRulesJson")} /></label>
                  <div className="private-entry-template-row">
                    {passiveRuleTemplates.map((template) => <button type="button" key={template.label} onClick={() => insertPassiveRuleTemplate(template.value)}>{template.label}</button>)}
                  </div>
                  <p className="private-entry-example">Example: [{"{\"trigger\":\"on_develop\",\"effects\":[{\"op\":\"gain_resource\",\"resource\":\"goods\",\"amount\":1}]}"}]</p>
                </fieldset>
                <label className="private-entry-wide">Notes <textarea rows={2} value={nationDraft.notes} onChange={nationDraftChange("notes")} /></label>
              </div>

              {nationValidation.length > 0 ? (
                <ul className="private-entry-messages">
                  {nationValidation.slice(0, 6).map((message, index) => (
                    <li key={`${message.field}-${index}`} className={message.level === "fatal" ? "is-error" : ""}>
                      {message.field}: {message.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="private-entry-nation-panel" aria-labelledby="private-ruleset-title">
              <div className="private-entry-subheading">
                <h2 id="private-ruleset-title">Nation Builder Traits</h2>
                <div className="private-entry-actions">
                  <button type="button" onClick={openRulesetCsv}>Open Ruleset CSV</button>
                  <button type="button" onClick={saveRulesetRow}>Save Ruleset Row</button>
                  <button className="primary-action" type="button" onClick={saveRulesetCsv}>Save Ruleset CSV</button>
                </div>
              </div>

              <div className={`private-entry-status ${rulesetFatalCount > 0 ? "is-error" : ""}`}>
                <span>{rulesetStatus}</span>
                <span>{rulesetDirty ? <strong className="private-entry-unsaved">Ruleset CSV changed</strong> : null}{rulesetRows.length} rulesets / {rulesetFatalCount} fatal / {rulesetWarningCount} warnings</span>
              </div>

              <div className="private-entry-nation-grid">
                <label>Linked Nation ID <input value={rulesetDraft.nationId || nationDraft.nationId || nationId} readOnly /></label>
                <label>Ruleset Name <input value={generatedRulesetName} readOnly /></label>
                <label>Required Expansions <select value={rulesetDraft.requiredExpansions} onChange={rulesetDraftChange("requiredExpansions")}>{expansionRequirementOptions.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}</select></label>
                <label>Implemented <select value={rulesetDraft.implemented} onChange={rulesetDraftChange("implemented")}><option value="false">false</option><option value="true">true</option></select></label>
                <label>Tested <select value={rulesetDraft.tested} onChange={rulesetDraftChange("tested")}><option value="false">false</option><option value="true">true</option></select></label>
                <label className="private-entry-wide">Public Summary <input value={rulesetDraft.publicSummary} onChange={rulesetDraftChange("publicSummary")} /></label>
                <label className="private-entry-wide">Private Notes <textarea rows={2} value={rulesetDraft.privateNotes} onChange={rulesetDraftChange("privateNotes")} /></label>
              </div>

              <div className="private-entry-trait-grid">
                {nationRulesetTagOptions.map((tag) => (
                  <label key={tag}>
                    <input type="checkbox" checked={rulesetDraft.rulesetTags.includes(tag)} onChange={() => toggleRulesetTrait(tag)} />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>

              {rulesetValidation.length > 0 ? (
                <ul className="private-entry-messages">
                  {rulesetValidation.slice(0, 6).map((message, index) => (
                    <li key={`${message.field}-${index}`} className={message.level === "fatal" ? "is-error" : ""}>
                      {message.field}: {message.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </>
        ) : null}

        {entryMode === "cards" || entryMode === "nations" ? (
        <>
        <form className="private-entry-grid" onSubmit={(event: { preventDefault: () => void }) => { event.preventDefault(); saveCurrentCard(); }}>
          <label>Card ID (auto) <input value={draft.cardId} readOnly autoFocus /></label>
          <label>Actual Card Name <input value={draft.privateName} onChange={draftChange("privateName")} /></label>
          <label>Placeholder Name <input value={draft.publicPlaceholderName} onChange={draftChange("publicPlaceholderName")} /></label>
          <label>Suit <select ref={setSuitSelectElement} value={draft.suit} onChange={draftChange("suit")}>{suitOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Suit Icons <input value={draft.suitIcons} onChange={draftChange("suitIcons")} /></label>
          <fieldset className="private-entry-choice-fieldset private-entry-wide">
            <legend>Suit Icon Checkboxes</legend>
            <div className="private-entry-choice-grid">
              {suitIconOptions.map((suitIcon) => (
                <label key={suitIcon}>
                  <input type="checkbox" checked={draft.suitIcons.split("|").map((value) => value.trim()).includes(suitIcon)} onChange={() => toggleSuitIcon(suitIcon)} />
                  <span>{suitIcon}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label>Type <select value={draft.cardType} onChange={draftChange("cardType")}>{cardTypeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>State <input list="private-card-id-options" value={draft.stateRequirement} onChange={draftChange("stateRequirement")} /></label>
          <label>Start <select value={draft.startingLocation} onChange={draftChange("startingLocation")}>{startOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Players <select value={draft.playerCountRequirement} onChange={(event: { target: HTMLSelectElement }) => updateDraft("playerCountRequirement", event.target.value)}>{playerCountOptions.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}</select></label>
          <label>Required Expansion <select value={draft.requiredExpansions} onChange={draftChange("requiredExpansions")}>{expansionRequirementOptions.map((option) => <option key={option.label} value={option.value}>{option.label}</option>)}</select></label>
          <label>Cost M <input value={draft.costMaterials} onChange={draftChange("costMaterials")} /></label>
          <label>Cost P <input value={draft.costPopulation} onChange={draftChange("costPopulation")} /></label>
          <label>Cost Prog <input value={draft.costProgress} onChange={draftChange("costProgress")} /></label>
          <label>Cost Goods <input value={draft.costGoods} onChange={draftChange("costGoods")} /></label>
          <label>VP Mode <select value={draft.vpMode} onChange={draftChange("vpMode")}>{vpModeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>VP <input value={draft.vpValue} onChange={draftChange("vpValue")} /></label>
          {draft.vpMode === "variable" ? (
            <fieldset className="private-entry-choice-fieldset private-entry-wide">
              <legend>Variable VP Builder</legend>
              <div className="private-entry-vp-builder-grid">
                <label>
                  Formula
                  <select value={variableVpDetails.formula} onChange={(event: { target: HTMLSelectElement }) => updateVariableVpDetail("formula", event.target.value as VariableVpFormula)}>
                    {variableVpFormulaOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label>Amount Each <input value={variableVpDetails.amountEach} onChange={(event: { target: HTMLInputElement }) => updateVariableVpDetail("amountEach", event.target.value)} /></label>
                <label>Target <input value={variableVpDetails.target} onChange={(event: { target: HTMLInputElement }) => updateVariableVpDetail("target", event.target.value)} /></label>
                <label>Cap <input value={variableVpDetails.cap} onChange={(event: { target: HTMLInputElement }) => updateVariableVpDetail("cap", event.target.value)} /></label>
                <label className="private-entry-wide">Scoring Note <input value={variableVpDetails.note} onChange={(event: { target: HTMLInputElement }) => updateVariableVpDetail("note", event.target.value)} /></label>
                <div className="private-entry-builder-actions private-entry-wide">
                  <button type="button" onClick={applyVariableVpDetails}>Apply Variable VP</button>
                </div>
              </div>
            </fieldset>
          ) : null}
          <label>Tags <input value={draft.tags} onChange={draftChange("tags")} /></label>
          <label className="private-entry-wide">Raw Private Text <textarea rows={6} value={draft.rawEffectTextPrivate} onChange={draftChange("rawEffectTextPrivate")} /></label>
          {isNationBatch ? (
            <fieldset className="private-entry-choice-fieldset private-entry-wide">
              <legend>Nation Definition Slots</legend>
              <div className="private-entry-choice-grid">
                {nationCardRoleOptions.map((role) => (
                  <label key={role.id}>
                    <input type="checkbox" checked={selectedNationCardRoles.includes(role.id)} onChange={() => toggleNationCardRole(role.id)} />
                    <span>{role.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
          <label className="private-entry-wide">Notes <textarea rows={3} value={draft.notes} onChange={draftChange("notes")} /></label>
          <div className="private-entry-duplicate-help private-entry-wide">
            <p><strong>Duplicate Structure</strong> copies card shape and metadata, assigns the next auto ID, then clears names, private text, implemented, and tested.</p>
            <p><strong>Duplicate Full</strong> copies the previous draft including actual card name and rules text, then assigns the next auto ID.</p>
          </div>
          <div className="private-entry-footer private-entry-wide">
            <button type="button" onClick={() => duplicatePrevious(false)}>Duplicate Structure</button>
            <button type="button" onClick={() => duplicatePrevious(true)}>Duplicate Full</button>
            <button className="primary-action" type="submit">Save / Next</button>
          </div>
        </form>

        {validation.length > 0 ? (
          <ul className="private-entry-messages">
            {validation.slice(0, 8).map((message, index) => (
              <li key={`${message.field}-${index}`} className={message.level === "fatal" ? "is-error" : ""}>
                {message.field}: {message.message}
              </li>
            ))}
          </ul>
        ) : null}
        </>
        ) : null}

        {entryMode === "bot-state" ? (
          <section className="private-entry-nation-panel" aria-labelledby="private-bot-state-title">
            <div className="private-entry-subheading">
              <div>
                <h2 id="private-bot-state-title">Bot State Table CSV</h2>
                <p>Build bot state trigger rows for AI nation behavior.</p>
              </div>
              <div className="private-entry-actions">
                <button type="button" onClick={openBotStateCsv}>Open Bot State CSV</button>
                <button type="button" onClick={saveBotStateRow}>Save Bot State Row</button>
                <button className="primary-action" type="button" onClick={saveBotStateCsv}>Save Bot State CSV</button>
              </div>
            </div>

            <div className={`private-entry-status ${botStateFatalCount > 0 ? "is-error" : ""}`}>
              <span>{botStateStatus}</span>
              <span>{botStateDirty ? <strong className="private-entry-unsaved">Bot state CSV changed</strong> : null}{botStateRows.length} rows / {botStateFatalCount} fatal / {botStateWarningCount} warnings</span>
            </div>

            <div className="private-entry-batch">
              <label>
                File
                <input value={botStateFileName} onChange={(event: { target: HTMLInputElement }) => setBotStateFileName(event.target.value)} />
              </label>
              <label>
                Existing Row
                <select value="" onChange={(event: { target: HTMLSelectElement }) => {
                  const row = botStateRows.find((item) => `${item.table_id}|${item.table_side}|${item.row_id}` === event.target.value);
                  if (row) setBotStateDraft(botStateTableRowToDraft(row));
                }}>
                  <option value="">Load saved row...</option>
                  {botStateRows.map((row) => (
                    <option key={`${row.table_id}|${row.table_side}|${row.row_id}`} value={`${row.table_id}|${row.table_side}|${row.row_id}`}>
                      {row.table_id} / {row.table_side} / {row.row_id}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <form className="private-entry-grid" onSubmit={(event: { preventDefault: () => void }) => { event.preventDefault(); saveBotStateRow(); }}>
              <label>Table ID <input value={botStateDraft.tableId} onChange={botStateDraftChange("tableId")} /></label>
              <label>Bot Nation ID <input value={botStateDraft.botNationId} onChange={botStateDraftChange("botNationId")} /></label>
              <label>Table Side <select value={botStateDraft.tableSide} onChange={botStateDraftChange("tableSide")}>{botTableSideOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Row ID <input value={botStateDraft.rowId} onChange={botStateDraftChange("rowId")} /></label>
              <label>Priority <input value={botStateDraft.priority} onChange={botStateDraftChange("priority")} /></label>
              <label>Trigger Kind <select value={botStateDraft.triggerKind} onChange={botStateDraftChange("triggerKind")}>{botTriggerKindOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Trigger Value <input value={botStateDraft.triggerValue} onChange={botStateDraftChange("triggerValue")} /></label>
              <label>Placeholder Label <input value={botStateDraft.publicPlaceholderLabel} onChange={botStateDraftChange("publicPlaceholderLabel")} /></label>
              <label>Private Trigger Label <input value={botStateDraft.privateTriggerLabel} onChange={botStateDraftChange("privateTriggerLabel")} /></label>
              <label>Implemented <select value={botStateDraft.implemented} onChange={botStateDraftChange("implemented")}><option value="false">false</option><option value="true">true</option></select></label>
              <label>Tested <select value={botStateDraft.tested} onChange={botStateDraftChange("tested")}><option value="false">false</option><option value="true">true</option></select></label>
              <label className="private-entry-wide">Private Effect Text <textarea rows={3} value={botStateDraft.privateEffectText} onChange={botStateDraftChange("privateEffectText")} /></label>
              <label className="private-entry-wide">Effects JSON <textarea rows={5} value={botStateDraft.effectsJson} onChange={botStateDraftChange("effectsJson")} /></label>
              <label className="private-entry-wide">Notes <textarea rows={2} value={botStateDraft.notes} onChange={botStateDraftChange("notes")} /></label>
              <div className="private-entry-footer private-entry-wide">
                <button type="button" onClick={() => setBotStateDraft(createBlankBotStateTableDraft())}>New Bot State Row</button>
                <button className="primary-action" type="submit">Save Bot State Row</button>
              </div>
            </form>

            {botStateReport.errors.length > 0 ? (
              <ul className="private-entry-messages">
                {botStateReport.errors.slice(0, 8).map((message, index) => (
                  <li key={`${message.field}-${message.row}-${index}`} className={message.level === "fatal" ? "is-error" : ""}>
                    Row {message.row} {message.field}: {message.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {entryMode === "bot-trade" ? (
          <section className="private-entry-nation-panel" aria-labelledby="private-bot-trade-title">
            <div className="private-entry-subheading">
              <div>
                <h2 id="private-bot-trade-title">Bot Trade Routes CSV</h2>
                <p>Build route and end-of-turn rows for AI trade route behavior.</p>
              </div>
              <div className="private-entry-actions">
                <button type="button" onClick={openBotTradeCsv}>Open Bot Trade CSV</button>
                <button type="button" onClick={saveBotTradeRow}>Save Bot Trade Row</button>
                <button className="primary-action" type="button" onClick={saveBotTradeCsv}>Save Bot Trade CSV</button>
              </div>
            </div>

            <div className={`private-entry-status ${botTradeFatalCount > 0 ? "is-error" : ""}`}>
              <span>{botTradeStatus}</span>
              <span>{botTradeDirty ? <strong className="private-entry-unsaved">Bot trade CSV changed</strong> : null}{botTradeRows.length} rows / {botTradeFatalCount} fatal / {botTradeWarningCount} warnings</span>
            </div>

            <div className="private-entry-batch">
              <label>
                File
                <input value={botTradeFileName} onChange={(event: { target: HTMLInputElement }) => setBotTradeFileName(event.target.value)} />
              </label>
              <label>
                Existing Row
                <select value="" onChange={(event: { target: HTMLSelectElement }) => {
                  const row = botTradeRows.find((item) => {
                    const key = item.row_type === "end_of_turn"
                      ? `${item.table_id}|${item.row_type}|${item.merchant_state}|${item.priority}`
                      : `${item.table_id}|${item.row_type}|${item.trade_route_card_id}`;
                    return key === event.target.value;
                  });
                  if (row) setBotTradeDraft(botTradeRoutesTableRowToDraft(row));
                }}>
                  <option value="">Load saved row...</option>
                  {botTradeRows.map((row) => {
                    const key = row.row_type === "end_of_turn"
                      ? `${row.table_id}|${row.row_type}|${row.merchant_state}|${row.priority}`
                      : `${row.table_id}|${row.row_type}|${row.trade_route_card_id}`;
                    return <option key={key} value={key}>{row.table_id} / {row.row_type} / {row.trade_route_card_id || row.merchant_state}</option>;
                  })}
                </select>
              </label>
            </div>

            <form className="private-entry-grid" onSubmit={(event: { preventDefault: () => void }) => { event.preventDefault(); saveBotTradeRow(); }}>
              <label>Table ID <input value={botTradeDraft.tableId} onChange={botTradeDraftChange("tableId")} /></label>
              <label>Row Type <select value={botTradeDraft.rowType} onChange={botTradeDraftChange("rowType")}>{botTradeRowTypeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              <label>Merchant State <select value={botTradeDraft.merchantState} onChange={botTradeDraftChange("merchantState")}>{botMerchantStateOptions.map((value) => <option key={value} value={value}>{value || "None"}</option>)}</select></label>
              <label>Priority <input value={botTradeDraft.priority} onChange={botTradeDraftChange("priority")} /></label>
              <label>Trade Route Card ID <input list="private-card-id-options" value={botTradeDraft.tradeRouteCardId} onChange={botTradeDraftChange("tradeRouteCardId")} /></label>
              <label>Placeholder Name <input value={botTradeDraft.publicPlaceholderName} onChange={botTradeDraftChange("publicPlaceholderName")} /></label>
              <label>Private Name <input value={botTradeDraft.privateName} onChange={botTradeDraftChange("privateName")} /></label>
              <label>Implemented <select value={botTradeDraft.implemented} onChange={botTradeDraftChange("implemented")}><option value="false">false</option><option value="true">true</option></select></label>
              <label>Tested <select value={botTradeDraft.tested} onChange={botTradeDraftChange("tested")}><option value="false">false</option><option value="true">true</option></select></label>
              <label className="private-entry-wide">Commerce Effects JSON <textarea rows={4} value={botTradeDraft.commerceEffectsJson} onChange={botTradeDraftChange("commerceEffectsJson")} /></label>
              <label className="private-entry-wide">Profit Effects JSON <textarea rows={4} value={botTradeDraft.profitEffectsJson} onChange={botTradeDraftChange("profitEffectsJson")} /></label>
              <label className="private-entry-wide">End-of-Turn Effects JSON <textarea rows={4} value={botTradeDraft.endOfTurnEffectsJson} onChange={botTradeDraftChange("endOfTurnEffectsJson")} /></label>
              <label className="private-entry-wide">Notes <textarea rows={2} value={botTradeDraft.notes} onChange={botTradeDraftChange("notes")} /></label>
              <div className="private-entry-footer private-entry-wide">
                <button type="button" onClick={() => setBotTradeDraft(createBlankBotTradeRoutesTableDraft())}>New Bot Trade Row</button>
                <button className="primary-action" type="submit">Save Bot Trade Row</button>
              </div>
            </form>

            {botTradeReport.errors.length > 0 ? (
              <ul className="private-entry-messages">
                {botTradeReport.errors.slice(0, 8).map((message, index) => (
                  <li key={`${message.field}-${message.row}-${index}`} className={message.level === "fatal" ? "is-error" : ""}>
                    Row {message.row} {message.field}: {message.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
