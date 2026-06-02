import type { CardType, EffectOp, ResourceName, Suit } from "../game/state";
import type { ExpansionId, GameMode, VariantId } from "../options/gameOptions";

export type NationRulesetTag =
  | "default_nation_deck" | "no_nation_deck" | "no_accession" | "no_development_area" | "development_area_available_from_start"
  | "quest_development_replacement" | "never_becomes_empire" | "starts_as_empire" | "custom_state_card" | "seasonal_state_cycle"
  | "custom_state_symbols" | "state_flip_on_solstice" | "no_history" | "alternate_history_zone" | "discard_instead_of_history"
  | "special_side_area" | "ceremony_track" | "journey_track" | "mana_track" | "chaos_pile" | "chaos_collapse_victory"
  | "trade_routes_required" | "merchant_focused" | "clean_up_market_resource_override" | "extra_unrest_supply" | "nadir_card" | "zenith_card"
  | "reverse_progression" | "martian_gadget_system" | "polynesian_mana_system" | "treaty_or_tributary_focus" | "aggressive_attack_focus"
  | "peaceful_engine_focus" | "market_acquisition_focus" | "development_focus" | "history_thinning_focus" | "garrison_focus" | "fame_focus"
  | "unrest_management_focus" | "collapse_pressure_focus" | "short_game_exception" | "short_game_excluded" | "solo_bot_exception"
  | "solo_bot_custom_dynasty" | "solo_bot_custom_state" | "campaign_exception";

export type EffectCondition =
  | { op: "always" }
  | { op: "state_is"; state: string }
  | { op: "zone_empty"; zoneId: string }
  | { op: "zone_has_at_least"; zoneId: string; count: number }
  | { op: "card_in_zone"; cardId: string; zoneId: string }
  | { op: "expansion_enabled"; expansion: ExpansionId }
  | { op: "variant_enabled"; variant: VariantId }
  | { op: "mode_is"; mode: GameMode }
  | { op: "payload_card_is"; payloadKey: string; cardId: string }
  | { op: "payload_card_suit_is"; payloadKey: string; suit: Suit }
  | { op: "payload_card_type_is"; payloadKey: string; cardType: CardType }
  | { op: "payload_card_has_tag"; payloadKey: string; tag: string };

export type SetupOverride =
  | { op: "set_initial_resources"; resources: Partial<Record<ResourceName, number>> }
  | { op: "gain_resource"; resource: ResourceName; count: number }
  | { op: "set_action_tokens_base"; count: number }
  | { op: "move_cards_to_unrest_supply"; cardIds: string[] }
  | { op: "create_side_area"; areaId: string; displayName: string; public?: boolean };
export type ZoneOverride =
  | { op: "disable_history"; replacementBehavior: "discard" | "exile" | "alternate_zone" }
  | { op: "replace_history_with_zone"; zoneId: string; displayName: string; cardsScore?: boolean }
  | { op: "create_zone"; zoneId: string; displayName: string; visibility: "public" | "private" };
export type StateOverride =
  | { op: "start_as_state"; state: string }
  | { op: "never_flip_to_empire" }
  | { op: "flip_state_on_solstice"; sequence: string[]; loop?: boolean }
  | { op: "take_unrest_when_spending_resource"; resource: ResourceName; state?: string }
  | { op: "suppress_king_of_kings_reward"; state?: string };
export type ReshuffleOverride =
  | { op: "skip_default_nation_card_addition" }
  | { op: "development_available_from_start" }
  | { op: "trigger_game_end_when_card_added"; cardId: string }
  | { op: "place_nation_card_in_play_when_added"; cardId: string; suppressStateFlip?: boolean }
  | { op: "custom_reshuffle_effect"; effect: EffectOp[] };
export type CleanupOverride =
  | { op: "prevent_voluntary_discard" }
  | { op: "market_resource_added"; resource: ResourceName; count: number }
  | { op: "custom_cleanup_effect"; effect: EffectOp[] };
