import type { NationDefinition } from "../nations/nationSchema";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsSetupOptions, CommonsSetupResult } from "./commonsTypes";
import { validateCommonsSetupOptions } from "./commonsValidation";
import { selectCommonsCandidates, applyExpansionAndPlayerCountFilters } from "./commonsSelection";
import { resolveNationConflictReplacement } from "./commonsReplacementPolicy";
import { constructDecks, buildInitialMarket } from "./commonsDeckConstruction";

export function buildCommonsSetup(args: { cardDb: Record<string, NormalizedCardRecord>; nationDb: Record<string, NationDefinition>; options: CommonsSetupOptions; rng: () => number; }): CommonsSetupResult {
  const cards = Object.values(args.cardDb);
  const setupErrors = validateCommonsSetupOptions(args.options);
  let selected = selectCommonsCandidates(cards, args.options);
  const { kept, removedForExpansion, removedForPlayerCount } = applyExpansionAndPlayerCountFilters(selected, args.options);
  selected = kept;
  const removedForNationConflict: string[] = [];
  const replacementCardsUsed: string[] = [];
  const setupWarnings: string[] = [];
  const postConflict: NormalizedCardRecord[] = [];
  for (const c of selected) {
    const hasConflict = (c.conflictsWithNationIds ?? []).some((n) => args.options.selectedNationIds.includes(n));
    if (!hasConflict) { postConflict.push(c); continue; }
    removedForNationConflict.push(c.id);
    const replacement = resolveNationConflictReplacement({ card: c, allCards: cards, options: args.options });
    if (replacement) { postConflict.push(replacement); replacementCardsUsed.push(replacement.id); }
  }
  const loweredAggression = args.options.enabledVariants.includes("lowered_aggression");
  const delayed = loweredAggression ? postConflict.filter((c) => c.delayableInLoweredAggression || (c.cardType === "attack" && c.tags.includes("aggressive"))) : [];
  const inSetup = loweredAggression ? postConflict.filter((c) => !delayed.includes(c)) : postConflict;
  const deckResult = constructDecks(inSetup, args.options.enabledVariants.includes("quick_setup"));
  const initialMarket = buildInitialMarket(deckResult.mainDeck, deckResult.unrestPile);
  const mainDeckWithDelayed = [...deckResult.mainDeck, ...delayed.map((c) => c.id)];
  if (args.options.commonsSetId === "horizons" && args.options.enabledExpansions.includes("trade_routes")) {
    setupWarnings.push("Horizons + trade_routes metadata path enabled.");
  }
  return {
    selectedCommonsCards: postConflict.map((c) => c.id),
    removedForPlayerCount,
    removedForExpansion,
    removedForVariant: [],
    removedForNationConflict,
    replacementCardsUsed,
    unrestPile: deckResult.unrestPile,
    fameDeck: deckResult.fameDeck,
    regionDeck: deckResult.regionDeck,
    uncivilizedDeck: deckResult.uncivilizedDeck,
    civilizedDeck: deckResult.civilizedDeck,
    mainDeck: mainDeckWithDelayed,
    delayedCards: delayed.map((c) => c.id),
    initialMarket,
    setupWarnings,
    setupErrors,
    constructionPath: deckResult.constructionPath
  };
}
