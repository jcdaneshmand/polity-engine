import type { GameState } from "../game/state";
import type { GameOptions } from "../options/gameOptions";
import { validateGameOptions } from "../options/optionValidation";
import { getEnabledRulesModules } from "../options/rulesModuleRegistry";
import { filterCardsByOptions } from "./deckConstruction";
import { buildCommonsSetup } from "./commonsSetup";
import { setupFameDeck } from "./fameSetup";
import { setupPlayerFromNation } from "../nations/setupPlayerFromNation";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition } from "../nations/nationSchema";
import { setupSoloBot } from "../solo/botSetup";
import { loadBotStateTables } from "../solo/botStateTableLoader";
import { loadNationRulesets } from "../nations/nationRulesetLoader";
import { loadNationStrategyProfiles } from "../nations/nationStrategyLoader";
import { getNationRuleset, validateNationRulesetCompatibility } from "../nations/nationRulesetRegistry";
import { applySetupOverrides } from "../nations/nationSetupOverrides";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import type { NationRulesetApplicationReport } from "../nations/nationRulesetTypes";

function buildGameCardDb(cards: NormalizedCardRecord[]): GameState["cardDb"] {
  return Object.fromEntries(filteredCardEntries(cards)) as GameState["cardDb"];
}

function filteredCardEntries(cards: NormalizedCardRecord[]) {
  return cards.map((c) => [c.id, {
    id: c.id,
    displayName: c.displayName,
    type: c.cardType as any,
    cardType: c.cardType as any,
    suit: c.suit as any,
    cost: c.cost.materials + c.cost.population + c.cost.progress + c.cost.goods,
    tags: c.tags,
    effects: c.effects as any,
    allowedModes: c.allowedModes,
    disallowedModes: c.disallowedModes,
    playerCountRequirement: c.playerCountRequirement,
    startingLocation: c.startingLocation
  }] as const);
}

function mergeCardsById(baseCards: NormalizedCardRecord[], sourceCards: Record<string, NormalizedCardRecord>, cardIds: string[]) {
  const byId = new Map(baseCards.map((card) => [card.id, card]));
  for (const cardId of cardIds) {
    const card = sourceCards[cardId];
    if (card) byId.set(cardId, card);
  }
  return [...byId.values()];
}

