import { loadCardDbWithOptionalPrivateData } from "../cards/privateCardLoader";
import { loadNationDb } from "../nations/nationLoader";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { defaultGameOptions, type GameOptions } from "../options/gameOptions";
import type { Card, GameState } from "./state";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import { getNodeFs } from "../local/nodeBuiltins";
import type { PrivateDataBundle } from "../setup/privateDataBundle";
import { recordById } from "../setup/privateDataBundle";

function hasGeneratedPrivateCoreData(args?: { privateCardPath?: string; privateNationPath?: string }): boolean {
  const fs = getNodeFs();
  if (!fs) return false;
  const cardPath = args?.privateCardPath ?? "generated-private/cards.normalized.json";
  const nationPath = args?.privateNationPath ?? "generated-private/nations.normalized.json";
  return fs.existsSync(cardPath) && fs.existsSync(nationPath);
}

export function createInitialGameState(args?: { options?: GameOptions; playerNationIds?: Record<string,string>; soloBotNationId?: string; randomSeed?: string; usePrivateData?: boolean; privateData?: PrivateDataBundle; privateCardPath?: string; privateNationPath?: string; privateRulesetPath?: string; privateStrategyPath?: string; privateBotStateTablePath?: string; privateBotTradeRoutesTablePath?: string }): GameState {
  const options = args?.options ?? defaultGameOptions;
  const hasUploadedPrivateData = Boolean(args?.privateData);
  const usePrivateData = args?.usePrivateData ?? (hasUploadedPrivateData || hasGeneratedPrivateCoreData(args));
  const cards: Record<string, Card> | Record<string, NormalizedCardRecord> = args?.privateData?.cards
    ? recordById(args.privateData.cards, (card) => card.id)!
    : loadCardDbWithOptionalPrivateData({ enabledExpansions: options.enabledExpansions, usePrivate: usePrivateData, privatePath: args?.privateCardPath });
  const nationDb = args?.privateData?.nations
    ? recordById(args.privateData.nations, (nation) => nation.id)!
    : loadNationDb({ enabledExpansions: options.enabledExpansions, usePrivate: usePrivateData, privatePath: args?.privateNationPath });
  const toNormalizedCost = (cost: Card["cost"] | NormalizedCardRecord["cost"]) => typeof cost === "number"
    ? { materials: cost, population: 0, progress: 0, goods: 0 }
    : {
      materials: cost.materials ?? 0,
      population: ("population" in cost ? cost.population : cost.influence) ?? 0,
      progress: ("progress" in cost ? cost.progress : cost.knowledge) ?? 0,
      goods: cost.goods ?? 0
    };
  const toNormalizedDevelopmentCost = (c: Card | NormalizedCardRecord) => ({
    materials: c.developmentCost?.materials ?? 0,
    population: c.developmentCost && "population" in c.developmentCost ? c.developmentCost.population : c.developmentCost?.influence ?? 0,
    progress: c.developmentCost && "progress" in c.developmentCost ? c.developmentCost.progress : c.developmentCost?.knowledge ?? 0,
    goods: c.developmentCost?.goods ?? 0
  });
  const normCards = args?.privateData?.cards
    ? recordById(args.privateData.cards, (card) => card.id)!
    : Object.fromEntries(Object.values(cards).map((c)=>[c.id,{id:c.id,displayName:c.displayName,suit:(c as any).suit ?? "none",suitIcons:(c as any).suitIcons,cardType:(c as any).cardType ?? (c as any).type ?? "action",cost:toNormalizedCost(c.cost),developmentCost:toNormalizedDevelopmentCost(c),vp:c.vp ?? {mode:"none",value:null},startingLocation:(c.startingLocation as any) ?? "market",isTradeRouteExpansion:(c as any).isTradeRouteExpansion ?? false,effects:c.effects as any,tags:c.tags,stateRequirement:(c as any).stateRequirement,implemented:(c as any).implemented ?? false,tested:(c as any).tested ?? false,requiredExpansions:(c as any).requiredExpansions ?? [],excludedExpansions:(c as any).excludedExpansions ?? [],allowedModes:c.allowedModes ?? ["multiplayer","solo","practice"],disallowedModes:c.disallowedModes ?? [],playerCountRequirement:c.playerCountRequirement,ownership:(c as any).ownership ?? "commons",commonsSetId:(c as any).commonsSetId ?? "classics",setupBannerSuit:(c as any).setupBannerSuit ?? (c as any).suit,commonsGroup:(c as any).commonsGroup ?? "base",marketEligible:(c as any).marketEligible,mainDeckEligible:(c as any).mainDeckEligible,replacementForCardId:(c as any).replacementForCardId,replacementGroupId:(c as any).replacementGroupId,conflictsWithNationIds:(c as any).conflictsWithNationIds,delayableInLoweredAggression:(c as any).delayableInLoweredAggression,smallDeckEligible:(c as any).smallDeckEligible,unrestPileEligible:(c as any).unrestPileEligible,fameDeckEligible:(c as any).fameDeckEligible}]));
  return createInitialGameStateFromPipeline({ options, playerNationIds: args?.playerNationIds, soloBotNationId: args?.soloBotNationId, randomSeed: args?.randomSeed, cardDb: normCards as any, nationDb, usePrivateRules: usePrivateData, privateData: args?.privateData, privateRulesetPath: args?.privateRulesetPath, privateStrategyPath: args?.privateStrategyPath, privateBotStateTablePath: args?.privateBotStateTablePath, privateBotTradeRoutesTablePath: args?.privateBotTradeRoutesTablePath });
}
export function createInitialState(args?: Parameters<typeof createInitialGameState>[0]): GameState {
  const G = createInitialGameState({ ...args, usePrivateData: args?.usePrivateData ?? false });
  for (const player of Object.values(G.players)) {
    player.deck = [...player.hand, ...player.deck];
    player.hand = [];
  }
  return G;
}
