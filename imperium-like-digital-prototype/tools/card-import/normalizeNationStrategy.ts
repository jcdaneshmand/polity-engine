import type { PrivateNationStrategyCsvRow, NationStrategyProfile } from "./nationStrategyCsvTypes";
const arr=(v:string)=>v.split("|").map(x=>x.trim()).filter(Boolean);
const bool=(v:string)=>v.trim().toLowerCase()==="true";
export function normalizeNationStrategy(r: PrivateNationStrategyCsvRow): NationStrategyProfile { return {
  nationId:r.nation_id.trim(), displayName:r.public_placeholder_name.trim(), privateName:r.nation_name_private.trim()||undefined,
  complexity:r.complexity.trim()?Number(r.complexity):undefined, aggression:(r.aggression.trim()||"unknown") as any,
  publicPlaceholderSummary:r.public_placeholder_summary?.trim()||"", privateCoreGameplan:r.private_core_gameplan?.trim()||undefined,
  privateEarlyGame:r.private_early_game?.trim()||undefined, privateMidGame:r.private_mid_game?.trim()||undefined, privateLateGame:r.private_late_game?.trim()||undefined,
  privateKeyMechanics:arr(r.private_key_mechanics||""), privateMarketPriorities:arr(r.private_market_priorities||""), privateRiskNotes:arr(r.private_risk_notes||""), privateRulesEngineNotes:arr(r.private_rules_engine_notes||""),
  implemented:bool(r.implemented), tested:bool(r.tested)
}; }
