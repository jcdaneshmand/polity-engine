import type { Ctx } from "boardgame.io";
import { runEffects } from "../cards/effectRunner";
import type { GameState } from "./state";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { resolvePendingDevelopmentChoice } from "./zones";
import { collectMarketResources, collectMarketUnrest, resolveCleanupMarketResourceChoice, startCleanupMarketResourceChoice } from "./marketResources";
import { refillMarketSlot } from "./marketRefill";
import { availableForResourceCost, canPayResourceCost, payResourceCost } from "./payments";
import { resolveCleanupDiscardChoice, startCleanupDiscardChoice } from "./turn";
import { abandonRegionToDiscard, garrisonCardOnRegion, isRegionCard, recallRegionToHand } from "./regions";

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

function cardRemainsInPlay(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "in_play" || type === "region" || type === "power" || type === "state";
}

function moveResolvedCardFromPlayToDiscard(G: GameState, playerId: string, cardId: string): void {
  if (cardRemainsInPlay(G, cardId)) return;
  const p = G.players[playerId];
  const playIndex = p.playArea.indexOf(cardId);
  if (playIndex < 0) return;
  p.playArea.splice(playIndex, 1);
  p.discard.push(cardId);
}

export function playCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
  if (p.actionsRemaining < 1) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", "no_actions_remaining");
    return;
  }
  if (!p.hand.includes(cardId)) {
    logInvalidMove(G, ctx.currentPlayer, "playCard", `card_not_in_hand(${cardId})`);
    return;
  }

  logTurnPhase(G, ctx.currentPlayer, "action_execution", `playCard(${cardId})`);
  p.actionsRemaining -= 1;
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_play_card", payload: { cardId }, randomNumber: random?.Number });
  const handIndex = p.hand.indexOf(cardId);
  if (handIndex < 0) {
    p.actionsRemaining += 1;
    return;
  }
  p.hand.splice(handIndex, 1);
  p.playArea.push(cardId);

  runEffects(
    { G, playerId: ctx.currentPlayer, selfCardId: cardId, randomNumber: random?.Number },
    G.cardDb[cardId]?.effects ?? []
  );
  moveResolvedCardFromPlayToDiscard(G, ctx.currentPlayer, cardId);
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_play_card", payload: { cardId }, randomNumber: random?.Number });
}

export function acquireCard({ G, ctx, random }: MoveCtx, cardId: string): void {
  const p = G.players[ctx.currentPlayer];
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
