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
import { loadNationRulesets } from "../nations/nationRulesetLoader";
import { loadNationStrategyProfiles } from "../nations/nationStrategyLoader";
import { getNationRuleset, validateNationRulesetCompatibility } from "../nations/nationRulesetRegistry";
import { applySetupOverrides } from "../nations/nationSetupOverrides";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
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
    const setupHookGame = { players: { [pid]: player }, options, activeNationRulesets: { [pid]: ruleset }, log: [], round: 1 } as any;
    runNationHooks({ G: setupHookGame, playerId: pid, trigger: "before_setup_player" });
    applySetupOverrides(player, ruleset);
    for (const ov of ruleset.zoneOverrides) {
      if (ov.op === "create_zone") {
        player.sideAreas ??= {};
        player.sideAreas[ov.zoneId] ??= [];
      }
    }
    for (const ov of ruleset.stateOverrides) {
      if (ov.op === "start_as_state" && !player.stateArea.includes(ov.state)) player.stateArea.unshift(ov.state);
    }
    if (options.enabledVariants.includes("short_game")) {
      for (const ov of ruleset.shortGameOverrides) {
        if (ov.op === "add_nation_cards_to_discard") player.discard.push(...player.nationDeck.splice(0, ov.count));
      }
    }
    runNationHooks({ G: setupHookGame, playerId: pid, trigger: "after_setup_player" });
    activeNationRulesets[pid] = ruleset;
    if (strategyDb[nid]) activeNationStrategyProfiles[pid] = strategyDb[nid];
    rulesetReports.push({ playerId: pid, nationId: nid, appliedTags: ruleset.rulesetTags, appliedOverrides: ruleset.setupOverrides.map((x:any)=>x.op), warnings: [] });
    return [pid, player];
  }));
  const setupReport = { delayedAggressiveCount:0, usedQuickSetup:false, shortGameExiled:0, shortGameNationAdvanced:0 };
  const ctx = { options, players, cards: filteredCards, setupReport };
  modules.forEach((m)=>m.modifyDeckConstruction?.(ctx as any));
  const market = setupMarket(filteredCards, options.enabledVariants.includes("quick_setup"));
  modules.forEach((m)=>m.modifyMarketSetup?.(ctx as any));
  const fame = setupFameDeck(options.enabledExpansions.includes("trade_routes"));
  modules.forEach((m)=>m.modifyFameSetup?.(ctx as any));
  modules.forEach((m)=>m.modifyPlayerSetup?.(ctx as any));
  const game: GameState = { players, cardDb: Object.fromEntries(filteredCards.map((c)=>[c.id,{id:c.id,displayName:c.displayName,type:"action",cost:c.cost.materials + c.cost.population + c.cost.progress + c.cost.goods,tags:c.tags,effects:c.effects as any}])), market, sharedDiscard: [], log: [{round:1,playerId:"setup",message:`Setup report delayed=${setupReport.delayedAggressiveCount}`},{round:1,playerId:"setup",message:`Fame cards: ${fame.length}`}], round: 1, options, setupReport, activeNationRulesets, activeNationStrategyProfiles, rulesetReports } as any;
  Object.entries(activeNationRulesets).forEach(([playerId, ruleset]) => {
    (ruleset.zoneOverrides ?? []).forEach((ov:any) => game.log.push({ round: game.round, playerId, message: `NationRulesetApplied(${ruleset.nationId}/zone/${ov.op})` }));
    (ruleset.stateOverrides ?? []).forEach((ov:any) => game.log.push({ round: game.round, playerId, message: `NationRulesetApplied(${ruleset.nationId}/state/${ov.op})` }));
    if (options.enabledVariants.includes("short_game")) {
      (ruleset.shortGameOverrides ?? []).forEach((ov:any) => {
        if (ov.op === "custom_short_game_setup") runEffects({ G: game, playerId, enabledExpansions: game.options?.enabledExpansions }, ov.effect as any);
        game.log.push({ round: game.round, playerId, message: `NationRulesetApplied(${ruleset.nationId}/short_game/${ov.op})` });
      });
    }
    if (options.mode === "solo") (ruleset.botOverrides ?? []).forEach((ov:any) => game.log.push({ round: game.round, playerId, message: `NationRulesetApplied(${ruleset.nationId}/bot/${ov.op})` }));
  });
  if (options.mode === "practice") (game as any).practiceClock = { turnsRemaining: 12, progressTokens: 0 };
  if (options.mode === "solo") {
    const difficulty = options.soloDifficulty ?? "chieftain";
    const skipDefaultDynasty = Object.values(activeNationRulesets).some((ruleset: any) => (ruleset.botOverrides ?? []).some((ov: any) => ov.op === "skip_default_dynasty_setup"));
    const bot = skipDefaultDynasty
      ? { botId: "bot_0", botDeck: [], botDiscard: [], botStateCards: [], difficulty, resources: { goods: 0 }, log: [] }
      : createBotState(difficulty);
    (game as any).solo = { bot, difficulty };
  }
  return game;
}
