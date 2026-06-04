import type { CampaignGameOutcome, GameOptions } from "../options/gameOptions";
import type { CommonsSetupResult, MarketSlot } from "../setup/commonsTypes";
import type { SoloState } from "../solo/botTypes";
import type { NationHookTrigger, NationRuleset, NationRulesetApplicationReport, SideAreaState, ZoneState } from "../nations/nationRulesetTypes";
import type { NationStrategyProfile } from "../nations/nationStrategyTypes";
import type { CommonsGroup, CommonsOwnership, CommonsSetId, CommonsPlayerCountRequirement } from "../../../tools/card-import/cardCsvTypes";
export type CardType = "action" | "unit" | "technology" | "legacy" | "in_play" | "attack" | "power" | "state" | "development" | "accession" | "nation" | "region" | "unrest" | "fame" | "trade_route" | "bot_state" | "other";
export type Suit = "military" | "civic" | "economic" | "unrest" | "wild" | "region" | "uncivilized" | "civilized" | "tributary" | "fame" | "power" | "trade_route" | "none" | "multi";
export type ZoneName = "deck" | "hand" | "discard" | "playArea" | "history" | "exile";
export type DrawSourceZone = "deck" | "discard" | "exile" | "fameDeck";
export type PlayerExileSource = "hand" | "discard" | "deck" | "playArea" | "history" | "garrison";
export type FindSourceZone = "hand" | "discard" | "deck" | "nationDeck" | "playArea" | "history" | "garrison";
export type LookSourceZone = "deck" | "nationDeck" | "fameDeck";
export type ReturnUnrestSourceZone = "hand" | "playArea" | "discard" | "deck" | "history" | "exile";
export type ReturnFameSourceZone = "hand" | "playArea" | "discard" | "deck" | "history" | "exile";
export type PlaceOnDeckSourceZone = "hand" | "discard";
export type SwapSourceZone = "hand" | "discard" | "deck";
export type ResourceName = "materials" | "knowledge" | "influence" | "unrest" | "goods";
export interface ResourceGainSource {
  sourceCardId?: string;
  sourceWasInPlay?: boolean;
  gains: Partial<Record<ResourceName, number>>;
}
export type TurnType = "activate" | "innovate" | "revolt" | "solstice";
export type EffectOp = Record<string, unknown>;
export type MarketDeckName = "mainDeck" | "regionDeck" | "uncivilizedDeck" | "civilizedDeck" | "tributaryDeck";
export type EffectTrigger = "on_play" | "on_exhaust" | "on_acquire" | "on_solstice" | "end_of_solstice";
export type VpCondition = { op: "self_in_zone"; zoneId: string };
export type VpFormula =
  | { op: "count_cards"; tag?: string; suit?: Suit; zones?: string[]; amountEach: number; cap?: number }
  | { op: "count_resources"; resource?: ResourceName; resources?: ResourceName[]; amountEach: number; denominator?: number; cap?: number };
export type VpValue = number | {
  mode?: "none" | "fixed" | "variable" | "negative" | "conditional";
  value?: number | null;
  condition?: VpCondition;
  formula?: VpFormula;
  trueValue?: number | null;
  falseValue?: number | null;
};
export type ReactiveExhaustCondition =
  | { trigger: "after_gain_resource"; resource?: ResourceName; sourceSuit?: Suit }
  | { trigger: "after_take_unrest"; target?: "self" | "opponent" | "any" }
  | { trigger: "after_acquire_card"; target?: "self" | "opponent" | "any" }
  | { trigger: "after_play_card"; target?: "self" | "opponent" | "any" }
  | { trigger: "after_break_through_card"; target?: "self" | "opponent" | "any" };

