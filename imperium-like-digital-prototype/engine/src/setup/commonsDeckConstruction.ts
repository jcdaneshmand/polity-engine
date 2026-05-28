import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsDeckConstructionInput, CommonsDeckConstructionResult, CommonsRng, MarketSlot } from "./commonsTypes";
import { getSetupSuit } from "./commonsTypes";

const MARKET_SIZE = 5;
const SMALL_DECK_SUITS = ["region", "uncivilized", "civilized", "tributary"];

function shuffleWithRng<T>(items: T[], rng?: CommonsRng): T[] {
  if (rng && typeof rng !== "function" && rng.shuffle) return rng.shuffle([...items]);
  const random = typeof rng === "function" ? rng : rng?.next;
  const out = [...items];
  if (!random) return out;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function isUnrest(card: NormalizedCardRecord): boolean {
  return card.unrestPileEligible === true || card.cardType === "unrest" || getSetupSuit(card) === "unrest";
}

function isFame(card: NormalizedCardRecord): boolean {
  return card.fameDeckEligible === true || card.cardType === "fame" || getSetupSuit(card) === "fame";
}

function isMarketEligible(card: NormalizedCardRecord): boolean {
  if (card.marketEligible !== undefined) return card.marketEligible;
  return card.startingLocation === "market" || card.startingLocation === "supply";
}

function isMainDeckEligible(card: NormalizedCardRecord): boolean {
  if (card.mainDeckEligible !== undefined) return card.mainDeckEligible;
  return isMarketEligible(card) && !isUnrest(card) && !isFame(card);
}

function isSmallDeckEligible(card: NormalizedCardRecord): boolean {
  return card.smallDeckEligible !== false;
}

function shouldDelayForLoweredAggression(card: NormalizedCardRecord): boolean {
  return card.delayableInLoweredAggression === true || (card.cardType === "attack" && (card.tags ?? []).includes("aggressive"));
}

function canAttachUnrest(card: NormalizedCardRecord | undefined): boolean {
  if (!card) return false;
  if (isUnrest(card)) return false;
  if ((card as any).attachUnrestOnSetup === false) return false;
  if ((card.tags ?? []).includes("no_unrest_under_market")) return false;
  return true;
}

function markerRecord(card: NormalizedCardRecord | undefined): Record<string, number> {
  if (!card) return {};
  const markers = (card as any).startingMarketResourceMarkers;
  if (!markers || typeof markers !== "object") return {};
  return { ...markers };
}

function drawFromDeck(deck: string[], cardById: Map<string, NormalizedCardRecord>): NormalizedCardRecord | undefined {
  const id = deck.shift();
  return id ? cardById.get(id) : undefined;
}

function createInitialMarket(args: { sourceDeck: string[]; unrestPile: string[]; cardById: Map<string, NormalizedCardRecord> }): MarketSlot[] {
  const slots: MarketSlot[] = [];
  for (let index = 0; index < MARKET_SIZE; index += 1) {
    const card = drawFromDeck(args.sourceDeck, args.cardById);
    const attachedUnrestCardIds: string[] = [];
    if (canAttachUnrest(card) && args.unrestPile.length > 0) {
      const unrest = args.unrestPile.shift();
      if (unrest) attachedUnrestCardIds.push(unrest);
    }
    slots.push({ index, cardId: card?.id, attachedUnrestCardIds, resourceMarkers: markerRecord(card) });
  }
  return slots;
}

function removeDrawnCards(deck: string[], drawnIds: Set<string>): string[] {
  return deck.filter((id) => !drawnIds.has(id));
}

export function buildCommonsDecks(input: CommonsDeckConstructionInput): CommonsDeckConstructionResult {
  const loweredAggression = input.options.enabledVariants.includes("lowered_aggression");
  const quickSetup = input.options.enabledVariants.includes("quick_setup");
  const activeCards = loweredAggression ? input.cards.filter((card) => !shouldDelayForLoweredAggression(card)) : [...input.cards];
  const delayedCards = loweredAggression ? input.cards.filter(shouldDelayForLoweredAggression).map((card) => card.id) : [];
  const cardById = new Map(input.cards.map((card) => [card.id, card]));

  let unrestPile = shuffleWithRng(activeCards.filter(isUnrest).map((card) => card.id), input.rng);
  const fameCards = activeCards.filter(isFame);
  const fameDeck = shuffleWithRng(fameCards.map((card) => card.id), input.rng);
  const kingOfKingsCardId = fameCards.find((card) => (card.tags ?? []).includes("king_of_kings"))?.id;
  const setupWarnings: string[] = [];

  let regionDeck: string[] = [];
  let uncivilizedDeck: string[] = [];
  let civilizedDeck: string[] = [];
  let tributaryDeck: string[] | undefined;
  let mainDeck: string[] = [];
  let initialMarket: MarketSlot[];

  if (quickSetup) {
    const quickSetupDeck = shuffleWithRng(activeCards.filter((card) => isMainDeckEligible(card)).map((card) => card.id), input.rng);
    initialMarket = createInitialMarket({ sourceDeck: quickSetupDeck, unrestPile, cardById });
    mainDeck = quickSetupDeck;
  } else {
    const marketCards = activeCards.filter((card) => isMainDeckEligible(card));
    const smallDeckCards = marketCards.filter((card) => isSmallDeckEligible(card) && SMALL_DECK_SUITS.includes(getSetupSuit(card)));
    regionDeck = shuffleWithRng(smallDeckCards.filter((card) => getSetupSuit(card) === "region").map((card) => card.id), input.rng);
    uncivilizedDeck = shuffleWithRng(smallDeckCards.filter((card) => getSetupSuit(card) === "uncivilized").map((card) => card.id), input.rng);
    civilizedDeck = shuffleWithRng(smallDeckCards.filter((card) => getSetupSuit(card) === "civilized").map((card) => card.id), input.rng);
    tributaryDeck = shuffleWithRng(smallDeckCards.filter((card) => getSetupSuit(card) === "tributary").map((card) => card.id), input.rng);
    mainDeck = shuffleWithRng(marketCards.filter((card) => !isSmallDeckEligible(card) || !SMALL_DECK_SUITS.includes(getSetupSuit(card))).map((card) => card.id), input.rng);

    const initialMarketSource = [...regionDeck, ...uncivilizedDeck, ...civilizedDeck, ...tributaryDeck, ...mainDeck];
    initialMarket = createInitialMarket({ sourceDeck: initialMarketSource, unrestPile, cardById });
    const drawnIds = new Set(initialMarket.map((slot) => slot.cardId).filter(Boolean) as string[]);
    regionDeck = removeDrawnCards(regionDeck, drawnIds);
    uncivilizedDeck = removeDrawnCards(uncivilizedDeck, drawnIds);
    civilizedDeck = removeDrawnCards(civilizedDeck, drawnIds);
    tributaryDeck = removeDrawnCards(tributaryDeck, drawnIds);
    mainDeck = removeDrawnCards(mainDeck, drawnIds);
  }

  if (delayedCards.length > 0) {
    mainDeck = shuffleWithRng([...mainDeck, ...delayedCards], input.rng);
  }
  if (initialMarket.filter((slot) => slot.cardId).length < MARKET_SIZE) setupWarnings.push("InitialMarketUnderfilled(no_more_market_eligible_cards)");

  return {
    unrestPile,
    fameDeck,
    kingOfKingsCardId,
    regionDeck,
    uncivilizedDeck,
    civilizedDeck,
    tributaryDeck,
    mainDeck,
    delayedCards,
    initialMarket,
    setupWarnings,
    constructionPath: quickSetup ? "quick" : "suit_separated"
  };
}
