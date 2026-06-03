export type Suit = "region"|"uncivilized"|"civilized"|"tributary"|"fame"|"unrest"|"power"|"trade_route"|"none"|"multi";
export type CardType = "action"|"unit"|"technology"|"legacy"|"in_play"|"attack"|"power"|"state"|"development"|"accession"|"nation"|"region"|"unrest"|"fame"|"trade_route"|"bot_state"|"other";
export type StartingLocation = "draw_deck"|"nation_deck"|"accession"|"development_area"|"in_play"|"supply"|"market"|"fame_deck"|"unrest_pile"|"bot_deck"|"box"|"other";
export type VpMode = "none"|"fixed"|"variable"|"negative"|"conditional";
export type VpCondition = { op:"self_in_zone"; zoneId:string };
export type ResourceName = "materials"|"influence"|"knowledge"|"goods"|"unrest";
export type VpFormula =
  | { op:"count_cards"; tag?:string; suit?:Suit; zones?:string[]; amountEach:number; cap?:number }
  | { op:"count_resources"; resource?:ResourceName; resources?:ResourceName[]; amountEach:number; denominator?:number; cap?:number };
export type VpValue = { mode:VpMode; value:number|null; condition?:VpCondition; formula?:VpFormula; trueValue?:number|null; falseValue?:number|null };
export type EffectOp = Record<string, unknown>;
export type ExpansionId = "trade_routes";
export type CommonsSetId = "classics"|"legends"|"horizons"|"custom";
export type CommonsOwnership = "commons"|"nation"|"bot"|"replacement";
export type CommonsGroup = "base"|"trade_friendly"|"trade_routes"|"replacement";
export type CommonsPlayerCountRequirement = "1+"|"2+"|"3+"|"4+";
export type ResourceCost = { materials:number; population:number; progress:number; goods:number };

export interface PrivateCardCsvRow { [k:string]: string; }
export interface NormalizedCardRecord {
  id:string; displayName:string; privateName?:string; sourceBox?:string; setOrNation?:string; suit:Suit; cardType:CardType; stateRequirement?:string;
  suitIcons?: Suit[];
  stateActionTokens?: number; stateExhaustTokens?: number; stateHandSize?: number;
  cost:ResourceCost; developmentCost:ResourceCost; vp:VpValue; startingLocation:StartingLocation; playerCountRequirement?:CommonsPlayerCountRequirement|string;
  ownership:CommonsOwnership; commonsSetId?:CommonsSetId; setupBannerSuit?:Suit; commonsGroup?:CommonsGroup; replacementForCardId?:string; replacementGroupId?:string; conflictsWithNationIds?:string[]; delayableInLoweredAggression?:boolean; marketEligible?:boolean; smallDeckEligible?:boolean; mainDeckEligible?:boolean; unrestPileEligible?:boolean; fameDeckEligible?:boolean;
  isTradeRouteExpansion:boolean; rawEffectTextPrivate?:string; effects:EffectOp[]; tags:string[]; notes?:string; implemented:boolean; tested:boolean; requiredExpansions?: ExpansionId[]; excludedExpansions?: ExpansionId[]; allowedModes?: ("multiplayer"|"solo"|"practice")[]; disallowedModes?: ("multiplayer"|"solo"|"practice")[];
}
export interface CardImportError { level:"fatal"|"warning"; row:number; field:string; message:string; }
export interface CardImportReport { errors:CardImportError[]; counts:{rows:number; validRows:number; fatal:number; warnings:number}; coverage:{implemented:number; tested:number}; }
