import type { NationDefinition, PrivateNationCsvRow } from "./nationCsvTypes";
const arr=(v:string)=>v.split("|").map(x=>x.trim()).filter(Boolean);
const bool=(v:string)=>v.trim().toLowerCase()==="true";
export function normalizeNation(r:PrivateNationCsvRow): NationDefinition { return {
  id:r.nation_id.trim(), displayName:r.public_placeholder_name.trim(), privateName:r.nation_name_private.trim()||undefined, sourceBox:r.source_box.trim()||undefined,
  complexity:r.complexity.trim()===""?undefined:Number(r.complexity), powerCardIds:arr(r.power_card_ids||""), stateCardIds:arr(r.state_card_ids||""),
  startingDeckCardIds:arr(r.starting_deck_card_ids||""), nationDeckCardIds:arr(r.nation_deck_card_ids||""), accessionCardId:r.accession_card_id.trim()||undefined,
  developmentCardIds:arr(r.development_card_ids||""), setupRules:r.special_setup_json.trim()?JSON.parse(r.special_setup_json):[], passiveRules:r.passive_rules_json.trim()?JSON.parse(r.passive_rules_json):[],
  actionTokensBase:Number(r.action_tokens_base), exhaustTokensBase:Number(r.exhaust_tokens_base), requiredExpansions:arr(r.required_expansions||""),
  excludedExpansions:arr(r.excluded_expansions||"").length?arr(r.excluded_expansions||""):undefined, notes:r.notes?.trim()||undefined,
  implemented:bool(r.implemented), tested:bool(r.tested)
}; }
