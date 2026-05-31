import type { PrivateCardCsvRow } from "../card-import/cardCsvTypes";
import type { CardEntryBatchProfile, CardEntryDraft, DuplicateCardDraftOptions } from "./cardEntryTypes";

export type VariableVpFormula =
  | "per_card"
  | "per_resource"
  | "per_region"
  | "per_development"
  | "per_unrest_or_fame"
  | "set_collection"
  | "threshold"
  | "custom";

export type VariableVpDraftDetails = {
  formula: VariableVpFormula;
  amountEach: string;
  target: string;
  cap: string;
  note: string;
};

export type CardEntryShortcutAction =
  | "save_card"
  | "focus_suit"
  | "apply_variable_vp"
  | { type: "toggle_nation_role"; index: number };

export type CardEntryShortcutEvent = {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

function pipeValues(value: string): string[] {
  return value.split("|").map((part) => part.trim()).filter(Boolean);
}

function appendUniquePipeValues(current: string, nextValues: string[]): string {
  const values = pipeValues(current);
  for (const nextValue of nextValues.map((value) => value.trim()).filter(Boolean)) {
    if (!values.includes(nextValue)) values.push(nextValue);
  }
  return values.join("|");
}

function replaceVariableVpNote(current: string, nextLine: string): string {
  const lines = current.split(/\r?\n/).filter((line) => !line.trim().startsWith("[Variable VP]"));
  return [...lines, nextLine].map((line) => line.trim()).filter(Boolean).join("\n");
}

export function createBlankCardDraft(profile: CardEntryBatchProfile): CardEntryDraft {
  return {
    cardId: "",
    sourceBox: "",
    setOrNation: profile.setOrNation,
    privateName: "",
    publicPlaceholderName: "",
    suit: "",
    suitIcons: "",
    stateActionTokens: "",
    stateExhaustTokens: "",
    stateHandSize: "",
    cardType: "",
    stateRequirement: "",
    costMaterials: "",
    costPopulation: "",
    costProgress: "",
    costGoods: "",
    developmentCostMaterials: "",
    developmentCostPopulation: "",
    developmentCostProgress: "",
    developmentCostGoods: "",
    vpMode: "none",
    vpValue: "",
    vpDetailsJson: "",
    startingLocation: "draw_deck",
    playerCountRequirement: "",
    ownership: profile.ownership,
    commonsSetId: profile.commonsSetId,
    setupBannerSuit: "",
    commonsGroup: profile.commonsGroup,
    replacementForCardId: "",
    replacementGroupId: "",
    conflictsWithNationIds: "",
    delayableInLoweredAggression: "",
    marketEligible: "",
    smallDeckEligible: "",
    mainDeckEligible: "",
    unrestPileEligible: "",
    fameDeckEligible: "",
    isTradeRouteExpansion: "false",
    rawEffectTextPrivate: "",
    effectOpsJson: "",
    tags: "",
    notes: "",
    implemented: "false",
    tested: "false",
    requiredExpansions: profile.requiredExpansions.join("|"),
    excludedExpansions: "",
    allowedModes: "",
    disallowedModes: "",
    ...profile.defaults
  };
}

export function duplicateCardDraft(draft: CardEntryDraft, options: DuplicateCardDraftOptions = {}): CardEntryDraft {
  const duplicate = {
    ...draft,
    cardId: "",
    implemented: "false" as const,
    tested: "false" as const
  };

  if (!options.includePrivateText) {
    return {
      ...duplicate,
      privateName: "",
      publicPlaceholderName: "",
      rawEffectTextPrivate: "",
      effectOpsJson: ""
    };
  }

  return duplicate;
}

export function getNextNumericCardId(rows: Array<Record<string, string>>): string {
  const highest = rows.reduce((max, row) => {
    const value = row.card_id?.trim() ?? "";
    if (!/^\d+$/.test(value)) return max;
    return Math.max(max, Number(value));
  }, 0);
  return String(highest + 1);
}

export function toggleDraftSuitIcon(draft: CardEntryDraft, suitIcon: string): CardEntryDraft {
  const trimmed = suitIcon.trim();
  if (!trimmed) return draft;
  const values = pipeValues(draft.suitIcons);
  const nextValues = values.includes(trimmed)
    ? values.filter((value) => value !== trimmed)
    : [...values, trimmed];
  return { ...draft, suitIcons: nextValues.join("|") };
}

export function applyVariableVpDraftDetails(draft: CardEntryDraft, details: VariableVpDraftDetails): CardEntryDraft {
  const amountEach = details.amountEach.trim();
  const target = details.target.trim();
  const cap = details.cap.trim();
  const note = details.note.trim();
  const basis = [`${amountEach || "?"} VP`, details.formula, target].filter(Boolean).join(" ");
  const summary = cap ? `${basis}; cap ${cap}` : basis;
  const variableVpLine = `[Variable VP] ${summary}.${note ? ` ${note}` : ""}`;

  return {
    ...draft,
    vpMode: "variable",
    vpValue: amountEach,
    tags: appendUniquePipeValues(draft.tags, ["vp_variable", `vp_${details.formula}`]),
    notes: replaceVariableVpNote(draft.notes, variableVpLine)
  };
}

export function getCardEntryShortcutAction(event: CardEntryShortcutEvent): CardEntryShortcutAction | null {
  const key = event.key.toLowerCase();
  if ((event.ctrlKey || event.metaKey) && key === "enter") return "save_card";
  if (!event.altKey) return null;
  if (key === "s") return "focus_suit";
  if (key === "v") return "apply_variable_vp";
  if (/^[1-6]$/.test(key)) return { type: "toggle_nation_role", index: Number(key) - 1 };
  return null;
}

export function draftToCsvRow(draft: CardEntryDraft): PrivateCardCsvRow {
  return {
    card_id: draft.cardId,
    source_box: draft.sourceBox,
    set_or_nation: draft.setOrNation,
    card_name_private: draft.privateName,
    public_placeholder_name: draft.publicPlaceholderName,
    suit: draft.suit,
    suit_icons: draft.suitIcons,
    state_action_tokens: draft.stateActionTokens,
    state_exhaust_tokens: draft.stateExhaustTokens,
    state_hand_size: draft.stateHandSize,
    card_type: draft.cardType,
    state_requirement: draft.stateRequirement,
    cost_materials: draft.costMaterials,
    cost_population: draft.costPopulation,
    cost_progress: draft.costProgress,
    cost_goods: draft.costGoods,
    development_cost_materials: draft.developmentCostMaterials,
    development_cost_population: draft.developmentCostPopulation,
    development_cost_progress: draft.developmentCostProgress,
    development_cost_goods: draft.developmentCostGoods,
    vp_mode: draft.vpMode,
    vp_value: draft.vpValue,
    vp_details_json: draft.vpDetailsJson,
    starting_location: draft.startingLocation,
    player_count_requirement: draft.playerCountRequirement,
    ownership: draft.ownership,
    commons_set_id: draft.commonsSetId,
    setup_banner_suit: draft.setupBannerSuit,
    commons_group: draft.commonsGroup,
    replacement_for_card_id: draft.replacementForCardId,
    replacement_group_id: draft.replacementGroupId,
    conflicts_with_nation_ids: draft.conflictsWithNationIds,
    delayable_in_lowered_aggression: draft.delayableInLoweredAggression,
    market_eligible: draft.marketEligible,
    small_deck_eligible: draft.smallDeckEligible,
    main_deck_eligible: draft.mainDeckEligible,
    unrest_pile_eligible: draft.unrestPileEligible,
    fame_deck_eligible: draft.fameDeckEligible,
    is_trade_route_expansion: draft.isTradeRouteExpansion,
    raw_effect_text_private: draft.rawEffectTextPrivate,
    effect_ops_json: draft.effectOpsJson,
    tags: draft.tags,
    notes: draft.notes,
    implemented: draft.implemented,
    tested: draft.tested,
    required_expansions: draft.requiredExpansions,
    excluded_expansions: draft.excludedExpansions,
    allowed_modes: draft.allowedModes,
    disallowed_modes: draft.disallowedModes
  };
}

export function csvRowToDraft(row: PrivateCardCsvRow): CardEntryDraft {
  return {
    cardId: row.card_id || "",
    sourceBox: row.source_box || "",
    setOrNation: row.set_or_nation || "",
    privateName: row.card_name_private || "",
    publicPlaceholderName: row.public_placeholder_name || "",
    suit: (row.suit || "") as CardEntryDraft["suit"],
    suitIcons: row.suit_icons || "",
    stateActionTokens: row.state_action_tokens || "",
    stateExhaustTokens: row.state_exhaust_tokens || "",
    stateHandSize: row.state_hand_size || "",
    cardType: (row.card_type || "") as CardEntryDraft["cardType"],
    stateRequirement: row.state_requirement || "",
    costMaterials: row.cost_materials || "",
    costPopulation: row.cost_population || "",
    costProgress: row.cost_progress || "",
    costGoods: row.cost_goods || "",
    developmentCostMaterials: row.development_cost_materials || "",
    developmentCostPopulation: row.development_cost_population || "",
    developmentCostProgress: row.development_cost_progress || "",
    developmentCostGoods: row.development_cost_goods || "",
    vpMode: (row.vp_mode || "none") as CardEntryDraft["vpMode"],
    vpValue: row.vp_value || "",
    vpDetailsJson: row.vp_details_json || "",
    startingLocation: (row.starting_location || "draw_deck") as CardEntryDraft["startingLocation"],
    playerCountRequirement: (row.player_count_requirement || "") as CardEntryDraft["playerCountRequirement"],
    ownership: (row.ownership || "commons") as CardEntryDraft["ownership"],
    commonsSetId: (row.commons_set_id || "") as CardEntryDraft["commonsSetId"],
    setupBannerSuit: (row.setup_banner_suit || "") as CardEntryDraft["setupBannerSuit"],
    commonsGroup: (row.commons_group || "") as CardEntryDraft["commonsGroup"],
    replacementForCardId: row.replacement_for_card_id || "",
    replacementGroupId: row.replacement_group_id || "",
    conflictsWithNationIds: row.conflicts_with_nation_ids || "",
    delayableInLoweredAggression: (row.delayable_in_lowered_aggression || "") as CardEntryDraft["delayableInLoweredAggression"],
    marketEligible: (row.market_eligible || "") as CardEntryDraft["marketEligible"],
    smallDeckEligible: (row.small_deck_eligible || "") as CardEntryDraft["smallDeckEligible"],
    mainDeckEligible: (row.main_deck_eligible || "") as CardEntryDraft["mainDeckEligible"],
    unrestPileEligible: (row.unrest_pile_eligible || "") as CardEntryDraft["unrestPileEligible"],
    fameDeckEligible: (row.fame_deck_eligible || "") as CardEntryDraft["fameDeckEligible"],
    isTradeRouteExpansion: (row.is_trade_route_expansion || "false") as CardEntryDraft["isTradeRouteExpansion"],
    rawEffectTextPrivate: row.raw_effect_text_private || "",
    effectOpsJson: row.effect_ops_json || "",
    tags: row.tags || "",
    notes: row.notes || "",
    implemented: (row.implemented || "false") as CardEntryDraft["implemented"],
    tested: (row.tested || "false") as CardEntryDraft["tested"],
    requiredExpansions: row.required_expansions || "",
    excludedExpansions: row.excluded_expansions || "",
    allowedModes: row.allowed_modes || "",
    disallowedModes: row.disallowed_modes || ""
  };
}
