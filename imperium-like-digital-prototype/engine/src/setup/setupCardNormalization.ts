import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { Card } from "../game/state";

function toNormalizedCost(cost: Card["cost"] | NormalizedCardRecord["cost"] | undefined): NormalizedCardRecord["cost"] {
  if (cost === undefined) return { materials: 0, population: 0, progress: 0, goods: 0 };
  return typeof cost === "number"
    ? { materials: cost, population: 0, progress: 0, goods: 0 }
    : {
      materials: cost.materials ?? 0,
      population: ("population" in cost ? cost.population : cost.influence) ?? 0,
      progress: ("progress" in cost ? cost.progress : cost.knowledge) ?? 0,
      goods: cost.goods ?? 0
    };
}

function toNormalizedDevelopmentCost(card: Card | NormalizedCardRecord): NormalizedCardRecord["developmentCost"] {
  return {
    materials: card.developmentCost?.materials ?? 0,
    population: card.developmentCost && "population" in card.developmentCost ? card.developmentCost.population : card.developmentCost?.influence ?? 0,
    progress: card.developmentCost && "progress" in card.developmentCost ? card.developmentCost.progress : card.developmentCost?.knowledge ?? 0,
    goods: card.developmentCost?.goods ?? 0
  };
}

export function normalizeSetupCardDb(cards: Record<string, Card> | Record<string, NormalizedCardRecord>): Record<string, NormalizedCardRecord> {
  return Object.fromEntries(Object.values(cards).map((card) => [card.id, {
    id: card.id,
    displayName: card.displayName,
    suit: (card as any).suit ?? "none",
    suitIcons: (card as any).suitIcons,
    stateActionTokens: (card as any).stateActionTokens,
    stateExhaustTokens: (card as any).stateExhaustTokens,
    stateHandSize: (card as any).stateHandSize,
    cardType: (card as any).cardType ?? (card as any).type ?? "action",
    cost: toNormalizedCost(card.cost),
    developmentCost: toNormalizedDevelopmentCost(card),
    vp: card.vp ?? { mode: "none", value: null },
    startingLocation: (card.startingLocation as any) ?? "market",
    isTradeRouteExpansion: (card as any).isTradeRouteExpansion ?? false,
    effects: card.effects as any,
    tags: card.tags,
    stateRequirement: (card as any).stateRequirement,
    implemented: (card as any).implemented ?? false,
    tested: (card as any).tested ?? false,
    requiredExpansions: (card as any).requiredExpansions ?? [],
    excludedExpansions: (card as any).excludedExpansions ?? [],
    allowedModes: card.allowedModes ?? ["multiplayer", "solo", "practice"],
    disallowedModes: card.disallowedModes ?? [],
    playerCountRequirement: card.playerCountRequirement,
    ownership: (card as any).ownership ?? "commons",
    commonsSetId: (card as any).commonsSetId ?? "classics",
    setupBannerSuit: (card as any).setupBannerSuit ?? (card as any).suit,
    commonsGroup: (card as any).commonsGroup ?? "base",
    marketEligible: (card as any).marketEligible,
    mainDeckEligible: (card as any).mainDeckEligible,
    replacementForCardId: (card as any).replacementForCardId,
    replacementGroupId: (card as any).replacementGroupId,
    conflictsWithNationIds: (card as any).conflictsWithNationIds,
    delayableInLoweredAggression: (card as any).delayableInLoweredAggression,
    smallDeckEligible: (card as any).smallDeckEligible,
    unrestPileEligible: (card as any).unrestPileEligible,
    fameDeckEligible: (card as any).fameDeckEligible
  }]));
}