function isRuntimeBaseCard(card: NormalizedCardRecord): boolean {
  return card.ownership !== "commons" && card.ownership !== "replacement";
}

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
  const setupReport: NonNullable<GameState["setupReport"]> = { delayedAggressiveCount:0, usedQuickSetup:false, shortGameExiled:0, shortGameNationAdvanced:0 };
  const players: GameState["players"] = {};
  const game: GameState = {
    players,
    cardDb: buildGameCardDb(filteredCards),
    market: [],
    sharedDiscard: [],
    log: [],
    round: 1,
    options,
    setupReport,
    activeNationRulesets,
    activeNationStrategyProfiles,
    rulesetReports
  } as any;

  for (const [pid, nid] of Object.entries(selected)) {
    const nation = args.nationDb[nid];
    if (!nation) throw new Error(`Nation not found: ${nid}`);
    if (nation.requiredExpansions.some((e)=>!options.enabledExpansions.includes(e))) throw new Error(`Nation ${nid} requires disabled expansion.`);
    if ((nation.excludedExpansions??[]).some((e)=>options.enabledExpansions.includes(e))) throw new Error(`Nation ${nid} excluded by enabled expansion.`);
    if (nation.disallowedModes?.includes(options.mode)) throw new Error(`Nation ${nid} disallows mode ${options.mode}.`);
    const ruleset = getNationRuleset(rulesetDb, nid) ?? { nationId: nid, displayName: nation.displayName, rulesetTags:["default_nation_deck"], requiredExpansions:[], setupOverrides:[], zoneOverrides:[], stateOverrides:[], reshuffleOverrides:[], cleanupOverrides:[], solsticeOverrides:[], scoringOverrides:[], collapseOverrides:[], botOverrides:[], shortGameOverrides:[], hookRules:[], implemented:false, tested:false };
    const compat = validateNationRulesetCompatibility(nation, ruleset, options);
    if (compat.length) throw new Error(`Ruleset incompatibility for ${nid}: ${compat.join(", ")}`);
    const player = setupPlayerFromNation({ nation, cardDb: args.cardDb, playerId: pid, shuffle: (x)=>[...x], enabledExpansions: options.enabledExpansions });
    players[pid] = player;
    activeNationRulesets[pid] = ruleset;
    if (strategyDb[nid]) activeNationStrategyProfiles[pid] = strategyDb[nid];

    runNationHooks({ G: game, playerId: pid, trigger: "before_setup_player" });
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
    runNationHooks({ G: game, playerId: pid, trigger: "after_setup_player" });
    rulesetReports.push({ playerId: pid, nationId: nid, appliedTags: ruleset.rulesetTags, appliedOverrides: ruleset.setupOverrides.map((x:any)=>x.op), warnings: [] });
  }

  const ctx = { options, players, cards: filteredCards, setupReport };
  modules.forEach((m)=>m.modifyDeckConstruction?.(ctx as any));
  game.cardDb = buildGameCardDb(filteredCards);
  const selectedNationIds = Object.values(selected);
  const effectiveCommonsPlayerCount = options.mode === "solo" || options.mode === "practice" ? 2 : options.playerCount;
  const commonsSetup = buildCommonsSetup({
    cardDb: args.cardDb,
    nationDb: args.nationDb,
    options: {
      commonsSetId: options.commonsSetId ?? "classics",
      playerCount: options.playerCount,
      effectiveCommonsPlayerCount: effectiveCommonsPlayerCount as 2 | 3 | 4,
      enabledExpansions: options.enabledExpansions,
      enabledVariants: options.enabledVariants,
      mode: options.mode,
      selectedNationIds,
      replacementPolicy: options.replacementPolicy ?? "use_replacements"
    },
    rng: { shuffle: (items) => [...items] }
  });
  setupReport.commonsSetup = commonsSetup;
  setupReport.delayedAggressiveCount = Math.max(setupReport.delayedAggressiveCount, commonsSetup.delayedCards.length);
  setupReport.usedQuickSetup = options.enabledVariants.includes("quick_setup");
  game.cardDb = buildGameCardDb(mergeCardsById(filteredCards.filter(isRuntimeBaseCard), args.cardDb, commonsSetup.selectedCommonsCards));
  game.marketSlots = commonsSetup.initialMarket;
  game.market = commonsSetup.initialMarket.map((slot) => slot.cardId).filter(Boolean) as string[];
  modules.forEach((m)=>m.modifyMarketSetup?.(ctx as any));
  const fame = commonsSetup.fameDeck.length ? commonsSetup.fameDeck : setupFameDeck(options.enabledExpansions.includes("trade_routes"));
  modules.forEach((m)=>m.modifyFameSetup?.(ctx as any));
  modules.forEach((m)=>m.modifyPlayerSetup?.(ctx as any));
  game.log.push({round:1,playerId:"setup",message:`Setup report delayed=${setupReport.delayedAggressiveCount}`},{round:1,playerId:"setup",message:`Fame cards: ${fame.length}`});
  commonsSetup.setupWarnings.forEach((message) => game.log.push({ round: 1, playerId: "setup", message }));
  game.log.push({ round: 1, playerId: "setup", message: `MarketInitialized(slots=${commonsSetup.initialMarket.length})` });
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
    const botStateTables = loadBotStateTables();
    const botRuleset = Object.values(activeNationRulesets)[0] as any;
    const bot = setupSoloBot({ botNation: Object.values(args.nationDb)[0] as any, botRuleset, cardDb: game.cardDb as any, botStateTables, options, shuffle: (x)=>[...x] });
    (game as any).solo = { bot, botStateTables };
  }
  return game;
}
