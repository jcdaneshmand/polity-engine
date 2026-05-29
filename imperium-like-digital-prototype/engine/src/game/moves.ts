import type { Ctx } from "boardgame.io";
import { runEffects, runTriggeredEffects } from "../cards/effectRunner";
import type { GameState } from "./state";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { resolvePendingDevelopmentChoice } from "./zones";
import { collectMarketResources, collectMarketUnrest, resolveCleanupMarketResourceChoice, startCleanupMarketResourceChoice } from "./marketResources";
import { refillMarketSlot } from "./marketRefill";
import { availableForResourceCost, canPayResourceCost, payResourceCost } from "./payments";
import { resolveCleanupDiscardChoice, startCleanupDiscardChoice } from "./turn";
import { abandonRegionToDiscard, garrisonCardOnRegion, isRegionCard, recallRegionToHand } from "./regions";
import { breakThrough } from "./breakThrough";
import type { Suit, ZoneName } from "./state";

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

function isActivateTurn(G: GameState): boolean {
  return (G.currentTurnType ?? "activate") === "activate";
}

function cardRemainsInPlay(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "in_play" || type === "region" || type === "power" || type === "state";
}

function normalizeStateToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[_\s-]+/g, "");
  if (normalized === "empire") return "civilized";
  if (normalized === "barbarian") return "uncivilized";
  return normalized;
}

function cardMeetsStateRequirement(G: GameState, playerId: string, cardId: string): boolean {
  const requirement = normalizeStateToken(G.cardDb[cardId]?.stateRequirement);
  if (!requirement) return true;
  const stateCardId = G.players[playerId]?.stateArea[0];
  const stateCard = stateCardId ? G.cardDb[stateCardId] : undefined;
  const stateTokens = [
    stateCardId,
    stateCard?.displayName,
    stateCard?.suit,
    ...(stateCard?.tags ?? [])
  ].map(normalizeStateToken).filter(Boolean);
  return stateTokens.includes(requirement);
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

function canExhaustCard(G: GameState, playerId: string, cardId: string): boolean {
  const p = G.players[playerId];
  return p.playArea.includes(cardId) || p.powerArea.includes(cardId) || p.stateArea.includes(cardId);
}

const INNOVATE_SUITS: Suit[] = ["region", "uncivilized", "civilized", "tributary"];

function isInnovateSuit(suit: Suit): boolean {
  return INNOVATE_SUITS.includes(suit);
}

function isUnrestCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "unrest" || card?.cardType === "unrest" || card?.type === "unrest" || card?.tags?.includes("unrest") || cardId.includes("unrest");
}

function moveResolvedCardFromPlayToDiscard(G: GameState, playerId: string, cardId: string): void {
  if (cardRemainsInPlay(G, cardId)) return;
  const p = G.players[playerId];
  const playIndex = p.playArea.indexOf(cardId);
  if (playIndex < 0) return;
  p.playArea.splice(playIndex, 1);
  p.discard.push(cardId);
}

type FindZone = "hand" | "discard" | "deck" | "nationDeck";

function findCardZone(G: GameState, playerId: string, cardId: string): FindZone | undefined {
  const p = G.players[playerId];
  const zones: FindZone[] = ["hand", "discard", "deck", "nationDeck"];
  return zones.find((zone) => p[zone].includes(cardId));
}

function movePlayerCard(G: GameState, playerId: string, cardId: string, destination: ZoneName): boolean {
  const p = G.players[playerId];
  const fromZone = findCardZone(G, playerId, cardId);
  if (!fromZone) return false;
  if (fromZone === destination) return true;
  const sourceCards = p[fromZone];
  const index = sourceCards.indexOf(cardId);
  if (index < 0) return false;
  sourceCards.splice(index, 1);
  p[destination].push(cardId);
  return true;
}

export function playCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
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
  if (!p.hand.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", `card_not_in_hand(${cardId})`);
    return;
  }
  if (!cardMeetsStateRequirement(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", `state_requirement_not_met(${G.cardDb[cardId]?.stateRequirement})`);
    return;
  }

  logTurnPhase(G, ctx.currentPlayer, "action_execution", `playCard(${cardId})`);
  if (freePlay) recordFreePlay(G, ctx.currentPlayer, cardId);
  else p.actionsRemaining -= 1;
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_play_card", payload: { cardId }, randomNumber: random?.Number });
  const handIndex = p.hand.indexOf(cardId);
  if (handIndex < 0) {
    p.actionsRemaining += 1;
    return;
  }
  p.hand.splice(handIndex, 1);
  p.playArea.push(cardId);

  runTriggeredEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number },
    G.cardDb[cardId]?.effects ?? [],
    "on_play"
  );
  moveResolvedCardFromPlayToDiscard(G, ctx.currentPlayer, cardId);
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_play_card", payload: { cardId }, randomNumber: random?.Number });
}

export function acquireCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  if (!isActivateTurn(G)) {
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `turn_type_not_activate(${G.currentTurnType})`);
    return;
  }
  if (!G.market.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `card_not_in_market(${cardId})`);
    return;
  }
  const cost = G.cardDb[cardId]?.cost ?? 0;
  const availableMaterials = availableForResourceCost(G, ctx.currentPlayer, "materials");
  if (!canPayResourceCost(G, ctx.currentPlayer, "materials", cost)) {
    logInvalidMove(G, ctx.currentPlayer, "acquireCard", `insufficient_materials(required=${cost}, available=${availableMaterials})`);
    return;
  }

  logTurnPhase(G, ctx.currentPlayer, "acquire_resolution", `acquireCard(${cardId})`);
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_acquire", payload: { cardId }, randomNumber: random?.Number });
  const idx = G.market.indexOf(cardId);
  if (idx < 0) return;
  G.market.splice(idx, 1);
  payResourceCost(G, ctx.currentPlayer, "materials", cost);
  collectMarketResources(G, ctx.currentPlayer, cardId);
  p.hand.push(cardId);
  collectMarketUnrest(G, ctx.currentPlayer, cardId);
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `Acquired ${cardId} for ${cost} materials.` });
  refillMarketSlot(G, { playerId: ctx.currentPlayer, slotIndex: idx, acquiredCardId: cardId });
  if (G.market.length === 0) {
    G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: "MarketExhausted(no_refill_pipeline_defined)." });
  } else {
    G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `MarketRefillStatus(market=${G.market.length}, pool=${G.marketRefillPool.length}).` });
  }
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_acquire", payload: { cardId }, randomNumber: random?.Number });
}

