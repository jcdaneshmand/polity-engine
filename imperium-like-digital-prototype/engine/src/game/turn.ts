import type { Ctx } from "boardgame.io";
import type { Effect, GameState, PausedSolsticeState, SolsticePhase } from "./state";
import { advanceScoringAtRoundBoundary, applyCollapseWinChecks } from "./scoring";
import { drawCardWithReshuffleLifecycle } from "./zones";
import { runEffects, runTriggeredEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import type { NationRuleset } from "../nations/nationRulesetTypes";
import { runBotTurn } from "../solo/botTurn";
import { startPracticeMarketExileChoice, tickPracticeClock } from "../solo/practiceMode";
import { ensureCleanupMarketResourcePlaced, startCleanupMarketResourceChoice } from "./marketResources";
import { collectAndClearCardStateToPlayer, collectCardResourcesToPlayer, detachGarrisonedCards } from "./regions";
import { activateState, currentStateMatches, stateCardMatches, stateCardSupports, syncPlayerStateCardStats } from "./stateMatching";
import { resourceAmount } from "./resources";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

function applyCollapseWinChecksForAllPlayers(G: GameState, randomNumber?: () => number): boolean {
  for (const playerId of Object.keys(G.players)) {
    const complete = applyCollapseWinChecks(G, playerId, randomNumber);
    if (G.gameover || !complete) return false;
  }
  return true;
}

function getTurnOrder(G: GameState, ctx: Ctx): string[] {
  const ctxOrder = (ctx as unknown as { playOrder?: string[] }).playOrder;
  return ctxOrder?.length ? ctxOrder : Object.keys(G.players).sort((a, b) => Number(a) - Number(b));
}

function isLastPlayerInRound(G: GameState, ctx: Ctx): boolean {
  const order = getTurnOrder(G, ctx);
  return order.at(-1) === ctx.currentPlayer;
}

function drawUpToHandLimit(G: GameState, playerId: string, randomNumber?: () => number, handLimit = 5): void {
  const p = G.players[playerId];
  const targetHandSize = p.handSize ?? handLimit;
  while (p.hand.length < targetHandSize && !G.gameover && !G.pendingDevelopmentChoice && !G.pendingShortGameDevelopmentExileChoice) {
    const remaining = targetHandSize - p.hand.length;
    const drawn = drawCardWithReshuffleLifecycle(G, playerId, randomNumber, remaining);
    if (!drawn) break;
  }
}

function clearCardMarkers(G: GameState, cardId: string): void {
  const state = G.cardStates?.[cardId];
  if (!state) return;
  state.exhausted = false;
  state.actionTokens = 0;
  state.exhaustTokens = 0;
}

function clearPlayerCleanupMarkers(G: GameState, playerId: string): void {
  const p = G.players[playerId];
  const baseCardIds = [
    ...p.hand,
    ...p.deck,
    ...p.discard,
    ...p.playArea,
    ...p.history,
    ...p.exile,
    ...p.powerArea,
    ...p.stateArea,
    ...p.nationDeck,
    ...p.developmentArea,
    ...Object.values(p.sideAreas ?? {}).flatMap((cards) => cards)
  ];
  const attachedCardIds = baseCardIds.flatMap((cardId) => G.cardStates?.[cardId]?.garrisonedCardIds ?? []);
  const cardIds = [...new Set([...baseCardIds, ...attachedCardIds])];
  cardIds.forEach((cardId) => clearCardMarkers(G, cardId));
}

function clearTreatAsEffects(G: GameState, playerId: string): void {
  if (!G.treatedSuitIconsThisTurn) return;
  G.treatedSuitIconsThisTurn[playerId] = [];
}

export function resetCleanupTokensBeforeOptionalDiscard(G: GameState, playerId: string): void {
  const p = G.players[playerId];
  clearPlayerCleanupMarkers(G, playerId);
  p.progressionTokens = { nationDeck: 0, developmentArea: 0 };
  p.actionsRemaining = p.actionTokensBase;
  p.actionTokensAvailable = p.actionTokensBase;
  p.exhaustTokensAvailable = p.exhaustTokensBase;
}

function cleanupEffectsAlreadyResolved(G: GameState, playerId: string): boolean {
  return G.cleanupEffectsResolved?.playerId === playerId && G.cleanupEffectsResolved.round === G.round;
}

export function prepareCleanupBeforeOptionalDiscard(G: GameState, ctx: Ctx, randomNumber?: () => number, startOverrideIndex = 0): boolean {
  ensureCleanupMarketResourcePlaced(G, ctx.currentPlayer);
  if (G.gameover) return false;
  if (cleanupEffectsAlreadyResolved(G, ctx.currentPlayer)) return true;

  const ruleset = G.activeNationRulesets?.[ctx.currentPlayer];
  if (ruleset) {
    const overrides = ruleset.cleanupOverrides ?? [];
    for (let index = startOverrideIndex; index < overrides.length; index += 1) {
      const ov = overrides[index];
      if (G.gameover) return false;
      logOverride(G, ctx.currentPlayer, ruleset.nationId, "cleanup", ov.op);
      if (ov.op === "custom_cleanup_effect") runEffects({ G, playerId: ctx.currentPlayer, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
      if (G.gameover) return false;
      if (pendingInterruption(G)) {
        G.pendingTurnEndCleanup = { playerId: ctx.currentPlayer, playOrder: getTurnOrder(G, ctx), stage: "before_optional_discard", nextCleanupOverrideIndex: index + 1 };
        return false;
      }
    }
  }

  G.cleanupEffectsResolved = { playerId: ctx.currentPlayer, round: G.round };
  return true;
}

function pendingInterruption(G: GameState): string | undefined {
  if (G.pendingChoice) return "pending_choice";
  if (G.pendingDrawChoice) return "pending_draw_choice";
  if (G.pendingFindChoice) return "pending_find_choice";
  if (G.pendingAcquireChoice) return "pending_acquire_choice";
  if (G.pendingMarketCardChoice) return "pending_market_card_choice";
  if (G.pendingMarketResourcePlacementChoice) return "pending_market_resource_placement_choice";
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
  if (G.pendingSolsticeOrderChoice) return "pending_solstice_order_choice";
  if (G.pendingCleanupMarketResourceChoice) return "pending_cleanup_market_resource_choice";
  if (G.pendingCleanupDiscardChoice) return "pending_cleanup_discard_choice";
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
  if (G.pendingScoringFinalization) return "pending_scoring_finalization";
  if (G.pendingScoringLifecycle) return "pending_scoring_lifecycle";
  if (G.pendingPracticeMarketExileBeforeCleanup) return "pending_practice_market_exile_before_cleanup";
  return undefined;
}

function nextSolsticeCursor(args: { playOrder: string[]; playerIndex: number; phase: SolsticePhase; cardIndex?: number; overrideIndex?: number }): PausedSolsticeState {
  return {
    playOrder: args.playOrder,
    playerIndex: args.playerIndex,
    phase: args.phase,
    cardIndex: args.cardIndex ?? 0,
    overrideIndex: args.overrideIndex ?? 0
  };
}

function pauseForPendingInterruption(G: GameState, playerId: string, cursor: PausedSolsticeState): boolean {
  const pending = pendingInterruption(G);
  if (!pending) return false;
  G.pausedSolstice = cursor;
  G.log.push({ round: G.round, playerId, message: `SolsticePaused(${pending})` });
  return true;
}

function solsticeCardsWithTrigger(G: GameState, cardIds: string[], phase: "on_solstice" | "end_of_solstice"): string[] {
  return cardIds.filter((cardId) => (G.cardDb[cardId]?.effects ?? []).some((effect) => effect.trigger === phase));
}

function isCurrentSolsticeSource(G: GameState, playerId: string, cardId: string): boolean {
  const p = G.players[playerId];
  return Boolean(p && (p.playArea.includes(cardId) || p.powerArea.includes(cardId) || p.stateArea.includes(cardId)));
}

function isValidSolsticePhase(value: unknown): value is SolsticePhase {
  return value === "on_solstice" || value === "overrides" || value === "end_of_solstice";
}

function isValidSolsticeCursor(G: GameState, cursor: PausedSolsticeState | undefined): cursor is PausedSolsticeState {
  if (!cursor || !Array.isArray(cursor.playOrder) || cursor.playOrder.length === 0) return false;
  if (cursor.playOrder.some((playerId) => typeof playerId !== "string" || !G.players[playerId])) return false;
  if (!Number.isInteger(cursor.playerIndex) || cursor.playerIndex < 0 || cursor.playerIndex > cursor.playOrder.length) return false;
  if (!isValidSolsticePhase(cursor.phase)) return false;
  return Number.isInteger(cursor.cardIndex) && cursor.cardIndex >= 0
    && Number.isInteger(cursor.overrideIndex) && cursor.overrideIndex >= 0;
}

function hasValidSolsticeSourceMap(
  G: GameState,
  recipientPlayerId: string,
  cardIds: string[],
  sourcePlayerIds?: Record<string, string>
): boolean {
  if (!G.players[recipientPlayerId] || cardIds.some((cardId) => typeof cardId !== "string")) return false;
  if (new Set(cardIds).size !== cardIds.length) return false;
  if (!sourcePlayerIds) return true;
  return cardIds.every((cardId) => {
    const sourcePlayerId = sourcePlayerIds[cardId];
    return typeof sourcePlayerId === "string" && Boolean(G.players[sourcePlayerId]);
  });
}

function solsticeEffectAppliesToPlayer(effect: Effect, sourcePlayerId: string, recipientPlayerId: string): boolean {
  const targeted = effect as Effect & { targetPlayerId?: string; targetPlayerIds?: string[]; targetPlayerScope?: string };
  if (effect.op === "take_unrest" && (targeted.targetPlayerIds?.length ?? 0) > 1) return sourcePlayerId === recipientPlayerId;
  if (targeted.targetPlayerIds) return targeted.targetPlayerIds.includes(recipientPlayerId);
  if (targeted.targetPlayerId) return targeted.targetPlayerId === recipientPlayerId;
  if (targeted.targetPlayerScope === "all") return true;
  if (targeted.targetPlayerScope === "others") return sourcePlayerId !== recipientPlayerId;
  return sourcePlayerId === recipientPlayerId;
}

function solsticeEffectsForPlayer(G: GameState, sourcePlayerId: string, recipientPlayerId: string, cardId: string, phase: "on_solstice" | "end_of_solstice"): Effect[] {
  return (G.cardDb[cardId]?.effects ?? [])
    .filter((effect) => effect.trigger === phase && solsticeEffectAppliesToPlayer(effect, sourcePlayerId, recipientPlayerId))
    .map((effect) => {
      const targeted = { ...effect } as Effect & { targetPlayerId?: string; targetPlayerIds?: string[]; targetPlayerScope?: string };
      if (effect.op === "take_unrest" && (targeted.targetPlayerIds?.length ?? 0) > 1) return targeted;
      delete targeted.targetPlayerId;
      delete targeted.targetPlayerIds;
      delete targeted.targetPlayerScope;
      return targeted;
    });
}

function solsticeSourcesForPlayer(G: GameState, playOrder: string[], recipientPlayerId: string, phase: "on_solstice" | "end_of_solstice"): { cardIds: string[]; sourcePlayerIds: Record<string, string> } {
  const sourcePlayerIds: Record<string, string> = {};
  const cardIds: string[] = [];
  for (const sourcePlayerId of playOrder) {
    const source = G.players[sourcePlayerId];
    if (!source) continue;
    for (const cardId of [...source.playArea, ...source.powerArea, ...source.stateArea]) {
      if (solsticeEffectsForPlayer(G, sourcePlayerId, recipientPlayerId, cardId, phase).length === 0) continue;
      cardIds.push(cardId);
      sourcePlayerIds[cardId] = sourcePlayerId;
    }
  }
  return { cardIds, sourcePlayerIds };
}

function solsticeEffectsNeedPlayerOrder(G: GameState, cardIds: string[], phase: "on_solstice" | "end_of_solstice"): boolean {
  const orderSensitiveOps = new Set([
    "spend_resource",
    "draw",
    "draw_if_able",
    "remove_resource",
    "return_resource",
    "steal_resource",
    "discard_random",
    "discard_cards",
    "take_unrest",
    "trigger_scoring",
    "trade",
    "profit",
    "garrison_card",
    "recall_region",
    "abandon_region",
    "develop",
    "move_self_to_history",
    "exile_card",
    "acquire_card",
    "break_through",
    "find_card",
    "look_cards",
    "gain_fame",
    "return_unrest",
    "return_fame",
    "place_card_on_deck",
    "give_card",
    "swap_card",
    "return_exhaust_token",
    "gain_card",
    "take_card",
    "gain_action",
    "spend_action",
    "commerce",
    "treat_suit_as",
    "conditional_resource_at_least",
    "conditional_state_is",
    "optional",
    "choose_one"
  ]);
  return cardIds.some((cardId) =>
    (G.cardDb[cardId]?.effects ?? []).some((effect) => effect.trigger === phase && orderSensitiveOps.has(effect.op))
  );
}

function createSolsticeOrderChoice(
  G: GameState,
  playerId: string,
  phase: "on_solstice" | "end_of_solstice",
  cardIds: string[],
  cursor: PausedSolsticeState,
  sourcePlayerIds?: Record<string, string>
): boolean {
  const eligibleCardIds = solsticeCardsWithTrigger(G, cardIds, phase);
  if (eligibleCardIds.length <= 1) return false;
  if (!solsticeEffectsNeedPlayerOrder(G, eligibleCardIds, phase)) return false;
  const externalSources = sourcePlayerIds && Object.values(sourcePlayerIds).some((sourcePlayerId) => sourcePlayerId !== playerId)
    ? sourcePlayerIds
    : undefined;
  G.pendingSolsticeOrderChoice = { playerId, phase, cardIds: eligibleCardIds, ...(externalSources ? { sourcePlayerIds: externalSources } : {}) };
  G.pausedSolstice = cursor;
  G.log.push({ round: G.round, playerId, message: `SolsticeOrderChoicePending(${phase}/cards=${eligibleCardIds.length})` });
  return true;
}

function runOrderedSolsticeCardEffects(
  G: GameState,
  playerId: string,
  phase: "on_solstice" | "end_of_solstice",
  cardIds: string[],
  cursor: PausedSolsticeState,
  randomNumber?: () => number,
  sourcePlayerIds?: Record<string, string>
): boolean {
  for (let index = 0; index < cardIds.length; index += 1) {
    const cardId = cardIds[index];
    const sourcePlayerId = sourcePlayerIds?.[cardId] ?? playerId;
    if (!isCurrentSolsticeSource(G, sourcePlayerId, cardId)) continue;
    const effects = solsticeEffectsForPlayer(G, sourcePlayerId, playerId, cardId, phase);
    runTriggeredEffects({ G, playerId, selfCardId: cardId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, effects, phase);
    if (G.gameover) return false;
    if (pendingInterruption(G)) {
      const remainingCardIds = cardIds.slice(index + 1);
      if (remainingCardIds.length > 0 || phase === "end_of_solstice") {
        const externalSources = sourcePlayerIds && Object.values(sourcePlayerIds).some((sourcePlayerId) => sourcePlayerId !== playerId)
          ? sourcePlayerIds
          : undefined;
        G.pendingSolsticeContinuation = { playerId, phase, cardIds: remainingCardIds, cursor, ...(externalSources ? { sourcePlayerIds: externalSources } : {}) };
      }
      pauseForPendingInterruption(G, playerId, cursor);
      return false;
    }
  }
  return true;
}

function applySolsticeStateFlip(G: GameState, playerId: string, ruleset: NationRuleset): void {
  const p = G.players[playerId];
  const sequenceOverride = (ruleset.stateOverrides ?? []).find((ov) => ov.op === "flip_state_on_solstice");
  if (!sequenceOverride) {
    if (p.stateArea.length >= 2) [p.stateArea[0], p.stateArea[1]] = [p.stateArea[1], p.stateArea[0]];
    syncPlayerStateCardStats(G, playerId);
    return;
  }
  const sequence = sequenceOverride.sequence;
  if (sequence.length === 0) return;
  const currentState = p.stateArea[0];
  const currentIndex = sequence.findIndex((state) => currentState ? stateCardMatches(G, currentState, state) : false);
  const nextIndex = currentIndex < 0
    ? 0
    : currentIndex + 1 < sequence.length
      ? currentIndex + 1
      : sequenceOverride.loop === false
        ? currentIndex
        : 0;
  const nextState = sequence[nextIndex];
  if (p.stateArea.some((cardId) => stateCardMatches(G, cardId, nextState) || stateCardSupports(G, cardId, nextState))) {
    activateState(G, playerId, nextState);
  } else {
    p.stateArea.splice(0, Math.min(1, p.stateArea.length), nextState);
    syncPlayerStateCardStats(G, playerId);
  }
  G.log.push({ round: G.round, playerId, message: `StateFlippedOnSolstice(${currentState ?? "none"}->${sequence[nextIndex]})` });
}

function applyEndOfSolsticeRemovals(G: GameState, playerId: string, ruleset: NationRuleset): void {
  const p = G.players[playerId];
  for (const ov of ruleset.solsticeOverrides ?? []) {
    if (ov.op !== "remove_play_card_and_nation_deck_if_resource_empty") continue;
    if (ov.state && !currentStateMatches(G, playerId, ov.state)) continue;
    if (resourceAmount(p.resources, ov.resource) > 0) continue;
    const playIndex = p.playArea.indexOf(ov.cardId);
    if (playIndex < 0) continue;
    const [removedCardId] = p.playArea.splice(playIndex, 1);
    collectCardResourcesToPlayer(G, playerId, ov.cardId);
    const garrisonedCardIds = detachGarrisonedCards(G, ov.cardId);
    garrisonedCardIds.forEach((cardId) => collectAndClearCardStateToPlayer(G, playerId, cardId));
    const removedNationCards = p.nationDeck.splice(0);
    const removedAccessionCardId = p.accessionCardId;
    p.accessionCardId = undefined;
    const removedCardIds = [removedCardId, ...garrisonedCardIds, ...removedNationCards];
    if (removedAccessionCardId) removedCardIds.push(removedAccessionCardId);
    p.exile.push(...removedCardIds);
    G.log.push({ round: G.round, playerId, message: `SolsticeRemovedPlayCardAndNationDeck(${ov.cardId}/removed=${1 + garrisonedCardIds.length + removedNationCards.length + (removedAccessionCardId ? 1 : 0)})` });
    if (ov.activateState) {
      activateState(G, playerId, ov.activateState);
      G.log.push({ round: G.round, playerId, message: `StateActivatedOnSolsticeRemoval(${ov.cardId}/${ov.activateState})` });
    }
  }
}

export function startCleanupDiscardChoice(G: GameState, playerId: string): boolean {
  if (G.pendingCleanupDiscardChoice) return false;
  if (G.cleanupDiscardResolved?.playerId === playerId && G.cleanupDiscardResolved.round === G.round) return false;
  if (G.options?.enabledVariants?.includes("precious_cards")) return false;
  if ((G.activeNationRulesets?.[playerId]?.cleanupOverrides ?? []).some((ov) => ov.op === "prevent_voluntary_discard")) return false;
  const cardIds = [...G.players[playerId].hand];
  if (cardIds.length === 0) return false;
  G.pendingCleanupDiscardChoice = { playerId, cardIds };
  G.log.push({ round: G.round, playerId, message: `CleanupDiscardChoicePending(options=${cardIds.length})` });
  return true;
}

export function resolveCleanupDiscardChoice(G: GameState, playerId: string, cardIds: string[]): boolean {
  const pending = G.pendingCleanupDiscardChoice;
  if (!pending || pending.playerId !== playerId) return false;
  const p = G.players[playerId];
  const uniqueCardIds = [...new Set(cardIds)];
  if (uniqueCardIds.some((cardId) => !pending.cardIds.includes(cardId) || !p.hand.includes(cardId))) return false;

  for (const cardId of uniqueCardIds) {
    const index = p.hand.indexOf(cardId);
    if (index < 0) return false;
    p.hand.splice(index, 1);
    p.discard.push(cardId);
  }

  G.pendingCleanupDiscardChoice = undefined;
  G.cleanupDiscardResolved = { playerId, round: G.round };
  G.log.push({ round: G.round, playerId, message: `CleanupDiscardResolved(count=${uniqueCardIds.length})` });
  return true;
}

function runSolsticeForPlayer(
  G: GameState,
  args: { playOrder: string[]; playerIndex: number; startPhase?: SolsticePhase; startCardIndex?: number; startOverrideIndex?: number; skipBeforeHook?: boolean },
  randomNumber?: () => number
): boolean {
  const playerId = args.playOrder[args.playerIndex];
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!args.skipBeforeHook && !runNationHooks({ G, playerId, trigger: "before_solstice", randomNumber })) return false;
  if (G.gameover) return false;
  if (!args.skipBeforeHook && pauseForPendingInterruption(G, playerId, nextSolsticeCursor({ playOrder: args.playOrder, playerIndex: args.playerIndex, phase: "on_solstice" }))) return false;
  const preventEmpireFlip = (ruleset?.stateOverrides ?? []).some((ov) => ov.op === "never_flip_to_empire");

  let phase: SolsticePhase = args.startPhase ?? "on_solstice";

  if (phase === "on_solstice") {
    const startCardIndex = args.startPhase === "on_solstice" ? args.startCardIndex ?? 0 : 0;
    const sources = solsticeSourcesForPlayer(G, args.playOrder, playerId, "on_solstice");
    const cursor = nextSolsticeCursor({ playOrder: args.playOrder, playerIndex: args.playerIndex, phase: "overrides" });
    if (startCardIndex === 0 && createSolsticeOrderChoice(G, playerId, "on_solstice", sources.cardIds, cursor, sources.sourcePlayerIds)) return false;
    if (!runOrderedSolsticeCardEffects(G, playerId, "on_solstice", sources.cardIds.slice(startCardIndex), cursor, randomNumber, sources.sourcePlayerIds)) return false;
    phase = "overrides";
  }

  if (phase === "overrides" && ruleset) {
    const overrides = ruleset.solsticeOverrides ?? [];
    const startOverrideIndex = args.startPhase === "overrides" ? args.startOverrideIndex ?? 0 : 0;
    for (let index = startOverrideIndex; index < overrides.length; index += 1) {
      const ov = overrides[index];
      logOverride(G, playerId, ruleset.nationId, "solstice", ov.op);
      if (ov.op === "flip_state" && !preventEmpireFlip) applySolsticeStateFlip(G, playerId, ruleset);
      if (ov.op === "custom_solstice_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
      if (G.gameover) return false;
      if (pauseForPendingInterruption(G, playerId, nextSolsticeCursor({ playOrder: args.playOrder, playerIndex: args.playerIndex, phase: "overrides", overrideIndex: index + 1 }))) return false;
    }
    phase = "end_of_solstice";
  } else if (phase === "overrides") {
    phase = "end_of_solstice";
  }

  if (phase === "end_of_solstice") {
    const startCardIndex = args.startPhase === "end_of_solstice" ? args.startCardIndex ?? 0 : 0;
    const sources = solsticeSourcesForPlayer(G, args.playOrder, playerId, "end_of_solstice");
    const cursor = nextSolsticeCursor({ playOrder: args.playOrder, playerIndex: args.playerIndex + 1, phase: "on_solstice" });
    if (startCardIndex === 0 && createSolsticeOrderChoice(G, playerId, "end_of_solstice", sources.cardIds, cursor, sources.sourcePlayerIds)) return false;
    if (!runOrderedSolsticeCardEffects(G, playerId, "end_of_solstice", sources.cardIds.slice(startCardIndex), cursor, randomNumber, sources.sourcePlayerIds)) return false;
    if (ruleset) applyEndOfSolsticeRemovals(G, playerId, ruleset);
  }
  if (!runNationHooks({ G, playerId, trigger: "after_solstice", randomNumber })) return false;
  if (G.gameover) return false;
  if (pauseForPendingInterruption(G, playerId, nextSolsticeCursor({ playOrder: args.playOrder, playerIndex: args.playerIndex + 1, phase: "on_solstice" }))) return false;
  return true;
}

function runSolsticeForAllPlayers(G: GameState, playOrder: string[], randomNumber?: () => number, start?: PausedSolsticeState): boolean {
  for (let playerIndex = start?.playerIndex ?? 0; playerIndex < playOrder.length; playerIndex += 1) {
    const completed = runSolsticeForPlayer(
      G,
      {
        playOrder,
        playerIndex,
        startPhase: playerIndex === start?.playerIndex ? start.phase : undefined,
        startCardIndex: playerIndex === start?.playerIndex ? start.cardIndex : undefined,
        startOverrideIndex: playerIndex === start?.playerIndex ? start.overrideIndex : undefined,
        skipBeforeHook: playerIndex === start?.playerIndex
      },
      randomNumber
    );
    if (!completed || G.gameover || pendingInterruption(G)) return false;
  }
  return true;
}

function finishSolsticeRound(G: GameState, playerId: string, randomNumber?: () => number): void {
  if (G.gameover || pendingInterruption(G)) return;
  G.pausedSolstice = undefined;
  G.round += 1;
  advanceScoringAtRoundBoundary(G, randomNumber);
  if (G.gameover || pendingInterruption(G) || G.pendingScoringFinalization) return;
  if (!applyCollapseWinChecksForAllPlayers(G, randomNumber)) {
    if (!G.gameover) G.pendingSolsticeRoundEnd = { playerId };
    return;
  }
  finishRoundHandoff(G, playerId);
}

function finishRoundHandoff(G: GameState, playerId: string): void {
  G.currentTurnType = "activate";
  G.log.push({ round: G.round, playerId, message: "TurnPhase(turn_handoff): end_turn_complete" });
}

export function continuePausedSolstice(G: GameState, playerId: string, randomNumber?: () => number): void {
  if (G.gameover) return;
  const pendingRoundEnd = G.pendingSolsticeRoundEnd;
  if (pendingRoundEnd || G.pendingSolsticeContinuation || G.pausedSolstice) G.currentTurnType = "solstice";
  if (pendingRoundEnd && !pendingInterruption(G)) {
    G.pendingSolsticeRoundEnd = undefined;
    if (!applyCollapseWinChecksForAllPlayers(G, randomNumber)) {
      if (!G.gameover) G.pendingSolsticeRoundEnd = pendingRoundEnd;
      return;
    }
    finishRoundHandoff(G, pendingRoundEnd.playerId);
    return;
  }

  const continuation = G.pendingSolsticeContinuation;
  if (continuation && !pendingInterruption(G)) {
    if (
      continuation.playerId !== playerId
      || !isValidSolsticePhase(continuation.phase)
      || !isValidSolsticeCursor(G, continuation.cursor)
      || !hasValidSolsticeSourceMap(G, continuation.playerId, continuation.cardIds, continuation.sourcePlayerIds)
    ) {
      G.log.push({ round: G.round, playerId, message: "SolsticeContinuationRejected(malformed_or_wrong_actor)" });
      return;
    }
    G.pendingSolsticeContinuation = undefined;
    runOrderedSolsticeCardEffects(G, continuation.playerId, continuation.phase, continuation.cardIds, continuation.cursor, randomNumber, continuation.sourcePlayerIds);
    if (G.gameover || pendingInterruption(G)) return;
    if (continuation.phase === "end_of_solstice") {
      const ruleset = G.activeNationRulesets?.[continuation.playerId];
      if (ruleset) applyEndOfSolsticeRemovals(G, continuation.playerId, ruleset);
      if (G.gameover) return;
      if (!runNationHooks({ G, playerId: continuation.playerId, trigger: "after_solstice", randomNumber })) return;
      if (G.gameover) return;
      if (pauseForPendingInterruption(G, continuation.playerId, continuation.cursor)) return;
    }
  }

  const paused = G.pausedSolstice;
  if (!paused || pendingInterruption(G)) return;
  G.log.push({ round: G.round, playerId, message: "SolsticeResumed" });
  if (!runSolsticeForAllPlayers(G, paused.playOrder, randomNumber, paused)) return;
  if (G.gameover || pendingInterruption(G)) return;
  finishSolsticeRound(G, playerId, randomNumber);
}

export function resolvePendingSolsticeOrderChoice(G: GameState, playerId: string, cardIds: string[], randomNumber?: () => number): boolean {
  const pending = G.pendingSolsticeOrderChoice;
  const paused = G.pausedSolstice;
  if (!pending || !paused || pending.playerId !== playerId) return false;
  if (pending.phase !== "on_solstice" && pending.phase !== "end_of_solstice") return false;
  if (!isValidSolsticeCursor(G, paused)) return false;
  if (!hasValidSolsticeSourceMap(G, pending.playerId, pending.cardIds, pending.sourcePlayerIds)) return false;
  if (cardIds.length !== pending.cardIds.length) return false;
  if (new Set(cardIds).size !== cardIds.length) return false;
  if (cardIds.some((cardId) => !pending.cardIds.includes(cardId))) return false;

  G.currentTurnType = "solstice";
  G.pendingSolsticeOrderChoice = undefined;
  const completed = runOrderedSolsticeCardEffects(G, playerId, pending.phase, cardIds, paused, randomNumber, pending.sourcePlayerIds);
  if (!completed) return true;
  G.log.push({ round: G.round, playerId, message: `SolsticeOrderChoiceResolved(${pending.phase}/cards=${cardIds.length})` });
  if (pending.phase === "end_of_solstice") {
    const ruleset = G.activeNationRulesets?.[playerId];
    if (ruleset) applyEndOfSolsticeRemovals(G, playerId, ruleset);
    if (G.gameover) return true;
    if (!runNationHooks({ G, playerId, trigger: "after_solstice", randomNumber })) return true;
    if (G.gameover) return true;
    if (pauseForPendingInterruption(G, playerId, paused)) return true;
  }
  continuePausedSolstice(G, playerId, randomNumber);
  return true;
}

export function onTurnBegin(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  const p = G.players[ctx.currentPlayer];
  G.currentTurnType ??= "activate";
  // Cleanup refreshed these pools. Preserve progression and reactive Exhaust
  // spending that occurred after cleanup and before this turn began.
  p.actionsRemaining = p.actionTokensAvailable;
  G.freePlayedThisTurn ??= {};
  G.freePlayedThisTurn[ctx.currentPlayer] = [];
  clearTreatAsEffects(G, ctx.currentPlayer);

  applyCollapseWinChecksForAllPlayers(G, randomNumber);
}

function finishTurnAfterModeCleanup(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(reshuffle_as_needed): next_draw_handles_reshuffle_lifecycle" });
  clearTreatAsEffects(G, ctx.currentPlayer);
  if (isLastPlayerInRound(G, ctx)) {
    const playOrder = getTurnOrder(G, ctx);
    G.currentTurnType = "solstice";
    if (!runSolsticeForAllPlayers(G, playOrder, randomNumber)) return;
    if (G.gameover) return;
    if (pendingInterruption(G)) return;
    finishSolsticeRound(G, ctx.currentPlayer, randomNumber);
    return;
  }
  if (!applyCollapseWinChecksForAllPlayers(G, randomNumber)) {
    if (!G.gameover) G.pendingTurnEndCleanup = { playerId: ctx.currentPlayer, playOrder: getTurnOrder(G, ctx), stage: "after_draw_up" };
    return;
  }
  G.currentTurnType = "activate";
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(turn_handoff): end_turn_complete" });
}

function finishTurnAfterCleanupDraw(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  const p = G.players[ctx.currentPlayer];
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `TurnPhase(cleanup): draw_up(hand=${p.hand.length})` });
  if (G.options?.mode === "solo") {
    runBotTurn({ G, rollDie: randomNumber ? () => Math.floor(randomNumber() * 6) + 1 : undefined, randomNumber });
    if (G.gameover) return;
  }
  if (G.options?.mode === "practice") {
    tickPracticeClock(G);
    if (G.gameover) return;
    if (G.cleanupMarketResourcePlaced?.playerId === ctx.currentPlayer
      && G.cleanupMarketResourcePlaced.round === G.round
      && startPracticeMarketExileChoice(G, ctx.currentPlayer)) {
      G.pendingTurnEndCleanup = { playerId: ctx.currentPlayer, playOrder: getTurnOrder(G, ctx), stage: "after_practice_market_exile" };
      return;
    }
  }
  finishTurnAfterModeCleanup(G, ctx, randomNumber);
}

function continueCleanupAfterEffects(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  const p = G.players[ctx.currentPlayer];
  resetCleanupTokensBeforeOptionalDiscard(G, ctx.currentPlayer);
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(cleanup): optional_discard_resolved" });
  drawUpToHandLimit(G, ctx.currentPlayer, randomNumber);
  if (G.gameover) return;
  if (pendingInterruption(G)) {
    G.pendingTurnEndCleanup = { playerId: ctx.currentPlayer, playOrder: getTurnOrder(G, ctx), stage: "after_draw_up" };
    return;
  }
  finishTurnAfterCleanupDraw(G, ctx, randomNumber);
}

function startPracticeMarketExileBeforeCleanup(G: GameState, ctx: Ctx): boolean {
  if (G.options?.mode !== "practice") return false;
  if (G.cleanupMarketResourcePlaced?.playerId !== ctx.currentPlayer) return false;
  if (G.cleanupMarketResourcePlaced.round !== G.round) return false;
  if (!startPracticeMarketExileChoice(G, ctx.currentPlayer)) return false;
  G.pendingPracticeMarketExileBeforeCleanup = { playerId: ctx.currentPlayer };
  return true;
}

export function continuePendingTurnEndCleanup(G: GameState, playerId: string, randomNumber?: () => number): void {
  const pending = G.pendingTurnEndCleanup;
  if (!pending || pending.playerId !== playerId || G.gameover || pendingInterruption(G)) return;
  G.pendingTurnEndCleanup = undefined;
  const ctx = { currentPlayer: pending.playerId, playOrder: pending.playOrder } as unknown as Ctx;
  if (pending.stage === "before_optional_discard") {
    if (!prepareCleanupBeforeOptionalDiscard(G, ctx, randomNumber, pending.nextCleanupOverrideIndex ?? 0)) return;
    if (startPracticeMarketExileBeforeCleanup(G, ctx)) return;
    resetCleanupTokensBeforeOptionalDiscard(G, ctx.currentPlayer);
    if (startCleanupDiscardChoice(G, ctx.currentPlayer)) return;
    continueCleanupAfterEffects(G, ctx, randomNumber);
    return;
  }
  if (pending.stage === "after_cleanup_effects") {
    continueCleanupAfterEffects(G, ctx, randomNumber);
    return;
  }
  if (pending.stage === "after_practice_market_exile") {
    finishTurnAfterModeCleanup(G, ctx, randomNumber);
    return;
  }
  finishTurnAfterCleanupDraw(G, ctx, randomNumber);
}

export function onTurnEnd(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  if (G.gameover) return;
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "TurnPhase(cleanup): start" });
  if (G.options?.mode === "practice"
    && G.market.length > 1
    && G.cleanupMarketResourcePlaced?.playerId !== ctx.currentPlayer
    && startCleanupMarketResourceChoice(G, ctx.currentPlayer)) return;
  if (!prepareCleanupBeforeOptionalDiscard(G, ctx, randomNumber)) return;
  if (startPracticeMarketExileBeforeCleanup(G, ctx)) return;
  continueCleanupAfterEffects(G, ctx, randomNumber);
}