export type SolsticeOverride =
  | { op: "flip_state" }
  | { op: "remove_play_card_and_nation_deck_if_resource_empty"; cardId: string; resource: ResourceName; state?: string; activateState?: string }
  | { op: "custom_solstice_effect"; effect: EffectOp[] };
export type ScoringOverride =
  | { op: "exclude_zone_from_scoring"; zoneId: string }
  | { op: "score_resource_ratio"; resource: ResourceName; denominator: number; numerator?: number; state?: string }
  | { op: "custom_scoring_effect"; effect: EffectOp[] };
export type CollapseOverride = { op: "auto_win_if_zone_empty"; zoneId: string } | { op: "custom_collapse_resolution"; effect: EffectOp[] };
export type BotOverride =
  | { op: "skip_default_dynasty_setup" }
  | { op: "skip_bot_accession_state_flip" }
  | { op: "bot_cleanup_market_resource"; resource: ResourceName; count: number }
  | { op: "custom_dynasty_setup"; config?: { cardIds?: string[] } & Record<string, unknown> }
  | { op: "custom_bot_state_stack"; cardIds?: string[] }
  | { op: "initial_bot_state_table"; tableId: string; side?: string }
  | { op: "bot_custom_cleanup"; effect: EffectOp[] };
export type ShortGameOverride =
  | { op: "excluded_from_short_game" }
  | { op: "custom_short_game_setup"; effect: EffectOp[] }
  | { op: "add_nation_cards_to_discard"; count: number }
  | { op: "skip_accession_development_exile" }
  | { op: "remove_starting_resource"; resource: ResourceName; count: number }
  | { op: "remove_starting_resources"; resources: ResourceName[] }
  | { op: "develop_one_remove_one_development"; developCardId: string; removeCardId: string }
  | { op: "move_development_cards_to_discard"; cardIds: string[] }
  | { op: "move_one_advanced_nation_card_to_side_area"; areaId: string; selection?: "first" | "random" }
  | { op: "garrison_development_and_add_nation_to_starting_deck"; developmentCardId: string; hostCardId: string };

export type NationHookTrigger = "before_setup_player" | "after_setup_player" | "before_play_card" | "after_play_card" | "before_acquire" | "after_acquire" | "after_break_through" | "after_revolt" | "before_reshuffle" | "after_reshuffle" | "after_develop" | "after_gain_unrest" | "before_solstice" | "after_solstice" | "before_scoring" | "after_scoring";
export type NationHookRule = { trigger: NationHookTrigger; condition?: EffectCondition; effects: EffectOp[]; priority?: number; description?: string };

export type NationRuleset = {
  nationId: string; displayName: string; privateName?: string; rulesetTags: NationRulesetTag[];
  requiredExpansions: ExpansionId[]; excludedExpansions?: ExpansionId[]; allowedModes?: GameMode[]; disallowedModes?: GameMode[];
  excludedVariants?: VariantId[]; requiredVariants?: VariantId[];
  setupOverrides: SetupOverride[]; zoneOverrides: ZoneOverride[]; stateOverrides: StateOverride[]; reshuffleOverrides: ReshuffleOverride[];
  cleanupOverrides: CleanupOverride[]; solsticeOverrides: SolsticeOverride[]; scoringOverrides: ScoringOverride[]; collapseOverrides: CollapseOverride[];
  botOverrides: BotOverride[]; shortGameOverrides: ShortGameOverride[]; hookRules: NationHookRule[];
  publicSummary?: string; privateNotes?: string; implemented: boolean; tested: boolean;
};

export type SideAreaState = { id: string; displayName: string; cardIds: string[]; activeCardId?: string; visibility: "public" | "private" };
export type ZoneState = { id: string; displayName: string; cardIds: string[]; visibility: "public" | "private"; scoresAsOwned: boolean };
export type NationRulesetApplicationReport = { playerId: string; nationId: string; appliedTags: NationRulesetTag[]; appliedOverrides: string[]; warnings: string[] };