export type Effect =
  | { trigger: EffectTrigger; op: "draw"; count: number; source?: DrawSourceZone }
  | { trigger: EffectTrigger; op: "draw_if_able"; count: number }
  | { trigger: EffectTrigger; op: "gain_resource"; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "spend_resource"; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "remove_resource"; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "return_resource"; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "steal_resource"; fromPlayerId: string; resource: ResourceName; amount: number }
  | { trigger: EffectTrigger; op: "discard_random"; count: number }
  | { trigger: EffectTrigger; op: "discard_cards"; count: number }
  | { trigger: EffectTrigger; op: "return_unrest"; cardId?: string; sourceZones?: ReturnUnrestSourceZone[] }
  | { trigger: EffectTrigger; op: "return_fame"; cardId?: string; sourceZones?: ReturnFameSourceZone[] }
  | { trigger: EffectTrigger; op: "place_card_on_deck"; cardId?: string; sourceZone?: PlaceOnDeckSourceZone }
  | { trigger: EffectTrigger; op: "give_card"; cardId?: string; targetPlayerId?: string; targetPlayerIds?: string[] }
  | { trigger: EffectTrigger; op: "swap_card"; cardId?: string; marketCardId?: string; sourceZone?: SwapSourceZone }
  | { trigger: EffectTrigger; op: "take_unrest"; count: number; targetPlayerIds?: string[] }
  | { trigger: EffectTrigger; op: "gain_fame"; count: number }
  | { trigger: EffectTrigger; op: "gain_action"; amount: number }
  | { trigger: EffectTrigger; op: "spend_action"; amount: number }
  | { trigger: EffectTrigger; op: "return_exhaust_token"; cardId?: string }
  | { trigger: EffectTrigger; op: "trigger_scoring"; reason: string }
  | { trigger: EffectTrigger; op: "trade" }
  | { trigger: EffectTrigger; op: "treat_suit_as"; from: Suit; to: Suit[] }
  | { trigger: EffectTrigger; op: "commerce"; effects: Effect[] }
  | { trigger: EffectTrigger; op: "profit"; destination?: "discard" | "history"; effects: Effect[] }
  | { trigger: EffectTrigger; op: "garrison_card"; hostCardId?: string; cardId?: string }
  | { trigger: EffectTrigger; op: "recall_region"; cardId?: string; count?: number }
  | { trigger: EffectTrigger; op: "abandon_region"; cardId?: string; count?: number }
  | { trigger: EffectTrigger; op: "develop"; free?: boolean; sourceCardId?: string }
  | { trigger: EffectTrigger; op: "move_self_to_history" }
  | { trigger: EffectTrigger; op: "exile_card"; source: "market" | PlayerExileSource; cardId?: string; suit?: Suit; cardType?: CardType; count?: number }
  | { trigger: EffectTrigger; op: "acquire_card"; count: number; source?: "market" | "exile"; cardId?: string; suit?: Suit; cardType?: CardType; destination?: "hand" | "discard" }
  | { trigger: EffectTrigger; op: "gain_card"; count: number; source: "market"; cardId?: string; suit?: Suit; cardType?: CardType; destination?: "hand" | "discard" }
  | { trigger: EffectTrigger; op: "take_card"; count: number; source: "market"; cardId?: string; suit?: Suit; cardType?: CardType; destination?: "hand" | "discard" }
  | { trigger: EffectTrigger; op: "break_through"; suit: Suit; source: "market" | "deck" | "exile"; count: number; cardId?: string }
  | { trigger: EffectTrigger; op: "find_card"; cardId?: string; suit?: Suit; cardType?: CardType; destination: ZoneName; sourceZones?: FindSourceZone[] }
  | { trigger: EffectTrigger; op: "look_cards"; source: LookSourceZone; count: number }
  | { trigger: EffectTrigger; op: "conditional_resource_at_least"; resource: ResourceName; atLeast: number; then: Effect[]; else?: Effect[] }
  | { trigger: EffectTrigger; op: "conditional_state_is"; state: string; then: Effect[]; else?: Effect[] }
  | { trigger: EffectTrigger; op: "optional"; effects: Effect[] }
  | { trigger: EffectTrigger; op: "choose_one"; choices: Effect[][] };

