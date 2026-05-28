import type { EffectOp, ExpansionId, ResourceName } from "../game/state";
import type { GameMode, VariantId } from "../options/gameOptions";

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
  | { op: "mode_is"; mode: GameMode };

export type SetupOverride = { op: "set_initial_resources"; resources: Partial<Record<ResourceName, number>> } | { op: "set_action_tokens_base"; count: number };
export type ZoneOverride = { op: "disable_history"; replacementBehavior: "discard" | "exile" | "alternate_zone" } | { op: "create_zone"; zoneId: string; displayName: string; visibility: "public" | "private" };
export type StateOverride = { op: "start_as_state"; state: string } | { op: "never_flip_to_empire" };
export type ReshuffleOverride = { op: "skip_default_nation_card_addition" } | { op: "custom_reshuffle_effect"; effect: EffectOp[] };
export type CleanupOverride = { op: "prevent_voluntary_discard" } | { op: "custom_cleanup_effect"; effect: EffectOp[] };
export type SolsticeOverride = { op: "flip_state" } | { op: "custom_solstice_effect"; effect: EffectOp[] };
export type ScoringOverride = { op: "exclude_zone_from_scoring"; zoneId: string } | { op: "custom_scoring_effect"; effect: EffectOp[] };
export type CollapseOverride = { op: "auto_win_if_zone_empty"; zoneId: string } | { op: "custom_collapse_resolution"; effect: EffectOp[] };
export type BotOverride = { op: "skip_default_dynasty_setup" } | { op: "bot_custom_cleanup"; effect: EffectOp[] };
export type ShortGameOverride = { op: "excluded_from_short_game" } | { op: "custom_short_game_setup"; effect: EffectOp[] } | { op: "add_nation_cards_to_discard"; count: number };

export type NationHookTrigger = "before_setup_player" | "after_setup_player" | "before_play_card" | "after_play_card" | "before_acquire" | "after_acquire" | "before_reshuffle" | "after_reshuffle" | "before_solstice" | "after_solstice" | "before_scoring" | "after_scoring";
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
