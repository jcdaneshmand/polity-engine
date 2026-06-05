import type { Ctx } from "boardgame.io";
import { createReactiveExhaustChoice, resolvePendingTradeChoice, runAcquireTriggers, runEffects, runTriggeredEffects } from "../cards/effectRunner";
import type { DrawSourceZone, Effect, EffectTrigger, FindSourceZone, GameState, LookSourceZone, LookTakeSourceZone, PendingPlayedCardResolution, PlaceOnDeckSourceZone, PlayerExileSource, ReactiveExhaustCondition, ResourceGainSource, ResourceName, ReturnFameSourceZone, ReturnUnrestSourceZone, Suit, SwapSourceZone, TargetPlayerScope, ZoneName } from "./state";
import { continuePendingNationHooks, runNationHooks } from "../nations/nationRulesetHooks";
import { continuePausedBotTurn } from "../solo/botTurn";
import { canUseDevelopmentArea, continuePendingReshuffleLifecycle, continuePendingShortGameDevelopmentExileQueue, resolvePendingDevelopmentChoice, resolvePendingShortGameDevelopmentExileChoice, skipPendingDevelopmentChoice } from "./zones";
import { continuePendingUnrestAllocationResolution, continuePendingUnrestTake } from "./unrest";
import { collectMarketResources, collectMarketUnrest, continuePendingMarketUnrestHooks, movePlayerResourcesToMarketCards, resolveCleanupMarketResourceChoice, startCleanupMarketResourceChoice } from "./marketResources";
import { deckForSuit, refillMarketSlot } from "./marketRefill";
import { availableForResourceCost, canPayResourceCost, canPayResourceCosts, describeResourceCost, normalizeResourceCost, payResourceCost, payResourceCosts, type ResourceCost } from "./payments";
import { continuePendingScoringFinalization } from "./scoring";
import { continuePausedSolstice, continuePendingTurnEndCleanup, prepareCleanupBeforeOptionalDiscard, resetCleanupTokensBeforeOptionalDiscard, resolveCleanupDiscardChoice, resolvePendingSolsticeOrderChoice, startCleanupDiscardChoice } from "./turn";
import {
  abandonRegionToDiscard,
  canBeGarrisoned,
  collectAndClearCardStateToPlayer,
  collectCardResourcesToPlayer,
  detachGarrisonedCard,
  detachGarrisonedCards,
  garrisonCardOnRegion,
  garrisonedCardsInPlay,
  isRegionCard,
  recallRegionToHand
} from "./regions";
import { breakThrough, type BreakThroughResult, visibleTributaryBreakThroughCards } from "./breakThrough";
import { acquireFromExile, availableExileCards, canAcquireExileCard, exileMarketCard, exilePlayerCard, marketCardHasTokens, playerCardOrGarrisonHasTokens, playerExileSourceCards } from "./exile";
import { acquireMarketCard, gainMarketCard, takeMarketCard } from "./marketAcquire";
import { isUnrestCard as isReturnableUnrestCard, resolvePendingUnrestAllocationChoice, returnUnrestCard, zoneCardsForReturnUnrest } from "./unrest";
import { currentStateMatches, currentStateMatchesAny } from "./stateMatching";
import { placeCardOnDeck } from "./deckPlacement";
import { returnableExhaustTokenCardIds, returnExhaustToken } from "./exhaustTokens";
import { giveCardToPlayer } from "./giveCard";
import { availableSwapChoices, swapCardWithMarket } from "./swap";
import { cardHasSuitIcon, cardHasSuitIconForPlayer } from "./suitIcons";
import { startPracticeMarketExileChoice } from "../solo/practiceMode";
import { isFameCard, peekFameCards, returnFameCard, zoneCardsForReturnFame } from "./fame";
import { isEffectiveAccessionCard, lookableNationDeckCards } from "./nationDeck";
import { actualHistorySourceZoneIds, moveCardsToHistoryDestination } from "./history";
import { canonicalResourceName, resourceAmount } from "./resources";

interface MoveCtx {
  G: GameState;
  ctx: Ctx;
  events?: { endTurn?: () => void };
  random?: { Number?: () => number };
}

function logTurnPhase(G: GameState, playerId: string, phase: string, message: string): void {
  G.log.push({ round: G.round, playerId, message: `TurnPhase(${phase}): ${message}` });
}

function logInvalidMove(G: GameState, playerId: string, move: string, reason: string): void {
  G.log.push({ round: G.round, playerId, message: `InvalidMove(${move}): ${reason}` });
}

function shuffleWithRandom<T>(items: T[], randomNumber?: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const roll = randomNumber ? randomNumber() : 0;
    const j = Math.floor(roll * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function shuffleResolvedFindDeck(G: GameState, playerId: string, zone: "deck" | "nationDeck", randomNumber?: () => number): void {
  const player = G.players[playerId];
  if (zone === "deck") {
    player.deck = shuffleWithRandom(player.deck, randomNumber);
    G.log.push({ round: G.round, playerId, message: "FindShuffled(deck)" });
    return;
  }
  const accessionCards = player.nationDeck.filter((candidateId) => isEffectiveAccessionCard(G, playerId, player, candidateId));
  const regularCards = player.nationDeck.filter((candidateId) => !isEffectiveAccessionCard(G, playerId, player, candidateId));
  player.nationDeck = [...shuffleWithRandom(regularCards, randomNumber), ...accessionCards];
  G.log.push({ round: G.round, playerId, message: "FindShuffled(nationDeck)" });
}

function cloneGameState(G: GameState): GameState {
  return JSON.parse(JSON.stringify(G)) as GameState;
}

function restoreGameState(G: GameState, snapshot: GameState): void {
  for (const key of Object.keys(G) as Array<keyof GameState>) delete G[key];
  Object.assign(G, snapshot);
}

function nationHookFailureLogEntriesSince(G: GameState, logIndex: number, trigger: string): GameState["log"] {
  return G.log.slice(logIndex).filter((entry) =>
    entry.message.startsWith("UnsupportedEffectOp(")
      || entry.message.startsWith(`Nation hook ${trigger}`)
      || entry.message.startsWith("NationRulesetError(")
  );
}

function rollbackPendingPlayedCardHookFailure(G: GameState, playerId: string, trigger: string): boolean {
  const pending = G.pendingPlayedCardResolution;
  const snapshot = pending?.rollbackSnapshot;
  if (!pending || !snapshot) return false;
  const failureLogEntries = nationHookFailureLogEntriesSince(G, snapshot.log.length, trigger);
  restoreGameState(G, snapshot);
  G.log.push(...failureLogEntries);
  logInvalidMove(G, playerId, "playCard", `after_play_hook_failed(${pending.cardId})`);
  return true;
}

function rollbackPendingPlayedCardEffectFailure(G: GameState, playerId: string, trigger: string): boolean {
  const pending = G.pendingPlayedCardResolution;
  const snapshot = pending?.rollbackSnapshot;
  if (!pending || !snapshot) return false;
  const failureLogEntries = nationHookFailureLogEntriesSince(G, snapshot.log.length, trigger);
  restoreGameState(G, snapshot);
  G.log.push(...failureLogEntries);
  logInvalidMove(G, playerId, "playCard", `on_play_effect_failed(${pending.cardId})`);
  return true;
}

function rollbackPendingPostDevelopmentHookFailure(G: GameState, playerId: string): boolean {
  const pending = G.pendingPostDevelopmentResolution;
  const snapshot = pending?.rollbackSnapshot;
  const cardId = pending?.cardId;
  if (!pending || !snapshot || !cardId) return false;
  const failureLogEntries = nationHookFailureLogEntriesSince(G, snapshot.log.length, "after_develop");
  restoreGameState(G, snapshot);
  G.log.push(...failureLogEntries);
  logInvalidMove(G, playerId, "resolveDevelopmentChoice", `development_resolution_failed(${cardId})`);
  return true;
}

function rollbackUnrestAllocationHookFailure(G: GameState, playerId: string, snapshot: GameState | undefined): boolean {
  if (!snapshot) return false;
  const failureLogEntries = nationHookFailureLogEntriesSince(G, snapshot.log.length, "after_gain_unrest");
  restoreGameState(G, snapshot);
  G.log.push(...failureLogEntries);
  logInvalidMove(G, playerId, "resolveUnrestAllocationChoice", "unrest_allocation_failed");
  return true;
}

function wasHandledResumeFailure(G: GameState): boolean {
  const lastMessage = G.log.at(-1)?.message;
  return lastMessage?.startsWith("InvalidMove(playCard): after_play_hook_failed(")
    || lastMessage?.startsWith("InvalidMove(playCard): on_play_effect_failed(")
    || lastMessage?.startsWith("InvalidMove(resolveDevelopmentChoice): development_resolution_failed(")
    || lastMessage === "InvalidMove(resolveUnrestAllocationChoice): unrest_allocation_failed"
    || false;
}

function handleAfterReshuffleHookFailure(G: GameState, playerId: string, move: string): boolean {
  const lastMessage = G.log.at(-1)?.message;
  if (!G.pendingReshuffleDraw || !lastMessage?.startsWith("Nation hook after_reshuffle") || !lastMessage.endsWith(" failed.")) return false;
  G.pendingReshuffleDraw = undefined;
  logInvalidMove(G, playerId, move, "after_reshuffle_hook_failed");
  return true;
}

function returnIfGameover(G: GameState): boolean {
  return Boolean(G.gameover);
}

function blockingPendingChoice(G: GameState): string | undefined {
  if (G.pendingChoice) return "pending_choice";
  if (G.pendingDrawChoice) return "pending_draw_choice";
  if (G.pendingFindChoice) return "pending_find_choice";
  if (G.pendingAcquireChoice) return "pending_acquire_choice";
  if (G.pendingMarketCardChoice) return "pending_market_card_choice";
  if (G.pendingBreakThroughChoice) return "pending_break_through_choice";
  if (G.pendingExileChoice) return "pending_exile_choice";
  if (G.pendingGarrisonChoice) return "pending_garrison_choice";
  if (G.pendingRegionChoice) return "pending_region_choice";
  if (G.pendingRegionChoiceContinuation) return "pending_region_choice_continuation";
  if (G.pendingDevelopmentChoice) return "pending_development_choice";
  if (G.pendingShortGameDevelopmentExileChoice) return "pending_short_game_development_exile_choice";
  if (G.pendingTradeChoice) return "pending_trade_choice";
  if (G.pendingDiscardChoice) return "pending_discard_choice";
  if (G.pendingReturnUnrestChoice) return "pending_return_unrest_choice";
  if (G.pendingReturnFameChoice) return "pending_return_fame_choice";
  if (G.pendingPlaceOnDeckChoice) return "pending_place_on_deck_choice";
  if (G.pendingReturnExhaustTokenChoice) return "pending_return_exhaust_token_choice";
  if (G.pendingFreePlayChoice) return "pending_free_play_choice";
  if (G.pendingGiveCardChoice) return "pending_give_card_choice";
  if (G.pendingSwapChoice) return "pending_swap_choice";
  if (G.pendingLookOrderChoice) return "pending_look_order_choice";
  if (G.pendingLookTakeChoice) return "pending_look_take_choice";
  if (G.pendingUnrestAllocationChoice) return "pending_unrest_allocation_choice";
  if (G.pendingReactiveExhaustChoice) return "pending_reactive_exhaust_choice";
  if (G.pendingMarketResourcePlacementChoice) return "pending_market_resource_placement_choice";
  if (G.pendingSolsticeOrderChoice) return "pending_solstice_order_choice";
  if (G.pendingCleanupMarketResourceChoice) return "pending_cleanup_market_resource_choice";
  if (G.pendingCleanupDiscardChoice) return "pending_cleanup_discard_choice";
  if (G.pendingTurnEndCleanup) return "pending_turn_end_cleanup";
  if (G.pendingScoringFinalization) return "pending_scoring_finalization";
  if (G.pendingScoringLifecycle) return "pending_scoring_lifecycle";
  if (G.pendingCollapseLifecycle) return "pending_collapse_lifecycle";
  if (G.pendingSolsticeContinuation) return "pending_solstice_continuation";
  if (G.pendingSolsticeRoundEnd) return "pending_solstice_round_end";
  if (G.pendingPlayCardResolution) return "pending_play_card_resolution";
  if (G.pendingPlayedCardResolution) return "pending_played_card_resolution";
  if (G.pendingAcquireCardResolution) return "pending_acquire_card_resolution";
  if (G.pendingAcquireEffectResolution) return "pending_acquire_effect_resolution";
  if (G.pendingMarketMoveEffectResolution) return "pending_market_move_effect_resolution";
  if (G.pendingBreakThroughEffectResolution) return "pending_break_through_effect_resolution";
  if (G.pendingMarketUnrestHookContinuation) return "pending_market_unrest_hook_continuation";
  if (G.pendingNationHookContinuation) return "pending_nation_hook_continuation";
  if (G.pendingUnrestTakeContinuation) return "pending_unrest_take_continuation";
  if (G.pendingUnrestAllocationResolution) return "pending_unrest_allocation_resolution";
  if (G.pendingPostDevelopmentResolution) return "pending_post_development_resolution";
  if (G.pendingReshuffleResolution) return "pending_reshuffle_resolution";
  if (G.pendingAfterReshuffleEffects) return "pending_after_reshuffle_effects";
  if (G.pendingReshuffleDraw) return "pending_reshuffle_draw";
  if (G.pendingPracticeMarketExileBeforeCleanup) return "pending_practice_market_exile_before_cleanup";
  if (G.pausedSolstice) return "paused_solstice";
  return undefined;
}

type ResumablePendingChoice =
  | NonNullable<GameState["pendingChoice"]>
  | NonNullable<GameState["pendingDrawChoice"]>
  | NonNullable<GameState["pendingFindChoice"]>
  | NonNullable<GameState["pendingAcquireChoice"]>
  | NonNullable<GameState["pendingMarketCardChoice"]>
  | NonNullable<GameState["pendingBreakThroughChoice"]>
  | NonNullable<GameState["pendingExileChoice"]>
  | NonNullable<GameState["pendingGarrisonChoice"]>
  | NonNullable<GameState["pendingRegionChoice"]>
  | NonNullable<GameState["pendingRegionChoiceContinuation"]>
  | NonNullable<GameState["pendingDevelopmentChoice"]>
  | NonNullable<GameState["pendingShortGameDevelopmentExileChoice"]>
  | NonNullable<GameState["pendingTradeChoice"]>
  | NonNullable<GameState["pendingDiscardChoice"]>
  | NonNullable<GameState["pendingReturnUnrestChoice"]>
  | NonNullable<GameState["pendingReturnFameChoice"]>
  | NonNullable<GameState["pendingPlaceOnDeckChoice"]>
  | NonNullable<GameState["pendingReturnExhaustTokenChoice"]>
  | NonNullable<GameState["pendingFreePlayChoice"]>
  | NonNullable<GameState["pendingGiveCardChoice"]>
  | NonNullable<GameState["pendingSwapChoice"]>
  | NonNullable<GameState["pendingLookOrderChoice"]>
  | NonNullable<GameState["pendingLookTakeChoice"]>
  | NonNullable<GameState["pendingUnrestAllocationChoice"]>
  | NonNullable<GameState["pendingMarketResourcePlacementChoice"]>
  | NonNullable<GameState["pendingReactiveExhaustChoice"]>;

function pendingEffectInterruption(G: GameState, options: { includeRegionContinuation?: boolean } = {}): ResumablePendingChoice | undefined {
  return G.pendingChoice
    ?? G.pendingDrawChoice
    ?? G.pendingFindChoice
    ?? G.pendingAcquireChoice
    ?? G.pendingMarketCardChoice
    ?? G.pendingBreakThroughChoice
    ?? G.pendingExileChoice
    ?? G.pendingGarrisonChoice
    ?? G.pendingRegionChoice
    ?? (options.includeRegionContinuation === false ? undefined : G.pendingRegionChoiceContinuation)
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingDiscardChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingReturnFameChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingReturnExhaustTokenChoice
    ?? G.pendingFreePlayChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingLookTakeChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingMarketResourcePlacementChoice
    ?? G.pendingReactiveExhaustChoice;
}

function restorePendingRegionChoiceContinuation(G: GameState): boolean {
  if (!G.pendingRegionChoiceContinuation || pendingEffectInterruption(G, { includeRegionContinuation: false })) return false;
  G.pendingRegionChoice = G.pendingRegionChoiceContinuation;
  G.pendingRegionChoiceContinuation = undefined;
  return true;
}

function sourceCardIsInPlay(G: GameState, playerId: string, cardId: string | undefined): boolean {
  if (!cardId) return false;
  const player = G.players[playerId];
  return player.playArea.includes(cardId) || player.powerArea.includes(cardId) || garrisonedCardsInPlay(G, playerId).includes(cardId);
}

function createReactiveExhaustChoicesForResourceGains(ctx: { G: GameState; playerId: string; selfCardId?: string; randomNumber?: () => number; enabledExpansions?: string[] }, gains: Partial<Record<ResourceName, number>>, sourceCardId?: string, sourceWasInPlay = sourceCardIsInPlay(ctx.G, ctx.playerId, sourceCardId)): void {
  for (const [resource, amount] of Object.entries(gains) as Array<[ResourceName, number | undefined]>) {
    if ((amount ?? 0) <= 0) continue;
    if (pendingEffectInterruption(ctx.G)) return;
    createReactiveExhaustChoice(ctx, { trigger: "after_gain_resource", resource, sourceCardId, sourceWasInPlay });
  }
}

function createReactiveExhaustChoicesForResourceGainSources(ctx: { G: GameState; playerId: string; selfCardId?: string; randomNumber?: () => number; enabledExpansions?: string[] }, sources: ResourceGainSource[], fallbackGains: Partial<Record<ResourceName, number>> = {}): void {
  if (sources.length === 0) {
    createReactiveExhaustChoicesForResourceGains(ctx, fallbackGains);
    return;
  }
  for (const source of sources) {
    createReactiveExhaustChoicesForResourceGains(ctx, source.gains, source.sourceCardId, source.sourceWasInPlay);
  }
}

function addResourceGains(target: Partial<Record<ResourceName, number>>, gained: Partial<Record<ResourceName, number>>): void {
  for (const [resource, amount] of Object.entries(gained) as Array<[ResourceName, number | undefined]>) {
    if ((amount ?? 0) <= 0) continue;
    target[resource] = (target[resource] ?? 0) + (amount ?? 0);
  }
}

function recordResourceGains(
  target: Partial<Record<ResourceName, number>> | undefined,
  sources: ResourceGainSource[] | undefined,
  sourceCardId: string,
  sourceWasInPlay: boolean,
  gained: Partial<Record<ResourceName, number>>
): void {
  if (target) addResourceGains(target, gained);
  if (sources && Object.values(gained).some((amount) => (amount ?? 0) > 0)) {
    sources.push({ sourceCardId, sourceWasInPlay, gains: gained });
  }
}

function finishAcquireCardResolution({ G, ctx, random }: MoveCtx, cardId: string, payment?: ResourceCost): boolean {
  const p = G.players[ctx.currentPlayer];
  const snapshot = cloneGameState(G);
  if (p.actionsRemaining < 1 || p.actionTokensAvailable < 1) {
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", "no_actions_remaining");
    return false;
  }
  const idx = G.market.indexOf(cardId);
  if (idx < 0) {
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `card_not_in_market(${cardId})`);
    return false;
  }
  const rawCost = G.cardDb[cardId]?.cost ?? 0;
  const cost = normalizeResourceCost(rawCost);
  if (!canPayResourceCosts(G, ctx.currentPlayer, cost, payment)) {
    const required = describeResourceCost(cost) || "none";
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `insufficient_resources(required=${required})`);
    return false;
  }
  p.actionsRemaining -= 1;
  p.actionTokensAvailable -= 1;
  G.market.splice(idx, 1);
  if (typeof rawCost === "number" && !payment) payResourceCost(G, ctx.currentPlayer, "materials", rawCost, random?.Number);
  else payResourceCosts(G, ctx.currentPlayer, cost, payment, random?.Number);
  collectMarketResources(G, ctx.currentPlayer, cardId);
  p.hand.push(cardId);
  if (!collectMarketUnrest(G, ctx.currentPlayer, cardId, { randomNumber: random?.Number })) {
    const failureLogEntries = G.log.slice(snapshot.log.length).filter((entry) =>
      entry.message.startsWith("UnsupportedEffectOp(")
        || entry.message.includes(" failed.")
        || entry.message.startsWith("NationRulesetError(")
    );
    restoreGameState(G, snapshot);
    G.log.push(...failureLogEntries);
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `after_gain_unrest_hook_failed(${cardId})`);
    return false;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `Acquired ${cardId} for ${typeof rawCost === "number" ? `${rawCost} materials` : describeResourceCost(cost)}.` });
  refillMarketSlot(G, { playerId: ctx.currentPlayer, slotIndex: idx, acquiredCardId: cardId });
  if (G.gameover) return true;
  if (G.market.length === 0) {
    G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "MarketExhausted(no_refill_pipeline_defined)." });
  } else {
    G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `MarketRefillStatus(market=${G.market.length}, pool=${G.marketRefillPool.length}).` });
  }
  if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_acquire", payload: { cardId }, randomNumber: random?.Number })) {
    const failureLogEntries = G.log.slice(snapshot.log.length).filter((entry) =>
      entry.message.startsWith("UnsupportedEffectOp(")
        || entry.message.startsWith("Nation hook after_acquire")
        || entry.message.startsWith("NationRulesetError(")
    );
    restoreGameState(G, snapshot);
    G.log.push(...failureLogEntries);
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `after_acquire_hook_failed(${cardId})`);
    return false;
  }
  return true;
}

