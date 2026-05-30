import { useMemo, useState } from "react";
import Papa from "papaparse";
import type { PrivateCardCsvRow } from "../../../../tools/card-import/cardCsvTypes";
import { commonsBatchProfiles, createNationBatchProfile } from "../../../../tools/card-entry/batchProfiles";
import { createBlankCardDraft, csvRowToDraft, draftToCsvRow, duplicateCardDraft } from "../../../../tools/card-entry/cardDraft";
import type { CardEntryBatchProfile, CardEntryDraft } from "../../../../tools/card-entry/cardEntryTypes";

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
const cardTypeOptions = ["", "action", "in_play", "attack", "power", "state", "development", "accession", "nation", "region", "unrest", "fame", "trade_route", "bot_state", "other"];
const startOptions = ["draw_deck", "nation_deck", "accession", "development_area", "in_play", "supply", "market", "fame_deck", "unrest_pile", "bot_deck", "box", "other"];
const vpModeOptions = ["none", "fixed", "variable", "negative", "conditional"];

function profileFromSelection(profileId: string, nationId: string): CardEntryBatchProfile {
  if (profileId === "nation-custom") return createNationBatchProfile(nationId.trim());
  return commonsBatchProfiles.find((profile) => profile.id === profileId) ?? commonsBatchProfiles[0];
}

function rowWithColumns(row: PrivateCardCsvRow): PrivateCardCsvRow {
  return Object.fromEntries(csvColumns.map((column) => [column, row[column] ?? ""])) as PrivateCardCsvRow;
}

function parseCsv(text: string): PrivateCardCsvRow[] {
  const parsed = Papa.parse<PrivateCardCsvRow>(text, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) throw new Error(parsed.errors[0].message);
  return parsed.data;
}

function toCsv(rows: PrivateCardCsvRow[]): string {
  return `${Papa.unparse(rows.map(rowWithColumns), { columns: csvColumns, newline: "\n" })}\n`;
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

  const selectedProfile = useMemo(() => profileFromSelection(profileId, nationId), [profileId, nationId]);
  const validation = useMemo(() => validateRows(rows), [rows]);
  const fatalCount = validation.filter((message) => message.level === "fatal").length;
  const warningCount = validation.filter((message) => message.level === "warning").length;

  const updateDraft = (field: keyof CardEntryDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const draftChange = (field: keyof CardEntryDraft) => (event: { target: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement }) => {
    updateDraft(field, event.target.value);
  };

  const resetDraftForProfile = (profile: CardEntryBatchProfile) => {
    setDraft(createBlankCardDraft(profile));
  };

  const changeProfile = (nextProfileId: string) => {
    setProfileId(nextProfileId);
    resetDraftForProfile(profileFromSelection(nextProfileId, nationId));
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
    setStatus(`Saved ${row.card_id}. Rows: ${nextRows.length}.`);
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
            <h1 id="private-entry-title">Card Transcription</h1>
          </div>
          <div className="private-entry-actions">
            <button type="button" onClick={onBack}>Back</button>
            <button type="button" onClick={openCsv}>Open CSV</button>
            <button className="primary-action" type="button" onClick={saveCsv}>Save CSV</button>
          </div>
        </div>

        <input id="private-card-file" hidden type="file" accept=".csv,text/csv" onChange={(event: { target: HTMLInputElement }) => importCsvFile(event.target.files?.[0])} />

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
              Nation ID
            <input value={nationId} onChange={(event: { target: HTMLInputElement }) => setNationId(event.target.value)} onBlur={() => resetDraftForProfile(profileFromSelection(profileId, nationId))} />
            </label>
          ) : null}
          <label>
            File
            <input value={fileName} onChange={(event: { target: HTMLInputElement }) => setFileName(event.target.value)} />
          </label>
        </div>

        <form className="private-entry-grid" onSubmit={(event: { preventDefault: () => void }) => { event.preventDefault(); saveCurrentCard(); }}>
          <label>Card ID <input value={draft.cardId} onChange={draftChange("cardId")} autoFocus /></label>
          <label>Private Name <input value={draft.privateName} onChange={draftChange("privateName")} /></label>
          <label>Placeholder Name <input value={draft.publicPlaceholderName} onChange={draftChange("publicPlaceholderName")} /></label>
          <label>Suit <select value={draft.suit} onChange={draftChange("suit")}>{suitOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Suit Icons <input value={draft.suitIcons} onChange={draftChange("suitIcons")} /></label>
          <label>Type <select value={draft.cardType} onChange={draftChange("cardType")}>{cardTypeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>State <input value={draft.stateRequirement} onChange={draftChange("stateRequirement")} /></label>
          <label>Start <select value={draft.startingLocation} onChange={draftChange("startingLocation")}>{startOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Players <input value={draft.playerCountRequirement} onChange={draftChange("playerCountRequirement")} /></label>
          <label>Cost M <input value={draft.costMaterials} onChange={draftChange("costMaterials")} /></label>
          <label>Cost P <input value={draft.costPopulation} onChange={draftChange("costPopulation")} /></label>
          <label>Cost Prog <input value={draft.costProgress} onChange={draftChange("costProgress")} /></label>
          <label>Cost Goods <input value={draft.costGoods} onChange={draftChange("costGoods")} /></label>
          <label>VP Mode <select value={draft.vpMode} onChange={draftChange("vpMode")}>{vpModeOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>VP <input value={draft.vpValue} onChange={draftChange("vpValue")} /></label>
          <label>Tags <input value={draft.tags} onChange={draftChange("tags")} /></label>
          <label className="private-entry-wide">Raw Private Text <textarea rows={6} value={draft.rawEffectTextPrivate} onChange={draftChange("rawEffectTextPrivate")} /></label>
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
