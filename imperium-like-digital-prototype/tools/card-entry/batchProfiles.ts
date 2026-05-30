import type { CardEntryBatchProfile } from "./cardEntryTypes";

export const commonsBatchProfiles: CardEntryBatchProfile[] = [
  {
    id: "commons-classics",
    label: "Commons > Classics",
    kind: "commons",
    ownership: "commons",
    setOrNation: "classics",
    commonsSetId: "classics",
    commonsGroup: "base",
    requiredExpansions: []
  },
  {
    id: "commons-legends",
    label: "Commons > Legends",
    kind: "commons",
    ownership: "commons",
    setOrNation: "legends",
    commonsSetId: "legends",
    commonsGroup: "base",
    requiredExpansions: []
  },
  {
    id: "commons-horizons",
    label: "Commons > Horizons",
    kind: "commons",
    ownership: "commons",
    setOrNation: "horizons",
    commonsSetId: "horizons",
    commonsGroup: "base",
    requiredExpansions: []
  },
  {
    id: "commons-trade-routes",
    label: "Commons > Trade Routes",
    kind: "commons",
    ownership: "commons",
    setOrNation: "trade_routes",
    commonsSetId: "horizons",
    commonsGroup: "trade_routes",
    requiredExpansions: ["trade_routes"],
    defaults: {
      isTradeRouteExpansion: "true",
      requiredExpansions: "trade_routes"
    }
  },
  {
    id: "commons-replacements",
    label: "Commons > Replacement Cards",
    kind: "commons",
    ownership: "commons",
    setOrNation: "replacements",
    commonsSetId: "horizons",
    commonsGroup: "replacement",
    requiredExpansions: []
  }
];

export function createNationBatchProfile(nationId: string): CardEntryBatchProfile {
  return {
    id: `nation-${nationId}`,
    label: `Nation > ${nationId}`,
    kind: "nation",
    ownership: "nation",
    setOrNation: nationId,
    commonsSetId: "",
    commonsGroup: "",
    requiredExpansions: []
  };
}
