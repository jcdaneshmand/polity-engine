import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { CommonsValidationProfile } from "./commonsAnalysis";

const PUBLIC_FICTIONAL_COMMONS_SIGNATURES = [
  "fixture_market_acquire|civilized|action|market|custom|base|true|true|true|false|fixture_acquire,fixture_market",
  "fixture_market_history|civilized|in_play|market|custom|base|true|true|true|false|fixture_history,fixture_market",
  "fixture_market_knowledge|civilized|action|market|custom|base|true|true|true|false|fixture_market",
  "fixture_market_materials|uncivilized|action|market|custom|base|true|true|true|false|fixture_market",
  "fixture_market_unrest|uncivilized|action|market|custom|base|true|true|true|false|fixture_market,fixture_unrest_flow",
  "fixture_unrest|unrest|unrest|unrest_pile|custom|base|false|false|true|true|fixture_unrest"
];

function compositionSignature(card: NormalizedCardRecord): string {
  return [
    card.id,
    card.suit,
    card.cardType,
    card.startingLocation,
    card.commonsSetId,
    card.commonsGroup ?? "base",
    card.marketEligible === true,
    card.mainDeckEligible === true,
    card.smallDeckEligible !== false,
    card.unrestPileEligible === true,
    [...(card.tags ?? [])].sort().join(",")
  ].join("|");
}

export function getCommonsValidationProfile(args: { usePrivateData: boolean; cards: Record<string, NormalizedCardRecord> }): CommonsValidationProfile {
  if (!args.usePrivateData) return "builtin_demo";
  const signatures = Object.values(args.cards)
    .filter((card) => card.ownership === "commons" && card.commonsGroup !== "replacement")
    .map(compositionSignature)
    .sort();
  if (signatures.length === PUBLIC_FICTIONAL_COMMONS_SIGNATURES.length && signatures.every((signature, index) => signature === PUBLIC_FICTIONAL_COMMONS_SIGNATURES[index])) return "fictional_demo";
  return "standard";
}
