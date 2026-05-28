import type { GameState } from "../game/state";
import type { GameOptions } from "../options/gameOptions";
import { validateGameOptions } from "../options/optionValidation";
import { getEnabledRulesModules } from "../options/rulesModuleRegistry";
import { filterCardsByOptions } from "./deckConstruction";
import { buildCommonsSetup } from "./commonsSetup";
import { setupPlayerFromNation } from "../nations/setupPlayerFromNation";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition } from "../nations/nationSchema";
import { createBotState } from "../solo/botState";
import { loadNationRulesets } from "../nations/nationRulesetLoader";
import { loadNationStrategyProfiles } from "../nations/nationStrategyLoader";
import { getNationRuleset, validateNationRulesetCompatibility } from "../nations/nationRulesetRegistry";
import { applySetupOverrides } from "../nations/nationSetupOverrides";
import type { NationRulesetApplicationReport } from "../nations/nationRulesetTypes";

export function createInitialGameStateFromPipeline(args: { options: GameOptions; playerNationIds?: Record<string,string>; cardDb: Record<string, NormalizedCardRecord>; nationDb: Record<string, NationDefinition>; randomSeed?: string; usePrivateRules?: boolean; privateRulesetPath?: string; privateStrategyPath?: string; }): GameState {
  const validation = validateGameOptions(args.options);
  const fatals = validation.issues.filter((i) => i.level === "fatal");
  if (fatals.length) throw new Error(fatals.map((f) => f.message).join("; "));
  const options = validation.options;
  const modules = getEnabledRulesModules(options);
  const filteredCards = filterCardsByOptions(Object.values(args.cardDb), options);
  const defaultSelected = Object.fromEntries(
    Array.from({ length: options.playerCount }, (_, i) => [String(i), "test_nation_sun_coast"])
  ) as Record<string, string>;
  const selected = { ...defaultSelected, ...(args.playerNationIds ?? {}) };
  const rulesetDb = loadNationRulesets({ usePrivate: args.usePrivateRules, privatePath: args.privateRulesetPath });
  const strategyDb = loadNationStrategyProfiles({ usePrivate: args.usePrivateRules, privatePath: args.privateStrategyPath });
  const activeNationRulesets: Record<string, any> = {};
  const activeNationStrategyProfiles: Record<string, any> = {};
  const rulesetReports: NationRulesetApplicationReport[] = [];
  const players = Object.fromEntries(Object.entries(selected).map(([pid,nid])=>{
    const nation = args.nationDb[nid];
    if (!nation) throw new Error(`Nation not found: ${nid}`);
    if (nation.requiredExpansions.some((e)=>!options.enabledExpansions.includes(e))) throw new Error(`Nation ${nid} requires disabled expansion.`);
    if ((nation.excludedExpansions??[]).some((e)=>options.enabledExpansions.includes(e))) throw new Error(`Nation ${nid} excluded by enabled expansion.`);
    if (nation.disallowedModes?.includes(options.mode)) throw new Error(`Nation ${nid} disallows mode ${options.mode}.`);
    const ruleset = getNationRuleset(rulesetDb, nid) ?? { nationId: nid, displayName: nation.displayName, rulesetTags:["default_nation_deck"], requiredExpansions:[], setupOverrides:[], zoneOverrides:[], stateOverrides:[], reshuffleOverrides:[], cleanupOverrides:[], solsticeOverrides:[], scoringOverrides:[], collapseOverrides:[], botOverrides:[], shortGameOverrides:[], hookRules:[], implemented:false, tested:false };
    const compat = validateNationRulesetCompatibility(nation, ruleset, options);
    if (compat.length) throw new Error(`Ruleset incompatibility for ${nid}: ${compat.join(", ")}`);
    const player = setupPlayerFromNation({ nation, cardDb: args.cardDb, playerId: pid, shuffle: (x)=>[...x], enabledExpansions: options.enabledExpansions });
    applySetupOverrides(player, ruleset);
    activeNationRulesets[pid] = ruleset;
    if (strategyDb[nid]) activeNationStrategyProfiles[pid] = strategyDb[nid];
    rulesetReports.push({ playerId: pid, nationId: nid, appliedTags: ruleset.rulesetTags, appliedOverrides: ruleset.setupOverrides.map((x:any)=>x.op), warnings: [] });
    return [pid, player];
  }));
  const setupReport = { delayedAggressiveCount:0, usedQuickSetup:false, shortGameExiled:0, shortGameNationAdvanced:0 };
  const ctx = { options, players, cards: filteredCards, setupReport };
  modules.forEach((m)=>m.modifyDeckConstruction?.(ctx as any));
  const effectiveCommonsPlayerCount = options.mode === "multiplayer" ? (options.playerCount as 2|3|4) : 2;
  const commonsSetup = buildCommonsSetup({ cardDb: args.cardDb, nationDb: args.nationDb, options: { commonsSetId: options.commonsSetId, playerCount: options.playerCount, effectiveCommonsPlayerCount, enabledExpansions: options.enabledExpansions, enabledVariants: options.enabledVariants, selectedNationIds: Object.values(selected), replacementPolicy: options.replacementPolicy }, rng: Math.random });
  const market = commonsSetup.initialMarket.map((s) => s.cardId).filter(Boolean) as string[];
  modules.forEach((m)=>m.modifyMarketSetup?.(ctx as any));
  const fame = commonsSetup.fameDeck;
  modules.forEach((m)=>m.modifyFameSetup?.(ctx as any));
  modules.forEach((m)=>m.modifyPlayerSetup?.(ctx as any));
  const game: GameState = { players, cardDb: Object.fromEntries(filteredCards.map((c)=>[c.id,{id:c.id,displayName:c.displayName,type:"action",cost:c.cost.materials + c.cost.population + c.cost.progress + c.cost.goods,tags:c.tags,effects:c.effects as any}])), market, sharedDiscard: [], log: [{round:1,playerId:"setup",message:`Setup report delayed=${commonsSetup.delayedCards.length}`},{round:1,playerId:"setup",message:`Fame cards: ${fame.length}`}], round: 1, options, setupReport: { ...setupReport, delayedAggressiveCount: commonsSetup.delayedCards.length, usedQuickSetup: commonsSetup.constructionPath === "quick_setup" }, commonsSetup, activeNationRulesets, activeNationStrategyProfiles, rulesetReports } as any;
  if (options.mode === "practice") (game as any).practiceClock = { turnsRemaining: 12, progressTokens: 0 };
  if (options.mode === "solo") (game as any).solo = { bot: createBotState(options.soloDifficulty ?? "chieftain"), difficulty: options.soloDifficulty ?? "chieftain" };
  return game;
}