function finishPendingAcquireCardResolution(moveCtx: MoveCtx): boolean {
  const pending = moveCtx.G.pendingAcquireCardResolution;
  if (!pending || pending.playerId !== moveCtx.ctx.currentPlayer || pendingEffectInterruption(moveCtx.G)) return true;
  moveCtx.G.pendingAcquireCardResolution = undefined;
  return finishAcquireCardResolution(moveCtx, pending.cardId, pending.payment);
}

function finishPendingAcquireEffectResolution(moveCtx: MoveCtx): boolean {
  const { G, ctx, random } = moveCtx;
  const pending = G.pendingAcquireEffectResolution;
  if (!pending || pending.playerId !== ctx.currentPlayer || pendingEffectInterruption(G)) return true;
  const resumeEffects = pending.resumeEffects ?? [];
  G.pendingAcquireEffectResolution = undefined;
  const continuationCtx = {
    G,
    playerId: ctx.currentPlayer,
    selfCardId: pending.sourceCardId,
    randomNumber: random?.Number,
    enabledExpansions: G.options?.enabledExpansions
  };
  if (!runAcquireTriggers(continuationCtx, pending.cardId)) return false;
  const triggerPending = pendingEffectInterruption(G);
  if (triggerPending) {
    triggerPending.resumeEffects = [...(triggerPending.resumeEffects ?? []), ...resumeEffects];
    return true;
  }
  if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_acquire", payload: { cardId: pending.cardId }, randomNumber: random?.Number })) return false;
  const hookPending = pendingEffectInterruption(G);
  if (hookPending) {
    hookPending.resumeEffects = [...(hookPending.resumeEffects ?? []), ...resumeEffects];
    return true;
  }
  const takenUnrestPlayerIds = pending.takenUnrestPlayerIds ?? [];
  for (let index = 0; index < takenUnrestPlayerIds.length; index += 1) {
    const targetPlayerId = takenUnrestPlayerIds[index];
    createReactiveExhaustChoice(continuationCtx, { trigger: "after_take_unrest", targetPlayerId });
    if (pendingEffectInterruption(G)) {
      G.pendingAcquireEffectResolution = {
        ...pending,
        takenUnrestPlayerIds: takenUnrestPlayerIds.slice(index + 1)
      };
      return true;
    }
  }
  createReactiveExhaustChoicesForResourceGainSources(
    continuationCtx,
    pending.collectedResourceSources ?? [],
    pending.collectedResources ?? {}
  );
  const resourcePending = pendingEffectInterruption(G);
  if (resourcePending) {
    G.pendingAcquireEffectResolution = {
      ...pending,
      takenUnrestPlayerIds: [],
      collectedResources: {},
      collectedResourceSources: []
    };
    return true;
  }
  createReactiveExhaustChoice(continuationCtx, { trigger: "after_acquire_card", targetPlayerId: ctx.currentPlayer });
  const acquirePending = pendingEffectInterruption(G);
  if (acquirePending) {
    acquirePending.resumeEffects = [...(acquirePending.resumeEffects ?? []), ...resumeEffects];
    return true;
  }
  if (resumeEffects.length > 0) return resumeEffectsAfterPendingChoice(moveCtx, pending.sourceCardId, resumeEffects);
  return true;
}

function finishPendingMarketMoveEffectResolution(moveCtx: MoveCtx): boolean {
  const { G, ctx, random } = moveCtx;
  const pending = G.pendingMarketMoveEffectResolution;
  if (!pending || pending.playerId !== ctx.currentPlayer || pendingEffectInterruption(G)) return true;
  const resumeEffects = pending.resumeEffects ?? [];
  G.pendingMarketMoveEffectResolution = undefined;
  const continuationCtx = {
    G,
    playerId: ctx.currentPlayer,
    selfCardId: pending.sourceCardId,
    randomNumber: random?.Number,
    enabledExpansions: G.options?.enabledExpansions
  };
  createReactiveExhaustChoicesForResourceGainSources(
    continuationCtx,
    pending.collectedResourceSources ?? [],
    pending.collectedResources ?? {}
  );
  const resourcePending = pendingEffectInterruption(G);
  if (resourcePending) {
    G.pendingMarketMoveEffectResolution = {
      ...pending,
      collectedResources: {},
      collectedResourceSources: []
    };
    return true;
  }
  const takenUnrestPlayerIds = pending.takenUnrestPlayerIds ?? [];
  for (let index = 0; index < takenUnrestPlayerIds.length; index += 1) {
    const targetPlayerId = takenUnrestPlayerIds[index];
    createReactiveExhaustChoice(continuationCtx, { trigger: "after_take_unrest", targetPlayerId });
    if (pendingEffectInterruption(G)) {
      G.pendingMarketMoveEffectResolution = {
        ...pending,
        collectedResources: {},
        collectedResourceSources: [],
        takenUnrestPlayerIds: takenUnrestPlayerIds.slice(index + 1)
      };
      return true;
    }
  }
  if (resumeEffects.length > 0) return resumeEffectsAfterPendingChoice(moveCtx, pending.sourceCardId, resumeEffects);
  return true;
}

function runAfterBreakThroughHooks(G: GameState, playerId: string, result: BreakThroughResult, randomNumber?: () => number): boolean {
  if (result.gainedCardIds.length === 0) return true;
  for (const cardId of result.gainedCardIds) {
    if (!runNationHooks({ G, playerId, trigger: "after_break_through", payload: { cardId }, randomNumber })) return false;
    if (G.gameover || pendingEffectInterruption(G)) return true;
  }
  return true;
}

function finishPendingBreakThroughEffectResolution(moveCtx: MoveCtx): boolean {
  const { G, ctx, random } = moveCtx;
  const pending = G.pendingBreakThroughEffectResolution;
  if (!pending || pending.playerId !== ctx.currentPlayer || pendingEffectInterruption(G)) return true;
  pending.resolving = true;
  const resumeEffects = pending.resumeEffects ?? [];
  const continuationCtx = {
    G,
    playerId: ctx.currentPlayer,
    selfCardId: pending.sourceCardId,
    randomNumber: random?.Number,
    enabledExpansions: G.options?.enabledExpansions
  };
  const completedReactiveWindows = pending.nextAfterBreakThroughReactiveCardIndex
    ?? (pending.afterBreakThroughCardReactiveChecked ? pending.gainedCardIds.length : 0);
  if (pending.gainedCardIds.length > 0 && completedReactiveWindows < pending.gainedCardIds.length) {
    let nextReactiveIndex = completedReactiveWindows;
    while (nextReactiveIndex < pending.gainedCardIds.length) {
      nextReactiveIndex += 1;
      pending.nextAfterBreakThroughReactiveCardIndex = nextReactiveIndex;
      createReactiveExhaustChoice(continuationCtx, { trigger: "after_break_through_card", targetPlayerId: ctx.currentPlayer });
      if (pendingEffectInterruption(G)) return true;
    }
    pending.afterBreakThroughCardReactiveChecked = true;
  }
  if (pending.gainedCardIds.length > 0 && !pending.afterBreakThroughHooksStarted) {
    let nextIndex = pending.nextAfterBreakThroughHookCardIndex ?? 0;
    while (nextIndex < pending.gainedCardIds.length) {
      const cardId = pending.gainedCardIds[nextIndex];
      if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_break_through", payload: { cardId }, randomNumber: random?.Number })) return false;
      nextIndex += 1;
      pending.nextAfterBreakThroughHookCardIndex = nextIndex;
      if (G.gameover || pendingEffectInterruption(G)) return true;
    }
    pending.afterBreakThroughHooksStarted = true;
  }
  G.pendingBreakThroughEffectResolution = undefined;
  if (resumeEffects.length > 0) return resumeEffectsAfterPendingChoice(moveCtx, pending.sourceCardId, resumeEffects);
  return true;
}

function runTriggeredEffectsWithPayment(ctx: { G: GameState; playerId: string; selfCardId?: string; randomNumber?: () => number; enabledExpansions?: string[]; allowPendingScoringFinalizationEffects?: boolean }, effects: Effect[], trigger: EffectTrigger, payment?: ResourceCost): boolean {
  const triggeredEffects = effects.filter((effect) => effect.trigger === trigger);
  const prefix = costPaymentPrefix(ctx.G, ctx.playerId, triggeredEffects, ctx.selfCardId);
  const cost = explicitSpendCost(prefix);
  if (!resourceCostHasPositiveAmount(cost)) return runEffects(ctx, triggeredEffects);
  if (!payResourceCosts(ctx.G, ctx.playerId, cost, payment, ctx.randomNumber)) return false;
  return runEffects(ctx, orderedEffectsAfterPrefixPayment(triggeredEffects, prefix));
}

function finishPlayCardResolution(
  moveCtx: MoveCtx,
  cardId: string,
  freePlay: boolean,
  payment?: ResourceCost,
  sourceCardId?: string,
  resumeEffects?: Effect[],
  resumePlayedCardResolution?: PendingPlayedCardResolution
): boolean {
  const { G, ctx, random } = moveCtx;
  const p = G.players[ctx.currentPlayer];
  const snapshot = cloneGameState(G);
  logTurnPhase(G, ctx.currentPlayer, "action_execution", `playCard(${cardId})`);
  if (freePlay) recordFreePlay(G, ctx.currentPlayer, cardId);
  else {
    p.actionsRemaining -= 1;
    p.actionTokensAvailable -= 1;
  }
  const handIndex = p.hand.indexOf(cardId);
  if (handIndex < 0) {
    if (!freePlay) p.actionsRemaining += 1;
    if (!freePlay) p.actionTokensAvailable += 1;
    return false;
  }
  p.hand.splice(handIndex, 1);
  p.playArea.push(cardId);
  if (!freePlay) markActionToken(G, cardId);

  const resolved = runTriggeredEffectsWithPayment(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    G.cardDb[cardId]?.effects ?? [],
    "on_play",
    payment
  );
  if (!resolved) {
    if (G.gameover) return true;
    const failureLogEntries = G.log.slice(snapshot.log.length).filter((entry) =>
      entry.message.startsWith("UnsupportedEffectOp(")
        || entry.message.includes(" failed.")
        || entry.message.startsWith("NationRulesetError(")
    );
    restoreGameState(G, snapshot);
    G.log.push(...failureLogEntries);
    logInvalidMove(G, ctx.currentPlayer, "playCard", `on_play_effect_failed(${cardId})`);
    return false;
  }
  if (G.gameover) return true;
  G.pendingPlayedCardResolution = { playerId: ctx.currentPlayer, cardId, freePlay, rollbackSnapshot: snapshot, sourceCardId, resumeEffects, resumePlayedCardResolution };
  if (pendingEffectInterruption(G)) return true;
  return finishPendingPlayedCardResolution(moveCtx);
}

function finishPendingPlayCardResolution(moveCtx: MoveCtx): boolean {
  const pending = moveCtx.G.pendingPlayCardResolution;
  if (!pending || pending.playerId !== moveCtx.ctx.currentPlayer || pendingEffectInterruption(moveCtx.G)) return true;
  moveCtx.G.pendingPlayCardResolution = undefined;
  return finishPlayCardResolution(moveCtx, pending.cardId, pending.freePlay, pending.payment, pending.sourceCardId, pending.resumeEffects, pending.resumePlayedCardResolution);
}

function finishPendingPlayedCardResolution(moveCtx: MoveCtx): boolean {
  const { G, ctx, random } = moveCtx;
  const pending = G.pendingPlayedCardResolution;
  if (!pending || pending.playerId !== ctx.currentPlayer || pendingEffectInterruption(G)) return true;
  if (!pending.afterPlayReactiveChecked) {
    pending.afterPlayReactiveChecked = true;
    createReactiveExhaustChoice(
      { G, playerId: ctx.currentPlayer, selfCardId: pending.cardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
      { trigger: "after_play_card", targetPlayerId: ctx.currentPlayer }
    );
    if (pendingEffectInterruption(G)) return true;
  }
  if (!pending.afterPlayHooksStarted) {
    pending.afterPlayHooksStarted = true;
    if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_play_card", payload: { cardId: pending.cardId }, randomNumber: random?.Number })) {
      if (!rollbackPendingPlayedCardHookFailure(G, ctx.currentPlayer, "after_play_card")) {
        G.pendingPlayedCardResolution = undefined;
        logInvalidMove(G, ctx.currentPlayer, "playCard", `after_play_hook_failed(${pending.cardId})`);
      }
      return false;
    }
    if (G.gameover || pendingEffectInterruption(G)) return true;
  }
  G.pendingPlayedCardResolution = undefined;
  const resourceGainSources = moveResolvedCardFromPlayToDiscard(G, ctx.currentPlayer, pending.cardId);
  createReactiveExhaustChoicesForResourceGainSources(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.cardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    resourceGainSources
  );
  if (pendingEffectInterruption(G)) {
    appendResumeEffectsToPending(G, pending.resumeEffects);
    if (pending.resumePlayedCardResolution) G.pendingPlayedCardResolution = pending.resumePlayedCardResolution;
    return true;
  }
  if (pending.resumePlayedCardResolution) G.pendingPlayedCardResolution = pending.resumePlayedCardResolution;
  if ((pending.resumeEffects ?? []).length > 0) return resumeEffectsAfterPendingChoice(moveCtx, pending.sourceCardId, pending.resumeEffects);
  if (pending.resumePlayedCardResolution) return finishPendingPlayedCardResolution(moveCtx);
  return true;
}

