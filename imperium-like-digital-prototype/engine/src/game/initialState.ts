import { loadCardDbWithOptionalPrivateData } from "../cards/privateCardLoader";
import { loadNationDb } from "../nations/nationLoader";
import { createInitialGameStateFromPipeline } from "../setup/setupPipeline";
import { defaultGameOptions, type GameOptions } from "../options/gameOptions";
import type { Card, GameState } from "./state";
import { getNodeFs } from "../local/nodeBuiltins";

function hasGeneratedPrivateCoreData(args?: { privateCardPath?: string; privateNationPath?: string }): boolean {
  const fs = getNodeFs();
  if (!fs) return false;
  const cardPath = args?.privateCardPath ?? "generated-private/cards.normalized.json";
  const nationPath = args?.privateNationPath ?? "generated-private/nations.normalized.json";
  return fs.existsSync(cardPath) && fs.existsSync(nationPath);
}

export function createInitialGameState(args?: { options?: GameOptions; playerNationIds?: Record<string,string>; soloBotNationId?: string; randomSeed?: string; usePrivateData?: boolean; privateCardPath?: string; privateNationPath?: string; privateRulesetPath?: string; privateStrategyPath?: string; privateBotStateTablePath?: string; privateBotTradeRoutesTablePath?: string }): GameState {
  const options = args?.options ?? defaultGameOptions;
  const usePrivateData = args?.usePrivateData ?? hasGeneratedPrivateCoreData(args);
  const cards = loadCardDbWithOptionalPrivateData({ enabledExpansions: options.enabledExpansions, usePrivate: usePrivateData, privatePath: args?.privateCardPath });
  const nationDb = loadNationDb({ enabledExpansions: options.enabledExpansions, usePrivate: usePrivateData, privatePath: args?.privateNationPath });
  const toNormalizedCost = (cost: Card["cost"]) => typeof cost === "number"
    ? { materials: cost, population: 0, progress: 0, goods: 0 }
    : {
      materials: cost.materials ?? 0,
      population: cost.influence ?? 0,
      progress: cost.knowledge ?? 0,
      goods: cost.goods ?? 0
    };
  const toNormalizedDevelopmentCost = (c: Card) => ({
    materials: c.developmentCost?.materials ?? 0,
    population: c.developmentCost?.influence ?? 0,
    progress: c.developmentCost?.knowledge ?? 0,
    goods: c.developmentCost?.goods ?? 0
  });
  const normCards = Object.fromEntries(Object.values(cards).map((c)=>[c.id,{id:c.id,displayName:c.displayName,suit:(c as any).suit ?? "none",suitIcons:(c as any).suitIcons,cardType:(c as any).cardType ?? c.type ?? "action",cost:toNormalizedCost(c.cost),developmentCost:toNormalizedDevelopmentCost(c),vp:c.vp ?? {mode:"none",value:null},startingLocation:(c.startingLocation as any) ?? "market",isTradeRouteExpansion:false,effects:c.effects as any,tags:c.tags,stateRequirement:(c as any).stateRequirement,implemented:false,tested:false,requiredExpansions:[],allowedModes:c.allowedModes ?? ["multiplayer","solo","practice"],disallowedModes:c.disallowedModes ?? [],playerCountRequirement:c.playerCountRequirement,ownership:(c as any).ownership ?? "commons",commonsSetId:(c as any).commonsSetId ?? "classics",setupBannerSuit:(c as any).setupBannerSuit ?? (c as any).suit,commonsGroup:(c as any).commonsGroup ?? "base",marketEligible:(c as any).marketEligible,mainDeckEligible:(c as any).mainDeckEligible,replacementForCardId:(c as any).replacementForCardId,replacementGroupId:(c as any).replacementGroupId,conflictsWithNationIds:(c as any).conflictsWithNationIds,delayableInLoweredAggression:(c as any).delayableInLoweredAggression,smallDeckEligible:(c as any).smallDeckEligible,unrestPileEligible:(c as any).unrestPileEligible,fameDeckEligible:(c as any).fameDeckEligible}]));
  return createInitialGameStateFromPipeline({ options, playerNationIds: args?.playerNationIds, soloBotNationId: args?.soloBotNationId, randomSeed: args?.randomSeed, cardDb: normCards as any, nationDb, usePrivateRules: usePrivateData, privateRulesetPath: args?.privateRulesetPath, privateStrategyPath: args?.privateStrategyPath, privateBotStateTablePath: args?.privateBotStateTablePath, privateBotTradeRoutesTablePath: args?.privateBotTradeRoutesTablePath });
}
export const createInitialState = createInitialGameState;
