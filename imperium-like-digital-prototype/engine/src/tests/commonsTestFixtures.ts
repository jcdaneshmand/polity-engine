import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition } from "../nations/nationSchema";
import type { CommonsSetupOptions } from "../setup/commonsTypes";

export function card(overrides: Partial<NormalizedCardRecord> & { id: string }): NormalizedCardRecord {
  return {
    id: overrides.id,
    displayName: overrides.displayName ?? `Placeholder ${overrides.id}`,
    suit: overrides.suit ?? "none",
    suitIcons: overrides.suitIcons,
    stateActionTokens: overrides.stateActionTokens,
    stateExhaustTokens: overrides.stateExhaustTokens,
    stateHandSize: overrides.stateHandSize,
    cardType: overrides.cardType ?? "action",
    cost: overrides.cost ?? { materials: 0, population: 0, progress: 0, goods: 0 },
    developmentCost: overrides.developmentCost ?? { materials: 0, population: 0, progress: 0, goods: 0 },
    vp: overrides.vp ?? { mode: "none", value: null },
    startingLocation: overrides.startingLocation ?? "market",
    playerCountRequirement: overrides.playerCountRequirement,
    ownership: overrides.ownership ?? "commons",
    commonsSetId: overrides.commonsSetId ?? "classics",
    setupBannerSuit: overrides.setupBannerSuit,
    commonsGroup: overrides.commonsGroup ?? "base",
    replacementForCardId: overrides.replacementForCardId,
    replacementGroupId: overrides.replacementGroupId,
    conflictsWithNationIds: overrides.conflictsWithNationIds,
    delayableInLoweredAggression: overrides.delayableInLoweredAggression,
    marketEligible: overrides.marketEligible,
    smallDeckEligible: overrides.smallDeckEligible,
    mainDeckEligible: overrides.mainDeckEligible,
    unrestPileEligible: overrides.unrestPileEligible,
    fameDeckEligible: overrides.fameDeckEligible,
    isTradeRouteExpansion: overrides.isTradeRouteExpansion ?? false,
    rawEffectTextPrivate: overrides.rawEffectTextPrivate,
    effects: overrides.effects ?? [],
    stateRequirement: overrides.stateRequirement,
    tags: overrides.tags ?? [],
    notes: overrides.notes,
    implemented: overrides.implemented ?? false,
    tested: overrides.tested ?? false,
    requiredExpansions: overrides.requiredExpansions ?? [],
    excludedExpansions: overrides.excludedExpansions ?? [],
    allowedModes: overrides.allowedModes,
    disallowedModes: overrides.disallowedModes
  };
}

export function options(overrides: Partial<CommonsSetupOptions> = {}): CommonsSetupOptions {
  return {
    commonsSetId: "classics",
    playerCount: 2,
    effectiveCommonsPlayerCount: 2,
    enabledExpansions: [],
    enabledVariants: [],
    selectedNationIds: [],
    replacementPolicy: "use_replacements",
    ...overrides
  };
}

export function cardDb(cards: NormalizedCardRecord[]): Record<string, NormalizedCardRecord> {
  return Object.fromEntries(cards.map((c) => [c.id, c]));
}

export const nationDb: Record<string, NationDefinition> = {
  test_nation_alpha: {
    id: "test_nation_alpha",
    displayName: "Placeholder Nation Alpha",
    powerCardIds: [],
    stateCardIds: [],
    startingDeckCardIds: [],
    nationDeckCardIds: [],
    developmentCardIds: [],
    setupRules: [],
    passiveRules: [],
    actionTokensBase: 3,
    exhaustTokensBase: 0,
    requiredExpansions: [],
    implemented: false,
    tested: false
  }
};
