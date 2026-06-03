import type { EffectOp, NormalizedCardRecord, PrivateCardCsvRow, ResourceCost, VpMode, VpValue } from "./cardCsvTypes";
import { normalizeResourceNames } from "./normalizeResources";

const intOr0=(v:string)=> v.trim()===""?0:Number(v);
const bool=(v:string)=>v.trim().toLowerCase()==="true";
const tags=(v:string)=>v.split("|").map((x)=>x.trim()).filter(Boolean);
const optBool=(v:string|undefined)=> v === undefined || v.trim() === "" ? undefined : bool(v);
const optInt=(v:string|undefined)=> v === undefined || v.trim() === "" ? undefined : Number(v);

function normalizeVp(row: PrivateCardCsvRow): VpValue {
  const vp: VpValue = { mode: row.vp_mode as VpMode, value: row.vp_value.trim()===""?null:Number(row.vp_value) };
  const details = row.vp_details_json?.trim();
  if (!details) return vp;
  const parsed = normalizeResourceNames(JSON.parse(details)) as Partial<VpValue>;
  return {
    ...vp,
    ...(parsed.condition ? { condition: parsed.condition } : {}),
    ...(parsed.formula ? { formula: parsed.formula } : {}),
    ...(parsed.trueValue !== undefined ? { trueValue: parsed.trueValue } : {}),
    ...(parsed.falseValue !== undefined ? { falseValue: parsed.falseValue } : {})
  };
}

export function normalizeCard(row: PrivateCardCsvRow): NormalizedCardRecord {
  const cost: ResourceCost = { materials:intOr0(row.cost_materials), population:intOr0(row.cost_population), progress:intOr0(row.cost_progress), goods:intOr0(row.cost_goods) };
  const developmentCost: ResourceCost = { materials:intOr0(row.development_cost_materials), population:intOr0(row.development_cost_population), progress:intOr0(row.development_cost_progress), goods:intOr0(row.development_cost_goods) };
  const isTradeRouteExpansion = bool(row.is_trade_route_expansion);
  const requiredExpansionsFromCsv = tags(row.required_expansions || "") as any[];
  const requiredExpansions = Array.from(new Set([...(requiredExpansionsFromCsv || []), ...(isTradeRouteExpansion ? ["trade_routes"] : [])]));
  const excludedExpansions = tags(row.excluded_expansions || "") as any[];
  const allowedModesFromCsv = tags(row.allowed_modes || "") as any[];
  const allowedModes = allowedModesFromCsv.length>0 ? allowedModesFromCsv : undefined;
  const disallowedModes = tags(row.disallowed_modes || "") as any[];
  const ownership = (row.ownership?.trim() || "commons") as any;
  const commonsSetId = row.commons_set_id?.trim() || (ownership === "commons" ? "classics" : undefined);
  const suitIcons = tags(row.suit_icons || "") as any[];

  return {
    id: row.card_id.trim(), displayName: row.public_placeholder_name.trim(), privateName: row.card_name_private.trim() || undefined,
    sourceBox: row.source_box.trim() || undefined, setOrNation: row.set_or_nation.trim() || undefined, suit: row.suit as any, cardType: row.card_type as any,
    ...(suitIcons.length ? { suitIcons } : {}),
    stateActionTokens: optInt(row.state_action_tokens),
    stateExhaustTokens: optInt(row.state_exhaust_tokens),
    stateHandSize: optInt(row.state_hand_size),
    stateRequirement: row.state_requirement.trim() || undefined, cost, developmentCost, vp: normalizeVp(row),
    startingLocation: row.starting_location as any, playerCountRequirement: row.player_count_requirement.trim()||undefined,
    isTradeRouteExpansion, rawEffectTextPrivate: row.raw_effect_text_private.trim()||undefined,
    effects: row.effect_ops_json.trim()?normalizeResourceNames(JSON.parse(row.effect_ops_json) as EffectOp[]):[], tags: tags(row.tags||""), notes: row.notes?.trim()||undefined,
    implemented: bool(row.implemented), tested: bool(row.tested), requiredExpansions, excludedExpansions, allowedModes, disallowedModes,
    ownership, commonsSetId: commonsSetId as any, setupBannerSuit: (row.setup_banner_suit?.trim() || undefined) as any, commonsGroup: (row.commons_group?.trim() || undefined) as any,
    replacementForCardId: row.replacement_for_card_id?.trim() || undefined, replacementGroupId: row.replacement_group_id?.trim() || undefined, conflictsWithNationIds: tags(row.conflicts_with_nation_ids || ""),
    delayableInLoweredAggression: optBool(row.delayable_in_lowered_aggression), marketEligible: optBool(row.market_eligible), smallDeckEligible: optBool(row.small_deck_eligible), mainDeckEligible: optBool(row.main_deck_eligible), unrestPileEligible: optBool(row.unrest_pile_eligible), fameDeckEligible: optBool(row.fame_deck_eligible)
  };
}
