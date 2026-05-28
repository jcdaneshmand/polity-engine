import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsSetupArgs, CommonsSetupResult } from "./commonsTypes";
import { selectCommonsCards } from "./commonsSelection";
import { buildCommonsDecks } from "./commonsDeckConstruction";
import { findEligibleReplacementCard, hasNationConflict } from "./commonsReplacementPolicy";
import { validateCommonsSetupOptions } from "./commonsValidation";

export function buildCommonsSetup(args: CommonsSetupArgs): CommonsSetupResult {
  const allCards = Object.values(args.cardDb);
  const setupErrors = validateCommonsSetupOptions(args.options);
  const selection = selectCommonsCards(allCards, args.options);
  const removedForNationConflict: string[] = [];
  const replacementCardsUsed: string[] = [];
  const setupWarnings: string[] = [];
  const selectedCards: NormalizedCardRecord[] = [];

  for (const card of selection.selectedCards) {
    if (!hasNationConflict(card, args.options.selectedNationIds)) {
      selectedCards.push(card);
      continue;
    }

    removedForNationConflict.push(card.id);
    const replacement = findEligibleReplacementCard({ removedCard: card, allCards, selectedCards: [...selectedCards, ...selection.selectedCards], options: args.options });
    if (replacement) {
      selectedCards.push(replacement);
      replacementCardsUsed.push(replacement.id);
    } else if (args.options.replacementPolicy !== "none") {
      setupWarnings.push(`NoEligibleReplacement(${card.id})`);
    }
  }

  const deckSetup = buildCommonsDecks({ cards: selectedCards, options: args.options, rng: args.rng });
  setupWarnings.push(...deckSetup.setupWarnings);
  setupWarnings.push(`CommonsDeckConstructionPath(${deckSetup.constructionPath})`);

  return {
    selectedCommonsCards: selectedCards.map((card) => card.id),
    removedForPlayerCount: selection.removedForPlayerCount,
    removedForExpansion: selection.removedForExpansion,
    removedForVariant: selection.removedForVariant,
    removedForNationConflict,
    replacementCardsUsed,
    unrestPile: deckSetup.unrestPile,
    fameDeck: deckSetup.fameDeck,
    kingOfKingsCardId: deckSetup.kingOfKingsCardId,
    regionDeck: deckSetup.regionDeck,
    uncivilizedDeck: deckSetup.uncivilizedDeck,
    civilizedDeck: deckSetup.civilizedDeck,
    tributaryDeck: deckSetup.tributaryDeck,
    mainDeck: deckSetup.mainDeck,
    delayedCards: deckSetup.delayedCards,
    initialMarket: deckSetup.initialMarket,
    setupWarnings,
    setupErrors
  };
}
