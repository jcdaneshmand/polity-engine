import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import { cardHasSuitIcon } from "../game/suitIcons";
import { buildCommonsSetup } from "./commonsSetup";
import { getSetupSuit, type CommonsSetupArgs, type CommonsSetupOptions, type CommonsSetupResult } from "./commonsTypes";

export type CommonsValidationProfile = "standard" | "builtin_demo" | "fictional_demo";
export type CommonsIssueSeverity = "blocking" | "advisory";
export type CommonsIssueCategory = "selection" | "market" | "small_decks" | "tributary" | "fame" | "unrest" | "main_deck" | "setup";

export type CommonsAnalysisIssue = {
  code: string;
  severity: CommonsIssueSeverity;
  category: CommonsIssueCategory;
  message: string;
  required?: number;
  available?: number;
  cardIds?: string[];
};

export type CommonsCompositionCounts = {
  requested: number;
  selected: number;
  initialMarket: number;
  region: number;
  uncivilized: number;
  civilized: number;
  tributaryBottoms: number;
  main: number;
  ordinaryFame: number;
  specialFame: number;
  unrestBeforeSetup: number;
  unrestAttached: number;
  unrestRemaining: number;
  byGroup: Record<string, number>;
  bySuit: Record<string, number>;
};

export type CommonsSetupAnalysis = {
  status: "ready" | "conditional" | "blocked";
  profile: CommonsValidationProfile;
  issues: CommonsAnalysisIssue[];
  counts: CommonsCompositionCounts;
  result: CommonsSetupResult;
  removals: {
    missing: string[];
    rejected: string[];
    playerCount: string[];
    expansion: string[];
    variant: string[];
    nationConflict: string[];
    replacements: string[];
  };
};

const FULL_SMALL_DECK_SIZE: Record<2 | 3 | 4, number> = { 2: 6, 3: 7, 4: 8 };
const FULL_FAME_SIZE: Record<1 | 2 | 3 | 4, number> = { 1: 6, 2: 6, 3: 7, 4: 8 };

function isUnrest(card: NormalizedCardRecord | undefined): boolean {
  return Boolean(card && (card.unrestPileEligible === true || card.cardType === "unrest" || getSetupSuit(card) === "unrest" || cardHasSuitIcon(card as any, "unrest")));
}

function isRegion(card: NormalizedCardRecord | undefined): boolean {
  return Boolean(card && (card.cardType === "region" || getSetupSuit(card) === "region" || cardHasSuitIcon(card as any, "region")));
}

function canAttachUnrest(card: NormalizedCardRecord | undefined): boolean {
  return Boolean(card && !isUnrest(card) && !isRegion(card) && (card as any).attachUnrestOnSetup !== false && !(card.tags ?? []).includes("no_unrest_under_market"));
}

