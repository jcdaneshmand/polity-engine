import type { Card, GameState, ResourceName } from "../game/state";
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
import { loadBotTradeRoutesTables } from "../solo/botTradeRoutesTableLoader";
import { loadNationRulesets } from "../nations/nationRulesetLoader";
import { loadNationStrategyProfiles } from "../nations/nationStrategyLoader";
import { getNationRuleset, validateNationRulesetCompatibility } from "../nations/nationRulesetRegistry";
import { applySetupOverrides } from "../nations/nationSetupOverrides";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import type { NationHookTrigger, NationRuleset, NationRulesetApplicationReport } from "../nations/nationRulesetTypes";
import { activateState } from "../game/stateMatching";

function buildGameCardDb(cards: NormalizedCardRecord[]): GameState["cardDb"] {
  return Object.fromEntries(filteredCardEntries(cards)) as GameState["cardDb"];
}

function mapResourceCost(cost: NormalizedCardRecord["developmentCost"]): Partial<Record<ResourceName, number>> {
  return {
    materials: cost.materials,
    influence: cost.population,
    knowledge: cost.progress,
    goods: cost.goods
  };
}

function mapAcquireCost(cost: NormalizedCardRecord["cost"]): Card["cost"] {
  return cost.population === 0 && cost.progress === 0 && cost.goods === 0
    ? cost.materials
    : mapResourceCost(cost);
}

