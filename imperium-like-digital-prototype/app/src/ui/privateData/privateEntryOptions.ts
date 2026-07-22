import type { NationRuleHook, SetupRule } from "../../../../tools/card-import/nationCsvTypes";
import type { CardEntryDraft } from "../../../../tools/card-entry/cardEntryTypes";
import type { VariableVpFormula } from "../../../../tools/card-entry/cardDraft";
import type { NationCardRole } from "../../../../tools/card-entry/nationDraft";

export const csvColumns = [
  "card_id",
  "source_box",
  "set_or_nation",
  "card_name_private",
  "public_placeholder_name",
  "suit",
  "suit_icons",
  "state_action_tokens",
  "state_exhaust_tokens",
  "state_hand_size",
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

export const suitOptions = ["", "region", "uncivilized", "civilized", "tributary", "fame", "unrest", "power", "trade_route", "none", "multi"];
export const suitIconOptions = ["region", "uncivilized", "civilized", "tributary", "fame", "unrest", "power", "trade_route"];
export const cardTypeOptions = ["", "action", "unit", "technology", "legacy", "in_play", "attack", "power", "state", "development", "accession", "nation", "region", "unrest", "fame", "trade_route", "bot_state", "other"];
export const startOptions = ["draw_deck", "nation_deck", "accession", "development_area", "in_play", "supply", "market", "fame_deck", "unrest_pile", "bot_deck", "box", "other"];
export const playerCountOptions: Array<{ value: CardEntryDraft["playerCountRequirement"]; label: string }> = [
  { value: "", label: "Any" },
  { value: "1+", label: "1+" },
  { value: "2+", label: "2+" },
  { value: "3+", label: "3+" },
  { value: "4+", label: "4+" }
];
export const expansionRequirementOptions = [
  { value: "", label: "None" },
  { value: "trade_routes", label: "Trade Module" }
];
export const vpModeOptions = ["none", "fixed", "variable", "negative", "conditional"];
export const variableVpFormulaOptions: Array<{ value: VariableVpFormula; label: string }> = [
  { value: "per_card", label: "Per card" },
  { value: "per_resource", label: "Per resource" },
  { value: "per_region", label: "Per region" },
  { value: "per_development", label: "Per development" },
  { value: "per_unrest_or_fame", label: "Per unrest/fame" },
  { value: "set_collection", label: "Set collection" },
  { value: "threshold", label: "Threshold" },
  { value: "custom", label: "Custom" }
];
export const nationCardRoleOptions: Array<{ id: NationCardRole; label: string; cardType?: CardEntryDraft["cardType"]; startingLocation?: CardEntryDraft["startingLocation"] }> = [
  { id: "power", label: "Power", cardType: "power" },
  { id: "state", label: "State", cardType: "state" },
  { id: "starting", label: "Starting Deck", startingLocation: "draw_deck" },
  { id: "nation", label: "Nation Deck", cardType: "nation", startingLocation: "nation_deck" },
  { id: "accession", label: "Accession", cardType: "accession", startingLocation: "accession" },
  { id: "development", label: "Development", cardType: "development", startingLocation: "development_area" }
];
export const specialSetupTemplates: Array<{ label: string; value: SetupRule }> = [
  { label: "Gain 2 materials", value: { op: "gain_resource", resource: "materials", count: 2 } },
  { label: "Create side area", value: { op: "create_side_area", areaId: "vault", displayName: "Vault" } },
  { label: "Card to history", value: { op: "place_card_in_area", cardId: "card_id_here", area: "history" } }
];
export const passiveRuleTemplates: Array<{ label: string; value: NationRuleHook }> = [
  { label: "On develop: gain goods", value: { trigger: "on_develop", effects: [{ op: "gain_resource", resource: "goods", amount: 1 }] } },
  { label: "On acquire: gain materials", value: { trigger: "on_acquire", effects: [{ op: "gain_resource", resource: "materials", amount: 1 }] } },
  { label: "On scoring hook", value: { trigger: "on_scoring", effects: [{ op: "gain_resource", resource: "progress", amount: 1 }] } }
];
export const botTriggerKindOptions = ["card_id", "card_name_private", "suit", "card_type", "tag", "unrest", "other"];
export const botTableSideOptions = ["S", "A", "B"];
export const botTradeRowTypeOptions = ["route", "end_of_turn"];
export const botMerchantStateOptions = ["", "merchants", "merchant_empire"];
