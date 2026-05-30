import type { NationRuleHook, PrivateNationCsvRow, SetupRule } from "../card-import/nationCsvTypes";

export const nationCsvColumns = [
  "nation_id",
  "source_box",
  "nation_name_private",
  "public_placeholder_name",
  "complexity",
  "power_card_ids",
  "state_card_ids",
  "starting_deck_card_ids",
  "nation_deck_card_ids",
  "accession_card_id",
  "development_card_ids",
  "special_setup_json",
  "passive_rules_json",
  "action_tokens_base",
  "exhaust_tokens_base",
  "required_expansions",
  "notes",
  "implemented",
  "tested"
] as const;

export type NationEntryDraft = {
  nationId: string;
  sourceBox: string;
  privateName: string;
  publicPlaceholderName: string;
  complexity: string;
  powerCardIds: string;
  stateCardIds: string;
  startingDeckCardIds: string;
  nationDeckCardIds: string;
  accessionCardId: string;
  developmentCardIds: string;
  specialSetupJson: string;
  passiveRulesJson: string;
  actionTokensBase: string;
  exhaustTokensBase: string;
  requiredExpansions: string;
  notes: string;
  implemented: "true" | "false";
  tested: "true" | "false";
};

export type NationCardRole = "power" | "state" | "starting" | "nation" | "accession" | "development";
export type NationJsonTemplateField = "specialSetupJson" | "passiveRulesJson";
export type NationDeckProgressSlotId = NationCardRole;

export type NationDeckProgressSlot = {
  id: NationDeckProgressSlotId;
  label: string;
  cardIds: string[];
  count: number;
};

export type NationDeckProgressSummary = {
  nationId: string;
  label: string;
  slots: NationDeckProgressSlot[];
  totalCards: number;
};

export function createBlankNationDraft(nationId = ""): NationEntryDraft {
  return {
    nationId,
    sourceBox: "",
    privateName: "",
    publicPlaceholderName: "",
    complexity: "",
    powerCardIds: "",
    stateCardIds: "",
    startingDeckCardIds: "",
    nationDeckCardIds: "",
    accessionCardId: "",
    developmentCardIds: "",
    specialSetupJson: "[]",
    passiveRulesJson: "[]",
    actionTokensBase: "3",
    exhaustTokensBase: "5",
    requiredExpansions: "",
    notes: "",
    implemented: "false",
    tested: "false"
  };
}

export function nationDraftToCsvRow(draft: NationEntryDraft): PrivateNationCsvRow {
  return {
    nation_id: draft.nationId,
    source_box: draft.sourceBox,
    nation_name_private: draft.privateName,
    public_placeholder_name: draft.publicPlaceholderName,
    complexity: draft.complexity,
    power_card_ids: draft.powerCardIds,
    state_card_ids: draft.stateCardIds,
    starting_deck_card_ids: draft.startingDeckCardIds,
    nation_deck_card_ids: draft.nationDeckCardIds,
    accession_card_id: draft.accessionCardId,
    development_card_ids: draft.developmentCardIds,
    special_setup_json: draft.specialSetupJson,
    passive_rules_json: draft.passiveRulesJson,
    action_tokens_base: draft.actionTokensBase,
    exhaust_tokens_base: draft.exhaustTokensBase,
    required_expansions: draft.requiredExpansions,
    notes: draft.notes,
    implemented: draft.implemented,
    tested: draft.tested
  };
}

export function nationRowToDraft(row: PrivateNationCsvRow): NationEntryDraft {
  return {
    nationId: row.nation_id || "",
    sourceBox: row.source_box || "",
    privateName: row.nation_name_private || "",
    publicPlaceholderName: row.public_placeholder_name || "",
    complexity: row.complexity || "",
    powerCardIds: row.power_card_ids || "",
    stateCardIds: row.state_card_ids || "",
    startingDeckCardIds: row.starting_deck_card_ids || "",
    nationDeckCardIds: row.nation_deck_card_ids || "",
    accessionCardId: row.accession_card_id || "",
    developmentCardIds: row.development_card_ids || "",
    specialSetupJson: row.special_setup_json || "[]",
    passiveRulesJson: row.passive_rules_json || "[]",
    actionTokensBase: row.action_tokens_base || "3",
    exhaustTokensBase: row.exhaust_tokens_base || "5",
    requiredExpansions: row.required_expansions || "",
    notes: row.notes || "",
    implemented: row.implemented === "true" ? "true" : "false",
    tested: row.tested === "true" ? "true" : "false"
  };
}

