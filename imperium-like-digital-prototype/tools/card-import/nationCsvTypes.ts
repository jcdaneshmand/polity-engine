import type { EffectOp } from "./cardCsvTypes";
export type PlayerAreaName = "power_area"|"state_area"|"draw_deck"|"discard"|"hand"|"play_area"|"history"|"development_area"|"nation_deck"|"accession"|"side_area";
export type SetupRule =
  | { op: "gain_resource"; resource: "materials"|"population"|"progress"|"goods"; count: number }
  | { op: "place_card_in_area"; cardId: string; area: PlayerAreaName }
  | { op: "use_custom_state"; stateCardId: string }
  | { op: "set_token_count"; actionTokens?: number; exhaustTokens?: number }
  | { op: "require_expansion"; expansionId: string }
  | { op: "create_side_area"; areaId: string; displayName: string };
export type NationRuleHook = { trigger: "before_reshuffle"|"after_reshuffle"|"on_develop"|"on_acquire"|"on_gain_unrest"|"on_solstice"|"on_scoring"|"passive_always"; effects: EffectOp[] };
export type NationDefinition = { id:string; displayName:string; privateName?:string; sourceBox?:string; complexity?:number; powerCardIds:string[]; stateCardIds:string[]; startingDeckCardIds:string[]; nationDeckCardIds:string[]; accessionCardId?:string; developmentCardIds:string[]; setupRules:SetupRule[]; passiveRules:NationRuleHook[]; actionTokensBase:number; exhaustTokensBase:number; requiredExpansions:string[]; notes?:string; implemented:boolean; tested:boolean; };
export type PrivateNationCsvRow = Record<string,string>;