function countBy(cards: NormalizedCardRecord[], key: (card: NormalizedCardRecord) => string | undefined): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const card of cards) {
    const value = key(card) ?? "unclassified";
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function quantityIssue(args: Omit<CommonsAnalysisIssue, "required" | "available"> & { required: number; available: number }): CommonsAnalysisIssue | undefined {
  return args.available < args.required ? args : undefined;
}

export function analyzeCommonsSetupResult(args: {
  cardDb: Record<string, NormalizedCardRecord>;
  options: CommonsSetupOptions;
  result: CommonsSetupResult;
  profile?: CommonsValidationProfile;
  requestedCustomCardIds?: string[];
  randomBotUnresolved?: boolean;
}): CommonsSetupAnalysis {
  const profile = args.profile ?? "standard";
  const strict = profile === "standard";
  const issues: CommonsAnalysisIssue[] = [];
  const requested = args.options.commonsSetId === "custom" ? args.requestedCustomCardIds ?? args.options.customCommonsCardIds ?? [] : [];
  const duplicateIds = [...new Set(requested.filter((id, index) => requested.indexOf(id) !== index))];
  const selectedCards = args.result.selectedCommonsCards.map((id) => args.cardDb[id]).filter((card): card is NormalizedCardRecord => Boolean(card));
  const attachedUnrest = args.result.initialMarket.flatMap((slot) => slot.attachedUnrestCardIds);
  const populatedMarket = args.result.initialMarket.filter((slot) => slot.cardId);
  const requiredUnrestAttachments = populatedMarket.filter((slot) => canAttachUnrest(slot.cardId ? args.cardDb[slot.cardId] : undefined)).length;
  const ordinaryFame = args.result.fameDeck.filter((id) => id !== args.result.kingOfKingsCardId).length;
  const tributaryBottoms = Object.values(args.result.smallDeckBottomCards ?? {}).filter(Boolean).length;
  const counts: CommonsCompositionCounts = {
    requested: args.options.commonsSetId === "custom" ? requested.length : args.result.selectedCommonsCards.length,
    selected: args.result.selectedCommonsCards.length,
    initialMarket: populatedMarket.length,
    region: args.result.regionDeck.length,
    uncivilized: args.result.uncivilizedDeck.length,
    civilized: args.result.civilizedDeck.length,
    tributaryBottoms,
    main: args.result.mainDeck.length,
    ordinaryFame,
    specialFame: args.result.kingOfKingsCardId ? 1 : 0,
    unrestBeforeSetup: args.result.unrestPile.length + attachedUnrest.length,
    unrestAttached: attachedUnrest.length,
    unrestRemaining: args.result.unrestPile.length,
    byGroup: countBy(selectedCards, (card) => card.commonsGroup ?? "base"),
    bySuit: countBy(selectedCards, (card) => getSetupSuit(card))
  };

  for (const message of args.result.setupErrors) {
    issues.push({ code: "invalid_setup_option", severity: "blocking", category: "setup", message });
  }
  if (args.options.commonsSetId === "custom" && requested.length === 0) {
    issues.push({ code: "custom_selection_empty", severity: "blocking", category: "selection", message: "Select at least one Commons card." });
  }
  if (duplicateIds.length > 0) {
    issues.push({ code: "custom_selection_duplicate", severity: "blocking", category: "selection", message: `${duplicateIds.length} Commons card ID${duplicateIds.length === 1 ? " is" : "s are"} selected more than once.`, cardIds: duplicateIds });
  }
  if (args.result.customCommonsMissing.length > 0) {
    issues.push({ code: "custom_cards_missing", severity: "blocking", category: "selection", message: `${args.result.customCommonsMissing.length} selected Commons card${args.result.customCommonsMissing.length === 1 ? " is" : "s are"} not loaded.`, cardIds: args.result.customCommonsMissing });
  }
  if (args.result.customCommonsRejected.length > 0) {
    issues.push({ code: "custom_cards_ineligible", severity: "blocking", category: "selection", message: `${args.result.customCommonsRejected.length} selected Commons card${args.result.customCommonsRejected.length === 1 ? " is" : "s are"} ineligible for this setup.`, cardIds: args.result.customCommonsRejected });
  }

  const marketIssue = quantityIssue({ code: "initial_market_underfilled", severity: strict ? "blocking" : "advisory", category: "market", message: strict ? "The Commons pool cannot fill all five initial Market slots." : "This compact demo intentionally starts with fewer than five Market cards.", required: 5, available: counts.initialMarket });
  if (marketIssue) issues.push(marketIssue);

  if (strict) {
    const smallDeckRequired = FULL_SMALL_DECK_SIZE[args.options.effectiveCommonsPlayerCount];
    const smallDeckChecks: Array<[string, string, number]> = [
      ["region_deck_short", "Region", counts.region],
      ["uncivilized_deck_short", "Uncivilised", counts.uncivilized],
      ["civilized_deck_short", "Civilised", counts.civilized]
    ];
    for (const [code, label, available] of smallDeckChecks) {
      const issue = quantityIssue({ code, severity: "blocking", category: "small_decks", message: `${label} deck needs ${smallDeckRequired} cards after the initial Market is dealt.`, required: smallDeckRequired, available });
      if (issue) issues.push(issue);
    }
    const tributaryIssue = quantityIssue({ code: "tributary_bottoms_missing", severity: "blocking", category: "tributary", message: "Three face-up Tributary bottom cards are required.", required: 3, available: counts.tributaryBottoms });
    if (tributaryIssue) issues.push(tributaryIssue);
    const fameRequired = FULL_FAME_SIZE[args.options.playerCount] + (args.options.enabledExpansions.includes("trade_routes") ? 1 : 0);
    const fameIssue = quantityIssue({ code: "ordinary_fame_short", severity: "blocking", category: "fame", message: `Fame deck needs ${fameRequired} ordinary cards for this setup.`, required: fameRequired, available: ordinaryFame });
    if (fameIssue) issues.push(fameIssue);
    if (!args.result.kingOfKingsCardId) issues.push({ code: "special_fame_missing", severity: "blocking", category: "fame", message: "The special bottom Fame card is missing.", required: 1, available: 0 });
    const unrestIssue = quantityIssue({ code: "initial_unrest_short", severity: "blocking", category: "unrest", message: "The Unrest supply cannot cover every eligible initial Market card.", required: requiredUnrestAttachments, available: counts.unrestBeforeSetup });
    if (unrestIssue) issues.push(unrestIssue);
    if (counts.unrestAttached < requiredUnrestAttachments) {
      issues.push({ code: "initial_unrest_unattached", severity: "blocking", category: "unrest", message: "At least one eligible initial Market card is missing its setup Unrest.", required: requiredUnrestAttachments, available: counts.unrestAttached });
    }
    const setupExile = args.options.mode === "practice" ? 15 : args.options.enabledVariants.includes("short_game") ? 10 : 0;
    if (setupExile > 0 && counts.main <= setupExile) {
      issues.push({ code: args.options.mode === "practice" ? "practice_main_deck_short" : "short_game_main_deck_short", severity: "blocking", category: "main_deck", message: `Main deck needs more than ${setupExile} cards before the setup exile.`, required: setupExile + 1, available: counts.main });
    } else if (counts.main === 0) {
      issues.push({ code: "main_deck_empty", severity: "advisory", category: "main_deck", message: "The Main deck is empty after initial setup." });
    }
  } else {
    const omitted = [counts.region, counts.uncivilized, counts.civilized, counts.ordinaryFame, counts.tributaryBottoms].some((count) => count === 0);
    if (omitted) issues.push({ code: "compact_demo_composition", severity: "advisory", category: "setup", message: "This repository-owned demo uses a compact teaching composition." });
  }

  if (args.randomBotUnresolved) {
    issues.push({ code: "random_bot_pending", severity: "advisory", category: "selection", message: "Final nation-conflict validation will run after the random Bot is chosen." });
  }

  return {
    status: issues.some((issue) => issue.severity === "blocking") ? "blocked" : args.randomBotUnresolved ? "conditional" : "ready",
    profile,
    issues,
    counts,
    result: args.result,
    removals: {
      missing: [...args.result.customCommonsMissing],
      rejected: [...args.result.customCommonsRejected],
      playerCount: [...args.result.removedForPlayerCount],
      expansion: [...args.result.removedForExpansion],
      variant: [...args.result.removedForVariant],
      nationConflict: [...args.result.removedForNationConflict],
      replacements: [...args.result.replacementCardsUsed]
    }
  };
}

export function analyzeCommonsSetup(args: CommonsSetupArgs & {
  profile?: CommonsValidationProfile;
  requestedCustomCardIds?: string[];
  randomBotUnresolved?: boolean;
}): CommonsSetupAnalysis {
  const result = buildCommonsSetup({ ...args, rng: { shuffle: (items) => [...items] } });
  return analyzeCommonsSetupResult({
    cardDb: args.cardDb,
    options: args.options,
    result,
    profile: args.profile,
    requestedCustomCardIds: args.requestedCustomCardIds,
    randomBotUnresolved: args.randomBotUnresolved
  });
}

export class CommonsSetupValidationError extends Error {
  readonly code = "commons_setup_invalid";
  constructor(readonly analysis: CommonsSetupAnalysis) {
    super(analysis.issues.filter((issue) => issue.severity === "blocking").map((issue) => `${issue.code}: ${issue.message}`).join("; "));
    this.name = "CommonsSetupValidationError";
  }
}
