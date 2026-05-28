export type Suit = "region"|"uncivilized"|"civilized"|"tributary"|"fame"|"unrest"|"power"|"trade_route"|"none"|"multi";
export type CardType = "action"|"in_play"|"attack"|"power"|"state"|"development"|"accession"|"nation"|"region"|"unrest"|"fame"|"trade_route"|"bot_state"|"other";
export type StartingLocation = "draw_deck"|"nation_deck"|"accession"|"development_area"|"in_play"|"supply"|"market"|"fame_deck"|"unrest_pile"|"bot_deck"|"box"|"other";
export type VpMode = "none"|"fixed"|"variable"|"negative"|"conditional";
export type EffectOp = Record<string, unknown>;
export type ExpansionId = "trade_routes";
export type ResourceCost = { materials:number; population:number; progress:number; goods:number };

export interface PrivateCardCsvRow { [k:string]: string; }
export interface NormalizedCardRecord {
  id:string; displayName:string; privateName?:string; sourceBox?:string; setOrNation?:string; suit:Suit; cardType:CardType; stateRequirement?:string;
  cost:ResourceCost; developmentCost:ResourceCost; vp:{mode:VpMode; value:number|null}; startingLocation:StartingLocation; playerCountRequirement?:string;
  isTradeRouteExpansion:boolean; rawEffectTextPrivate?:string; effects:EffectOp[]; tags:string[]; notes?:string; implemented:boolean; tested:boolean; requiredExpansions?: ExpansionId[]; excludedExpansions?: ExpansionId[];
}
export interface CardImportError { level:"fatal"|"warning"; row:number; field:string; message:string; }
export interface CardImportReport { errors:CardImportError[]; counts:{rows:number; validRows:number; fatal:number; warnings:number}; coverage:{implemented:number; tested:number}; }