export interface Card {
  id: string; displayName: string; type: CardType; cardType?: CardType; suit?: Suit; vp?: VpValue; cost: number | Partial<Record<ResourceName, number>>; developmentCost?: Partial<Record<ResourceName, number>>; tags: string[]; effects: Effect[];
  suitIcons?: Suit[];
  stateActionTokens?: number; stateExhaustTokens?: number; stateHandSize?: number;
  stateRequirement?: string; allowedModes?: ("multiplayer"|"solo"|"practice")[]; disallowedModes?: ("multiplayer"|"solo"|"practice")[]; playerCountRequirement?: CommonsPlayerCountRequirement|string; startingLocation?: string;
  ownership?: CommonsOwnership; commonsSetId?: CommonsSetId; setupBannerSuit?: Suit; commonsGroup?: CommonsGroup; replacementForCardId?: string; replacementGroupId?: string; conflictsWithNationIds?: string[];
  delayableInLoweredAggression?: boolean; marketEligible?: boolean; smallDeckEligible?: boolean; mainDeckEligible?: boolean; unrestPileEligible?: boolean; fameDeckEligible?: boolean;
}
export interface GameLogEntry { round: number; playerId: string; message: string; }
export interface CardRuntimeState {
  resources?: Partial<Record<ResourceName, number>>;
  garrisonedCardIds?: string[];
  activeState?: string;
  exhausted?: boolean;
  actionTokens?: number;
  exhaustTokens?: number;
}
export interface FameDeckState {
  available: string[];
  specialBottomCardId?: string;
  specialBottomSide?: "A" | "B" | "face_down";
  resolvedSpecialByPlayer: Record<string, boolean>;
}
export type SolsticePhase = "on_solstice" | "overrides" | "end_of_solstice";
export interface PausedSolsticeState {
  playOrder: string[];
  playerIndex: number;
  phase: SolsticePhase;
  cardIndex: number;
  overrideIndex: number;
}
export interface PlayerState {
  deck: string[]; hand: string[]; discard: string[]; playArea: string[]; history: string[]; exile: string[];
  powerArea: string[]; stateArea: string[]; developmentArea: string[]; nationDeck: string[]; accessionCardId?: string; sideAreas?: Record<string, string[]>;
  resources: Record<ResourceName, number>; actionsRemaining: number;
  handSize?: number;
  actionTokensBase: number; exhaustTokensBase: number; actionTokensAvailable: number; exhaustTokensAvailable: number;
  progressionTokens?: { nationDeck: number; developmentArea: number };
}
export interface GameState {
  players: Record<string, PlayerState>; cardDb: Record<string, Card>; market: string[]; marketRefillPool: string[]; sharedDiscard: string[]; log: GameLogEntry[]; round: number;
  playOrder?: string[];
  resourceSupply?: Partial<Record<ResourceName, number>>;
  marketSlots?: MarketSlot[];
  marketResources?: Record<string, Partial<Record<ResourceName, number>>>;
  marketUnrest?: Record<string, string[]>;
  marketDecks?: Record<MarketDeckName, string[]>;
  marketDeckBottomCards?: Partial<Record<MarketDeckName, string>>;
  fameDeck?: FameDeckState;
  unrestPile?: string[];
  currentTurnType?: TurnType;
  freePlayedThisTurn?: Record<string, string[]>;
  treatedSuitIconsThisTurn?: Record<string, Array<{ from: Suit; to: Suit[] }>>;
  cardStates?: Record<string, CardRuntimeState>;
  pendingChoice?: { playerId: string; sourceCardId?: string; choices: Effect[][]; resumeEffects?: Effect[] };
  pendingDrawChoice?: { playerId: string; sourceCardId?: string; source: Exclude<DrawSourceZone, "deck" | "fameDeck">; cardIds: string[]; remainingCount: number; resumeEffects?: Effect[] };
  pendingFindChoice?: { playerId: string; sourceCardId?: string; cardIds: string[]; destination: ZoneName; shuffleZones?: ("deck" | "nationDeck")[]; resumeEffects?: Effect[] };
  pendingAcquireChoice?: { playerId: string; sourceCardId?: string; source: "market" | "exile"; cardIds: string[]; destination: "hand" | "discard"; resumeEffects?: Effect[] };
  pendingMarketCardChoice?: { playerId: string; sourceCardId?: string; op: "gain_card" | "take_card"; cardIds: string[]; destination: "hand" | "discard"; resumeEffects?: Effect[] };
  pendingBreakThroughChoice?: { playerId: string; sourceCardId?: string; source: "market" | "deck" | "exile"; suit: Suit; cardIds: string[]; resumeEffects?: Effect[] };
  pendingExileChoice?: { playerId: string; sourceCardId?: string; source: "market" | PlayerExileSource; cardIds: string[]; optional?: boolean; resumeEffects?: Effect[] };
  pendingGarrisonChoice?: { playerId: string; sourceCardId?: string; hostCardIds: string[]; cardIds: string[]; resumeEffects?: Effect[] };
  pendingRegionChoice?: { playerId: string; sourceCardId?: string; op: "recall_region" | "abandon_region"; cardIds: string[]; count?: number; resumeEffects?: Effect[] };
  pendingRegionChoiceContinuation?: { playerId: string; sourceCardId?: string; op: "recall_region" | "abandon_region"; cardIds: string[]; count?: number; resolving?: boolean; resumeEffects?: Effect[] };
  pendingDevelopmentChoice?: { playerId: string; sourceCardId?: string; cardIds: string[]; resumeDrawCount: number; resumeBehavior?: "reshuffle_draw" | "none"; usesProgressionToken?: boolean; free?: boolean; allowSkip?: boolean; resumeEffects?: Effect[] };
  pendingShortGameDevelopmentExileChoice?: { playerId: string; cardIds: string[]; resumeDrawCount: number; resumeBehavior?: "reshuffle_draw" | "none"; resumeEffects?: Effect[] };
  pendingShortGameDevelopmentExileQueue?: Array<{ playerId: string; cardIds: string[]; resumeDrawCount: number; resumeBehavior?: "reshuffle_draw" | "none" }>;
  pendingTradeChoice?: { playerId: string; sourceCardId?: string; routeCardIds: string[]; allowGoodsForProgress: boolean; resumeEffects?: Effect[] };
  pendingDiscardChoice?: { playerId: string; sourceCardId?: string; cardIds: string[]; count: number; resumeEffects?: Effect[] };
  pendingReturnUnrestChoice?: { playerId: string; sourceCardId?: string; cardIds: string[]; sourceZones: ReturnUnrestSourceZone[]; resumeEffects?: Effect[] };
  pendingReturnFameChoice?: { playerId: string; sourceCardId?: string; cardIds: string[]; sourceZones: ReturnFameSourceZone[]; resumeEffects?: Effect[] };
  pendingPlaceOnDeckChoice?: { playerId: string; sourceCardId?: string; sourceZone: PlaceOnDeckSourceZone; cardIds: string[]; resumeEffects?: Effect[] };
  pendingReturnExhaustTokenChoice?: { playerId: string; sourceCardId?: string; cardIds: string[]; resumeEffects?: Effect[] };
  pendingGiveCardChoice?: { playerId: string; sourceCardId?: string; cardIds: string[]; recipientPlayerIds: string[]; resumeEffects?: Effect[] };
  pendingSwapChoice?: { playerId: string; sourceCardId?: string; sourceZone: SwapSourceZone; choices: { cardId: string; marketCardId: string }[]; resumeEffects?: Effect[] };
  pendingLookOrderChoice?: { playerId: string; sourceCardId?: string; source: LookSourceZone; cardIds: string[]; resumeEffects?: Effect[] };
  pendingUnrestAllocationChoice?: { playerId: string; recipientPlayerIds: string[]; countPerPlayer: number; availableUnrestCardIds: string[]; resumeEffects?: Effect[] };
  pendingReactiveExhaustChoice?: { playerId: string; cardIds: string[]; resolvingPlayerId: string; sourceCardId?: string; resumeEffects?: Effect[]; trigger: ReactiveExhaustCondition["trigger"]; resource?: ResourceName; targetPlayerId?: string; eventSourceCardId?: string; eventSourceWasInPlay?: boolean };
  pendingPlayCardResolution?: { playerId: string; cardId: string; freePlay: boolean; payment?: Partial<Record<ResourceName, number>> };
  pendingPlayedCardResolution?: { playerId: string; cardId: string; freePlay: boolean; afterPlayReactiveChecked?: boolean; afterPlayHooksStarted?: boolean; rollbackSnapshot?: GameState };
  pendingAcquireCardResolution?: { playerId: string; cardId: string; payment?: Partial<Record<ResourceName, number>> };
  pendingAcquireEffectResolution?: { playerId: string; cardId: string; sourceCardId?: string; takenUnrestPlayerIds?: string[]; collectedResources?: Partial<Record<ResourceName, number>>; collectedResourceSources?: ResourceGainSource[]; resolving?: boolean; resumeEffects?: Effect[] };
  pendingMarketMoveEffectResolution?: { playerId: string; sourceCardId?: string; takenUnrestPlayerIds?: string[]; collectedResources?: Partial<Record<ResourceName, number>>; collectedResourceSources?: ResourceGainSource[]; resolving?: boolean; resumeEffects?: Effect[] };
  pendingBreakThroughEffectResolution?: { playerId: string; sourceCardId?: string; gainedCardIds: string[]; afterBreakThroughCardReactiveChecked?: boolean; afterBreakThroughHooksStarted?: boolean; nextAfterBreakThroughReactiveCardIndex?: number; nextAfterBreakThroughHookCardIndex?: number; resolving?: boolean; resumeEffects?: Effect[] };
  pendingMarketUnrestHookContinuation?: { playerId: string; cardIds: string[]; nextIndex: number };
  pendingNationHookContinuation?: { playerId: string; trigger: NationHookTrigger; payload?: Record<string, unknown>; nextIndex: number; resolvedHookIndex: number };
  pendingUnrestTakeContinuation?: { playerId: string; recipientPlayerIds: string[]; countPerPlayer: number; recipientIndex: number; cardIndex: number; taken: number; reactiveTargetPlayerIds?: string[] };
  pendingUnrestAllocationResolution?: { playerId: string; recipientPlayerIds: string[]; availableUnrestCardIds: string[]; nextIndex: number; rollbackSnapshot?: GameState };
  pendingPostDevelopmentResolution?: { playerId: string; cardId?: string; resumeDrawCount: number; resumeBehavior?: "reshuffle_draw" | "none"; rollbackSnapshot?: GameState };
  pendingReshuffleResolution?: { playerId: string; resumeDrawCount: number };
  pendingAfterReshuffleEffects?: { playerId: string; resumeDrawCount: number; nextOverrideIndex: number };
  pendingReshuffleDraw?: { playerId: string; resumeDrawCount: number };
  pendingTurnEndCleanup?: { playerId: string; playOrder: string[]; stage: "before_optional_discard" | "after_cleanup_effects" | "after_draw_up" | "after_practice_market_exile"; nextCleanupOverrideIndex?: number };
  pendingCollapseLifecycle?: { playerId: string; nextOverrideIndex: number };
  pendingScoringLifecycle?: { playerId: string; stage: "overrides" | "collapse_checks" | "after_scoring" | "complete"; overrideIndex: number; lifecycleKey: string };
  pendingScoringFinalization?: { playerIds: string[]; scores: Record<string, number>; nextPlayerIndex: number };
  pendingSolsticeOrderChoice?: { playerId: string; phase: Extract<EffectTrigger, "on_solstice" | "end_of_solstice">; cardIds: string[] };
  pendingSolsticeContinuation?: { playerId: string; phase: Extract<EffectTrigger, "on_solstice" | "end_of_solstice">; cardIds: string[]; cursor: PausedSolsticeState };
  pendingSolsticeRoundEnd?: { playerId: string };
  pendingCleanupMarketResourceChoice?: { playerId: string; resource: ResourceName; amount: number; cardIds: string[] };
  pendingCleanupDiscardChoice?: { playerId: string; cardIds: string[] };
  lookedCards?: { playerId: string; source: LookSourceZone; cardIds: string[] };
  pausedSolstice?: PausedSolsticeState;
  cleanupMarketResourcePlaced?: { playerId: string; round: number };
  cleanupEffectsResolved?: { playerId: string; round: number };
  cleanupDiscardResolved?: { playerId: string; round: number };
  pendingPracticeMarketExileBeforeCleanup?: { playerId: string };
  practiceMarketExileResolved?: { playerId: string; round: number };
  activeNationRulesets?: Record<string, NationRuleset>;
  activeNationStrategyProfiles?: Record<string, NationStrategyProfile>;
  sideAreas?: Record<string, Record<string, SideAreaState>>;
  specialZones?: Record<string, Record<string, ZoneState>>;
  globalSpecialZones?: Record<string, ZoneState>;
  rulesetReports?: NationRulesetApplicationReport[];
  options?: GameOptions;
  scoringOptions?: GameOptions;
  practiceClock?: { turnsRemaining: number; progressTokens: number };
  solo?: SoloState;
  setupReport?: { delayedAggressiveCount: number; usedQuickSetup: boolean; shortGameExiled: number; shortGameNationAdvanced: number; practiceModeExiled: number; commonsSetup?: CommonsSetupResult };
  scoring?: { reason: string; triggeredBy?: string; phase: "finish_current_round" | "final_round"; finalRound?: number };
  gameover?: { winner: string; reason: string; scores?: Record<string, number>; tieBreakScores?: Record<string, number>; campaignOutcome?: CampaignGameOutcome };
}
