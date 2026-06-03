export type ExpansionId = "trade_routes";
export type GameMode = "multiplayer" | "solo" | "practice";
export type VariantId = "lowered_aggression" | "quick_setup" | "precious_cards" | "short_game";
export type SoloDifficulty = "chieftain" | "warlord" | "imperator" | "sovereign" | "overlord" | "supreme_ruler";
export type CampaignMode = "standard" | "supreme_ruler";
export type CommonsSetId = "classics" | "legends" | "horizons" | "custom";
export type CommonsReplacementPolicy = "none" | "use_replacements" | "prefer_latest";
export type CampaignCardChoice =
  | { kind: "add_gained_commons_to_starting_deck"; cardId: string }
  | { kind: "remove_starting_deck_card"; cardId: string }
  | { kind: "set_aside_commons_card"; cardId: string }
  | { kind: "return_set_aside_commons_card"; cardId: string };

export type CampaignGameRecord = {
  won: boolean;
  botNationId: string;
  difficulty: SoloDifficulty;
  date?: string;
  score?: number;
  choice?: CampaignCardChoice;
};

export type CampaignProgress = {
  mode: CampaignMode;
  playerNationId: string;
  wins: number;
  losses: number;
  currentDifficulty: SoloDifficulty;
  defeatedBotNationIds: string[];
  startingDeckAdditions: string[];
  startingDeckRemovals: string[];
  setAsideCommonsCardIds: string[];
  doubleStartingResourcesForNextGame?: boolean;
  records?: CampaignGameRecord[];
  complete?: "won" | "lost";
};

export type CampaignGameOutcome = {
  mode: CampaignMode;
  won: boolean;
  humanPlayerId: string;
  botId: string;
  botNationId: string;
  difficulty: SoloDifficulty;
  score: number;
  scoreKind: "victory_points" | "collapse_unrest";
  botScore?: number;
  requiresCampaignChoice: boolean;
  result: CampaignGameRecord;
};

export type GameOptions = {
  playerCount: 1 | 2 | 3 | 4;
  mode: GameMode;
  enabledExpansions: ExpansionId[];
  enabledVariants: VariantId[];
  soloDifficulty?: SoloDifficulty;
  campaignMode?: CampaignMode;
  campaignProgress?: CampaignProgress;
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
