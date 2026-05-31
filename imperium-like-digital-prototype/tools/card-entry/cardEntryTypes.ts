import type {
  CardType,
  CommonsGroup,
  CommonsOwnership,
  CommonsPlayerCountRequirement,
  CommonsSetId,
  ExpansionId,
  PrivateCardCsvRow,
  StartingLocation,
  Suit,
  VpMode
} from "../card-import/cardCsvTypes";

export type BatchProfileKind = "commons" | "nation";

export interface CardEntryBatchProfile {
  id: string;
  label: string;
  kind: BatchProfileKind;
  ownership: CommonsOwnership;
  setOrNation: string;
  commonsSetId: CommonsSetId | "";
  commonsGroup: CommonsGroup | "";
  requiredExpansions: ExpansionId[];
  defaults?: Partial<CardEntryDraft>;
}

export interface CardEntryDraft {
  cardId: string;
  sourceBox: string;
  setOrNation: string;
  privateName: string;
  publicPlaceholderName: string;
  suit: Suit | "";
  suitIcons: string;
  stateActionTokens: string;
  stateExhaustTokens: string;
  stateHandSize: string;
  cardType: CardType | "";
  stateRequirement: string;
  costMaterials: string;
  costPopulation: string;
  costProgress: string;
  costGoods: string;
  developmentCostMaterials: string;
  developmentCostPopulation: string;
  developmentCostProgress: string;
  developmentCostGoods: string;
  vpMode: VpMode;
  vpValue: string;
  vpDetailsJson: string;
  startingLocation: StartingLocation;
  playerCountRequirement: CommonsPlayerCountRequirement | "";
  ownership: CommonsOwnership;
  commonsSetId: CommonsSetId | "";
  setupBannerSuit: Suit | "";
  commonsGroup: CommonsGroup | "";
  replacementForCardId: string;
  replacementGroupId: string;
  conflictsWithNationIds: string;
  delayableInLoweredAggression: "" | "true" | "false";
  marketEligible: "" | "true" | "false";
  smallDeckEligible: "" | "true" | "false";
  mainDeckEligible: "" | "true" | "false";
  unrestPileEligible: "" | "true" | "false";
  fameDeckEligible: "" | "true" | "false";
  isTradeRouteExpansion: "true" | "false";
  rawEffectTextPrivate: string;
  effectOpsJson: string;
  tags: string;
  notes: string;
  implemented: "true" | "false";
  tested: "true" | "false";
  requiredExpansions: string;
  excludedExpansions: string;
  allowedModes: string;
  disallowedModes: string;
}

export interface DuplicateCardDraftOptions {
  includePrivateText?: boolean;
}

export type CardEntryCsvRow = PrivateCardCsvRow;