export function appendOrReplaceNationRow(rows: PrivateNationCsvRow[], row: PrivateNationCsvRow): PrivateNationCsvRow[] {
  const nationId = row.nation_id?.trim();
  const index = rows.findIndex((existing) => existing.nation_id?.trim() === nationId);
  if (index === -1) return [...rows, row];
  return rows.map((existing, existingIndex) => (existingIndex === index ? row : existing));
}

export function sortNationRowsByName(rows: PrivateNationCsvRow[]): PrivateNationCsvRow[] {
  return [...rows].sort((left, right) => {
    const leftLabel = left.public_placeholder_name || left.nation_name_private || left.nation_id || "";
    const rightLabel = right.public_placeholder_name || right.nation_name_private || right.nation_id || "";
    return leftLabel.localeCompare(rightLabel);
  });
}

function appendPipeValue(current: string, nextValue: string): string {
  const values = current.split("|").map((value) => value.trim()).filter(Boolean);
  if (!nextValue.trim() || values.includes(nextValue.trim())) return values.join("|");
  return [...values, nextValue.trim()].join("|");
}

function splitPipeValues(value: string): string[] {
  return value.split("|").map((item) => item.trim()).filter(Boolean);
}

export function summarizeNationDeckProgress(draft: NationEntryDraft): NationDeckProgressSummary {
  const slotInputs: Array<Omit<NationDeckProgressSlot, "count">> = [
    { id: "power", label: "Power", cardIds: splitPipeValues(draft.powerCardIds) },
    { id: "state", label: "State", cardIds: splitPipeValues(draft.stateCardIds) },
    { id: "starting", label: "Starting Deck", cardIds: splitPipeValues(draft.startingDeckCardIds) },
    { id: "nation", label: "Nation Deck", cardIds: splitPipeValues(draft.nationDeckCardIds) },
    { id: "accession", label: "Accession", cardIds: splitPipeValues(draft.accessionCardId) },
    { id: "development", label: "Development", cardIds: splitPipeValues(draft.developmentCardIds) }
  ];
  const slots = slotInputs.map((slot) => ({ ...slot, count: slot.cardIds.length }));

  return {
    nationId: draft.nationId,
    label: draft.publicPlaceholderName || draft.privateName || draft.nationId || "New nation",
    slots,
    totalCards: slots.reduce((total, slot) => total + slot.count, 0)
  };
}

export function summarizeNationRowsDeckProgress(rows: PrivateNationCsvRow[]): NationDeckProgressSummary[] {
  return sortNationRowsByName(rows).map((row) => summarizeNationDeckProgress(nationRowToDraft(row)));
}

export function appendCardIdToNationDraftRoles(draft: NationEntryDraft, cardId: string, roles: NationCardRole[]): NationEntryDraft {
  return roles.reduce((current, role) => {
    if (role === "power") return { ...current, powerCardIds: appendPipeValue(current.powerCardIds, cardId) };
    if (role === "state") return { ...current, stateCardIds: appendPipeValue(current.stateCardIds, cardId) };
    if (role === "starting") return { ...current, startingDeckCardIds: appendPipeValue(current.startingDeckCardIds, cardId) };
    if (role === "nation") return { ...current, nationDeckCardIds: appendPipeValue(current.nationDeckCardIds, cardId) };
    if (role === "development") return { ...current, developmentCardIds: appendPipeValue(current.developmentCardIds, cardId) };
    return { ...current, accessionCardId: cardId.trim() || current.accessionCardId };
  }, draft);
}

function parseJsonArray(value: string): unknown[] {
  if (!value.trim()) return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [];
}

export function insertNationJsonTemplate(
  draft: NationEntryDraft,
  field: "specialSetupJson",
  template: SetupRule
): NationEntryDraft;
export function insertNationJsonTemplate(
  draft: NationEntryDraft,
  field: "passiveRulesJson",
  template: NationRuleHook
): NationEntryDraft;
export function insertNationJsonTemplate(
  draft: NationEntryDraft,
  field: NationJsonTemplateField,
  template: SetupRule | NationRuleHook
): NationEntryDraft {
  const current = parseJsonArray(draft[field]);
  return {
    ...draft,
    [field]: JSON.stringify([...current, template])
  };
}