function resumeEffectsAfterPendingChoice(moveCtx: MoveCtx, sourceCardId?: string, resumeEffects: Effect[] = []): boolean {
  const { G, ctx, random } = moveCtx;
  if (restorePendingRegionChoiceContinuation(G)) {
    G.pendingRegionChoice!.resumeEffects = [
      ...(G.pendingRegionChoice!.resumeEffects ?? []),
      ...resumeEffects
    ];
    return true;
  }
  markOwnedEffectResolutionContinuationsResolving(G, ctx.currentPlayer);
  if (resumeEffects.length === 0) {
    const nationHookTrigger = G.pendingNationHookContinuation?.trigger;
    if (!continuePendingNationHooks({ G, playerId: ctx.currentPlayer, randomNumber: random?.Number })) {
      if (nationHookTrigger !== "after_reshuffle") {
        rollbackPendingPlayedCardHookFailure(G, ctx.currentPlayer, "after_play_card")
          || rollbackPendingPostDevelopmentHookFailure(G, ctx.currentPlayer);
      }
      return false;
    }
    if (pendingEffectInterruption(G)) return true;
    continuePendingShortGameDevelopmentExileQueue(G);
    if (pendingEffectInterruption(G)) return true;
    if (!continuePendingMarketUnrestHooks(G, ctx.currentPlayer, random?.Number)) {
      rollbackPendingPlayedCardEffectFailure(G, ctx.currentPlayer, "after_gain_unrest");
      return false;
    }
    if (pendingEffectInterruption(G)) return true;
    if (!finishPendingAcquireEffectResolution(moveCtx) || pendingEffectInterruption(G)) return true;
    if (pendingEffectInterruption(G)) return true;
    if (!finishPendingMarketMoveEffectResolution(moveCtx) || pendingEffectInterruption(G)) return true;
    if (pendingEffectInterruption(G)) return true;
    if (!finishPendingBreakThroughEffectResolution(moveCtx) || pendingEffectInterruption(G)) return true;
    if (pendingEffectInterruption(G)) return true;
    if (G.pendingUnrestAllocationResolution) {
      const allocationSnapshot = G.pendingUnrestAllocationResolution.rollbackSnapshot;
      const allocationResolved = continuePendingUnrestAllocationResolution(G, ctx.currentPlayer, random?.Number);
      if (allocationResolved === false) {
        rollbackUnrestAllocationHookFailure(G, ctx.currentPlayer, allocationSnapshot);
        return false;
      }
    }
    if (pendingEffectInterruption(G)) return true;
    if (!continuePendingUnrestTakeAndOpenReactive(G, ctx.currentPlayer, random?.Number)) {
      rollbackPendingPlayedCardEffectFailure(G, ctx.currentPlayer, "after_gain_unrest");
      return false;
    }
    if (pendingEffectInterruption(G)) return true;
    continuePendingReshuffleLifecycle(G, ctx.currentPlayer, random?.Number);
    if (pendingEffectInterruption(G)) return true;
    if (!finishPendingPlayCardResolution(moveCtx) || pendingEffectInterruption(G)) return true;
    if (!finishPendingAcquireCardResolution(moveCtx) || pendingEffectInterruption(G)) return true;
    return finishPendingPlayedCardResolution(moveCtx);
  }
  const followupPendingChoice = pendingEffectInterruption(G);
  if (followupPendingChoice) {
    followupPendingChoice.resumeEffects = [...(followupPendingChoice.resumeEffects ?? []), ...resumeEffects];
    return true;
  }
  if (G.pendingNationHookContinuation) {
    const nationHookTrigger = G.pendingNationHookContinuation.trigger;
    if (!continuePendingNationHooks({ G, playerId: ctx.currentPlayer, randomNumber: random?.Number })) {
      if (nationHookTrigger !== "after_reshuffle") {
        rollbackPendingPlayedCardHookFailure(G, ctx.currentPlayer, "after_play_card")
          || rollbackPendingPostDevelopmentHookFailure(G, ctx.currentPlayer);
      }
      return false;
    }
    const nationHookPending = pendingEffectInterruption(G);
    if (nationHookPending) {
      nationHookPending.resumeEffects = [...(nationHookPending.resumeEffects ?? []), ...resumeEffects];
      return true;
    }
  }
  if (G.pendingMarketUnrestHookContinuation) {
    if (!continuePendingMarketUnrestHooks(G, ctx.currentPlayer, random?.Number)) {
      rollbackPendingPlayedCardEffectFailure(G, ctx.currentPlayer, "after_gain_unrest");
      return false;
    }
    const marketUnrestPending = pendingEffectInterruption(G);
    if (marketUnrestPending) {
      marketUnrestPending.resumeEffects = [...(marketUnrestPending.resumeEffects ?? []), ...resumeEffects];
      return true;
    }
  }
  if (G.pendingAcquireEffectResolution) {
    G.pendingAcquireEffectResolution.resumeEffects = [
      ...(G.pendingAcquireEffectResolution.resumeEffects ?? []),
      ...resumeEffects
    ];
    return finishPendingAcquireEffectResolution(moveCtx);
  }
  if (G.pendingMarketMoveEffectResolution) {
    G.pendingMarketMoveEffectResolution.resumeEffects = [
      ...(G.pendingMarketMoveEffectResolution.resumeEffects ?? []),
      ...resumeEffects
    ];
    return finishPendingMarketMoveEffectResolution(moveCtx);
  }
  if (G.pendingBreakThroughEffectResolution) {
    G.pendingBreakThroughEffectResolution.resumeEffects = [
      ...(G.pendingBreakThroughEffectResolution.resumeEffects ?? []),
      ...resumeEffects
    ];
    return finishPendingBreakThroughEffectResolution(moveCtx);
  }
  const resolved = runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions, allowPendingScoringFinalizationEffects: true },
    resumeEffects
  );
  if (!resolved || pendingEffectInterruption(G)) return resolved;
  const nationHookTrigger = G.pendingNationHookContinuation?.trigger;
  if (!continuePendingNationHooks({ G, playerId: ctx.currentPlayer, randomNumber: random?.Number })) {
    if (nationHookTrigger !== "after_reshuffle") {
      rollbackPendingPlayedCardHookFailure(G, ctx.currentPlayer, "after_play_card")
        || rollbackPendingPostDevelopmentHookFailure(G, ctx.currentPlayer);
    }
    return false;
  }
  if (pendingEffectInterruption(G)) return true;
  if (!continuePendingMarketUnrestHooks(G, ctx.currentPlayer, random?.Number)) {
    rollbackPendingPlayedCardEffectFailure(G, ctx.currentPlayer, "after_gain_unrest");
    return false;
  }
  if (pendingEffectInterruption(G)) return true;
  if (!finishPendingAcquireEffectResolution(moveCtx) || pendingEffectInterruption(G)) return true;
  if (pendingEffectInterruption(G)) return true;
  if (!finishPendingMarketMoveEffectResolution(moveCtx) || pendingEffectInterruption(G)) return true;
  if (pendingEffectInterruption(G)) return true;
  if (!finishPendingBreakThroughEffectResolution(moveCtx) || pendingEffectInterruption(G)) return true;
  if (pendingEffectInterruption(G)) return true;
  if (G.pendingUnrestAllocationResolution) {
    const allocationSnapshot = G.pendingUnrestAllocationResolution.rollbackSnapshot;
    const allocationResolved = continuePendingUnrestAllocationResolution(G, ctx.currentPlayer, random?.Number);
    if (allocationResolved === false) {
      rollbackUnrestAllocationHookFailure(G, ctx.currentPlayer, allocationSnapshot);
      return false;
    }
  }
  if (pendingEffectInterruption(G)) return true;
  if (!continuePendingUnrestTakeAndOpenReactive(G, ctx.currentPlayer, random?.Number)) {
    rollbackPendingPlayedCardEffectFailure(G, ctx.currentPlayer, "after_gain_unrest");
    return false;
  }
  if (pendingEffectInterruption(G)) return true;
  continuePendingReshuffleLifecycle(G, ctx.currentPlayer, random?.Number);
  if (pendingEffectInterruption(G)) return true;
  if (!finishPendingPlayCardResolution(moveCtx) || pendingEffectInterruption(G)) return true;
  if (!finishPendingAcquireCardResolution(moveCtx) || pendingEffectInterruption(G)) return true;
  return finishPendingPlayedCardResolution(moveCtx);
}

function rejectIfPendingChoice(G: GameState, playerId: string, move: string): boolean {
  const pending = blockingPendingChoice(G);
  if (!pending) return false;
  logInvalidMove(G, playerId, move, pending);
  return true;
}

function continuePendingUnrestTakeAndOpenReactive(G: GameState, playerId: string, randomNumber?: () => number): boolean {
  const pending = G.pendingUnrestTakeContinuation;
  if (pending?.playerId === playerId && !G.gameover && !pendingEffectInterruption(G)) {
    const queuedReactiveTargets = pending.reactiveTargetPlayerIds ?? [];
    for (let index = 0; index < queuedReactiveTargets.length; index += 1) {
      pending.reactiveTargetPlayerIds = queuedReactiveTargets.slice(index + 1);
      createReactiveExhaustChoice(
        { G, playerId: pending.playerId, enabledExpansions: G.options?.enabledExpansions },
        { trigger: "after_take_unrest", targetPlayerId: queuedReactiveTargets[index] }
      );
      if (pendingEffectInterruption(G)) return true;
    }
    pending.reactiveTargetPlayerIds = [];
  }
  const continuationResult = continuePendingUnrestTake(G, playerId, randomNumber);
  if (continuationResult && !continuationResult.resolved) return false;
  if (!continuationResult?.completed || G.gameover || pendingEffectInterruption(G)) return true;
  for (const targetPlayerId of continuationResult.reactiveTargetPlayerIds) {
    createReactiveExhaustChoice(
      { G, playerId: continuationResult.playerId, enabledExpansions: G.options?.enabledExpansions },
      { trigger: "after_take_unrest", targetPlayerId }
    );
    if (pendingEffectInterruption(G)) break;
  }
  return true;
}

function continuePausedRulesSequences(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  const pendingUnrestPlayerId = G.pendingUnrestAllocationResolution?.playerId ?? G.pendingUnrestTakeContinuation?.playerId;
  if (pendingUnrestPlayerId) {
    if (G.pendingUnrestAllocationResolution) {
      const allocationSnapshot = G.pendingUnrestAllocationResolution.rollbackSnapshot;
      const allocationResolved = continuePendingUnrestAllocationResolution(G, pendingUnrestPlayerId, randomNumber);
      if (allocationResolved === false) {
        rollbackUnrestAllocationHookFailure(G, pendingUnrestPlayerId, allocationSnapshot);
        return;
      }
    }
    if (!continuePendingUnrestTakeAndOpenReactive(G, pendingUnrestPlayerId, randomNumber)) {
      rollbackPendingPlayedCardEffectFailure(G, pendingUnrestPlayerId, "after_gain_unrest");
      return;
    }
  }
  if (pendingEffectInterruption(G, { includeRegionContinuation: false })) return;
  if (restorePendingRegionChoiceContinuation(G)) return;
  continuePendingShortGameDevelopmentExileQueue(G);
  if (pendingEffectInterruption(G)) return;
  if (!continuePendingMarketUnrestHooks(G, ctx.currentPlayer, randomNumber)) {
    rollbackPendingPlayedCardEffectFailure(G, ctx.currentPlayer, "after_gain_unrest");
    return;
  }
  if (pendingEffectInterruption(G)) return;
  finishPendingAcquireEffectResolution({ G, ctx, random: randomNumber ? { Number: randomNumber } : undefined });
  if (pendingEffectInterruption(G)) return;
  finishPendingMarketMoveEffectResolution({ G, ctx, random: randomNumber ? { Number: randomNumber } : undefined });
  if (pendingEffectInterruption(G)) return;
  continuePendingReshuffleLifecycle(G, ctx.currentPlayer, randomNumber);
  if (pendingEffectInterruption(G)) return;
  continuePendingTurnEndCleanup(G, ctx.currentPlayer, randomNumber);
  continuePendingScoringFinalization(G, randomNumber);
  continuePausedSolstice(G, ctx.currentPlayer, randomNumber);
  continuePausedBotTurn(G, randomNumber);
}

function movePlayOrder(G: GameState, ctx: Ctx): string[] {
  const ctxOrder = (ctx as unknown as { playOrder?: string[] }).playOrder;
  return ctxOrder?.length ? ctxOrder : Object.keys(G.players).sort((a, b) => Number(a) - Number(b));
}

function scheduleTurnEndCleanupAfterPendingChoice(G: GameState, ctx: Ctx): void {
  G.pendingTurnEndCleanup ??= { playerId: ctx.currentPlayer, playOrder: movePlayOrder(G, ctx), stage: "before_optional_discard" };
}

function isActivateTurn(G: GameState): boolean {
  return (G.currentTurnType ?? "activate") === "activate";
}

function cardRemainsInPlay(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "in_play" || type === "region" || type === "power" || type === "state" || type === "trade_route";
}

function isTradeRouteCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "trade_route" || card?.suit === "trade_route" || cardHasSuitIcon(card, "trade_route");
}

function cardGoods(G: GameState, cardId: string): number {
  return G.cardStates?.[cardId]?.resources?.goods ?? 0;
}

function cardMeetsStateRequirement(G: GameState, playerId: string, cardId: string): boolean {
  const requirement = G.cardDb[cardId]?.stateRequirement;
  return !requirement || currentStateMatchesAny(G, playerId, requirement);
}

function canDrawAtLeastOneCardOrReshuffle(G: GameState, playerId: string): boolean {
  const p = G.players[playerId];
  if (p.deck.length > 0 || p.discard.length > 0) return true;
  const progressionTokens = p.progressionTokens ?? { nationDeck: 0, developmentArea: 0 };
  const canSpendProgressionToken = progressionTokens.nationDeck <= 0
    && progressionTokens.developmentArea <= 0
    && p.actionTokensAvailable > 0;
  if (!canSpendProgressionToken) return false;

  const ruleset = G.activeNationRulesets?.[playerId];
  const skipsDefaultNationProgression = (ruleset?.rulesetTags ?? []).includes("no_nation_deck")
    || (ruleset?.reshuffleOverrides ?? []).some((ov) => ov.op === "skip_default_nation_card_addition");
  const canDevelopBeforeNationDeckEmpty = (ruleset?.reshuffleOverrides ?? []).some((ov) => ov.op === "development_available_from_start")
    || (ruleset?.rulesetTags ?? []).includes("development_area_available_from_start");
  if (canDevelopBeforeNationDeckEmpty && canPayAnyDevelopmentCard(G, playerId)) return true;
  if (skipsDefaultNationProgression) return false;
  return p.nationDeck.length > 0 || Boolean(p.accessionCardId) || canPayAnyDevelopmentCard(G, playerId);
}

function canPayAnyDevelopmentCard(G: GameState, playerId: string): boolean {
  if (!canUseDevelopmentArea(G, playerId)) return false;
  const p = G.players[playerId];
  return p.developmentArea.some((cardId) => canPayResourceCosts(G, playerId, G.cardDb[cardId]?.developmentCost ?? {}));
}

function canResolveDevelopEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "develop" }>): boolean {
  if (!canUseDevelopmentArea(G, playerId)) return false;
  return effect.free
    ? G.players[playerId].developmentArea.length > 0
    : canPayAnyDevelopmentCard(G, playerId);
}

function canGainResourceFromSupply(G: GameState, resource: ResourceName, amount: number): boolean {
  const canonical = canonicalResourceName(resource);
  if (amount <= 0) return false;
  return !G.resourceSupply || (G.resourceSupply[canonical] ?? 0) > 0;
}

function canGainFameCard(G: GameState, playerId: string): boolean {
  const fameDeck = G.fameDeck;
  if (!fameDeck) return false;
  if (fameDeck.available.length > 0) return true;
  return Boolean(
    fameDeck.specialBottomCardId
    && fameDeck.specialBottomSide !== "face_down"
    && !fameDeck.resolvedSpecialByPlayer?.[playerId]
  );
}

function canLookAtCards(G: GameState, playerId: string, source: LookSourceZone): boolean {
  const p = G.players[playerId];
  if (source === "deck") return p.deck.length > 0;
  if (source === "nationDeck") return lookableNationDeckCards(G, p, playerId).length > 0;
  const fameDeck = G.fameDeck;
  if (!fameDeck) return false;
  return peekFameCards(G, 1).length > 0;
}

function canResolveTradeEffect(G: GameState, playerId: string): boolean {
  if (!G.options?.enabledExpansions?.includes("trade_routes")) return false;
  const p = G.players[playerId];
  const hasGoods = (p.resources.goods ?? 0) > 0;
  const hasGoodsFallback = hasGoods && canGainResourceFromSupply(G, "knowledge", 1);
  const ownRouteAvailable = p.playArea.some((cardId) =>
    isTradeRouteCard(G, cardId) && cardGoods(G, cardId) < 3 && hasGoods
  );
  if (ownRouteAvailable || hasGoodsFallback) return true;
  return Object.entries(G.players).some(([candidatePlayerId, opponent]) =>
    candidatePlayerId !== playerId
    && opponent.playArea.some((cardId) =>
      isTradeRouteCard(G, cardId)
      && cardGoods(G, cardId) < 3
      && canGainResourceFromSupply(G, "goods", 1)
      && canGainResourceFromSupply(G, "knowledge", 1)
    )
  );
}

function tradeRoutesEnabled(G: GameState): boolean {
  return Boolean(G.options?.enabledExpansions?.includes("trade_routes"));
}

function canResolveProfitEffect(G: GameState, playerId: string, selfCardId?: string): boolean {
  return Boolean(
    selfCardId
    && tradeRoutesEnabled(G)
    && G.players[playerId].playArea.includes(selfCardId)
    && cardGoods(G, selfCardId) >= 3
  );
}

function marketDeckHasDrawableCard(G: GameState, deckName: NonNullable<ReturnType<typeof deckForSuit>>): boolean {
  const deck = G.marketDecks?.[deckName];
  if (!deck || deck.length === 0) return false;
  return !(deck.length === 1 && G.marketDeckBottomCards?.[deckName] === deck[0]);
}

function marketDeckDrawableTopCard(G: GameState, deckName: NonNullable<ReturnType<typeof deckForSuit>>): string | undefined {
  const deck = G.marketDecks?.[deckName];
  if (!deck || deck.length === 0) return undefined;
  if (deck.length === 1 && G.marketDeckBottomCards?.[deckName] === deck[0]) return undefined;
  return deck[0];
}

function canResolveExactDeckBreakThroughEffect(G: GameState, playerId: string, suit: Suit, cardId: string): boolean {
  if (!cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], suit)) return false;
  if (suit === "tributary" && visibleTributaryBreakThroughCards(G, playerId).includes(cardId)) return true;
  const sourceDeck = suit === "tributary" ? undefined : deckForSuit(suit);
  if (sourceDeck && marketDeckDrawableTopCard(G, sourceDeck) === cardId) return true;
  return (G.marketDecks?.mainDeck ?? []).includes(cardId);
}

function canResolveDeckBreakThroughEffect(G: GameState, playerId: string, suit: Suit, cardId?: string): boolean {
  if (cardId) return canResolveExactDeckBreakThroughEffect(G, playerId, suit, cardId);
  if (suit === "tributary" && visibleTributaryBreakThroughCards(G, playerId).length > 0) return true;
  const sourceDeck = suit === "tributary" ? undefined : deckForSuit(suit);
  if (sourceDeck && marketDeckHasDrawableCard(G, sourceDeck)) return true;
  const mainDeck = G.marketDecks?.mainDeck ?? [];
  if (mainDeck.some((cardId) => cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], suit))) return true;
  return canGainResourceFromSupply(G, "materials", 1);
}

function isFindAccessionCard(G: GameState, playerId: string, p: GameState["players"][string], cardId: string): boolean {
  return isEffectiveAccessionCard(G, playerId, p, cardId);
}

