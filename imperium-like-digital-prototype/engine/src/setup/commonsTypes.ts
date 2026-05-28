import type { ExpansionId, Suit } from "../../../tools/card-import/cardCsvTypes";
import type { VariantId } from "../options/gameOptions";

export type CommonsSetId = "classics" | "legends" | "horizons" | "custom";

export type MarketSlot = {
  cardId?: string;
  unrestAttached?: string[];
  startingResourceMarkers?: number;
};

export type CommonsSetupOptions = {
  commonsSetId: CommonsSetId;
  playerCount: 1 | 2 | 3 | 4;
  effectiveCommonsPlayerCount: 2 | 3 | 4;
  enabledExpansions: ExpansionId[];
  enabledVariants: VariantId[];
  selectedNationIds: string[];
  replacementPolicy: "none" | "use_replacements" | "prefer_latest";
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
  constructionPath?: "quick_setup" | "default";
};

export const SETUP_BANNER_SUITS: Suit[] = ["region", "uncivilized", "civilized", "tributary"];
