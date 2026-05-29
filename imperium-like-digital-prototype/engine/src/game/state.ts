import type { GameOptions } from "../options/gameOptions";
import type { CommonsSetupResult, MarketSlot } from "../setup/commonsTypes";
import type { SoloState } from "../solo/botTypes";
import type { NationRuleset, NationRulesetApplicationReport, SideAreaState, ZoneState } from "../nations/nationRulesetTypes";
import type { NationStrategyProfile } from "../nations/nationStrategyTypes";
import type { CommonsGroup, CommonsOwnership, CommonsSetId, CommonsPlayerCountRequirement } from "../../../tools/card-import/cardCsvTypes";
export type CardType = "action" | "unit" | "technology" | "legacy" | "in_play" | "attack" | "power" | "state" | "development" | "accession" | "nation" | "region" | "unrest" | "fame" | "trade_route" | "bot_state" | "other";
export type Suit = "military" | "civic" | "economic" | "unrest" | "wild" | "region" | "uncivilized" | "civilized" | "tributary" | "fame" | "power" | "trade_route" | "none" | "multi";
export type ZoneName = "deck" | "hand" | "discard" | "playArea" | "history" | "exile";
export type ResourceName = "materials" | "knowledge" | "influence" | "unrest" | "goods";
export type TurnType = "activate" | "innovate" | "revolt";
export type EffectOp = Record<string, unknown>;
export type MarketDeckName = "mainDeck" | "regionDeck" | "uncivilizedDeck" | "civilizedDeck" | "tributaryDeck";
export type EffectTrigger = "on_play" | "on_exhaust" | "on_solstice" | "end_of_solstice";

export type Effect =
  | { trigger: EffectTrigger; op: "draw"; count: number }
  | { trigger: EffectTrigger; op: "draw_if_able"; count: number }
  | { trigger: EffectTrigger; op: "gain_resource"; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "spend_resource"; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "remove_resource"; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "return_resource"; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "steal_resource"; fromPlayerId: string; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "discard_random"; count: number }
  | { trigger: EffectTrigger; op: "move_self_to_history" }
  | { trigger: EffectTrigger; op: "acquire_card"; count: number }
  | { trigger: EffectTrigger; op: "break_through"; suit: Suit; source: "market" | "deck"; count: number; cardId?: string }
  | { trigger: EffectTrigger; op: "find_card"; cardId?: string; suit?: Suit; cardType?: CardType; destination: ZoneName }
  | { trigger: EffectTrigger; op: "conditional_resource_at_least"; resource: ResourceName; atLeast: number; then: Effect[]; else?: Effect[] }
  | { trigger: EffectTrigger; op: "conditional_state_is"; state: string; then: Effect[]; else?: Effect[] }
  | { trigger: EffectTrigger; op: "optional"; effects: Effect[] }
  | { trigger: EffectTrigger; op: "choose_one"; choices: Effect[][] };

export interface Card {
  id: string; displayName: string; type: CardType; cardType?: CardType; suit?: Suit; vp?: number; cost: number; developmentCost?: Partial<Record<ResourceName, number>>; tags: string[]; effects: Effect[];
  stateRequirement?: string; allowedModes?: ("multiplayer"|"solo"|"practice")[]; disallowedModes?: ("multiplayer"|"solo"|"practice")[]; playerCountRequirement?: CommonsPlayerCountRequirement|string; startingLocation?: string;
  ownership?: CommonsOwnership; commonsSetId?: CommonsSetId; setupBannerSuit?: Suit; commonsGroup?: CommonsGroup; replacementForCardId?: string; replacementGroupId?: string; conflictsWithNationIds?: string[];
  delayableInLoweredAggression?: boolean; marketEligible?: boolean; smallDeckEligible?: boolean; mainDeckEligible?: boolean; unrestPileEligible?: boolean; fameDeckEligible?: boolean;
}
export interface GameLogEntry { round: number; playerId: string; message: string; }
export interface CardRuntimeState {
  resources?: Partial<Record<ResourceName, number>>;
  garrisonedCardIds?: string[];
}
export interface FameDeckState {
  available: string[];
  specialBottomCardId?: string;
  resolvedSpecialByPlayer: Record<string, boolean>;
}
export interface PlayerState {
  deck: string[]; hand: string[]; discard: string[]; playArea: string[]; history: string[]; exile: string[];
  powerArea: string[]; stateArea: string[]; developmentArea: string[]; nationDeck: string[]; accessionCardId?: string; sideAreas?: Record<string, string[]>;
  resources: Record<ResourceName, number>; actionsRemaining: number;
  actionTokensBase: number; exhaustTokensBase: number; actionTokensAvailable: number; exhaustTokensAvailable: number;
  progressionTokens?: { nationDeck: number; developmentArea: number };
}
export interface GameState {
  players: Record<string, PlayerState>; cardDb: Record<string, Card>; market: string[]; marketRefillPool: string[]; sharedDiscard: string[]; log: GameLogEntry[]; round: number;
  marketSlots?: MarketSlot[];
  marketResources?: Record<string, Partial<Record<ResourceName, number>>>;
  marketUnrest?: Record<string, string[]>;
  marketDecks?: Record<MarketDeckName, string[]>;
  fameDeck?: FameDeckState;
  unrestPile?: string[];
  currentTurnType?: TurnType;
  cardStates?: Record<string, CardRuntimeState>;
  pendingChoice?: { playerId: string; sourceCardId?: string; choices: Effect[][] };
  pendingFindChoice?: { playerId: string; sourceCardId?: string; cardIds: string[]; destination: ZoneName };
  pendingDevelopmentChoice?: { playerId: string; cardIds: string[]; resumeDrawCount: number };
  pendingCleanupMarketResourceChoice?: { playerId: string; resource: ResourceName; amount: number; cardIds: string[] };
  pendingCleanupDiscardChoice?: { playerId: string; cardIds: string[] };
  cleanupMarketResourcePlaced?: { playerId: string; round: number };
  cleanupDiscardResolved?: { playerId: string; round: number };
  activeNationRulesets?: Record<string, NationRuleset>;
  activeNationStrategyProfiles?: Record<string, NationStrategyProfile>;
  sideAreas?: Record<string, Record<string, SideAreaState>>;
  specialZones?: Record<string, Record<string, ZoneState>>;
  globalSpecialZones?: Record<string, ZoneState>;
  rulesetReports?: NationRulesetApplicationReport[];
  options?: GameOptions;
  practiceClock?: { turnsRemaining: number; progressTokens: number };
  solo?: SoloState;
  setupReport?: { delayedAggressiveCount: number; usedQuickSetup: boolean; shortGameExiled: number; shortGameNationAdvanced: number; commonsSetup?: CommonsSetupResult };
  scoring?: { reason: string; triggeredBy?: string; phase: "finish_current_round" | "final_round"; finalRound?: number };
  gameover?: { winner: string; reason: string; scores?: Record<string, number> };
}