function findSourceZoneCardsForLegality(G: GameState, playerId: string, zone: string): string[] {
  if (zone === "garrison") return garrisonedCardsInPlay(G, playerId);
  const player = G.players[playerId];
  const direct = (player as unknown as Record<string, unknown>)[zone];
  if (Array.isArray(direct)) return direct as string[];
  if (player.sideAreas?.[zone]) return player.sideAreas[zone];
  if (G.specialZones?.[playerId]?.[zone]?.cardIds) return G.specialZones[playerId][zone].cardIds;
  if (G.globalSpecialZones?.[zone]?.cardIds) return G.globalSpecialZones[zone].cardIds;
  return [];
}

function searchableFindZoneCards(G: GameState, playerId: string, zone: FindSourceZone): string[] {
  const p = G.players[playerId];
  if (zone === "history") {
    return actualHistorySourceZoneIds(G, playerId).flatMap((zoneId) => findSourceZoneCardsForLegality(G, playerId, zoneId));
  }
  const cards = findSourceZoneCardsForLegality(G, playerId, zone);
  return zone === "nationDeck" ? cards.filter((cardId) => !isFindAccessionCard(G, playerId, p, cardId)) : cards;
}

function returnUnrestSourceZones(effect: Extract<Effect, { op: "return_unrest" }>): ReturnUnrestSourceZone[] {
  return effect.sourceZones?.length ? effect.sourceZones : ["hand"];
}

function canResolveReturnUnrestEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "return_unrest" }>): boolean {
  return returnUnrestSourceZones(effect).some((zone) => (zoneCardsForReturnUnrest(G, playerId, zone) ?? []).some((cardId) =>
    isUnrestCard(G, cardId) && (!effect.cardId || cardId === effect.cardId)
  ));
}

function returnFameSourceZones(effect: Extract<Effect, { op: "return_fame" }>): ReturnFameSourceZone[] {
  return effect.sourceZones?.length ? effect.sourceZones : ["hand"];
}

function canResolveReturnFameEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "return_fame" }>): boolean {
  return returnFameSourceZones(effect).some((zone) => zoneCardsForReturnFame(G, playerId, zone).some((cardId) =>
    isFameCard(G, cardId) && (!effect.cardId || cardId === effect.cardId)
  ));
}

function placeOnDeckSourceZone(effect: Extract<Effect, { op: "place_card_on_deck" }>): PlaceOnDeckSourceZone {
  return effect.sourceZone ?? "hand";
}

function canResolvePlaceOnDeckEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "place_card_on_deck" }>): boolean {
  const p = G.players[playerId];
  const sourceZone = placeOnDeckSourceZone(effect);
  return effect.cardId ? p[sourceZone].includes(effect.cardId) : p[sourceZone].length > 0;
}

function canResolveReturnExhaustTokenEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "return_exhaust_token" }>, selfCardId?: string): boolean {
  const cardIds = returnableExhaustTokenCardIds(G, playerId);
  if (
    effect.trigger === "on_exhaust"
    && selfCardId
    && G.players[playerId].playArea.includes(selfCardId)
    && (!effect.cardId || effect.cardId === selfCardId)
  ) {
    return true;
  }
  return effect.cardId ? cardIds.includes(effect.cardId) : cardIds.length > 0;
}

function giveCardRecipients(G: GameState, playerId: string, effect: Extract<Effect, { op: "give_card" }>): string[] {
  const candidates = effect.targetPlayerId
    ? [effect.targetPlayerId]
    : effect.targetPlayerIds?.length
      ? effect.targetPlayerIds
      : Object.keys(G.players);
  return candidates
    .filter((candidatePlayerId) => candidatePlayerId !== playerId && Boolean(G.players[candidatePlayerId]));
}

function playerIdsForScope(G: GameState, playerId: string, scope: TargetPlayerScope | undefined): string[] {
  if (scope === "all") return Object.keys(G.players);
  if (scope === "others") return Object.keys(G.players).filter((candidatePlayerId) => candidatePlayerId !== playerId);
  return [playerId];
}

function canResolveDrawEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "draw" }>): boolean {
  if (effect.count <= 0) return false;
  const source = effect.source ?? "deck";
  const targetPlayerIds = effect.targetPlayerIds ?? playerIdsForScope(G, playerId, effect.targetPlayerScope);
  return targetPlayerIds.some((targetPlayerId) => {
    if (!G.players[targetPlayerId]) return false;
    if (source === "fameDeck") return canGainFameCard(G, targetPlayerId);
    if (source !== "deck") return drawChoiceSourceCards(G, targetPlayerId, source).length > 0;
    return canDrawAtLeastOneCardOrReshuffle(G, targetPlayerId);
  });
}

function stealSourcePlayerIds(G: GameState, playerId: string, effect: Extract<Effect, { op: "steal_resource" }>): string[] {
  if (effect.fromPlayerIds?.length) return effect.fromPlayerIds;
  if (effect.fromPlayerId) return [effect.fromPlayerId];
  if (effect.targetPlayerScope) return playerIdsForScope(G, playerId, effect.targetPlayerScope);
  return [];
}

function canResolveStealEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "steal_resource" }>): boolean {
  if (effect.amount <= 0) return false;
  return stealSourcePlayerIds(G, playerId, effect).some((targetPlayerId) => {
    if (!G.players[targetPlayerId]) return false;
    return resourceAmount(G.players[targetPlayerId].resources, effect.resource) > 0 || (effect.ifUnable ?? []).length > 0;
  });
}

function canResolveGiveCardEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "give_card" }>): boolean {
  const p = G.players[playerId];
  return giveCardRecipients(G, playerId, effect).length > 0
    && (effect.cardId ? p.hand.includes(effect.cardId) : p.hand.length > 0);
}

function swapSourceZone(effect: Extract<Effect, { op: "swap_card" }>): SwapSourceZone {
  return effect.sourceZone ?? "hand";
}

function canResolveSwapEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "swap_card" }>): boolean {
  return availableSwapChoices(G, playerId, swapSourceZone(effect))
    .some((choice) => (!effect.cardId || choice.cardId === effect.cardId) && (!effect.marketCardId || choice.marketCardId === effect.marketCardId));
}

function canResolveTakeUnrestEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "take_unrest" }>): boolean {
  if (effect.count <= 0) return false;
  const recipients = effect.targetPlayerIds ?? playerIdsForScope(G, playerId, effect.targetPlayerScope);
  return recipients.some((candidatePlayerId) => Boolean(G.players[candidatePlayerId]));
}

function marketCardMatchesMoveEffect(G: GameState, playerId: string, cardId: string, effect: Extract<Effect, { op: "gain_card" | "take_card" }>): boolean {
  const card = G.cardDb[cardId];
  if (!card || effect.source !== "market") return false;
  if (effect.cardId && cardId !== effect.cardId) return false;
  if (effect.suit && !cardHasSuitIconForPlayer(G, playerId, card, effect.suit)) return false;
  if (effect.cardType && (card.cardType ?? card.type) !== effect.cardType) return false;
  return true;
}

function explicitSpendCost(effects: Effect[]): ResourceCost {
  const cost: Partial<Record<ResourceName, number>> = {};
  for (const effect of effects) {
    if (effect.op !== "spend_resource") continue;
    cost[effect.resource] = (cost[effect.resource] ?? 0) + effect.amount;
  }
  return cost;
}

function removeExplicitSpendEffects(effects: Effect[]): Effect[] {
  return effects.filter((effect) => effect.op !== "spend_resource");
}

function canCreatePlayerChoice(effect: Effect): boolean {
  return [
    "optional",
    "choose_one",
    "discard_cards",
    "draw",
    "find_card",
    "acquire_card",
    "gain_card",
    "take_card",
    "break_through",
    "exile_card",
    "garrison_card",
    "recall_region",
    "abandon_region",
    "develop",
    "trade",
    "return_unrest",
    "return_fame",
    "place_card_on_deck",
    "return_exhaust_token",
    "free_play_card",
    "give_card",
    "swap_card",
    "look_cards",
    "look_take_card",
    "take_unrest"
  ].includes(effect.op);
}

function canCreateResourceGainReactiveBoundary(G: GameState, playerId: string, effect: Effect, selfCardId?: string): boolean {
  if (effect.op !== "gain_resource" && effect.op !== "steal_resource") return false;
  if (effect.amount <= 0) return false;
  if (effect.op === "steal_resource" && !stealSourcePlayerIds(G, playerId, effect).some((targetPlayerId) => resourceAmount(G.players[targetPlayerId]?.resources, effect.resource) > 0)) return false;
  const sourceWasInPlay = sourceCardIsInPlay(G, playerId, selfCardId);
  for (const [ownerPlayerId, owner] of Object.entries(G.players)) {
    if (owner.exhaustTokensAvailable < 1) continue;
    const candidateCardIds = [...owner.playArea, ...owner.powerArea];
    if (candidateCardIds.some((cardId) =>
      !isCardExhausted(G, cardId)
        && (G.cardDb[cardId]?.effects ?? []).some((candidate) =>
          candidate.trigger === "on_exhaust"
            && pendingReactiveEventMatchesCondition(G, ownerPlayerId, {
              playerId: ownerPlayerId,
              cardIds: [cardId],
              resolvingPlayerId: playerId,
              sourceCardId: selfCardId,
              trigger: "after_gain_resource",
              resource: effect.resource,
              eventSourceCardId: selfCardId,
              eventSourceWasInPlay: sourceWasInPlay
            }, reactiveCondition(candidate))
            && canResolveEffectText(G, ownerPlayerId, candidate, cardId)
        )
    )) return true;
  }
  return false;
}

function canCreateCostBoundary(G: GameState, playerId: string, effect: Effect, selfCardId?: string): boolean {
  return canCreatePlayerChoice(effect) || canCreateResourceGainReactiveBoundary(G, playerId, effect, selfCardId);
}

function firstChoiceBoundary(G: GameState, playerId: string, effects: Effect[], selfCardId?: string): number {
  return effects.findIndex((effect) => canCreateCostBoundary(G, playerId, effect, selfCardId));
}

function costPaymentPrefix(G: GameState, playerId: string, effects: Effect[], selfCardId?: string): Effect[] {
  const boundary = firstChoiceBoundary(G, playerId, effects, selfCardId);
  return boundary < 0 ? effects : effects.slice(0, boundary);
}

function orderedEffectsAfterPrefixPayment(effects: Effect[], prefix: Effect[]): Effect[] {
  if (prefix.length === 0) return effects;
  return [...removeExplicitSpendEffects(prefix), ...effects.slice(prefix.length)];
}

function defaultGarrisonHostCardsForResolution(G: GameState, playerId: string, selfCardId: string | undefined): string[] {
  const p = G.players[playerId];
  if (selfCardId && (p.playArea.includes(selfCardId) || p.hand.includes(selfCardId)) && isRegionCard(G, selfCardId)) {
    return [selfCardId];
  }
  return p.playArea.filter((cardId) => isRegionCard(G, cardId));
}

function canResolveGarrisonEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "garrison_card" }>, selfCardId?: string): boolean {
  const p = G.players[playerId];
  if (effect.hostCardId || effect.cardId) {
    if (!effect.hostCardId || !effect.cardId) return false;
    return p.playArea.includes(effect.hostCardId)
      && isRegionCard(G, effect.hostCardId)
      && p.hand.includes(effect.cardId)
      && canBeGarrisoned(G, effect.cardId);
  }
  const handCardIds = p.hand.filter((cardId) => cardId !== selfCardId && canBeGarrisoned(G, cardId));
  return defaultGarrisonHostCardsForResolution(G, playerId, selfCardId).length > 0 && handCardIds.length > 0;
}

function regionActionCardIds(G: GameState, playerId: string): string[] {
  const p = G.players[playerId];
  return [...p.playArea, ...garrisonedCardsInPlay(G, playerId)].filter((cardId) => isRegionCard(G, cardId));
}

function regionTargetPlayerIds(G: GameState, playerId: string, effect: Extract<Effect, { op: "recall_region" | "abandon_region" }>): string[] {
  return effect.targetPlayerIds ?? playerIdsForScope(G, playerId, effect.targetPlayerScope);
}

function canResolveRegionEffect(G: GameState, playerId: string, effect: Extract<Effect, { op: "recall_region" | "abandon_region" }>): boolean {
  return regionTargetPlayerIds(G, playerId, effect).some((targetPlayerId) => {
    const p = G.players[targetPlayerId];
    if (!p) return false;
    return effect.cardId
      ? (p.playArea.includes(effect.cardId) || garrisonedCardsInPlay(G, targetPlayerId).includes(effect.cardId)) && isRegionCard(G, effect.cardId)
      : regionActionCardIds(G, targetPlayerId).length > 0;
  });
}

function marketCardCanBeExiled(G: GameState, cardId: string): boolean {
  return !marketCardHasTokens(G, cardId);
}

function marketCardMatchesExileEffect(G: GameState, playerId: string, cardId: string, effect: Extract<Effect, { op: "exile_card" }>): boolean {
  const card = G.cardDb[cardId];
  if (!card || !marketCardCanBeExiled(G, cardId)) return false;
  if (effect.cardId && cardId !== effect.cardId) return false;
  if (effect.suit && !cardHasSuitIconForPlayer(G, playerId, card, effect.suit)) return false;
  if (effect.cardType && (card.cardType ?? card.type) !== effect.cardType) return false;
  return true;
}

function isPlayerExileSource(source: Extract<Effect, { op: "exile_card" }>["source"]): source is PlayerExileSource {
  return source !== "market";
}

function playerCardMatchesExileEffect(G: GameState, playerId: string, cardId: string, effect: Extract<Effect, { op: "exile_card" }>): boolean {
  const card = G.cardDb[cardId];
  if (!card) return false;
  if (playerCardOrGarrisonHasTokens(G, cardId)) return false;
  if (effect.cardId && cardId !== effect.cardId) return false;
  if (effect.suit && !cardHasSuitIconForPlayer(G, playerId, card, effect.suit)) return false;
  if (effect.cardType && (card.cardType ?? card.type) !== effect.cardType) return false;
  return playerExileSourceCards(G, playerId, effect.source as PlayerExileSource).includes(cardId);
}

function canResolveChoiceEffectText(G: GameState, playerId: string, effect: Effect, selfCardId?: string): boolean {
  const p = G.players[playerId];
  switch (effect.op) {
    case "draw":
      return canResolveDrawEffect(G, playerId, effect);
    case "draw_if_able":
      return effect.count > 0 && p.deck.length > 0;
    case "gain_resource":
      return effect.amount > 0 && canGainResourceFromSupply(G, effect.resource, effect.amount);
    case "spend_action":
      return effect.amount > 0 && p.actionsRemaining >= effect.amount && p.actionTokensAvailable >= effect.amount;
    case "remove_resource":
    case "return_resource":
      return effect.amount > 0 && resourceAmount(p.resources, effect.resource) > 0;
    case "steal_resource":
      return canResolveStealEffect(G, playerId, effect);
    case "spend_resource":
      return effect.amount > 0 && canPayResourceCost(G, playerId, effect.resource, effect.amount);
    case "discard_cards":
      return effect.count > 0 && G.players[playerId].hand.filter((cardId) => cardId !== selfCardId).length >= effect.count;
    case "gain_fame":
      return effect.count > 0 && canGainFameCard(G, playerId);
    case "look_cards":
      return effect.count > 0 && canLookAtCards(G, playerId, effect.source);
    case "look_take_card":
      return effect.count > 0 && canLookAtCards(G, playerId, effect.source);
    case "optional":
      return choiceOptionIsLegal(G, playerId, effect.effects, selfCardId);
    case "choose_one":
      return effect.choices.some((choice) => choiceOptionIsLegal(G, playerId, choice, selfCardId));
    case "conditional_resource_at_least":
      return resourceAmount(p.resources, effect.resource) >= effect.atLeast
        ? effect.then.some((candidate) => canResolveChoiceEffectText(G, playerId, candidate, selfCardId))
        : (effect.else ?? []).some((candidate) => canResolveChoiceEffectText(G, playerId, candidate, selfCardId));
    case "conditional_state_is":
      return currentStateMatches(G, playerId, effect.state)
        ? effect.then.some((candidate) => canResolveChoiceEffectText(G, playerId, candidate, selfCardId))
        : (effect.else ?? []).some((candidate) => canResolveChoiceEffectText(G, playerId, candidate, selfCardId));
    default:
      return canResolveEffectText(G, playerId, effect, selfCardId);
  }
}

function choiceOptionIsLegal(G: GameState, playerId: string, effects: Effect[], selfCardId?: string): boolean {
  return effects.length > 0
    && canPayResourceCosts(G, playerId, explicitSpendCost(effects))
    && removeExplicitSpendEffects(effects).some((effect) => canResolveChoiceEffectText(G, playerId, effect, selfCardId));
}

function resourceCostHasPositiveAmount(cost: ResourceCost): boolean {
  return Object.values(cost).some((amount) => (amount ?? 0) > 0);
}