function filteredCardEntries(cards: NormalizedCardRecord[]) {
  return cards.map((c) => [c.id, {
    id: c.id,
    displayName: c.displayName,
    type: c.cardType as any,
    cardType: c.cardType as any,
    suit: c.suit as any,
    suitIcons: c.suitIcons as any,
    vp: c.vp,
    cost: mapAcquireCost(c.cost),
    developmentCost: mapResourceCost(c.developmentCost),
    tags: c.tags,
    effects: c.effects as any,
    stateRequirement: c.stateRequirement,
    allowedModes: c.allowedModes,
    disallowedModes: c.disallowedModes,
    playerCountRequirement: c.playerCountRequirement,
    startingLocation: c.startingLocation,
    ownership: c.ownership,
    commonsSetId: c.commonsSetId,
    setupBannerSuit: c.setupBannerSuit as any,
    commonsGroup: c.commonsGroup,
    replacementForCardId: c.replacementForCardId,
    replacementGroupId: c.replacementGroupId,
    conflictsWithNationIds: c.conflictsWithNationIds,
    delayableInLoweredAggression: c.delayableInLoweredAggression,
    marketEligible: c.marketEligible,
    smallDeckEligible: c.smallDeckEligible,
    mainDeckEligible: c.mainDeckEligible,
    unrestPileEligible: c.unrestPileEligible,
    fameDeckEligible: c.fameDeckEligible
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

function getPlayerReferencedCardIds(players: GameState["players"]): string[] {
  const ids = new Set<string>();
  for (const player of Object.values(players)) {
    [
      player.deck,
      player.hand,
      player.discard,
      player.playArea,
      player.history,
      player.exile,
      player.powerArea,
      player.stateArea,
      player.developmentArea,
      player.nationDeck,
      player.accessionCardId ? [player.accessionCardId] : [],
      ...Object.values(player.sideAreas ?? {})
    ].forEach((zone) => zone.forEach((cardId) => ids.add(cardId)));
  }
  return [...ids];
}

function buildRuntimeCardDb(args: {
  filteredCards: NormalizedCardRecord[];
  sourceCards: Record<string, NormalizedCardRecord>;
  selectedCommonsCardIds: string[];
  players: GameState["players"];
}): GameState["cardDb"] {
  return buildGameCardDb(mergeCardsById(
    args.filteredCards.filter(isRuntimeBaseCard),
    args.sourceCards,
    [...args.selectedCommonsCardIds, ...getPlayerReferencedCardIds(args.players)]
  ));
}

function cloneMarketSlots(slots: NonNullable<GameState["marketSlots"]>): NonNullable<GameState["marketSlots"]> {
  return slots.map((slot) => ({
    ...slot,
    attachedUnrestCardIds: [...slot.attachedUnrestCardIds],
    resourceMarkers: { ...slot.resourceMarkers }
  }));
}

function marketResourcesFromSlots(slots: NonNullable<GameState["marketSlots"]>): NonNullable<GameState["marketResources"]> {
  return Object.fromEntries(
    slots
      .filter((slot) => slot.cardId && Object.keys(slot.resourceMarkers).length > 0)
      .map((slot) => [slot.cardId, { ...slot.resourceMarkers }])
  ) as NonNullable<GameState["marketResources"]>;
}

function marketUnrestFromSlots(slots: NonNullable<GameState["marketSlots"]>): NonNullable<GameState["marketUnrest"]> {
  return Object.fromEntries(
    slots
      .filter((slot) => slot.cardId && slot.attachedUnrestCardIds.length > 0)
      .map((slot) => [slot.cardId, [...slot.attachedUnrestCardIds]])
  ) as NonNullable<GameState["marketUnrest"]>;
}

function ordinaryFameCountForSetup(playerCount: number, enabledTradeRoutes: boolean): number {
  const baseCount = playerCount <= 2 ? 6 : playerCount === 3 ? 7 : 8;
  return baseCount + (enabledTradeRoutes ? 1 : 0);
}

function buildFameDeckState(commonsSetup: NonNullable<GameState["setupReport"]>["commonsSetup"], playerCount: number, enabledTradeRoutes: boolean): NonNullable<GameState["fameDeck"]> {
  if (!commonsSetup?.fameDeck.length) return setupFameDeck(enabledTradeRoutes);
  const specialBottomCardId = commonsSetup.kingOfKingsCardId;
  const ordinaryFameCards = commonsSetup.fameDeck.filter((cardId) => cardId !== specialBottomCardId);
  return {
    available: ordinaryFameCards.slice(0, ordinaryFameCountForSetup(playerCount, enabledTradeRoutes)),
    specialBottomCardId,
    specialBottomSide: specialBottomCardId ? "A" : undefined,
    resolvedSpecialByPlayer: {}
  };
}

function seededIndex(seed: string | undefined, length: number): number {
  if (length <= 0) return 0;
  if (!seed) return 0;
  let total = 0;
  for (let i = 0; i < seed.length; i += 1) total += seed.charCodeAt(i);
  return total % length;
}

function seededRandom(seed: string | undefined): (() => number) | undefined {
  if (!seed) return undefined;
  let state = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    state ^= seed.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function passiveRuleHookTrigger(trigger: NationDefinition["passiveRules"][number]["trigger"]): NationHookTrigger | undefined {
  if (trigger === "before_reshuffle") return "before_reshuffle";
  if (trigger === "after_reshuffle") return "after_reshuffle";
  if (trigger === "on_develop") return "after_develop";
  if (trigger === "on_acquire") return "after_acquire";
  if (trigger === "on_gain_unrest") return "after_gain_unrest";
  if (trigger === "on_solstice") return "before_solstice";
  if (trigger === "on_scoring") return "before_scoring";
  return undefined;
}

function initializeDefaultStateSide(game: GameState, playerId: string, ruleset: NationRuleset): void {
  if ((ruleset.stateOverrides ?? []).some((ov) => ov.op === "start_as_state")) return;
  activateState(game, playerId, "barbarian");
}

function mergeImportedPassiveRules(nation: NationDefinition, ruleset: NationRuleset): NationRuleset {
  const passiveHooks = (nation.passiveRules ?? []).flatMap((rule, index) => {
    const trigger = passiveRuleHookTrigger(rule.trigger);
    return trigger
      ? [{ trigger, effects: rule.effects as any, priority: index, description: `Imported passive rule ${rule.trigger}` }]
      : [];
  });
  if (passiveHooks.length === 0) return ruleset;
  return {
    ...ruleset,
    hookRules: [...passiveHooks, ...(ruleset.hookRules ?? [])]
  };
}

function isNationCompatibleWithOptions(nation: NationDefinition, options: GameOptions): boolean {
  return !nation.requiredExpansions.some((e) => !options.enabledExpansions.includes(e))
    && !(nation.excludedExpansions ?? []).some((e) => options.enabledExpansions.includes(e))
    && !nation.disallowedModes?.includes(options.mode);
}

function resolveSoloBotNationId(args: {
  requestedBotNationId?: string;
  nationDb: Record<string, NationDefinition>;
  options: GameOptions;
  randomSeed?: string;
}): string {
  const compatibleNationIds = Object.values(args.nationDb)
    .filter((nation) => isNationCompatibleWithOptions(nation, args.options))
    .map((nation) => nation.id);
  if (!compatibleNationIds.length) throw new Error("No compatible nations available for solo bot.");
  if (!args.requestedBotNationId || args.requestedBotNationId === "random") {
    return compatibleNationIds[seededIndex(args.randomSeed ? `${args.randomSeed}:solo-bot` : undefined, compatibleNationIds.length)];
  }
  const requested = args.nationDb[args.requestedBotNationId];
  if (!requested) throw new Error(`Solo bot nation not found: ${args.requestedBotNationId}`);
  if (!isNationCompatibleWithOptions(requested, args.options)) throw new Error(`Solo bot nation ${args.requestedBotNationId} is incompatible with the selected options.`);
  return args.requestedBotNationId;
}

export function createInitialGameStateFromPipeline(args: { options: GameOptions; playerNationIds?: Record<string,string>; soloBotNationId?: string; cardDb: Record<string, NormalizedCardRecord>; nationDb: Record<string, NationDefinition>; randomSeed?: string; usePrivateRules?: boolean; privateRulesetPath?: string; privateStrategyPath?: string; privateBotStateTablePath?: string; privateBotTradeRoutesTablePath?: string; }): GameState {
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
  const setupReport: NonNullable<GameState["setupReport"]> = { delayedAggressiveCount:0, usedQuickSetup:false, shortGameExiled:0, shortGameNationAdvanced:0, practiceModeExiled:0 };
  const setupRandom = seededRandom(args.randomSeed);
  const soloBotNationId = options.mode === "solo"
    ? resolveSoloBotNationId({ requestedBotNationId: args.soloBotNationId, nationDb: args.nationDb, options, randomSeed: args.randomSeed })
    : undefined;
  const players: GameState["players"] = {};
  const extraUnrestSupplyCardIds: string[] = [];
  const game: GameState = {
    players,
    cardDb: buildGameCardDb(filteredCards),
    market: [],
    marketRefillPool: [],
    marketDecks: { mainDeck: [], regionDeck: [], uncivilizedDeck: [], civilizedDeck: [], tributaryDeck: [] },
    marketResources: {},
    marketUnrest: {},
    unrestPile: Array.from({ length: 12 }, (_, index) => `placeholder_unrest_${index + 1}`),
    sharedDiscard: [],
    log: [],
    round: 1,
    currentTurnType: "activate",
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
    const ruleset = mergeImportedPassiveRules(
      nation,
      getNationRuleset(rulesetDb, nid) ?? { nationId: nid, displayName: nation.displayName, rulesetTags:["default_nation_deck"], requiredExpansions:[], setupOverrides:[], zoneOverrides:[], stateOverrides:[], reshuffleOverrides:[], cleanupOverrides:[], solsticeOverrides:[], scoringOverrides:[], collapseOverrides:[], botOverrides:[], shortGameOverrides:[], hookRules:[], implemented:false, tested:false }
    );
    const compat = validateNationRulesetCompatibility(nation, ruleset, options);
    if (compat.length) throw new Error(`Ruleset incompatibility for ${nid}: ${compat.join(", ")}`);
    const player = setupPlayerFromNation({ nation, cardDb: args.cardDb, playerId: pid, shuffle: (x)=>[...x], enabledExpansions: options.enabledExpansions });
    players[pid] = player;
    activeNationRulesets[pid] = ruleset;
    if (strategyDb[nid]) activeNationStrategyProfiles[pid] = strategyDb[nid];
    initializeDefaultStateSide(game, pid, ruleset);

    runNationHooks({ G: game, playerId: pid, trigger: "before_setup_player" });
    applySetupOverrides(player, ruleset);
    for (const ov of ruleset.zoneOverrides) {
      if (ov.op === "create_zone") {
        player.sideAreas ??= {};
        player.sideAreas[ov.zoneId] ??= [];
      }
      if (ov.op === "replace_history_with_zone") {
        player.sideAreas ??= {};
        player.sideAreas[ov.zoneId] ??= [];
      }
    }
    for (const ov of ruleset.stateOverrides) {
      if (ov.op === "start_as_state") activateState(game, pid, ov.state);
    }
    if (options.enabledVariants.includes("short_game")) {
      let advancedNationCards: string[] = [];
      for (const ov of ruleset.shortGameOverrides) {
        if (ov.op === "add_nation_cards_to_discard") {
          advancedNationCards = player.nationDeck.splice(0, ov.count);
          player.discard.push(...advancedNationCards);
          setupReport.shortGameNationAdvanced += advancedNationCards.length;
        }
        if (ov.op === "remove_starting_resource") {
          player.resources[ov.resource] = Math.max(0, (player.resources[ov.resource] ?? 0) - ov.count);
        }
        if (ov.op === "remove_starting_resources") {
          ov.resources.forEach((resource) => {
            player.resources[resource] = 0;
          });
        }
        if (ov.op === "develop_one_remove_one_development") {
          const developIndex = player.developmentArea.indexOf(ov.developCardId);
          if (developIndex >= 0) {
            player.developmentArea.splice(developIndex, 1);
            player.discard.push(ov.developCardId);
          }
          const removeIndex = player.developmentArea.indexOf(ov.removeCardId);
          if (removeIndex >= 0) {
            player.developmentArea.splice(removeIndex, 1);
            player.exile.push(ov.removeCardId);
          }
        }
        if (ov.op === "move_development_cards_to_discard") {
          for (const cardId of ov.cardIds) {
            const index = player.developmentArea.indexOf(cardId);
            if (index >= 0) {
              player.developmentArea.splice(index, 1);
              player.discard.push(cardId);
            }
          }
        }
      }
      if (!ruleset.shortGameOverrides.some((ov) => ov.op === "add_nation_cards_to_discard")) {
        advancedNationCards = player.nationDeck.splice(0, 2);
        player.discard.push(...advancedNationCards);
        setupReport.shortGameNationAdvanced += advancedNationCards.length;
      }
      for (const ov of ruleset.shortGameOverrides) {
        if (ov.op === "move_one_advanced_nation_card_to_side_area") {
          const cardId = advancedNationCards[ov.selection === "random" ? seededIndex(args.randomSeed, advancedNationCards.length) : 0];
          if (cardId) {
            player.sideAreas ??= {};
            player.sideAreas[ov.areaId] ??= [];
            const discardIndex = player.discard.indexOf(cardId);
            if (discardIndex >= 0) player.discard.splice(discardIndex, 1);
            player.sideAreas[ov.areaId].push(cardId);
          }
        }
        if (ov.op === "garrison_development_and_add_nation_to_starting_deck") {
          const developmentIndex = player.developmentArea.indexOf(ov.developmentCardId);
          if (developmentIndex >= 0 && player.powerArea.includes(ov.hostCardId)) {
            player.developmentArea.splice(developmentIndex, 1);
            game.cardStates ??= {};
            game.cardStates[ov.hostCardId] ??= {};
            const hostState = game.cardStates[ov.hostCardId];
            hostState.garrisonedCardIds ??= [];
            if (!hostState.garrisonedCardIds.includes(ov.developmentCardId)) {
              hostState.garrisonedCardIds.push(ov.developmentCardId);
            }
          }
          const nextNationCard = player.nationDeck.shift();
          if (nextNationCard) player.deck.push(nextNationCard);
        }
      }
    }
    for (const ov of ruleset.setupOverrides) {
      if (ov.op === "move_cards_to_unrest_supply") extraUnrestSupplyCardIds.push(...ov.cardIds);
    }
    runNationHooks({ G: game, playerId: pid, trigger: "after_setup_player" });
    rulesetReports.push({ playerId: pid, nationId: nid, appliedTags: ruleset.rulesetTags, appliedOverrides: ruleset.setupOverrides.map((x:any)=>x.op), warnings: [] });
  }

  const ctx = { options, players, cards: filteredCards, setupReport };
  modules.forEach((m)=>m.modifyDeckConstruction?.(ctx as any));
  game.cardDb = buildGameCardDb(filteredCards);
  const selectedNationIds = [
    ...Object.values(selected),
    ...(soloBotNationId ? [soloBotNationId] : [])
  ];
  const effectiveCommonsPlayerCount = options.mode === "solo" || options.mode === "practice" ? 2 : Math.max(2, options.playerCount);
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
    rng: setupRandom ? { next: setupRandom } : { shuffle: (items) => [...items] }
  });
  setupReport.commonsSetup = commonsSetup;
  setupReport.delayedAggressiveCount = Math.max(setupReport.delayedAggressiveCount, commonsSetup.delayedCards.length);
  setupReport.usedQuickSetup = options.enabledVariants.includes("quick_setup");
  game.cardDb = buildRuntimeCardDb({
    filteredCards,
    sourceCards: args.cardDb,
    selectedCommonsCardIds: commonsSetup.selectedCommonsCards,
    players
  });
  const filledMarketSlots = commonsSetup.initialMarket.filter((slot) => slot.cardId);
  game.marketSlots = cloneMarketSlots(filledMarketSlots);
  game.market = filledMarketSlots.map((slot) => slot.cardId).filter(Boolean) as string[];
  game.marketResources = marketResourcesFromSlots(filledMarketSlots);
  game.marketUnrest = marketUnrestFromSlots(filledMarketSlots);
  game.unrestPile = [...commonsSetup.unrestPile];
  for (const cardId of extraUnrestSupplyCardIds) {
    if (!game.unrestPile.includes(cardId)) game.unrestPile.push(cardId);
  }
  game.marketRefillPool = [];
  game.marketDecks = {
    mainDeck: commonsSetup.mainDeck,
    regionDeck: commonsSetup.regionDeck,
    uncivilizedDeck: commonsSetup.uncivilizedDeck,
    civilizedDeck: commonsSetup.civilizedDeck,
    tributaryDeck: commonsSetup.tributaryDeck ?? []
  };
  if (options.enabledVariants.includes("short_game")) {
    const exiledMainCards = game.marketDecks.mainDeck.splice(0, 10);
    setupReport.shortGameExiled = exiledMainCards.length;
  }
  if (options.mode === "practice") {
    const exiledMainCards = game.marketDecks.mainDeck.splice(0, 15);
    setupReport.practiceModeExiled = exiledMainCards.length;
  }
  modules.forEach((m)=>m.modifyMarketSetup?.(ctx as any));
  game.fameDeck = buildFameDeckState(commonsSetup, options.playerCount, options.enabledExpansions.includes("trade_routes"));
  modules.forEach((m)=>m.modifyFameSetup?.(ctx as any));
  modules.forEach((m)=>m.modifyPlayerSetup?.(ctx as any));
  game.cardDb = buildRuntimeCardDb({
    filteredCards,
    sourceCards: args.cardDb,
    selectedCommonsCardIds: commonsSetup.selectedCommonsCards,
    players
  });
  const fameCount = game.fameDeck.available.length + (game.fameDeck.specialBottomCardId ? 1 : 0);
  game.log.push({round:1,playerId:"setup",message:`Setup report delayed=${setupReport.delayedAggressiveCount}`},{round:1,playerId:"setup",message:`Fame cards: ${fameCount}`});
  commonsSetup.setupWarnings.forEach((message) => game.log.push({ round: 1, playerId: "setup", message }));
  game.log.push({ round: 1, playerId: "setup", message: `MarketInitialized(slots=${game.market.length})` });
  game.log.push({ round: 1, playerId: "setup", message: `MarketDecks(main=${game.marketDecks.mainDeck.length},region=${game.marketDecks.regionDeck.length},uncivilized=${game.marketDecks.uncivilizedDeck.length},civilized=${game.marketDecks.civilizedDeck.length},tributary=${game.marketDecks.tributaryDeck.length})` });
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
  if (options.mode === "practice") (game as any).practiceClock = { turnsRemaining: 12, progressTokens: 12 };
  if (options.mode === "solo") {
    const botStateTables = loadBotStateTables({ usePrivate: args.usePrivateRules, privatePath: args.privateBotStateTablePath });
    const botTradeRoutesTables = loadBotTradeRoutesTables({ usePrivate: args.usePrivateRules, privatePath: args.privateBotTradeRoutesTablePath });
    const botNation = args.nationDb[soloBotNationId!];
    const botRuleset = mergeImportedPassiveRules(
      botNation,
      getNationRuleset(rulesetDb, soloBotNationId!) ?? { nationId: soloBotNationId!, displayName: botNation.displayName, rulesetTags:["default_nation_deck"], requiredExpansions:[], setupOverrides:[], zoneOverrides:[], stateOverrides:[], reshuffleOverrides:[], cleanupOverrides:[], solsticeOverrides:[], scoringOverrides:[], collapseOverrides:[], botOverrides:[], shortGameOverrides:[], hookRules:[], implemented:false, tested:false }
    );
    const compat = validateNationRulesetCompatibility(botNation, botRuleset, options);
    if (compat.length) throw new Error(`Bot ruleset incompatibility for ${soloBotNationId}: ${compat.join(", ")}`);
    const bot = setupSoloBot({ botNation: botNation as any, botRuleset, cardDb: game.cardDb as any, botStateTables, options, shuffle: (x)=>[...x] });
    (game as any).solo = { bot, botStateTables, botTradeRoutesTables };
  }
  return game;
}
