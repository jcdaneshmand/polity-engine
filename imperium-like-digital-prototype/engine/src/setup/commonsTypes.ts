import type { ExpansionId, NormalizedCardRecord, Suit } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition } from "../nations/nationSchema";
import type { GameMode, VariantId } from "../options/gameOptions";

export type CommonsSetId = "classics" | "legends" | "horizons" | "custom";
export type CommonsOwnership = "commons" | "nation" | "bot" | "replacement";
export type CommonsGroup = "base" | "trade_friendly" | "trade_routes" | "replacement";
export type CommonsPlayerCountRequirement = "1+" | "2+" | "3+" | "4+";
export type CommonsReplacementPolicy = "none" | "use_replacements" | "prefer_latest";
export type CommonsRng = { next?: () => number; shuffle?: <T>(items: T[]) => T[] } | (() => number);

export type MarketSlot = {
  index: number;
  cardId?: string;
  attachedUnrestCardIds: string[];
  resourceMarkers: Record<string, number>;
};

export type CommonsSetupOptions = {
  commonsSetId: CommonsSetId;
  playerCount: 1 | 2 | 3 | 4;
  effectiveCommonsPlayerCount: 2 | 3 | 4;
  enabledExpansions: ExpansionId[];
  enabledVariants: VariantId[];
  mode?: GameMode;
  selectedNationIds: string[];
  replacementPolicy: CommonsReplacementPolicy;
};

export type CommonsSetupResult = {
  selectedCommonsCards: string[];
  removedForPlayerCount: string[];
  removedForExpansion: string[];
  removedForVariant: string[];
  removedForNationConflict: string[];
  replacementCardsUsed: string[];

  unrestPile: string[];
  fameDeck: string[];
  kingOfKingsCardId?: string;

  regionDeck: string[];
  uncivilizedDeck: string[];
  civilizedDeck: string[];
  tributaryDeck?: string[];
  mainDeck: string[];

  delayedCards: string[];
  initialMarket: MarketSlot[];

  setupWarnings: string[];
  setupErrors: string[];
};

export type CommonsSetupArgs = {
  cardDb: Record<string, NormalizedCardRecord>;
  nationDb: Record<string, NationDefinition>;
  options: CommonsSetupOptions;
  rng?: CommonsRng;
};

export type CommonsSelectionReport = {
  selectedCards: NormalizedCardRecord[];
  removedForPlayerCount: string[];
  removedForExpansion: string[];
  removedForVariant: string[];
};

export type CommonsDeckConstructionInput = {
  cards: NormalizedCardRecord[];
  options: CommonsSetupOptions;
  rng?: CommonsRng;
};

export type CommonsDeckConstructionResult = Pick<CommonsSetupResult,
  | "unrestPile"
  | "fameDeck"
  | "kingOfKingsCardId"
  | "regionDeck"
  | "uncivilizedDeck"
  | "civilizedDeck"
  | "tributaryDeck"
  | "mainDeck"
  | "delayedCards"
  | "initialMarket"
  | "setupWarnings"
> & { constructionPath: "quick" | "suit_separated" };

export function getSetupSuit(card: NormalizedCardRecord): Suit {
  return (card.setupBannerSuit ?? card.suit) as Suit;
}
