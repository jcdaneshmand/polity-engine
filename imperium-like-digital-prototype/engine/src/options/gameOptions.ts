export type ExpansionId = "trade_routes";
export type GameMode = "multiplayer" | "solo" | "practice";
export type VariantId = "lowered_aggression" | "quick_setup" | "precious_cards" | "short_game";
export type SoloDifficulty = "chieftain" | "warlord" | "imperator" | "sovereign" | "sovereign_plus";

export type CommonsSetId = "classics" | "legends" | "horizons" | "custom";

export type GameOptions = {
  playerCount: 1 | 2 | 3 | 4;
  mode: GameMode;
  enabledExpansions: ExpansionId[];
  enabledVariants: VariantId[];
  commonsSetId: CommonsSetId;
  replacementPolicy: "none" | "use_replacements" | "prefer_latest";
  soloDifficulty?: SoloDifficulty;
};

export const defaultGameOptions: GameOptions = {
  playerCount: 2,
  mode: "multiplayer",
  enabledExpansions: [],
  enabledVariants: [],
  commonsSetId: "classics",
  replacementPolicy: "none"
};
