import { useMemo, useState } from "react";
import Papa from "papaparse";
import type { PrivateCardCsvRow } from "../../../../tools/card-import/cardCsvTypes";
import type { NationRuleHook, PrivateNationCsvRow, SetupRule } from "../../../../tools/card-import/nationCsvTypes";
import type { NationRulesetTag } from "../../../../engine/src/nations/nationRulesetTypes";
import type { PrivateNationRulesetCsvRow } from "../../../../tools/card-import/nationRulesetCsvTypes";
import { commonsBatchProfiles, createNationBatchProfile } from "../../../../tools/card-entry/batchProfiles";
import {
  applyVariableVpDraftDetails,
  createBlankCardDraft,
  csvRowToDraft,
  draftToCsvRow,
  duplicateCardDraft,
  toggleDraftSuitIcon,
  type VariableVpDraftDetails,
  type VariableVpFormula
} from "../../../../tools/card-entry/cardDraft";
import type { CardEntryBatchProfile, CardEntryDraft } from "../../../../tools/card-entry/cardEntryTypes";
import {
  appendOrReplaceNationRow,
  appendCardIdToNationDraftRoles,
  createBlankNationDraft,
  insertNationJsonTemplate,
  nationCsvColumns,
  nationDraftToCsvRow,
  nationRowToDraft,
  sortNationRowsByName,
  type NationCardRole,
  type NationEntryDraft
} from "../../../../tools/card-entry/nationDraft";
import {
  appendOrReplaceNationRulesetRow,
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

function toCsv(rows: PrivateCardCsvRow[]): string {
  return `${Papa.unparse(rows.map(rowWithColumns), { columns: csvColumns, newline: "\n" })}\n`;
}

function toNationCsv(rows: PrivateNationCsvRow[]): string {
  return `${Papa.unparse(rows.map(nationRowWithColumns), { columns: [...nationCsvColumns], newline: "\n" })}\n`;
}

function toNationRulesetCsv(rows: PrivateNationRulesetCsvRow[]): string {
  return `${Papa.unparse(rows.map(nationRulesetRowWithColumns), { columns: [...nationRulesetCsvColumns], newline: "\n" })}\n`;
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
  const [profileId, setProfileId] = useState(commonsBatchProfiles[0].id);
  const [nationId, setNationId] = useState("");
  const [rows, setRows] = useState<PrivateCardCsvRow[]>([]);
  const [draft, setDraft] = useState<CardEntryDraft>(createBlankCardDraft(commonsBatchProfiles[0]));
  const [previousDraft, setPreviousDraft] = useState<CardEntryDraft | null>(null);
  const [fileName, setFileName] = useState("imperium_cards_private.csv");
  const [status, setStatus] = useState("No private CSV loaded. New saves stay in this browser until exported.");
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [variableVpDetails, setVariableVpDetails] = useState<VariableVpDraftDetails>({
    formula: "per_card",
    amountEach: "1",
    target: "",
    cap: "",
    note: ""
  });
  const [nationRows, setNationRows] = useState<PrivateNationCsvRow[]>([]);
  const [nationDraft, setNationDraft] = useState<NationEntryDraft>(createBlankNationDraft());
  const [nationFileName, setNationFileName] = useState("imperium_nations_private.csv");
  const [nationStatus, setNationStatus] = useState("No private nation CSV loaded. New nation rows stay in this browser until exported.");
  const [nationFileHandle, setNationFileHandle] = useState<FileSystemFileHandleLike | null>(null);
  const [selectedNationCardRoles, setSelectedNationCardRoles] = useState<NationCardRole[]>(["nation"]);
  const [rulesetRows, setRulesetRows] = useState<PrivateNationRulesetCsvRow[]>([]);
  const [rulesetDraft, setRulesetDraft] = useState<NationRulesetEntryDraft>(createBlankNationRulesetDraft());
  const [rulesetFileName, setRulesetFileName] = useState("imperium_nation_rulesets_private.csv");
  const [rulesetStatus, setRulesetStatus] = useState("No private ruleset CSV loaded. Builder traits stay in this browser until exported.");
  const [rulesetFileHandle, setRulesetFileHandle] = useState<FileSystemFileHandleLike | null>(null);

  const selectedProfile = useMemo(() => profileFromSelection(profileId, nationId), [profileId, nationId]);
  const isNationBatch = profileId === "nation-custom";
  const sortedNationRows = useMemo(() => sortNationRowsByName(nationRows), [nationRows]);
  const validation = useMemo(() => validateRows(rows), [rows]);
  const nationValidation = useMemo(() => validateNationRows(nationRows), [nationRows]);
  const rulesetValidation = useMemo(() => validateNationRulesetRows(rulesetRows), [rulesetRows]);
  const fatalCount = validation.filter((message) => message.level === "fatal").length;
  const warningCount = validation.filter((message) => message.level === "warning").length;
  const nationFatalCount = nationValidation.filter((message) => message.level === "fatal").length;
  const nationWarningCount = nationValidation.filter((message) => message.level === "warning").length;
  const rulesetFatalCount = rulesetValidation.filter((message) => message.level === "fatal").length;
  const rulesetWarningCount = rulesetValidation.filter((message) => message.level === "warning").length;

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

  const draftChange = (field: keyof CardEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateDraft(field, event.target.value);
  };

  const nationDraftChange = (field: keyof NationEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateNationDraft(field, event.target.value);
  };

  const rulesetDraftChange = (field: keyof NationRulesetEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateRulesetDraft(field, event.target.value);
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

  const resetDraftForProfile = (profile: CardEntryBatchProfile) => {
    setDraft(createBlankCardDraft(profile));
  };

  const changeProfile = (nextProfileId: string) => {
    setProfileId(nextProfileId);
    resetDraftForProfile(profileFromSelection(nextProfileId, nationId));
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
      setNationId("");
      const blankNation = createBlankNationDraft();
      setNationDraft(blankNation);
      setRulesetDraft(createBlankNationRulesetDraft());
      resetDraftForProfile(createNationBatchProfile(""));
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
      setFileHandle(handle);
      setFileName(file.name);
      setRows(parseCsv(await file.text()));
      setStatus(`Loaded ${file.name}.`);
      return;
    }
    document.getElementById("private-card-file")?.click();
  };

  const importCsvFile = async (file: File | undefined) => {
    if (!file) return;
    setFileHandle(null);
    setFileName(file.name);
    setRows(parseCsv(await file.text()));
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
      const firstNation = sortNationRowsByName(nextRows)[0];
      if (firstNation?.nation_id) selectNation(firstNation.nation_id, nextRows);
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
    const firstNation = sortNationRowsByName(nextRows)[0];
    if (firstNation?.nation_id) selectNation(firstNation.nation_id, nextRows);
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
    if (nationId) selectRulesetForNation(nationId, nextRows);
    setRulesetStatus(`Loaded ${file.name}. Saving will download a replacement CSV.`);
  };

  const saveCurrentCard = () => {
    const row = draftToCsvRow(draft);
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
    setPreviousDraft(draft);
    setDraft(createBlankCardDraft(selectedProfile));
    if (isNationBatch && selectedNationCardRoles.length > 0 && row.card_id.trim()) {
      if (!nationDraft.nationId.trim()) {
        setNationStatus("Choose or add a nation before assigning card roles.");
      } else {
        const nextNationDraft = appendCardIdToNationDraftRoles(nationDraft, row.card_id.trim(), selectedNationCardRoles);
        const nextNationRows = appendOrReplaceNationRow(nationRows, nationDraftToCsvRow(nextNationDraft));
        setNationDraft(nextNationDraft);
        setNationRows(nextNationRows);
        setNationStatus(`Added ${row.card_id} to ${nextNationDraft.nationId || "new nation"} definition roles.`);
      }
    }
    setStatus(`Saved ${row.card_id}. Rows: ${nextRows.length}.`);
  };

  const saveNationRow = () => {
    const row = nationDraftToCsvRow(nationDraft);
    const nextRows = appendOrReplaceNationRow(nationRows, row);
    const messages = validateNationRows(nextRows);
    const firstFatal = messages.find((message) => message.level === "fatal");
    if (firstFatal) {
      setNationStatus(`${firstFatal.field}: ${firstFatal.message}`);
      return;
    }
    setNationRows(nextRows);
    setNationId(row.nation_id.trim());
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
    const row = nationRulesetDraftToCsvRow({ ...rulesetDraft, nationId: linkedNationId });
    const nextRows = appendOrReplaceNationRulesetRow(rulesetRows, row);
    const messages = validateNationRulesetRows(nextRows);
    const firstFatal = messages.find((message) => message.level === "fatal");
    if (firstFatal) {
      setRulesetStatus(`${firstFatal.field}: ${firstFatal.message}`);
      return;
    }
    setRulesetRows(nextRows);
    setRulesetDraft((current) => ({ ...current, nationId: row.nation_id.trim() }));
    setRulesetStatus(`Saved ruleset ${row.nation_id}. Rows: ${nextRows.length}.`);
  };

  const saveCsv = async () => {
    const content = toCsv(rows);
    if (fileHandle) {
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setStatus(`Saved ${fileName}.`);
      return;
    }
    downloadCsv(fileName, content);
    setStatus(`Downloaded ${fileName}.`);
  };

  const saveNationCsv = async () => {
    const content = toNationCsv(nationRows);
    if (nationFileHandle) {
      const writable = await nationFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setNationStatus(`Saved ${nationFileName}.`);
      return;
    }
    downloadCsv(nationFileName, content);
    setNationStatus(`Downloaded ${nationFileName}.`);
  };

  const saveRulesetCsv = async () => {
    const content = toNationRulesetCsv(rulesetRows);
    if (rulesetFileHandle) {
      const writable = await rulesetFileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      setRulesetStatus(`Saved ${rulesetFileName}.`);
      return;
    }
    downloadCsv(rulesetFileName, content);
    setRulesetStatus(`Downloaded ${rulesetFileName}.`);
  };

  const toggleRulesetTrait = (tag: NationRulesetTag) => {
    setRulesetDraft((current) => ({ ...current, rulesetTags: toggleNationRulesetTag(current.rulesetTags, tag) }));
  };

  const duplicatePrevious = (includePrivateText: boolean) => {
    if (!previousDraft) {
      setStatus("No previous card to duplicate.");
      return;
    }
    setDraft(duplicateCardDraft(previousDraft, { includePrivateText }));
  };

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
            <button type="button" onClick={openCsv}>Open CSV</button>
            <button className="primary-action" type="button" onClick={saveCsv}>Save CSV</button>
          </div>
        </div>

        <input id="private-card-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importCsvFile(event.target.files?.[0])} />
        <input id="private-nation-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importNationCsvFile(event.target.files?.[0])} />
        <input id="private-ruleset-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importRulesetCsvFile(event.target.files?.[0])} />

        <div className={`private-entry-status ${fatalCount > 0 ? "is-error" : ""}`}>
          <span>{status}</span>
          <span>{rows.length} rows / {fatalCount} fatal / {warningCount} warnings</span>
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
                    {row.public_placeholder_name || row.nation_name_private || row.nation_id}
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

        {isNationBatch ? (
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
                <span>{nationRows.length} nations / {nationFatalCount} fatal / {nationWarningCount} warnings</span>
              </div>

              <div className="private-entry-nation-grid">
                <label>Nation ID <input value={nationDraft.nationId} onChange={nationDraftChange("nationId")} onBlur={() => resetDraftForProfile(createNationBatchProfile(nationDraft.nationId))} /></label>
                <label>Private Name <input value={nationDraft.privateName} onChange={nationDraftChange("privateName")} /></label>
                <label>Placeholder Name <input value={nationDraft.publicPlaceholderName} onChange={nationDraftChange("publicPlaceholderName")} /></label>
                <label>Source Box <input value={nationDraft.sourceBox} onChange={nationDraftChange("sourceBox")} /></label>
                <label>Complexity <input value={nationDraft.complexity} onChange={nationDraftChange("complexity")} /></label>
                <label>Power Card IDs <input value={nationDraft.powerCardIds} onChange={nationDraftChange("powerCardIds")} /></label>
                <label>State Card IDs <input value={nationDraft.stateCardIds} onChange={nationDraftChange("stateCardIds")} /></label>
                <label>Starting Deck IDs <input value={nationDraft.startingDeckCardIds} onChange={nationDraftChange("startingDeckCardIds")} /></label>
                <label>Nation Deck IDs <input value={nationDraft.nationDeckCardIds} onChange={nationDraftChange("nationDeckCardIds")} /></label>
                <label>Accession Card ID <input value={nationDraft.accessionCardId} onChange={nationDraftChange("accessionCardId")} /></label>
                <label>Development IDs <input value={nationDraft.developmentCardIds} onChange={nationDraftChange("developmentCardIds")} /></label>
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
                <span>{rulesetRows.length} rulesets / {rulesetFatalCount} fatal / {rulesetWarningCount} warnings</span>
              </div>

              <div className="private-entry-nation-grid">
                <label>Linked Nation ID <input value={rulesetDraft.nationId || nationDraft.nationId || nationId} readOnly /></label>
                <label>Ruleset Name <input value={rulesetDraft.publicPlaceholderName} onChange={rulesetDraftChange("publicPlaceholderName")} /></label>
                <label>Private Ruleset Name <input value={rulesetDraft.privateName} onChange={rulesetDraftChange("privateName")} /></label>
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

        <form className="private-entry-grid" onSubmit={(event: { preventDefault: () => void }) => { event.preventDefault(); saveCurrentCard(); }}>
          <label>Card ID <input value={draft.cardId} onChange={draftChange("cardId")} autoFocus /></label>
          <label>Private Name <input value={draft.privateName} onChange={draftChange("privateName")} /></label>
          <label>Placeholder Name <input value={draft.publicPlaceholderName} onChange={draftChange("publicPlaceholderName")} /></label>
          <label>Suit <select value={draft.suit} onChange={draftChange("suit")}>{suitOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
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
          <label>State <input value={draft.stateRequirement} onChange={draftChange("stateRequirement")} /></label>
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
      </section>
    </main>
  );
}