function canResolveEffectText(G: GameState, playerId: string, effect: Effect, selfCardId?: string): boolean {
  const p = G.players[playerId];
  switch (effect.op) {
    case "draw":
      return canResolveDrawEffect(G, playerId, effect);
    case "draw_if_able":
      return effect.count > 0 && p.deck.length > 0;
    case "trigger_scoring":
      return true;
    case "gain_resource":
      return effect.amount > 0 && canGainResourceFromSupply(G, effect.resource, effect.amount);
    case "gain_action":
      return effect.amount > 0;
    case "spend_action":
      return effect.amount > 0 && p.actionsRemaining >= effect.amount && p.actionTokensAvailable >= effect.amount;
    case "optional":
      return choiceOptionIsLegal(G, playerId, effect.effects, selfCardId);
    case "choose_one":
      return effect.choices.some((choice) => choiceOptionIsLegal(G, playerId, choice, selfCardId));
    case "spend_resource":
      return effect.amount > 0 && canPayResourceCost(G, playerId, effect.resource, effect.amount);
    case "remove_resource":
    case "return_resource":
      if (effect.trigger === "on_exhaust") return true;
      return effect.amount <= 0 || resourceAmount(p.resources, effect.resource) > 0;
    case "steal_resource":
      if (effect.trigger === "on_exhaust") return true;
      return effect.amount <= 0 || canResolveStealEffect(G, playerId, effect);
    case "discard_random":
      return p.hand.length > (effect.trigger === "on_play" ? 1 : 0);
    case "discard_cards":
      return effect.count > 0 && p.hand.filter((cardId) => cardId !== selfCardId).length >= effect.count;
    case "return_unrest":
      return canResolveReturnUnrestEffect(G, playerId, effect);
    case "return_fame":
      return canResolveReturnFameEffect(G, playerId, effect);
    case "place_card_on_deck":
      return canResolvePlaceOnDeckEffect(G, playerId, effect);
    case "return_exhaust_token":
      return canResolveReturnExhaustTokenEffect(G, playerId, effect, selfCardId);
    case "give_card":
      return canResolveGiveCardEffect(G, playerId, effect);
    case "swap_card":
      return canResolveSwapEffect(G, playerId, effect);
    case "take_unrest":
      return canResolveTakeUnrestEffect(G, playerId, effect);
    case "gain_fame":
      return effect.count > 0 && canGainFameCard(G, playerId);
    case "trade":
      return canResolveTradeEffect(G, playerId);
    case "commerce":
      return tradeRoutesEnabled(G);
    case "profit":
      return canResolveProfitEffect(G, playerId, selfCardId);
    case "treat_suit_as":
      return effect.to.length > 0;
    case "garrison_card":
      return canResolveGarrisonEffect(G, playerId, effect, selfCardId);
    case "recall_region":
    case "abandon_region":
      return canResolveRegionEffect(G, playerId, effect);
    case "develop":
      return canResolveDevelopEffect(G, playerId, effect);
    case "move_self_to_history":
      return true;
    case "exile_card":
      return effect.source === "market"
        ? G.market.some((cardId) => marketCardMatchesExileEffect(G, playerId, cardId, effect))
        : playerExileSourceCards(G, playerId, effect.source).some((cardId) => playerCardMatchesExileEffect(G, playerId, cardId, effect));
    case "acquire_card":
      return effect.source === "exile"
        ? availableExileCards(G, playerId).some((cardId) => canAcquireExileCard(G, cardId) && (!effect.cardId || cardId === effect.cardId) && (!effect.suit || cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], effect.suit)) && (!effect.cardType || (G.cardDb[cardId]?.cardType ?? G.cardDb[cardId]?.type) === effect.cardType))
        : G.market.some((cardId) => (!effect.cardId || cardId === effect.cardId) && (!effect.suit || cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], effect.suit)) && (!effect.cardType || (G.cardDb[cardId]?.cardType ?? G.cardDb[cardId]?.type) === effect.cardType));
    case "gain_card":
    case "take_card":
      return G.market.some((cardId) => marketCardMatchesMoveEffect(G, playerId, cardId, effect));
    case "break_through":
      return effect.source === "market"
        ? G.market.some((cardId) =>
          (!effect.cardId || cardId === effect.cardId)
          && cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], effect.suit)
        )
        : effect.source === "exile"
          ? availableExileCards(G, playerId).some((cardId) =>
            (!effect.cardId || cardId === effect.cardId)
            && cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], effect.suit)
          )
          : canResolveDeckBreakThroughEffect(G, playerId, effect.suit, effect.cardId);
    case "find_card":
      return ((effect.sourceZones?.length ? effect.sourceZones : ["hand", "discard", "deck", "nationDeck"]) as FindSourceZone[]).some((zone) => searchableFindZoneCards(G, playerId, zone).some((cardId) =>
        (!effect.cardId || cardId === effect.cardId) && (!effect.suit || cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], effect.suit)) && (!effect.cardType || (G.cardDb[cardId]?.cardType ?? G.cardDb[cardId]?.type) === effect.cardType)
      ));
    case "look_cards":
      return effect.count > 0 && canLookAtCards(G, playerId, effect.source);
    case "look_take_card":
      return effect.count > 0 && canLookAtCards(G, playerId, effect.source);
    case "conditional_resource_at_least":
      return resourceAmount(p.resources, effect.resource) >= effect.atLeast
        ? effect.then.some((candidate) => canResolveEffectText(G, playerId, candidate, selfCardId))
        : (effect.else ?? []).some((candidate) => canResolveEffectText(G, playerId, candidate, selfCardId));
    case "conditional_state_is":
      return currentStateMatches(G, playerId, effect.state)
        ? effect.then.some((candidate) => canResolveEffectText(G, playerId, candidate, selfCardId))
        : (effect.else ?? []).some((candidate) => canResolveEffectText(G, playerId, candidate, selfCardId));
    default:
      return false;
  }
}

function cardHasResolvableOnPlayText(G: GameState, playerId: string, cardId: string, payment?: ResourceCost): boolean {
  const onPlayEffects = (G.cardDb[cardId]?.effects ?? []).filter((effect) => effect.trigger === "on_play");
  if (onPlayEffects.length === 0) return true;
  if (!canPayResourceCosts(G, playerId, explicitSpendCost(costPaymentPrefix(G, playerId, onPlayEffects, cardId)), payment)) return false;
  return onPlayEffects.some((effect) => canResolveEffectText(G, playerId, effect, cardId));
}

function cardHasResolvableExhaustText(G: GameState, playerId: string, cardId: string, payment?: ResourceCost): boolean {
  const onExhaustEffects = (G.cardDb[cardId]?.effects ?? []).filter((effect) => effect.trigger === "on_exhaust" && !reactiveCondition(effect));
  if (onExhaustEffects.length === 0) return true;
  if (!canPayResourceCosts(G, playerId, explicitSpendCost(costPaymentPrefix(G, playerId, onExhaustEffects, cardId)), payment)) return false;
  return onExhaustEffects.some((effect) => canResolveEffectText(G, playerId, effect, cardId));
}

function isFreePlayCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return (card?.tags ?? []).some((tag) => tag.toLowerCase().replace(/[_\s-]+/g, "_") === "free_play");
}

function hasFreePlayedThisTurn(G: GameState, playerId: string, cardId: string): boolean {
  return (G.freePlayedThisTurn?.[playerId] ?? []).includes(cardId);
}

function recordFreePlay(G: GameState, playerId: string, cardId: string): void {
  G.freePlayedThisTurn ??= {};
  G.freePlayedThisTurn[playerId] ??= [];
  if (!G.freePlayedThisTurn[playerId].includes(cardId)) G.freePlayedThisTurn[playerId].push(cardId);
}

function markActionToken(G: GameState, cardId: string): void {
  G.cardStates ??= {};
  G.cardStates[cardId] ??= {};
  G.cardStates[cardId].actionTokens = (G.cardStates[cardId].actionTokens ?? 0) + 1;
}

function canExhaustCard(G: GameState, playerId: string, cardId: string): boolean {
  const p = G.players[playerId];
  return p.playArea.includes(cardId) || p.powerArea.includes(cardId);
}

function isCardExhausted(G: GameState, cardId: string): boolean {
  const state = G.cardStates?.[cardId];
  return state?.exhausted === true || (state?.exhaustTokens ?? 0) > 0;
}

function markCardExhausted(G: GameState, cardId: string): void {
  G.cardStates ??= {};
  G.cardStates[cardId] ??= {};
  G.cardStates[cardId].exhausted = true;
  G.cardStates[cardId].exhaustTokens = (G.cardStates[cardId].exhaustTokens ?? 0) + 1;
}

function appendResumeEffectsToPending(G: GameState, effects: Effect[] | undefined): void {
  if (!effects?.length) return;
  const pending = pendingEffectInterruption(G);
  if (!pending) return;
  pending.resumeEffects = [...(pending.resumeEffects ?? []), ...effects];
}

function resumeReactiveExhaustSourceEffects(moveCtx: MoveCtx, pending: NonNullable<GameState["pendingReactiveExhaustChoice"]>): boolean {
  const sourceMoveCtx = {
    ...moveCtx,
    ctx: { ...moveCtx.ctx, currentPlayer: pending.resolvingPlayerId } as Ctx
  };
  if (restorePendingRegionChoiceContinuation(moveCtx.G)) {
    if (pending.resumeEffects?.length) {
      moveCtx.G.pendingRegionChoice!.resumeEffects = [
        ...(moveCtx.G.pendingRegionChoice!.resumeEffects ?? []),
        ...pending.resumeEffects
      ];
    }
    return true;
  }
  const resumed = resumeEffectsAfterPendingChoice(
    {
      ...sourceMoveCtx
    },
    pending.sourceCardId,
    pending.resumeEffects ?? []
  );
  if (resumed && !pendingEffectInterruption(moveCtx.G)) {
    continuePausedRulesSequences(moveCtx.G, sourceMoveCtx.ctx, moveCtx.random?.Number);
  }
  return resumed;
}

function markOwnedEffectResolutionContinuationsResolving(G: GameState, playerId: string): void {
  if (G.pendingAcquireEffectResolution?.playerId === playerId) {
    G.pendingAcquireEffectResolution.resolving = true;
  }
  if (G.pendingMarketMoveEffectResolution?.playerId === playerId) {
    G.pendingMarketMoveEffectResolution.resolving = true;
  }
  if (G.pendingBreakThroughEffectResolution?.playerId === playerId) {
    G.pendingBreakThroughEffectResolution.resolving = true;
  }
}

function reactiveCondition(effect: Effect): ReactiveExhaustCondition | undefined {
  return (effect as Effect & { reactive?: ReactiveExhaustCondition }).reactive;
}

function pendingReactiveEventMatchesCondition(G: GameState, ownerPlayerId: string, pending: NonNullable<GameState["pendingReactiveExhaustChoice"]>, condition: ReactiveExhaustCondition | undefined): boolean {
  if (!condition || condition.trigger !== pending.trigger) return false;
  if (condition.trigger === "after_gain_resource") {
    if (condition.resource && canonicalResourceName(condition.resource) !== (pending.resource ? canonicalResourceName(pending.resource) : undefined)) return false;
    if (!condition.sourceSuit) return true;
    if (!pending.eventSourceCardId || !pending.eventSourceWasInPlay) return false;
    return cardHasSuitIconForPlayer(G, ownerPlayerId, G.cardDb[pending.eventSourceCardId], condition.sourceSuit);
  }
  if (
    condition.trigger === "after_take_unrest"
    || condition.trigger === "after_acquire_card"
    || condition.trigger === "after_play_card"
    || condition.trigger === "after_break_through_card"
  ) {
    const target = condition.target ?? "any";
    if (target === "self") return pending.targetPlayerId === ownerPlayerId;
    if (target === "opponent") return pending.targetPlayerId !== ownerPlayerId;
    return true;
  }
  return false;
}

function matchingReactiveExhaustEffects(G: GameState, ownerPlayerId: string, cardId: string, pending: NonNullable<GameState["pendingReactiveExhaustChoice"]>): Effect[] {
  return (G.cardDb[cardId]?.effects ?? []).filter((effect) =>
    effect.trigger === "on_exhaust"
      && pendingReactiveEventMatchesCondition(G, ownerPlayerId, pending, reactiveCondition(effect))
  );
}

const INNOVATE_SUITS: Suit[] = ["region", "uncivilized", "civilized", "tributary"];

function isInnovateSuit(suit: Suit): boolean {
  return INNOVATE_SUITS.includes(suit);
}

function matchingMarketCardsForSuit(G: GameState, playerId: string, suit: Suit): string[] {
  return G.market.filter((cardId) => cardHasSuitIconForPlayer(G, playerId, G.cardDb[cardId], suit));
}

function isUnrestCard(G: GameState, cardId: string): boolean {
  return isReturnableUnrestCard(G, cardId) || cardId.includes("unrest");
}

function moveResolvedCardFromPlayToDiscard(G: GameState, playerId: string, cardId: string): ResourceGainSource[] {
  if (cardRemainsInPlay(G, cardId)) return [];
  const p = G.players[playerId];
  const playIndex = p.playArea.indexOf(cardId);
  if (playIndex < 0) return [];
  const resourceGainSources: ResourceGainSource[] = [];
  p.playArea.splice(playIndex, 1);
  const cardGains = collectCardResourcesToPlayer(G, playerId, cardId);
  if (Object.values(cardGains).some((amount) => (amount ?? 0) > 0)) {
    resourceGainSources.push({ sourceCardId: cardId, sourceWasInPlay: true, gains: cardGains });
  }
  const garrisoned = detachGarrisonedCards(G, cardId);
  garrisoned.forEach((garrisonedCardId) => {
    const gains = collectAndClearCardStateToPlayer(G, playerId, garrisonedCardId);
    if (Object.values(gains).some((amount) => (amount ?? 0) > 0)) {
      resourceGainSources.push({ sourceCardId: garrisonedCardId, sourceWasInPlay: true, gains });
    }
  });
  p.discard.push(cardId, ...garrisoned);
  return resourceGainSources;
}

type FindZone = FindSourceZone;

function findCardZone(G: GameState, playerId: string, cardId: string): FindZone | undefined {
  const p = G.players[playerId];
  const zones: Array<Exclude<FindZone, "garrison">> = ["hand", "discard", "deck", "nationDeck", "playArea", "history"];
  const directZone = zones.find((zone) => p[zone].includes(cardId));
  if (directZone) return directZone;
  if (garrisonedCardsInPlay(G, playerId).includes(cardId)) return "garrison";
  const sideZone = Object.entries(p.sideAreas ?? {}).find(([, cards]) => cards.includes(cardId))?.[0];
  if (sideZone) return sideZone as FindZone;
  const playerSpecialZone = Object.entries(G.specialZones?.[playerId] ?? {}).find(([, zone]) => zone.cardIds.includes(cardId))?.[0];
  if (playerSpecialZone) return playerSpecialZone as FindZone;
  return Object.entries(G.globalSpecialZones ?? {}).find(([, zone]) => zone.cardIds.includes(cardId))?.[0] as FindZone | undefined;
}

function findCardZoneCards(G: GameState, playerId: string, zoneId: string): string[] | undefined {
  if (zoneId === "garrison") return garrisonedCardsInPlay(G, playerId);
  const p = G.players[playerId];
  const direct = (p as unknown as Record<string, unknown>)[zoneId];
  if (Array.isArray(direct)) return direct as string[];
  if (p.sideAreas?.[zoneId]) return p.sideAreas[zoneId];
  if (G.specialZones?.[playerId]?.[zoneId]?.cardIds) return G.specialZones[playerId][zoneId].cardIds;
  if (G.globalSpecialZones?.[zoneId]?.cardIds) return G.globalSpecialZones[zoneId].cardIds;
  return undefined;
}

function movePlayerCard(
  G: GameState,
  playerId: string,
  cardId: string,
  destination: ZoneName,
  collectedResources?: Partial<Record<ResourceName, number>>,
  collectedResourceSources?: ResourceGainSource[]
): string | undefined {
  const p = G.players[playerId];
  const fromZone = findCardZone(G, playerId, cardId);
  if (!fromZone) return undefined;
  if (fromZone === destination) return destination;
  if (fromZone === "garrison") {
    if (!detachGarrisonedCard(G, playerId, cardId)) return undefined;
    recordResourceGains(collectedResources, collectedResourceSources, cardId, true, collectAndClearCardStateToPlayer(G, playerId, cardId));
    if (destination === "history") return moveCardsToHistoryDestination(G, playerId, [cardId]);
    p[destination].push(cardId);
    return destination;
  }
  const sourceCards = findCardZoneCards(G, playerId, fromZone);
  if (!sourceCards) return undefined;
  const index = sourceCards.indexOf(cardId);
  if (index < 0) return undefined;
  sourceCards.splice(index, 1);
  const movedCardIds = [cardId];
  if (fromZone === "playArea") {
    recordResourceGains(collectedResources, collectedResourceSources, cardId, true, collectCardResourcesToPlayer(G, playerId, cardId));
    const garrisoned = detachGarrisonedCards(G, cardId);
    garrisoned.forEach((garrisonedCardId) => {
      recordResourceGains(collectedResources, collectedResourceSources, garrisonedCardId, true, collectAndClearCardStateToPlayer(G, playerId, garrisonedCardId));
    });
    movedCardIds.push(...garrisoned);
  }
  if (destination === "history") return moveCardsToHistoryDestination(G, playerId, movedCardIds);
  p[destination].push(...movedCardIds);
  return destination;
}

function removeOneCard(cards: string[], cardId: string): boolean {
  const index = cards.indexOf(cardId);
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

function drawChoiceSourceCards(G: GameState, playerId: string, source: Exclude<DrawSourceZone, "deck" | "fameDeck">): string[] {
  if (source === "exile") return availableExileCards(G, playerId);
  return G.players[playerId][source];
}

function removeFromDrawChoiceSource(G: GameState, playerId: string, source: Exclude<DrawSourceZone, "deck" | "fameDeck">, cardId: string): boolean {
  if (source !== "exile") return removeOneCard(G.players[playerId][source], cardId);
  return removeOneCard(G.players[playerId].exile, cardId)
    || removeOneCard(G.globalSpecialZones?.exile?.cardIds ?? [], cardId);
}

export function playCard({ G, ctx, random }: MoveCtx, cardId: string, payment?: ResourceCost): void {
  const p = G.players[ctx.currentPlayer];
  if (rejectIfPendingChoice(G, ctx.currentPlayer, "playCard")) return;
  const freePlay = isFreePlayCard(G, cardId);
  if (!isActivateTurn(G)) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", `turn_type_not_activate(${G.currentTurnType})`);
    return;
  }
  if (freePlay && hasFreePlayedThisTurn(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", `free_play_already_used(${cardId})`);
    return;
  }
  if (!freePlay && p.actionsRemaining < 1) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", "no_actions_remaining");
    return;
  }
  if (!freePlay && p.actionTokensAvailable < 1) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", "no_action_tokens_available");
    return;
  }
  if (!p.hand.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", `card_not_in_hand(${cardId})`);
    return;
  }
  if (!cardMeetsStateRequirement(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", `state_requirement_not_met(${G.cardDb[cardId]?.stateRequirement})`);
    return;
  }
  if (!cardHasResolvableOnPlayText(G, ctx.currentPlayer, cardId, payment)) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", `no_resolvable_on_play_effects(${cardId})`);
    return;
  }

  if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_play_card", payload: { cardId }, randomNumber: random?.Number })) return;
  if (G.gameover) return;
  if (pendingEffectInterruption(G)) {
    G.pendingPlayCardResolution = { playerId: ctx.currentPlayer, cardId, freePlay, payment };
    return;
  }
  finishPlayCardResolution({ G, ctx, random }, cardId, freePlay, payment);
}

