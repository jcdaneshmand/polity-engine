import type { NormalizedCardRecord, PrivateCardCsvRow, ResourceCost, VpMode } from "./cardCsvTypes";

const intOr0=(v:string)=> v.trim()===""?0:Number(v);
const bool=(v:string)=>v.trim().toLowerCase()==="true";
const tags=(v:string)=>v.split("|").map((x)=>x.trim()).filter(Boolean);

export function normalizeCard(row: PrivateCardCsvRow): NormalizedCardRecord {
  const cost: ResourceCost = { materials:intOr0(row.cost_materials), population:intOr0(row.cost_population), progress:intOr0(row.cost_progress), goods:intOr0(row.cost_goods) };
  const developmentCost: ResourceCost = { materials:intOr0(row.development_cost_materials), population:intOr0(row.development_cost_population), progress:intOr0(row.development_cost_progress), goods:intOr0(row.development_cost_goods) };
  const isTradeRouteExpansion = bool(row.is_trade_route_expansion);
  const requiredExpansionsFromCsv = tags(row.required_expansions || "") as any[];
  const requiredExpansions = Array.from(new Set([...(requiredExpansionsFromCsv || []), ...(isTradeRouteExpansion ? ["trade_routes"] : [])]));
  const excludedExpansions = tags(row.excluded_expansions || "") as any[];
  const allowedModes = tags(row.allowed_modes || "") as any[];
  const disallowedModes = tags(row.disallowed_modes || "") as any[];

  return {
    id: row.card_id.trim(), displayName: row.public_placeholder_name.trim(), privateName: row.card_name_private.trim() || undefined,
    sourceBox: row.source_box.trim() || undefined, setOrNation: row.set_or_nation.trim() || undefined, suit: row.suit as any, cardType: row.card_type as any,
    stateRequirement: row.state_requirement.trim() || undefined, cost, developmentCost, vp: { mode: row.vp_mode as VpMode, value: row.vp_value.trim()===""?null:Number(row.vp_value) },
    startingLocation: row.starting_location as any, playerCountRequirement: row.player_count_requirement.trim()||undefined,
    isTradeRouteExpansion, rawEffectTextPrivate: row.raw_effect_text_private.trim()||undefined,
    effects: row.effect_ops_json.trim()?JSON.parse(row.effect_ops_json):[], tags: tags(row.tags||""), notes: row.notes?.trim()||undefined,
    implemented: bool(row.implemented), tested: bool(row.tested), requiredExpansions, excludedExpansions, allowedModes, disallowedModes
  };
}
