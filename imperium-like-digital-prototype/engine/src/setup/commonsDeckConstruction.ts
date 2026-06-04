import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import { cardHasSuitIcon } from "../game/suitIcons";
import type { CommonsDeckConstructionInput, CommonsDeckConstructionResult, CommonsRng, MarketSlot } from "./commonsTypes";
import { getSetupSuit } from "./commonsTypes";

const MARKET_SIZE = 5;
const DEFAULT_SMALL_DECK_SUITS = ["region", "uncivilized", "civilized"];
type SmallDeckBottomCards = Partial<Record<"regionDeck" | "uncivilizedDeck" | "civilizedDeck" | "tributaryDeck", string>>;

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
  return card.unrestPileEligible === true || card.cardType === "unrest" || getSetupSuit(card) === "unrest" || cardHasSuitIcon(card as any, "unrest");
}

function isFame(card: NormalizedCardRecord): boolean {
  return card.fameDeckEligible === true || card.cardType === "fame" || getSetupSuit(card) === "fame" || cardHasSuitIcon(card as any, "fame");
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

function isSetupTributary(card: NormalizedCardRecord): boolean {
  return getSetupSuit(card) === "tributary" || cardHasSuitIcon(card as any, "tributary");
}

function shouldDelayForLoweredAggression(card: NormalizedCardRecord): boolean {
  return card.delayableInLoweredAggression === true || (card.cardType === "attack" && (card.tags ?? []).includes("aggressive"));
}

function canAttachUnrest(card: NormalizedCardRecord | undefined): boolean {
  if (!card) return false;
  if (isUnrest(card)) return false;
  if (card.cardType === "region" || getSetupSuit(card) === "region" || cardHasSuitIcon(card as any, "region")) return false;
  if ((card as any).attachUnrestOnSetup === false) return false;
  if ((card.tags ?? []).includes("no_unrest_under_market")) return false;
  return true;
}

function markerRecord(card: NormalizedCardRecord | undefined): Record<string, number> {
  if (!card) return {};
  const markers = (card as any).startingMarketResourceMarkers;
  const setupMarkers: Record<string, number> = {};
  if (isSetupTributary(card)) setupMarkers.knowledge = 1;
  if (!markers || typeof markers !== "object") return setupMarkers;
  return { ...setupMarkers, ...markers };
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

function createInitialMarketFromDeckSequence(args: { sourceDecks: string[][]; fallbackDeck?: string[]; unrestPile: string[]; cardById: Map<string, NormalizedCardRecord> }): MarketSlot[] {
  const slots: MarketSlot[] = [];
  for (let index = 0; index < MARKET_SIZE; index += 1) {
    const sourceDeck = args.sourceDecks[index] ?? [];
    const card = drawFromDeck(sourceDeck, args.cardById) ?? (sourceDeck === args.fallbackDeck ? undefined : drawFromDeck(args.fallbackDeck ?? [], args.cardById));
    const attachedUnrestCardIds: string[] = [];
    if (canAttachUnrest(card) && args.unrestPile.length > 0) {
      const unrest = args.unrestPile.shift();
      if (unrest) attachedUnrestCardIds.push(unrest);
    }
    slots.push({ index, cardId: card?.id, attachedUnrestCardIds, resourceMarkers: markerRecord(card) });
  }
  return slots;
}

function smallDeckFaceDownSize(playerCount: number): number {
  if (playerCount <= 2) return 6;
  if (playerCount === 3) return 7;
  return 8;
}

function splitSmallDeckForPlayerCount(cardIds: string[], playerCount: number): { deck: string[]; setAside: string[] } {
  const faceDownSize = smallDeckFaceDownSize(playerCount);
  return {
    deck: cardIds.slice(0, faceDownSize),
    setAside: cardIds.slice(faceDownSize)
  };
}

function tributaryRemovalCount(playerCount: number): number {
  if (playerCount <= 2) return 2;
  if (playerCount === 3) return 1;
  return 0;
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
  let smallDeckBottomCards: SmallDeckBottomCards = {};

  if (quickSetup) {
    const marketCards = activeCards.filter((card) => isMainDeckEligible(card));
    const tributaryCards = shuffleWithRng(marketCards.filter((card) => isSmallDeckEligible(card) && isSetupTributary(card)).map((card) => card.id), input.rng);
    const [regionBottomCard, uncivilizedBottomCard, civilizedBottomCard, ...extraTributaryCards] = tributaryCards;
    const remainingTributaryCards = extraTributaryCards.slice(tributaryRemovalCount(input.options.effectiveCommonsPlayerCount));
    const quickSetupDeck = shuffleWithRng([
      ...marketCards
        .filter((card) => !isSmallDeckEligible(card) || !isSetupTributary(card))
        .map((card) => card.id),
      ...remainingTributaryCards
    ], input.rng);
    const smallDeckSize = smallDeckFaceDownSize(input.options.effectiveCommonsPlayerCount);
    regionDeck = quickSetupDeck.splice(0, smallDeckSize);
    uncivilizedDeck = quickSetupDeck.splice(0, smallDeckSize);
    civilizedDeck = quickSetupDeck.splice(0, smallDeckSize);
    if (regionBottomCard) regionDeck.push(regionBottomCard);
    if (uncivilizedBottomCard) uncivilizedDeck.push(uncivilizedBottomCard);
    if (civilizedBottomCard) civilizedDeck.push(civilizedBottomCard);
    mainDeck = quickSetupDeck;
    initialMarket = createInitialMarketFromDeckSequence({
      sourceDecks: [regionDeck, uncivilizedDeck, civilizedDeck, mainDeck, mainDeck],
      fallbackDeck: mainDeck,
      unrestPile,
      cardById
    });
    smallDeckBottomCards = {
      ...(regionBottomCard && regionDeck.at(-1) === regionBottomCard ? { regionDeck: regionBottomCard } : {}),
      ...(uncivilizedBottomCard && uncivilizedDeck.at(-1) === uncivilizedBottomCard ? { uncivilizedDeck: uncivilizedBottomCard } : {}),
      ...(civilizedBottomCard && civilizedDeck.at(-1) === civilizedBottomCard ? { civilizedDeck: civilizedBottomCard } : {})
    };
  } else {
    const marketCards = activeCards.filter((card) => isMainDeckEligible(card));
    const smallDeckCards = marketCards.filter((card) => isSmallDeckEligible(card) && !isSetupTributary(card) && DEFAULT_SMALL_DECK_SUITS.includes(getSetupSuit(card)));
    const tributaryCards = shuffleWithRng(marketCards.filter((card) => isSmallDeckEligible(card) && isSetupTributary(card)).map((card) => card.id), input.rng);
    const regionSplit = splitSmallDeckForPlayerCount(shuffleWithRng(smallDeckCards.filter((card) => getSetupSuit(card) === "region").map((card) => card.id), input.rng), input.options.effectiveCommonsPlayerCount);
    const uncivilizedSplit = splitSmallDeckForPlayerCount(shuffleWithRng(smallDeckCards.filter((card) => getSetupSuit(card) === "uncivilized").map((card) => card.id), input.rng), input.options.effectiveCommonsPlayerCount);
    const civilizedSplit = splitSmallDeckForPlayerCount(shuffleWithRng(smallDeckCards.filter((card) => getSetupSuit(card) === "civilized").map((card) => card.id), input.rng), input.options.effectiveCommonsPlayerCount);
    regionDeck = regionSplit.deck;
    uncivilizedDeck = uncivilizedSplit.deck;
    civilizedDeck = civilizedSplit.deck;
    const [regionBottomCard, uncivilizedBottomCard, civilizedBottomCard, ...extraTributaryCards] = tributaryCards;
    const remainingTributaryCards = extraTributaryCards.slice(tributaryRemovalCount(input.options.effectiveCommonsPlayerCount));
    if (regionBottomCard) regionDeck.push(regionBottomCard);
    if (uncivilizedBottomCard) uncivilizedDeck.push(uncivilizedBottomCard);
    if (civilizedBottomCard) civilizedDeck.push(civilizedBottomCard);
    tributaryDeck = [];
    mainDeck = shuffleWithRng([
      ...marketCards
        .filter((card) => !isSmallDeckEligible(card) || (!isSetupTributary(card) && !DEFAULT_SMALL_DECK_SUITS.includes(getSetupSuit(card))))
        .map((card) => card.id),
      ...regionSplit.setAside,
      ...uncivilizedSplit.setAside,
      ...civilizedSplit.setAside,
      ...remainingTributaryCards
    ], input.rng);

    initialMarket = createInitialMarketFromDeckSequence({
      sourceDecks: [regionDeck, uncivilizedDeck, civilizedDeck, mainDeck, mainDeck],
      fallbackDeck: mainDeck,
      unrestPile,
      cardById
    });
    smallDeckBottomCards = {
      ...(regionBottomCard && regionDeck.at(-1) === regionBottomCard ? { regionDeck: regionBottomCard } : {}),
      ...(uncivilizedBottomCard && uncivilizedDeck.at(-1) === uncivilizedBottomCard ? { uncivilizedDeck: uncivilizedBottomCard } : {}),
      ...(civilizedBottomCard && civilizedDeck.at(-1) === civilizedBottomCard ? { civilizedDeck: civilizedBottomCard } : {}),
      ...(tributaryDeck.length > 0 ? { tributaryDeck: tributaryDeck[tributaryDeck.length - 1] } : {})
    };
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
    smallDeckBottomCards,
    delayedCards,
    initialMarket,
    setupWarnings,
    constructionPath: quickSetup ? "quick" : "suit_separated"
  };
}