export function resolveFreePlayChoice({ G, ctx, random }: MoveCtx, cardId: string, payment?: ResourceCost): void {
  const pending = G.pendingFreePlayChoice;
  if (!pending || pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFreePlayChoice", "no_pending_free_play_choice");
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFreePlayChoice", `card_not_eligible(${cardId})`);
    return;
  }
  const p = G.players[ctx.currentPlayer];
  if (!p.hand.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFreePlayChoice", `card_not_in_hand(${cardId})`);
    return;
  }
  if (hasFreePlayedThisTurn(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFreePlayChoice", `free_play_already_used(${cardId})`);
    return;
  }
  if (!pending.ignoreStateRequirement && !cardMeetsStateRequirement(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFreePlayChoice", `state_requirement_not_met(${G.cardDb[cardId]?.stateRequirement})`);
    return;
  }
  if (!cardHasResolvableOnPlayText(G, ctx.currentPlayer, cardId, payment)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFreePlayChoice", `no_resolvable_on_play_effects(${cardId})`);
    return;
  }

  const sourcePlayedResolution = G.pendingPlayedCardResolution;
  G.pendingFreePlayChoice = undefined;
  G.pendingPlayedCardResolution = undefined;
  if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_play_card", payload: { cardId }, randomNumber: random?.Number })) return;
  if (G.gameover) return;
  if (pendingEffectInterruption(G)) {
    G.pendingPlayCardResolution = {
      playerId: ctx.currentPlayer,
      cardId,
      freePlay: true,
      payment,
      sourceCardId: pending.sourceCardId,
      resumeEffects: pending.resumeEffects,
      resumePlayedCardResolution: sourcePlayedResolution
    };
    return;
  }
  finishPlayCardResolution(
    { G, ctx, random },
    cardId,
    true,
    payment,
    pending.sourceCardId,
    pending.resumeEffects,
    sourcePlayedResolution
  );
}

export function acquireCard({ G, ctx, random }: MoveCtx, cardId: string, payment?: ResourceCost): void {
  if (rejectIfPendingChoice(G, ctx.currentPlayer, "acquireCard")) return;
  if (!isActivateTurn(G)) {
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `turn_type_not_activate(${G.currentTurnType})`);
    return;
  }
  if (!G.market.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `card_not_in_market(${cardId})`);
    return;
  }
  if (G.players[ctx.currentPlayer].actionsRemaining < 1 || G.players[ctx.currentPlayer].actionTokensAvailable < 1) {
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", "no_actions_remaining");
    return;
  }
  const rawCost = G.cardDb[cardId]?.cost ?? 0;
  const cost = normalizeResourceCost(rawCost);
  const availableMaterials = availableForResourceCost(G, ctx.currentPlayer, "materials");
  if (!canPayResourceCosts(G, ctx.currentPlayer, cost, payment)) {
    const required = describeResourceCost(cost) || "none";
    const reason = typeof rawCost === "number"
      ? `insufficient_materials(required=${rawCost}, available=${availableMaterials})`
      : `insufficient_resources(required=${required})`;
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", reason);
    return;
  }

  logTurnPhase(G, ctx.currentPlayer, "acquire_resolution", `acquireCard(${cardId})`);
  if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_acquire", payload: { cardId }, randomNumber: random?.Number })) return;
  if (G.gameover) return;
  if (pendingEffectInterruption(G)) {
    G.pendingAcquireCardResolution = { playerId: ctx.currentPlayer, cardId, payment };
    return;
  }
  finishAcquireCardResolution({ G, ctx, random }, cardId, payment);
}

export function exhaustCard({ G, ctx, random }: MoveCtx, cardId: string, payment?: ResourceCost): void {
  const p = G.players[ctx.currentPlayer];
  if (rejectIfPendingChoice(G, ctx.currentPlayer, "exhaustCard")) return;
  if (!isActivateTurn(G)) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `turn_type_not_activate(${G.currentTurnType})`);
    return;
  }
  if (!canExhaustCard(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `card_not_exhaust_source(${cardId})`);
    return;
  }
  if (isCardExhausted(G, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `card_already_exhausted(${cardId})`);
    return;
  }
  if (p.exhaustTokensAvailable < 1) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", "no_exhaust_tokens_available");
    return;
  }
  const effects = G.cardDb[cardId]?.effects ?? [];
  const ordinaryExhaustEffects = effects.filter((effect) => effect.trigger === "on_exhaust" && !reactiveCondition(effect));
  if (ordinaryExhaustEffects.length === 0) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `no_exhaust_ability(${cardId})`);
    return;
  }
  if (!cardHasResolvableExhaustText(G, ctx.currentPlayer, cardId, payment)) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `no_resolvable_on_exhaust_effects(${cardId})`);
    return;
  }

  const snapshot = cloneGameState(G);
  p.exhaustTokensAvailable -= 1;
  markCardExhausted(G, cardId);
  const resolved = runTriggeredEffectsWithPayment(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    ordinaryExhaustEffects,
    "on_exhaust",
    payment
  );
  if (!resolved) {
    if (G.gameover) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `exhaust_effect_failed(${cardId})`);
    return;
  }
  if (G.gameover) return;
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `Exhausted ${cardId}.` });
}