export function exhaustCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  if (!isActivateTurn(G)) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `turn_type_not_activate(${G.currentTurnType})`);
    return;
  }
  if (!canExhaustCard(G, ctx.currentPlayer, cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `card_not_exhaust_source(${cardId})`);
    return;
  }
  if (p.exhaustTokensAvailable < 1) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", "no_exhaust_tokens_available");
    return;
  }
  const effects = G.cardDb[cardId]?.effects ?? [];
  if (!effects.some((effect) => effect.trigger === "on_exhaust")) {
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `no_exhaust_ability(${cardId})`);
    return;
  }

  p.exhaustTokensAvailable -= 1;
  const resolved = runTriggeredEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    effects,
    "on_exhaust"
  );
  if (!resolved) {
    p.exhaustTokensAvailable += 1;
    logInvalidMove(G, ctx.currentPlayer, "exhaustCard", `exhaust_effect_failed(${cardId})`);
    return;
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `Exhausted ${cardId}.` });
}

export function innovateTurn({ G, ctx, events, random }: MoveCtx, args: { suit: Suit; source: "market" | "deck"; cardId?: string }): void {
  const p = G.players[ctx.currentPlayer];
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
  breakThrough(G, { playerId: ctx.currentPlayer, suit: args.suit, source: args.source, count: 1, cardId: args.cardId, randomNumber: random?.Number });
  continueEndTurnAfterCleanupChoices({ G, ctx, events, random });
}

export function revoltTurn({ G, ctx, events, random }: MoveCtx, cardIds: string[]): void {
  const p = G.players[ctx.currentPlayer];
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
  for (const cardId of uniqueCardIds) {
    const index = p.hand.indexOf(cardId);
    if (index < 0) continue;
    p.hand.splice(index, 1);
    G.unrestPile.push(cardId);
  }
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `RevoltResolved(returned=${uniqueCardIds.length})` });
  continueEndTurnAfterCleanupChoices({ G, ctx, events, random });
}

export function resolveChoice({ G, ctx, random }: MoveCtx, choiceIndex: number): void {
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

  G.pendingChoice = undefined;
  runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: pending.sourceCardId, randomNumber: random?.Number, enabledExpansions: G.options?.enabledExpansions },
    choice
  );
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `ChoiceResolved(${pending.sourceCardId ?? "unknown"}/index=${choiceIndex})` });
}

export function resolveFindChoice({ G, ctx }: MoveCtx, cardId: string): void {
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
  if (!movePlayerCard(G, ctx.currentPlayer, cardId, pending.destination)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveFindChoice", `find_move_failed(${cardId})`);
    return;
  }
  G.pendingFindChoice = undefined;
  G.log.push({ round: G.round, playerId: ctx.currentPlayer, message: `FindChoiceResolved(${pending.sourceCardId ?? "unknown"}/${cardId}->${pending.destination})` });
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
  if (!recallRegionToHand(G, ctx.currentPlayer, regionCardId)) {
    logInvalidMove(G, ctx.currentPlayer, "recallRegion", `recall_failed(${regionCardId})`);
  }
}

export function abandonRegion({ G, ctx }: MoveCtx, regionCardId: string): void {
  if (!isRegionCard(G, regionCardId)) {
    logInvalidMove(G, ctx.currentPlayer, "abandonRegion", `card_not_region(${regionCardId})`);
    return;
  }
  if (!abandonRegionToDiscard(G, ctx.currentPlayer, regionCardId)) {
    logInvalidMove(G, ctx.currentPlayer, "abandonRegion", `abandon_failed(${regionCardId})`);
  }
}

export function resolveDevelopmentChoice({ G, ctx, random }: MoveCtx, cardId: string): void {
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
  if (!resolvePendingDevelopmentChoice(G, ctx.currentPlayer, cardId, random?.Number)) {
    logInvalidMove(G, ctx.currentPlayer, "resolveDevelopmentChoice", `development_resolution_failed(${cardId})`);
  }
}

export function resolveCleanupMarketResource({ G, ctx, events }: MoveCtx, cardId: string): void {
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
  continueEndTurnAfterCleanupChoices({ G, ctx, events });
}

export function resolveCleanupDiscard({ G, ctx, events }: MoveCtx, cardIds: string[]): void {
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
  continueEndTurnAfterCleanupChoices({ G, ctx, events });
}

export function endTurnMove({ G, ctx, events }: MoveCtx): void {
  continueEndTurnAfterCleanupChoices({ G, ctx, events });
}

function continueEndTurnAfterCleanupChoices({ G, ctx, events }: MoveCtx): void {
  if (G.pendingCleanupMarketResourceChoice || G.pendingCleanupDiscardChoice) return;
  if (!G.pendingCleanupMarketResourceChoice && startCleanupMarketResourceChoice(G, ctx.currentPlayer)) return;
  if (!G.pendingCleanupDiscardChoice && startCleanupDiscardChoice(G, ctx.currentPlayer)) return;
  events?.endTurn?.();
}
