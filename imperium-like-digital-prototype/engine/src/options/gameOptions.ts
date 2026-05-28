export type ExpansionId = "trade_routes";
export type GameMode = "multiplayer" | "solo" | "practice";
export type VariantId = "lowered_aggression" | "quick_setup" | "precious_cards" | "short_game";
export type SoloDifficulty = "chieftain" | "warlord" | "imperator" | "sovereign" | "overlord" | "supreme_ruler";
export type CommonsSetId = "classics" | "legends" | "horizons" | "custom";
export type CommonsReplacementPolicy = "none" | "use_replacements" | "prefer_latest";

export type GameOptions = {
  playerCount: 1 | 2 | 3 | 4;
  mode: GameMode;
  enabledExpansions: ExpansionId[];
  enabledVariants: VariantId[];
  soloDifficulty?: SoloDifficulty;
  commonsSetId?: CommonsSetId;
  replacementPolicy?: CommonsReplacementPolicy;
};

export const defaultGameOptions: GameOptions = {
  playerCount: 2,
  mode: "multiplayer",
  enabledExpansions: [],
  enabledVariants: [],
  commonsSetId: "classics",
  replacementPolicy: "use_replacements"
};