export function resolveReactiveExhaustChoice({ G, ctx, random }: MoveCtx, cardId: string, payment?: ResourceCost): void {
  const pending = G.pendingReactiveExhaustChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", "no_pending_reactive_exhaust_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", `pending_reactive_exhaust_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", `card_not_in_reactive_exhaust_options(${cardId})`);
    return;
  }
  if (!canExhaustCard(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", `card_not_exhaust_source(${cardId})`);
    return;
  }
  if (isCardExhausted(G, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", `card_already_exhausted(${cardId})`);
    return;
  }
  const p = G.players[ctx.currentPlayer];
  if (p.exhaustTokensAvailable < 1) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", "no_exhaust_tokens_available");
    return;
  }
  const effects = matchingReactiveExhaustEffects(G, ctx.currentPlayer, cardId, pending);
  if (effects.length === 0) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", `no_exhaust_ability(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  G.pendingReactiveExhaustChoice = undefined;
  p.exhaustTokensAvailable -= 1;
  markCardExhausted(G, cardId);
  if (G.pendingRegionChoiceContinuation?.playerId === pending.resolvingPlayerId) {
    G.pendingRegionChoiceContinuation.resolving = true;
  }
  if (G.pendingAcquireEffectResolution?.playerId === pending.resolvingPlayerId) {
    G.pendingAcquireEffectResolution.resolving = true;
  }
  if (G.pendingMarketMoveEffectResolution?.playerId === pending.resolvingPlayerId) {
    G.pendingMarketMoveEffectResolution.resolving = true;
  }
  if (pending.trigger === "after_break_through_card" && G.pendingBreakThroughEffectResolution?.playerId === pending.resolvingPlayerId) {
    G.pendingBreakThroughEffectResolution.resolving = true;
  }
  const resolved = runTriggeredEffectsWithPayment(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions, allowPendingScoringFinalizationEffects: true },
    effects,
    "on_exhaust",
    payment
  );
  if (!resolved) {
    if (G.gameover) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", `exhaust_effect_failed(${cardId})`);
    return;
  }
  if (G.gameover || pendingEffectInterruption(G, { includeRegionContinuation: false })) {
    appendResumeEffectsToPending(G, pending.resumeEffects);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ReactiveExhaustResolved(${cardId}).` });
  if (!resumeReactiveExhaustSourceEffects({ G, ctx, random }, pending)) {
    if (G.gameover) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveReactiveExhaustChoice", `resume_effect_failed(${cardId})`);
  }
}

export function skipReactiveExhaustChoice({ G, ctx, random }: MoveCtx): void {
  const pending = G.pendingReactiveExhaustChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "skipReactiveExhaustChoice", "no_pending_reactive_exhaust_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "skipReactiveExhaustChoice", `pending_reactive_exhaust_for_player(${pending.playerId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  G.pendingReactiveExhaustChoice = undefined;
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ReactiveExhaustSkipped(${pending.trigger}/${pending.resource ?? "any"}).` });
  if (!resumeReactiveExhaustSourceEffects({ G, ctx, random }, pending)) {
    if (G.gameover) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "skipReactiveExhaustChoice", "resume_effect_failed");
  }
}

export function profitCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  if (rejectIfPendingChoice(G, ctx.currentPlayer, "profitCard")) return;
  if (!G.options?.enabledExpansions?.includes("trade_routes")) {
    logInvalidMove(G, ctx.currentPlayer, "profitCard", "trade_routes_disabled");
    return;
  }
  if (!isActivateTurn(G)) {
    logInvalidMove(G, ctx.currentPlayer, "profitCard", `turn_type_not_activate(${G.currentTurnType})`);
    return;
  }
  if (p.actionsRemaining < 1) {
    logInvalidMove(G, ctx.currentPlayer, "profitCard", "no_actions_remaining");
    return;
  }
  if (p.actionTokensAvailable < 1) {
    logInvalidMove(G, ctx.currentPlayer, "profitCard", "no_action_tokens_available");
    return;
  }
  if (!p.playArea.includes(cardId) || !isTradeRouteCard(G, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "profitCard", `card_not_trade_route_in_play(${cardId})`);
    return;
  }
  if (cardGoods(G, cardId) < 3) {
    logInvalidMove(G, ctx.currentPlayer, "profitCard", `route_not_complete(${cardId})`);
    return;
  }
  const effects = (G.cardDb[cardId]?.effects ?? []).filter((effect) => effect.op === "profit");
  if (effects.length === 0) {
    logInvalidMove(G, ctx.currentPlayer, "profitCard", `no_profit_effect(${cardId})`);
    return;
  }

  const snapshot = cloneGameState(G);
  p.actionsRemaining -= 1;
  p.actionTokensAvailable -= 1;
  markActionToken(G, cardId);
  const resolved = runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    effects
  );
  if (!resolved) {
    if (G.gameover) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "profitCard", `profit_effect_failed(${cardId})`);
  }
}

export function innovateTurn({ G, ctx, events, random }: MoveCtx, args: { suit: Suit; source: "market" | "deck"; cardId?: string }): void {
  const p = G.players[ctx.currentPlayer];
  if (rejectIfPendingChoice(G, ctx.currentPlayer, "innovateTurn")) return;
  if (!isActivateTurn(G)) {
    logInvalidMove(G, ctx.currentPlayer, "innovateTurn", `turn_type_not_activate(${G.currentTurnType})`);
    return;
  }
  if (!isInnovateSuit(args.suit)) {
    logInvalidMove(G, ctx.currentPlayer, "innovateTurn", `invalid_innovate_suit(${args.suit})`);
    return;
  }

  G.currentTurnType = "innovate";
  p.discard.push(...p.hand);
  p.hand = [];
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `InnovateStarted(${args.suit}/${args.source})` });
  if (args.source === "market" && !args.cardId) {
    const cardIds = matchingMarketCardsForSuit(G, ctx.currentPlayer, args.suit);
    if (cardIds.length > 1) {
      G.pendingBreakThroughChoice = {
        playerId: ctx.currentPlayer,
        sourceCardId: "innovate_turn",
        source: "market",
        suit: args.suit,
        cardIds
      };
      G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `BreakThroughChoicePending(innovate_turn/source=market/options=${cardIds.length})` });
      return;
    }
  }
  if (args.source === "deck" && args.suit === "tributary" && !args.cardId) {
    const cardIds = visibleTributaryBreakThroughCards(G, ctx.currentPlayer);
    if (cardIds.length > 1) {
      G.pendingBreakThroughChoice = {
        playerId: ctx.currentPlayer,
        sourceCardId: "innovate_turn",
        source: "deck",
        suit: args.suit,
        cardIds
      };
      G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `BreakThroughChoicePending(innovate_turn/source=deck/options=${cardIds.length})` });
      return;
    }
  }
  const result = breakThrough(G, { playerId: ctx.currentPlayer, suit: args.suit, source: args.source, count: 1, cardId: args.cardId, randomNumber: random?.Number });
  if (!runAfterBreakThroughHooks(G, ctx.currentPlayer, result, random?.Number)) {
    logInvalidMove(G, ctx.currentPlayer, "innovateTurn", "after_break_through_hook_failed");
    return;
  }
  if (returnIfGameover(G)) return;
  if (pendingEffectInterruption(G)) {
    scheduleTurnEndCleanupAfterPendingChoice(G, ctx);
    return;
  }
  continueEndTurnAfterCleanupChoices({ G, ctx, events, random });
}

export function revoltTurn({ G, ctx, events, random }: MoveCtx, cardIds: string[]): void {
  const p = G.players[ctx.currentPlayer];
  if (rejectIfPendingChoice(G, ctx.currentPlayer, "revoltTurn")) return;
  if (!isActivateTurn(G)) {
    logInvalidMove(G, ctx.currentPlayer, "revoltTurn", `turn_type_not_activate(${G.currentTurnType})`);
    return;
  }
  const uniqueCardIds = [...new Set(cardIds)];
  if (uniqueCardIds.some((cardId) => !p.hand.includes(cardId))) {
    logInvalidMove(G, ctx.currentPlayer, "revoltTurn", "card_not_in_hand");
    return;
  }
  if (uniqueCardIds.some((cardId) => !isUnrestCard(G, cardId))) {
    logInvalidMove(G, ctx.currentPlayer, "revoltTurn", "card_not_returnable");
    return;
  }

  G.currentTurnType = "revolt";
  G.unrestPile ??= [];
  for (const cardId of [...uniqueCardIds]) {
    const index = p.hand.indexOf(cardId);
    if (index < 0) continue;
    p.hand.splice(index, 1);
    G.unrestPile.push(cardId);
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `RevoltResolved(returned=${uniqueCardIds.length})` });
  if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_revolt", payload: { returnedCardIds: uniqueCardIds }, randomNumber: random?.Number })) {
    logInvalidMove(G, ctx.currentPlayer, "revoltTurn", "after_revolt_hook_failed");
    return;
  }
  if (returnIfGameover(G)) return;
  if (pendingEffectInterruption(G)) {
    scheduleTurnEndCleanupAfterPendingChoice(G, ctx);
    return;
  }
  continueEndTurnAfterCleanupChoices({ G, ctx, events, random });
}

export function resolveChoice({ G, ctx, random }: MoveCtx, choiceIndex: number, payment?: ResourceCost): void {
  const pending = G.pendingChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveChoice", "no_pending_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveChoice", `pending_choice_for_player(${pending.playerId})`);
    return;
  }
  const choice = pending.choices[choiceIndex];
  if (!choice) {
    logInvalidMove(G, ctx.currentPlayer, "resolveChoice", `choice_index_out_of_range(${choiceIndex})`);
    return;
  }

  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  const resumePlayerId = pending.resolvingPlayerId ?? ctx.currentPlayer;
  const resumeCtx = resumePlayerId === ctx.currentPlayer
    ? ctx
    : ({ ...ctx, currentPlayer: resumePlayerId } as Ctx);
  G.pendingChoice = undefined;
  const cost = explicitSpendCost(choice);
  const choiceEffects = resourceCostHasPositiveAmount(cost) ? removeExplicitSpendEffects(choice) : choice;
  if (resourceCostHasPositiveAmount(cost) && !payResourceCosts(G, ctx.currentPlayer, cost, payment, random?.Number)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveChoice", `choice_effect_failed(index=${choiceIndex})`);
    return;
  }
  markOwnedEffectResolutionContinuationsResolving(G, ctx.currentPlayer);
  const resolved = runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions, allowPendingScoringFinalizationEffects: true },
    choiceEffects
  );
  const followupPendingChoice = pendingEffectInterruption(G);
  if (resolved && followupPendingChoice && resumeEffects.length > 0) {
    followupPendingChoice.resumeEffects = [...(followupPendingChoice.resumeEffects ?? []), ...resumeEffects];
    if (pending.resolvingPlayerId && "resolvingPlayerId" in followupPendingChoice && !followupPendingChoice.resolvingPlayerId) {
      followupPendingChoice.resolvingPlayerId = pending.resolvingPlayerId;
    }
  }
  const resumed = resolved && !followupPendingChoice
    ? resumeEffectsAfterPendingChoice({ G, ctx: resumeCtx, random }, pending.sourceCardId, resumeEffects)
    : true;
  if (!resolved || !resumed) {
    if (returnIfGameover(G)) return;
    if (!resumed && wasHandledResumeFailure(G)) return;
    if (!resumed && handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveChoice", `choice_effect_failed(index=${choiceIndex})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ChoiceResolved(${pending.sourceCardId ?? "unknown"}/index=${choiceIndex})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveDrawChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingDrawChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDrawChoice", "no_pending_draw_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDrawChoice", `pending_draw_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDrawChoice", `card_not_in_draw_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const sourceCards = drawChoiceSourceCards(G, ctx.currentPlayer, pending.source);
  if (!removeFromDrawChoiceSource(G, ctx.currentPlayer, pending.source, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDrawChoice", `draw_choice_failed(${cardId})`);
    return;
  }
  G.players[ctx.currentPlayer].hand.push(cardId);
  const resumeEffects = pending.resumeEffects ?? [];
  const remainingCount = pending.remainingCount - 1;
  const remainingSourceCards = drawChoiceSourceCards(G, ctx.currentPlayer, pending.source);
  if (remainingCount > 0 && remainingSourceCards.length > 0) {
    G.pendingDrawChoice = {
      playerId: pending.playerId,
      sourceCardId: pending.sourceCardId,
      source: pending.source,
      cardIds: [...remainingSourceCards],
      remainingCount,
      ...(resumeEffects.length > 0 ? { resumeEffects } : {})
    };
    G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `DrawChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId}/remaining=${remainingCount})` });
    return;
  }
  G.pendingDrawChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveDrawChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveDrawChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `DrawChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId}/complete)` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveFindChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingFindChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFindChoice", "no_pending_find_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFindChoice", `pending_find_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFindChoice", `card_not_in_find_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  const collectedResources: Partial<Record<ResourceName, number>> = {};
  const collectedResourceSources: ResourceGainSource[] = [];
  const resolvedDestination = movePlayerCard(G, ctx.currentPlayer, cardId, pending.destination, collectedResources, collectedResourceSources);
  if (!resolvedDestination) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFindChoice", `find_move_failed(${cardId})`);
    return;
  }
  for (const shuffleZone of pending.shuffleZones ?? []) shuffleResolvedFindDeck(G, ctx.currentPlayer, shuffleZone, random?.Number);
  G.pendingFindChoice = undefined;
  createReactiveExhaustChoicesForResourceGainSources(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    collectedResourceSources,
    collectedResources
  );
  const resourcePending = pendingEffectInterruption(G);
  if (resourcePending) {
    resourcePending.resumeEffects = [...(resourcePending.resumeEffects ?? []), ...resumeEffects];
    return;
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveFindChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveFindChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `FindChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId}->${resolvedDestination})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveAcquireChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingAcquireChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveAcquireChoice", "no_pending_acquire_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveAcquireChoice", `pending_acquire_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveAcquireChoice", `card_not_in_acquire_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  const collectedResources: Partial<Record<ResourceName, number>> = {};
  const collectedResourceSources: ResourceGainSource[] = [];
  const takenUnrestPlayerIds: string[] = [];
  G.pendingAcquireChoice = undefined;
  const acquired = pending.source === "exile"
    ? acquireFromExile(G, { playerId: ctx.currentPlayer, cardId, destination: pending.destination, takenUnrestPlayerIds, randomNumber: random?.Number })
    : acquireMarketCard(G, { playerId: ctx.currentPlayer, cardId, destination: pending.destination, collectedResources, collectedResourceSources, takenUnrestPlayerIds, randomNumber: random?.Number });
  if (!acquired) {
    if (returnIfGameover(G)) {
      G.pendingAcquireChoice = undefined;
      return;
    }
    const failureLogEntries = G.log.slice(snapshot.log.length).filter((entry) =>
      entry.message.startsWith("UnsupportedEffectOp(")
        || entry.message.includes(" failed.")
        || entry.message.startsWith("NationRulesetError(")
    );
    restoreGameState(G, snapshot);
    G.log.push(...failureLogEntries);
    logInvalidMove(G, ctx.currentPlayer, "resolveAcquireChoice", `acquire_choice_failed(${cardId})`);
    return;
  }
  if (returnIfGameover(G)) return;
  if (pendingEffectInterruption(G)) {
    G.pendingAcquireEffectResolution = {
      playerId: ctx.currentPlayer,
      cardId,
      sourceCardId: pending.sourceCardId,
      takenUnrestPlayerIds,
      collectedResources,
      collectedResourceSources,
      resumeEffects
    };
    return;
  }
  if (!runAcquireTriggers({ G, playerId: ctx.currentPlayer, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions }, cardId)) {
    if (returnIfGameover(G)) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveAcquireChoice", `on_acquire_effect_failed(${cardId})`);
    return;
  }
  const triggerPending = pendingEffectInterruption(G);
  if (triggerPending) {
    triggerPending.resumeEffects = [...(triggerPending.resumeEffects ?? []), ...resumeEffects];
    return;
  }
  if (!runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_acquire", payload: { cardId }, randomNumber: random?.Number })) {
    if (returnIfGameover(G)) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveAcquireChoice", `after_acquire_hook_failed(${cardId})`);
    return;
  }
  const hookPending = pendingEffectInterruption(G);
  if (hookPending) {
    hookPending.resumeEffects = [...(hookPending.resumeEffects ?? []), ...resumeEffects];
    return;
  }
  for (const targetPlayerId of takenUnrestPlayerIds) {
    createReactiveExhaustChoice(
      { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
      { trigger: "after_take_unrest", targetPlayerId }
    );
    if (pendingEffectInterruption(G)) break;
  }
  const unrestPending = pendingEffectInterruption(G);
  if (unrestPending) {
    unrestPending.resumeEffects = [...(unrestPending.resumeEffects ?? []), ...resumeEffects];
    return;
  }
  createReactiveExhaustChoicesForResourceGainSources(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    collectedResourceSources,
    collectedResources
  );
  const resourcePending = pendingEffectInterruption(G);
  if (resourcePending) {
    resourcePending.resumeEffects = [...(resourcePending.resumeEffects ?? []), ...resumeEffects];
    return;
  }
  createReactiveExhaustChoice(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    { trigger: "after_acquire_card", targetPlayerId: ctx.currentPlayer }
  );
  const reactivePending = pendingEffectInterruption(G);
  if (reactivePending) {
    reactivePending.resumeEffects = [...(reactivePending.resumeEffects ?? []), ...resumeEffects];
    return;
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveAcquireChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveAcquireChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `AcquireChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveMarketCardChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingMarketCardChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketCardChoice", "no_pending_market_card_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketCardChoice", `pending_market_card_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketCardChoice", `card_not_in_market_card_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  const collectedResources: Partial<Record<ResourceName, number>> = {};
  const collectedResourceSources: ResourceGainSource[] = [];
  const takenUnrestPlayerIds: string[] = [];
  G.pendingMarketCardChoice = undefined;
  const moved = pending.op === "gain_card"
    ? gainMarketCard(G, { playerId: ctx.currentPlayer, cardId, destination: pending.destination, collectedResources, collectedResourceSources, takenUnrestPlayerIds, randomNumber: random?.Number })
    : takeMarketCard(G, { playerId: ctx.currentPlayer, cardId, destination: pending.destination, collectedResources, collectedResourceSources });
  if (!moved) {
    G.pendingMarketCardChoice = pending;
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketCardChoice", `market_card_choice_failed(${cardId})`);
    return;
  }
  if (returnIfGameover(G)) return;
  if (pendingEffectInterruption(G)) {
    G.pendingMarketMoveEffectResolution = {
      playerId: ctx.currentPlayer,
      sourceCardId: pending.sourceCardId,
      takenUnrestPlayerIds,
      collectedResources,
      collectedResourceSources,
      resumeEffects
    };
    return;
  }
  createReactiveExhaustChoicesForResourceGainSources(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    collectedResourceSources,
    collectedResources
  );
  const resourcePending = pendingEffectInterruption(G);
  if (resourcePending) {
    G.pendingMarketMoveEffectResolution = {
      playerId: ctx.currentPlayer,
      sourceCardId: pending.sourceCardId,
      takenUnrestPlayerIds,
      collectedResources: {},
      collectedResourceSources: [],
      resumeEffects
    };
    return;
  }
  for (let index = 0; index < takenUnrestPlayerIds.length; index += 1) {
    const targetPlayerId = takenUnrestPlayerIds[index];
    createReactiveExhaustChoice(
      { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
      { trigger: "after_take_unrest", targetPlayerId }
    );
    if (pendingEffectInterruption(G)) {
      G.pendingMarketMoveEffectResolution = {
        playerId: ctx.currentPlayer,
        sourceCardId: pending.sourceCardId,
        takenUnrestPlayerIds: takenUnrestPlayerIds.slice(index + 1),
        collectedResources: {},
        collectedResourceSources: [],
        resumeEffects
      };
      return;
    }
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveMarketCardChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketCardChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `MarketCardChoiceResolved(${pending.sourceCardId ?? "unknown"}/${pending.op}/${cardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

function continueAfterPracticePreCleanupExile(moveCtx: MoveCtx): boolean {
  const { G, ctx } = moveCtx;
  if (G.pendingPracticeMarketExileBeforeCleanup?.playerId !== ctx.currentPlayer) return false;
  G.pendingPracticeMarketExileBeforeCleanup = undefined;
  G.practiceMarketExileResolved = { playerId: ctx.currentPlayer, round: G.round };
  continueEndTurnAfterCleanupChoices(moveCtx);
  return true;
}

export function resolveExileChoice({ G, ctx, events, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingExileChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveExileChoice", "no_pending_exile_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveExileChoice", `pending_exile_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveExileChoice", `card_not_in_exile_options(${cardId})`);
    return;
  }
  if (pending.source === "market" ? !G.market.includes(cardId) : !playerExileSourceCards(G, ctx.currentPlayer, pending.source).includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveExileChoice", `exile_choice_failed(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  const exiled = pending.source === "market"
    ? exileMarketCard(G, { playerId: ctx.currentPlayer, cardId })
    : exilePlayerCard(G, { playerId: ctx.currentPlayer, source: pending.source, cardId });
  if (!exiled) {
    logInvalidMove(G, ctx.currentPlayer, "resolveExileChoice", `exile_choice_failed(${cardId})`);
    return;
  }
  G.pendingExileChoice = undefined;
  if (returnIfGameover(G)) return;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveExileChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveExileChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ExileChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId})` });
  if (continueAfterPracticePreCleanupExile({ G, ctx, events, random })) return;
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function skipExileChoice({ G, ctx, events, random }: MoveCtx): void {
  const pending = G.pendingExileChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "skipExileChoice", "no_pending_exile_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "skipExileChoice", `pending_exile_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.optional) {
    logInvalidMove(G, ctx.currentPlayer, "skipExileChoice", "exile_choice_not_optional");
    return;
  }
  G.pendingExileChoice = undefined;
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ExileChoiceSkipped(${pending.sourceCardId ?? "unknown"})` });
  if (continueAfterPracticePreCleanupExile({ G, ctx, events, random })) return;
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveBreakThroughChoice({ G, ctx, events, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingBreakThroughChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveBreakThroughChoice", "no_pending_break_through_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveBreakThroughChoice", `pending_break_through_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveBreakThroughChoice", `card_not_in_break_through_options(${cardId})`);
    return;
  }
  const inSource = pending.source === "exile"
    ? availableExileCards(G, ctx.currentPlayer).includes(cardId)
    : pending.source === "deck"
      ? visibleTributaryBreakThroughCards(G, ctx.currentPlayer).includes(cardId)
      : G.market.includes(cardId);
  if (!inSource || !cardHasSuitIconForPlayer(G, ctx.currentPlayer, G.cardDb[cardId], pending.suit)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveBreakThroughChoice", `break_through_choice_failed(${cardId})`);
    return;
  }

  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  const result = breakThrough(G, { playerId: ctx.currentPlayer, suit: pending.suit, source: pending.source, count: 1, cardId, randomNumber: random?.Number });
  G.pendingBreakThroughChoice = undefined;
  if (returnIfGameover(G)) return;
  createReactiveExhaustChoicesForResourceGainSources(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    result.marketResourceGainSources,
    result.marketResourceGains
  );
  const resourcePending = pendingEffectInterruption(G);
  if (resourcePending) {
    G.pendingBreakThroughEffectResolution = {
      playerId: ctx.currentPlayer,
      sourceCardId: pending.sourceCardId,
      gainedCardIds: result.gainedCardIds,
      resumeEffects
    };
    return;
  }
  if (result.gainedCardIds.length > 0) {
    createReactiveExhaustChoice(
      { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
      { trigger: "after_break_through_card", targetPlayerId: ctx.currentPlayer }
    );
    const reactivePending = pendingEffectInterruption(G);
    if (reactivePending) {
      G.pendingBreakThroughEffectResolution = {
        playerId: ctx.currentPlayer,
        sourceCardId: pending.sourceCardId,
        gainedCardIds: result.gainedCardIds,
        nextAfterBreakThroughReactiveCardIndex: 1,
        resumeEffects
      };
      return;
    }
  }
  if (!runAfterBreakThroughHooks(G, ctx.currentPlayer, result, random?.Number)) {
    if (returnIfGameover(G)) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveBreakThroughChoice", `after_break_through_hook_failed(${cardId})`);
    return;
  }
  const hookPending = pendingEffectInterruption(G);
  if (hookPending) {
    hookPending.resumeEffects = [...(hookPending.resumeEffects ?? []), ...resumeEffects];
    if (pending.sourceCardId === "innovate_turn" && G.currentTurnType === "innovate") {
      scheduleTurnEndCleanupAfterPendingChoice(G, ctx);
    }
    return;
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveBreakThroughChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveBreakThroughChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `BreakThroughChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId})` });
  if (pending.sourceCardId === "innovate_turn" && G.currentTurnType === "innovate") {
    continueEndTurnAfterCleanupChoices({ G, ctx, events, random });
    return;
  }
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveGarrisonChoice({ G, ctx, random }: MoveCtx, hostCardId: string, cardId: string): void {
  const pending = G.pendingGarrisonChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGarrisonChoice", "no_pending_garrison_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGarrisonChoice", `pending_garrison_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.hostCardIds.includes(hostCardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGarrisonChoice", `host_not_in_garrison_options(${hostCardId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGarrisonChoice", `card_not_in_garrison_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!garrisonCardOnRegion(G, ctx.currentPlayer, hostCardId, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGarrisonChoice", `garrison_choice_failed(${cardId}/host=${hostCardId})`);
    return;
  }
  G.pendingGarrisonChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveGarrisonChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveGarrisonChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `GarrisonChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId}->${hostCardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveRegionChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingRegionChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveRegionChoice", "no_pending_region_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveRegionChoice", `pending_region_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveRegionChoice", `card_not_in_region_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  const resumePlayerId = pending.resolvingPlayerId ?? ctx.currentPlayer;
  const resumeCtx = resumePlayerId === ctx.currentPlayer
    ? ctx
    : ({ ...ctx, currentPlayer: resumePlayerId } as Ctx);
  const collectedResources: Partial<Record<ResourceName, number>> = {};
  const collectedResourceSources: ResourceGainSource[] = [];
  const resolved = pending.op === "recall_region"
    ? recallRegionToHand(G, ctx.currentPlayer, cardId, collectedResources, collectedResourceSources)
    : abandonRegionToDiscard(G, ctx.currentPlayer, cardId, collectedResources, collectedResourceSources);
  if (!resolved) {
    logInvalidMove(G, ctx.currentPlayer, "resolveRegionChoice", `region_choice_failed(${pending.op}/${cardId})`);
    return;
  }
  const remainingCount = (pending.count ?? 1) - 1;
  const remainingCardIds = pending.cardIds.filter((candidate) => candidate !== cardId);
  let remainingRegionChoice: NonNullable<GameState["pendingRegionChoice"]> | undefined;
  if (remainingCount > 0 && remainingCardIds.length > 0) {
    remainingRegionChoice = {
      ...pending,
      cardIds: remainingCardIds,
      count: Math.min(remainingCount, remainingCardIds.length)
    };
  }
  G.pendingRegionChoice = undefined;
  createReactiveExhaustChoicesForResourceGainSources(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    collectedResourceSources,
    collectedResources
  );
  if (remainingRegionChoice) {
    if (G.pendingReactiveExhaustChoice) {
      G.pendingRegionChoiceContinuation = remainingRegionChoice;
      G.pendingRegionChoice = undefined;
      return;
    }
    G.pendingRegionChoice = remainingRegionChoice;
    return;
  }
  const resourcePending = pendingEffectInterruption(G);
  if (resourcePending) {
    resourcePending.resumeEffects = [...(resourcePending.resumeEffects ?? []), ...resumeEffects];
    if (pending.resolvingPlayerId && "resolvingPlayerId" in resourcePending && !resourcePending.resolvingPlayerId) {
      resourcePending.resolvingPlayerId = pending.resolvingPlayerId;
    }
    return;
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx: resumeCtx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveRegionChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveRegionChoice", `resume_effect_failed(${pending.op}/${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `RegionChoiceResolved(${pending.sourceCardId ?? "unknown"}/${pending.op}/${cardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
  continuePausedBotTurn(G, random?.Number);
}

export function garrisonCard({ G, ctx }: MoveCtx, hostCardId: string, cardId: string): void {
  if (!isRegionCard(G, hostCardId)) {
    logInvalidMove(G, ctx.currentPlayer, "garrisonCard", `host_not_region(${hostCardId})`);
    return;
  }
  if (!garrisonCardOnRegion(G, ctx.currentPlayer, hostCardId, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "garrisonCard", `garrison_failed(${cardId}/host=${hostCardId})`);
  }
}

export function recallRegion({ G, ctx }: MoveCtx, regionCardId: string): void {
  if (!isRegionCard(G, regionCardId)) {
    logInvalidMove(G, ctx.currentPlayer, "recallRegion", `card_not_region(${regionCardId})`);
    return;
  }
  const collectedResources: Partial<Record<ResourceName, number>> = {};
  const collectedResourceSources: ResourceGainSource[] = [];
  if (!recallRegionToHand(G, ctx.currentPlayer, regionCardId, collectedResources, collectedResourceSources)) {
    logInvalidMove(G, ctx.currentPlayer, "recallRegion", `recall_failed(${regionCardId})`);
    return;
  }
  createReactiveExhaustChoicesForResourceGainSources(
    { G, playerId: ctx.currentPlayer, randomNumber: undefined, enabledExpansions: G.options?.enabledExpansions },
    collectedResourceSources,
    collectedResources
  );
}

export function abandonRegion({ G, ctx }: MoveCtx, regionCardId: string): void {
  if (!isRegionCard(G, regionCardId)) {
    logInvalidMove(G, ctx.currentPlayer, "abandonRegion", `card_not_region(${regionCardId})`);
    return;
  }
  const collectedResources: Partial<Record<ResourceName, number>> = {};
  const collectedResourceSources: ResourceGainSource[] = [];
  if (!abandonRegionToDiscard(G, ctx.currentPlayer, regionCardId, collectedResources, collectedResourceSources)) {
    logInvalidMove(G, ctx.currentPlayer, "abandonRegion", `abandon_failed(${regionCardId})`);
    return;
  }
  createReactiveExhaustChoicesForResourceGainSources(
    { G, playerId: ctx.currentPlayer, randomNumber: undefined, enabledExpansions: G.options?.enabledExpansions },
    collectedResourceSources,
    collectedResources
  );
}

export function resolveDevelopmentChoice({ G, ctx, random }: MoveCtx, cardId: string, payment?: ResourceCost): void {
  const pending = G.pendingDevelopmentChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDevelopmentChoice", "no_pending_development_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDevelopmentChoice", `pending_development_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDevelopmentChoice", `card_not_in_pending_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!resolvePendingDevelopmentChoice(G, ctx.currentPlayer, cardId, random?.Number, payment)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveDevelopmentChoice", `development_resolution_failed(${cardId})`);
    return;
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveDevelopmentChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveDevelopmentChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function skipDevelopmentChoice({ G, ctx, random }: MoveCtx): void {
  const pending = G.pendingDevelopmentChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "skipDevelopmentChoice", "no_pending_development_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "skipDevelopmentChoice", `pending_development_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.allowSkip) {
    logInvalidMove(G, ctx.currentPlayer, "skipDevelopmentChoice", "development_choice_not_skippable");
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!skipPendingDevelopmentChoice(G, ctx.currentPlayer, random?.Number)) {
    logInvalidMove(G, ctx.currentPlayer, "skipDevelopmentChoice", "development_skip_failed");
    return;
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "skipDevelopmentChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "skipDevelopmentChoice", "resume_effect_failed");
    return;
  }
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveShortGameDevelopmentExileChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingShortGameDevelopmentExileChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveShortGameDevelopmentExileChoice", "no_pending_short_game_development_exile_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveShortGameDevelopmentExileChoice", `pending_short_game_development_exile_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveShortGameDevelopmentExileChoice", `card_not_in_pending_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!resolvePendingShortGameDevelopmentExileChoice(G, ctx.currentPlayer, cardId, random?.Number)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveShortGameDevelopmentExileChoice", `short_game_development_exile_failed(${cardId})`);
    return;
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, undefined, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveShortGameDevelopmentExileChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveShortGameDevelopmentExileChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  if (!pendingEffectInterruption(G)) continuePendingShortGameDevelopmentExileQueue(G);
  continuePendingReshuffleLifecycle(G, ctx.currentPlayer, random?.Number);
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveTradeChoice({ G, ctx, random }: MoveCtx, routeCardId?: string): void {
  const pending = G.pendingTradeChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveTradeChoice", "no_pending_trade_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveTradeChoice", `pending_trade_for_player(${pending.playerId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!resolvePendingTradeChoice(G, ctx.currentPlayer, routeCardId)) {
    if (returnIfGameover(G)) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveTradeChoice", `trade_choice_failed(${routeCardId ?? "goods_to_progress"})`);
    return;
  }
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveTradeChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveTradeChoice", `resume_effect_failed(${routeCardId ?? "goods_to_progress"})`);
    return;
  }
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveDiscardChoice({ G, ctx, random }: MoveCtx, cardIds: string[]): void {
  const pending = G.pendingDiscardChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDiscardChoice", "no_pending_discard_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDiscardChoice", `pending_discard_for_player(${pending.playerId})`);
    return;
  }
  if (cardIds.length !== pending.count) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDiscardChoice", `wrong_card_count(required=${pending.count}/selected=${cardIds.length})`);
    return;
  }
  if (new Set(cardIds).size !== cardIds.length) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDiscardChoice", "duplicate_card_selection");
    return;
  }
  const p = G.players[ctx.currentPlayer];
  if (cardIds.some((cardId) => !pending.cardIds.includes(cardId) || !p.hand.includes(cardId))) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDiscardChoice", "card_not_in_discard_options");
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  for (const cardId of cardIds) {
    const index = p.hand.indexOf(cardId);
    if (index < 0) {
      restoreGameState(G, snapshot);
      logInvalidMove(G, ctx.currentPlayer, "resolveDiscardChoice", `discard_choice_failed(${cardId})`);
      return;
    }
    p.hand.splice(index, 1);
    p.discard.push(cardId);
  }
  G.pendingDiscardChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveDiscardChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveDiscardChoice", "resume_effect_failed");
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `DiscardChoiceResolved(${pending.sourceCardId ?? "unknown"}/count=${cardIds.length})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveMarketResourcePlacement({ G, ctx, random }: MoveCtx, cardIds: string[]): void {
  const pending = G.pendingMarketResourcePlacementChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketResourcePlacement", "no_pending_market_resource_placement_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketResourcePlacement", `pending_market_resource_placement_for_player(${pending.playerId})`);
    return;
  }
  if (cardIds.length !== pending.amount) {
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketResourcePlacement", `wrong_card_count(required=${pending.amount}/selected=${cardIds.length})`);
    return;
  }
  if (new Set(cardIds).size !== cardIds.length) {
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketResourcePlacement", "duplicate_card_selection");
    return;
  }
  if (cardIds.some((cardId) => !pending.cardIds.includes(cardId))) {
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketResourcePlacement", "card_not_in_market_resource_options");
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!movePlayerResourcesToMarketCards(G, { playerId: ctx.currentPlayer, cardIds, resource: pending.resource })) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketResourcePlacement", "market_resource_placement_failed");
    return;
  }
  G.pendingMarketResourcePlacementChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveMarketResourcePlacement")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveMarketResourcePlacement", "resume_effect_failed");
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `MarketResourcePlacementResolved(${pending.sourceCardId ?? "unknown"}/count=${cardIds.length})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveReturnUnrestChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingReturnUnrestChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnUnrestChoice", "no_pending_return_unrest_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnUnrestChoice", `pending_return_unrest_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnUnrestChoice", `card_not_in_return_unrest_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!returnUnrestCard(G, ctx.currentPlayer, cardId, pending.sourceZones)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnUnrestChoice", `return_unrest_failed(${cardId})`);
    return;
  }
  G.pendingReturnUnrestChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveReturnUnrestChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnUnrestChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ReturnUnrestChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveReturnFameChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingReturnFameChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnFameChoice", "no_pending_return_fame_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnFameChoice", `pending_return_fame_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnFameChoice", `card_not_in_return_fame_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!returnFameCard(G, ctx.currentPlayer, cardId, pending.sourceZones)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnFameChoice", `return_fame_failed(${cardId})`);
    return;
  }
  G.pendingReturnFameChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveReturnFameChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnFameChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ReturnFameChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolvePlaceOnDeckChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingPlaceOnDeckChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolvePlaceOnDeckChoice", "no_pending_place_on_deck_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolvePlaceOnDeckChoice", `pending_place_on_deck_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolvePlaceOnDeckChoice", `card_not_in_place_on_deck_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!placeCardOnDeck(G, ctx.currentPlayer, cardId, pending.sourceZone)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolvePlaceOnDeckChoice", `place_on_deck_failed(${cardId})`);
    return;
  }
  G.pendingPlaceOnDeckChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolvePlaceOnDeckChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolvePlaceOnDeckChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `PlaceOnDeckChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveReturnExhaustTokenChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingReturnExhaustTokenChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnExhaustTokenChoice", "no_pending_return_exhaust_token_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnExhaustTokenChoice", `pending_return_exhaust_token_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnExhaustTokenChoice", `card_not_in_return_exhaust_token_options(${cardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!returnExhaustToken(G, ctx.currentPlayer, cardId)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnExhaustTokenChoice", `return_exhaust_token_failed(${cardId})`);
    return;
  }
  G.pendingReturnExhaustTokenChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveReturnExhaustTokenChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveReturnExhaustTokenChoice", `resume_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ReturnExhaustTokenChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveGiveCardChoice({ G, ctx, random }: MoveCtx, cardId: string, recipientPlayerId: string): void {
  const pending = G.pendingGiveCardChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGiveCardChoice", "no_pending_give_card_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGiveCardChoice", `pending_give_card_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGiveCardChoice", `card_not_in_give_card_options(${cardId})`);
    return;
  }
  if (!pending.recipientPlayerIds.includes(recipientPlayerId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveGiveCardChoice", `recipient_not_in_give_card_options(${recipientPlayerId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!giveCardToPlayer(G, ctx.currentPlayer, cardId, recipientPlayerId)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveGiveCardChoice", `give_card_failed(${cardId}->${recipientPlayerId})`);
    return;
  }
  G.pendingGiveCardChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveGiveCardChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveGiveCardChoice", `resume_effect_failed(${cardId}->${recipientPlayerId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `GiveCardChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId}->${recipientPlayerId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveSwapChoice({ G, ctx, random }: MoveCtx, cardId: string, marketCardId: string): void {
  const pending = G.pendingSwapChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveSwapChoice", "no_pending_swap_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveSwapChoice", `pending_swap_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.choices.some((choice) => choice.cardId === cardId && choice.marketCardId === marketCardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveSwapChoice", `pair_not_in_swap_options(${cardId}<->${marketCardId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!swapCardWithMarket(G, { playerId: ctx.currentPlayer, sourceZone: pending.sourceZone, cardId, marketCardId })) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveSwapChoice", `swap_choice_failed(${cardId}<->${marketCardId})`);
    return;
  }
  G.pendingSwapChoice = undefined;
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveSwapChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveSwapChoice", `resume_effect_failed(${cardId}<->${marketCardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `SwapChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId}<->${marketCardId})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

function sameCardSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const cardId of a) counts.set(cardId, (counts.get(cardId) ?? 0) + 1);
  for (const cardId of b) {
    const count = counts.get(cardId) ?? 0;
    if (count <= 0) return false;
    if (count === 1) counts.delete(cardId);
    else counts.set(cardId, count - 1);
  }
  return counts.size === 0;
}

function reorderLookedCards(G: GameState, playerId: string, source: LookSourceZone, orderedCardIds: string[]): boolean {
  const player = G.players[playerId];
  if (source === "deck") {
    if (!sameCardSet(player.deck.slice(0, orderedCardIds.length), orderedCardIds)) return false;
    player.deck = [...orderedCardIds, ...player.deck.slice(orderedCardIds.length)];
    return true;
  }
  if (source === "nationDeck") {
    const accessionCards = player.nationDeck.filter((cardId) => isEffectiveAccessionCard(G, playerId, player, cardId));
    const nonAccessionCards = player.nationDeck.filter((cardId) => !isEffectiveAccessionCard(G, playerId, player, cardId));
    if (!sameCardSet(nonAccessionCards.slice(0, orderedCardIds.length), orderedCardIds)) return false;
    player.nationDeck = [...orderedCardIds, ...nonAccessionCards.slice(orderedCardIds.length), ...accessionCards];
    return true;
  }
  const fameDeck = G.fameDeck;
  if (!fameDeck) return false;
  if (!sameCardSet(fameDeck.available.slice(0, orderedCardIds.length), orderedCardIds)) return false;
  fameDeck.available = [...orderedCardIds, ...fameDeck.available.slice(orderedCardIds.length)];
  return true;
}

function takeLookedCard(G: GameState, playerId: string, source: LookTakeSourceZone, takeCardId: string, returnOrder: string[], destination: "hand" | "discard" | "history"): boolean {
  const player = G.players[playerId];
  const lookedCardIds = [takeCardId, ...returnOrder];
  if (source === "deck") {
    if (!sameCardSet(player.deck.slice(0, lookedCardIds.length), lookedCardIds)) return false;
    player.deck = [...returnOrder, ...player.deck.slice(lookedCardIds.length)];
  } else {
    const accessionCards = player.nationDeck.filter((cardId) => isEffectiveAccessionCard(G, playerId, player, cardId));
    const nonAccessionCards = player.nationDeck.filter((cardId) => !isEffectiveAccessionCard(G, playerId, player, cardId));
    if (!sameCardSet(nonAccessionCards.slice(0, lookedCardIds.length), lookedCardIds)) return false;
    player.nationDeck = [...returnOrder, ...nonAccessionCards.slice(lookedCardIds.length), ...accessionCards];
  }
  if (destination === "hand") player.hand.push(takeCardId);
  else if (destination === "discard") player.discard.push(takeCardId);
  else if (!moveCardsToHistoryDestination(G, playerId, [takeCardId])) return false;
  return true;
}

export function resolveLookOrderChoice({ G, ctx, random }: MoveCtx, cardIds: string[]): void {
  const pending = G.pendingLookOrderChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveLookOrderChoice", "no_pending_look_order_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveLookOrderChoice", `pending_look_order_for_player(${pending.playerId})`);
    return;
  }
  if (!sameCardSet(pending.cardIds, cardIds)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveLookOrderChoice", "card_order_mismatch");
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!reorderLookedCards(G, ctx.currentPlayer, pending.source, cardIds)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveLookOrderChoice", "look_order_failed");
    return;
  }
  G.pendingLookOrderChoice = undefined;
  G.lookedCards = { playerId: ctx.currentPlayer, source: pending.source, cardIds };
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveLookOrderChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveLookOrderChoice", "resume_effect_failed");
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `LookOrderResolved(${pending.source}/count=${cardIds.length})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveLookTakeChoice({ G, ctx, random }: MoveCtx, cardId: string, returnOrder?: string[]): void {
  const pending = G.pendingLookTakeChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveLookTakeChoice", "no_pending_look_take_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveLookTakeChoice", `pending_look_take_for_player(${pending.playerId})`);
    return;
  }
  if (!pending.cardIds.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveLookTakeChoice", "card_not_in_look_take_options");
    return;
  }
  const orderedReturn = returnOrder ?? pending.cardIds.filter((candidate) => candidate !== cardId);
  const expectedReturn = pending.cardIds.filter((candidate) => candidate !== cardId);
  if (!sameCardSet(expectedReturn, orderedReturn)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveLookTakeChoice", "return_order_mismatch");
    return;
  }
  const snapshot = cloneGameState(G);
  const resumeEffects = pending.resumeEffects ?? [];
  if (!takeLookedCard(G, ctx.currentPlayer, pending.source, cardId, orderedReturn, pending.destination)) {
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveLookTakeChoice", "look_take_failed");
    return;
  }
  G.pendingLookTakeChoice = undefined;
  G.lookedCards = { playerId: ctx.currentPlayer, source: pending.source, cardIds: pending.cardIds };
  if (!resumeEffectsAfterPendingChoice({ G, ctx, random }, pending.sourceCardId, resumeEffects)) {
    if (returnIfGameover(G)) return;
    if (handleAfterReshuffleHookFailure(G, ctx.currentPlayer, "resolveLookTakeChoice")) return;
    restoreGameState(G, snapshot);
    logInvalidMove(G, ctx.currentPlayer, "resolveLookTakeChoice", "resume_effect_failed");
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `LookTakeResolved(${pending.source}/${cardId}->${pending.destination})` });
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveUnrestAllocationChoice({ G, ctx, random }: MoveCtx, recipientPlayerIds: string[]): void {
  const pending = G.pendingUnrestAllocationChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveUnrestAllocationChoice", "no_pending_unrest_allocation_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveUnrestAllocationChoice", `pending_unrest_allocation_for_player(${pending.playerId})`);
    return;
  }
  const snapshot = cloneGameState(G);
  if (!resolvePendingUnrestAllocationChoice(G, ctx.currentPlayer, recipientPlayerIds, random?.Number)) {
    const failureLogEntries = G.log.slice(snapshot.log.length).filter((entry) =>
      entry.message.startsWith("UnsupportedEffectOp(")
        || entry.message.includes(" failed.")
        || entry.message.startsWith("NationRulesetError(")
    );
    restoreGameState(G, snapshot);
    G.log.push(...failureLogEntries);
    logInvalidMove(G, ctx.currentPlayer, "resolveUnrestAllocationChoice", "unrest_allocation_failed");
    return;
  }
  if (G.pendingUnrestAllocationResolution?.playerId === ctx.currentPlayer) {
    G.pendingUnrestAllocationResolution.rollbackSnapshot = snapshot;
  }
  continuePausedRulesSequences(G, ctx, random?.Number);
}

