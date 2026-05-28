import type { GameState } from "../game/state";
import type { GameOptions } from "../options/gameOptions";
import { validateGameOptions } from "../options/optionValidation";
import { getEnabledRulesModules } from "../options/rulesModuleRegistry";
import { filterCardsByOptions } from "./deckConstruction";
import { setupMarket } from "./marketSetup";
import { setupFameDeck } from "./fameSetup";
import { setupPlayerFromNation } from "../nations/setupPlayerFromNation";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition } from "../nations/nationSchema";
import { createBotState } from "../solo/botState";

export function createInitialGameStateFromPipeline(args: { options: GameOptions; playerNationIds?: Record<string,string>; cardDb: Record<string, NormalizedCardRecord>; nationDb: Record<string, NationDefinition>; randomSeed?: string; }): GameState {
  const validation = validateGameOptions(args.options);
  const fatals = validation.issues.filter((i) => i.level === "fatal");
  if (fatals.length) throw new Error(fatals.map((f) => f.message).join("; "));
  const options = validation.options;
  const modules = getEnabledRulesModules(options);
  const filteredCards = filterCardsByOptions(Object.values(args.cardDb), options);
  const selected = args.playerNationIds ?? (options.playerCount === 1 ? {"0":"test_nation_sun_coast"} : {"0":"test_nation_sun_coast","1":"test_nation_sun_coast"});
  const players = Object.fromEntries(Object.entries(selected).map(([pid,nid])=>{
    const nation = args.nationDb[nid];
    if (!nation) throw new Error(`Nation not found: ${nid}`);
    if (nation.requiredExpansions.some((e)=>!options.enabledExpansions.includes(e))) throw new Error(`Nation ${nid} requires disabled expansion.`);
    if ((nation.excludedExpansions??[]).some((e)=>options.enabledExpansions.includes(e))) throw new Error(`Nation ${nid} excluded by enabled expansion.`);
    if (nation.disallowedModes?.includes(options.mode)) throw new Error(`Nation ${nid} disallows mode ${options.mode}.`);
    return [pid, setupPlayerFromNation({ nation, cardDb: args.cardDb, playerId: pid, shuffle: (x)=>[...x], enabledExpansions: options.enabledExpansions })];
  }));
  const setupReport = { delayedAggressiveCount:0, usedQuickSetup:false, shortGameExiled:0, shortGameNationAdvanced:0 };
  const ctx = { options, players, cards: filteredCards, setupReport };
  modules.forEach((m)=>m.modifyDeckConstruction?.(ctx as any));
  const market = setupMarket(filteredCards, options.enabledVariants.includes("quick_setup"));
  modules.forEach((m)=>m.modifyMarketSetup?.(ctx as any));
  const fame = setupFameDeck(options.enabledExpansions.includes("trade_routes"));
  modules.forEach((m)=>m.modifyFameSetup?.(ctx as any));
  modules.forEach((m)=>m.modifyPlayerSetup?.(ctx as any));
  const game: GameState = { players, cardDb: Object.fromEntries(filteredCards.map((c)=>[c.id,{id:c.id,displayName:c.displayName,type:"action",cost:0,tags:c.tags,effects:c.effects as any}])), market, sharedDiscard: [], log: [{round:1,playerId:"setup",message:`Setup report delayed=${setupReport.delayedAggressiveCount}`},{round:1,playerId:"setup",message:`Fame cards: ${fame.length}`}], round: 1, options, setupReport } as any;
  if (options.mode === "practice") (game as any).practiceClock = { turnsRemaining: 12, progressTokens: 0 };
  if (options.mode === "solo") (game as any).solo = { bot: createBotState(options.soloDifficulty ?? "chieftain"), difficulty: options.soloDifficulty ?? "chieftain" };
  return game;
}
