import { loadCardDbWithOptionalPrivateData } from "../cards/privateCardLoader";
import { loadNationDb } from "../nations/nationLoader";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { defaultGameOptions, type GameOptions } from "../options/gameOptions";
import type { Card, GameState } from "./state";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import { getNodeFs } from "../local/nodeBuiltins";
import type { PrivateDataBundle } from "../setup/privateDataBundle";
import { recordById } from "../setup/privateDataBundle";
import { getCommonsValidationProfile } from "../setup/registeredCommonsProfile";
import { normalizeSetupCardDb } from "../setup/setupCardNormalization";

function hasGeneratedPrivateCoreData(args?: { privateCardPath?: string; privateNationPath?: string }): boolean {
  const fs = getNodeFs();
  if (!fs) return false;
  const cardPath = args?.privateCardPath ?? "generated-private/cards.normalized.json";
  const nationPath = args?.privateNationPath ?? "generated-private/nations.normalized.json";
  return fs.existsSync(cardPath) && fs.existsSync(nationPath);
}

export function createInitialGameState(args?: { options?: GameOptions; playerNationIds?: Record<string,string>; soloBotNationId?: string; randomSeed?: string; usePrivateData?: boolean; privateData?: PrivateDataBundle; privateCardPath?: string; privateNationPath?: string; privateRulesetPath?: string; privateStrategyPath?: string; privateBotStateTablePath?: string; privateBotTradeRoutesTablePath?: string; enforceCommonsValidation?: boolean }): GameState {
  const options = args?.options ?? defaultGameOptions;
  const hasUploadedPrivateData = Boolean(args?.privateData);
  const usePrivateData = args?.usePrivateData ?? (hasUploadedPrivateData || hasGeneratedPrivateCoreData(args));
  const cards: Record<string, Card> | Record<string, NormalizedCardRecord> = args?.privateData?.cards
    ? recordById(args.privateData.cards, (card) => card.id)!
    : loadCardDbWithOptionalPrivateData({ enabledExpansions: options.enabledExpansions, usePrivate: usePrivateData, privatePath: args?.privateCardPath });
  const nationDb = args?.privateData?.nations
    ? recordById(args.privateData.nations, (nation) => nation.id)!
    : loadNationDb({ enabledExpansions: options.enabledExpansions, usePrivate: usePrivateData, privatePath: args?.privateNationPath });
  const normCards = args?.privateData?.cards
    ? recordById(args.privateData.cards, (card) => card.id)!
    : normalizeSetupCardDb(cards);
  return createInitialGameStateFromPipeline({ options, playerNationIds: args?.playerNationIds, soloBotNationId: args?.soloBotNationId, randomSeed: args?.randomSeed, cardDb: normCards as any, nationDb, usePrivateRules: usePrivateData, privateData: args?.privateData, privateRulesetPath: args?.privateRulesetPath, privateStrategyPath: args?.privateStrategyPath, privateBotStateTablePath: args?.privateBotStateTablePath, privateBotTradeRoutesTablePath: args?.privateBotTradeRoutesTablePath, commonsValidationProfile: args?.enforceCommonsValidation ? getCommonsValidationProfile({ usePrivateData, cards: normCards as Record<string, NormalizedCardRecord> }) : undefined });
}
export function createInitialState(args?: Parameters<typeof createInitialGameState>[0]): GameState {
  const G = createInitialGameState({ ...args, usePrivateData: args?.usePrivateData ?? false });
  for (const player of Object.values(G.players)) {
    player.deck = [...player.hand, ...player.deck];
    player.hand = [];
    player.resources = { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 };
  }
  return G;
}
