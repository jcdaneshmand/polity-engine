import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsSetupResult, MarketSlot } from "./commonsTypes";

export function constructDecks(cards: NormalizedCardRecord[], quickSetup: boolean): Pick<CommonsSetupResult, "unrestPile"|"fameDeck"|"regionDeck"|"uncivilizedDeck"|"civilizedDeck"|"mainDeck"|"constructionPath"> {
  if (quickSetup) {
    return {
      unrestPile: cards.filter((c) => c.unrestPileEligible || c.suit === "unrest" || c.cardType === "unrest").map((c) => c.id),
      fameDeck: cards.filter((c) => c.fameDeckEligible || c.suit === "fame" || c.cardType === "fame").map((c) => c.id),
      regionDeck: [], uncivilizedDeck: [], civilizedDeck: [],
      mainDeck: cards.filter((c) => c.marketEligible ?? true).map((c) => c.id),
      constructionPath: "quick_setup"
    };
  }
  return {
    unrestPile: cards.filter((c) => c.unrestPileEligible || c.suit === "unrest" || c.cardType === "unrest").map((c) => c.id),
    fameDeck: cards.filter((c) => c.fameDeckEligible || c.suit === "fame" || c.cardType === "fame").map((c) => c.id),
    regionDeck: cards.filter((c) => c.setupBannerSuit === "region" || c.suit === "region").map((c) => c.id),
    uncivilizedDeck: cards.filter((c) => c.setupBannerSuit === "uncivilized" || c.suit === "uncivilized").map((c) => c.id),
    civilizedDeck: cards.filter((c) => c.setupBannerSuit === "civilized" || c.suit === "civilized").map((c) => c.id),
    mainDeck: cards.filter((c) => (c.mainDeckEligible ?? c.marketEligible ?? true) && !["fame","unrest"].includes(c.suit)).map((c) => c.id),
    constructionPath: "default"
  };
}

export function buildInitialMarket(mainDeck: string[], unrestPile: string[]): MarketSlot[] {
  return Array.from({ length: 5 }, (_, i) => {
    const cardId = mainDeck[i];
    const unrestAttached = cardId && !cardId.includes("unrest") ? unrestPile.length ? [unrestPile[i % unrestPile.length]] : [] : [];
    return { cardId, unrestAttached, startingResourceMarkers: 0 };
  });
}