export function resolveSolsticeOrderChoice({ G, ctx, random }: MoveCtx, cardIds: string[]): void {
  const pending = G.pendingSolsticeOrderChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveSolsticeOrderChoice", "no_pending_solstice_order_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveSolsticeOrderChoice", `pending_solstice_order_for_player(${pending.playerId})`);
    return;
  }
  if (!resolvePendingSolsticeOrderChoice(G, ctx.currentPlayer, cardIds, random?.Number)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveSolsticeOrderChoice", "solstice_order_failed");
  }
}

export function resolveCleanupMarketResource({ G, ctx, events, random }: MoveCtx, cardId: string): void {
  const pending = G.pendingCleanupMarketResourceChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveCleanupMarketResource", "no_pending_cleanup_market_resource_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveCleanupMarketResource", `pending_cleanup_for_player(${pending.playerId})`);
    return;
  }
  if (!resolveCleanupMarketResourceChoice(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveCleanupMarketResource", `cleanup_market_resource_failed(${cardId})`);
    return;
  }
  continueEndTurnAfterCleanupChoices({ G, ctx, events, random });
}

export function resolveCleanupDiscard({ G, ctx, events, random }: MoveCtx, cardIds: string[]): void {
  const pending = G.pendingCleanupDiscardChoice;
  if (!pending) {
    logInvalidMove(G, ctx.currentPlayer, "resolveCleanupDiscard", "no_pending_cleanup_discard_choice");
    return;
  }
  if (pending.playerId !== ctx.currentPlayer) {
    logInvalidMove(G, ctx.currentPlayer, "resolveCleanupDiscard", `pending_cleanup_discard_for_player(${pending.playerId})`);
    return;
  }
  if (!resolveCleanupDiscardChoice(G, ctx.currentPlayer, cardIds)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveCleanupDiscard", "cleanup_discard_failed");
    return;
  }
  continueEndTurnAfterCleanupChoices({ G, ctx, events, random });
}

export function endTurnMove({ G, ctx, events, random }: MoveCtx): void {
  if (rejectIfPendingChoice(G, ctx.currentPlayer, "endTurn")) return;
  continueEndTurnAfterCleanupChoices({ G, ctx, events, random });
}

function continueEndTurnAfterCleanupChoices({ G, ctx, events, random }: MoveCtx): void {
  if (G.pendingCleanupMarketResourceChoice || G.pendingCleanupDiscardChoice) return;
  if (!G.pendingCleanupMarketResourceChoice && startCleanupMarketResourceChoice(G, ctx.currentPlayer)) return;
  if (G.options?.mode === "practice"
    && G.cleanupMarketResourcePlaced?.playerId === ctx.currentPlayer
    && G.cleanupMarketResourcePlaced.round === G.round
    && startPracticeMarketExileChoice(G, ctx.currentPlayer)) {
    G.pendingPracticeMarketExileBeforeCleanup = { playerId: ctx.currentPlayer };
    return;
  }
  if (!prepareCleanupBeforeOptionalDiscard(G, ctx, random?.Number)) return;
  resetCleanupTokensBeforeOptionalDiscard(G, ctx.currentPlayer);
  if (!G.pendingCleanupDiscardChoice && startCleanupDiscardChoice(G, ctx.currentPlayer)) return;
  events?.endTurn?.();
}
