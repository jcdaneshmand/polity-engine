import type { GameState } from "../game/state";
import { placeMarketResource } from "../game/marketResources";
import { runBotCleanup } from "./botCleanup";
import { applyBotEffect, resolveBotCard } from "./botStateTableResolver";
import { resolveBotTradeRoutesEndOfTurn } from "./botTradeRoutesResolver";
import { getResolvableBotSlots, revealSlotCard, rollAndBlockSlot } from "./botSlots";
import type { BotSlot } from "./botTypes";
import type { BotEffectOp } from "./botEffectOps";

function finishBotTurn(G: GameState, randomNumber?: () => number): void {
  if (!G.solo) return;
  const bot = G.solo.bot;
  const marketCardId = bot.unresolvedSlot ? G.market[bot.unresolvedSlot - 1] : undefined;
  const cleanupResource = bot.cleanupMarketResource ?? { resource: "knowledge" as const, count: 1 };
  if (marketCardId && cleanupResource.count > 0) {
    placeMarketResource(G, { playerId: bot.botId, cardId: marketCardId, resource: cleanupResource.resource, amount: cleanupResource.count });
  }
  if (G.options?.enabledExpansions.includes("trade_routes")) resolveBotTradeRoutesEndOfTurn(G, bot);
  runBotCleanup(bot, { G, randomNumber });
  const table = G.solo.botStateTables[bot.botStateTableId];
  if (table) {
    for (const effect of bot.customCleanupEffects ?? []) {
      applyBotEffect(G, bot, table, "bot_cleanup", effect as BotEffectOp, { randomNumber });
      if (G.gameover) break;
    }
  }
  G.log.push(...bot.botLog.splice(0));
}

function hasPendingInterruption(G: GameState): boolean {
  return Boolean(
    G.pendingChoice
    ?? G.pendingDrawChoice
    ?? G.pendingFindChoice
    ?? G.pendingAcquireChoice
    ?? G.pendingMarketCardChoice
    ?? G.pendingBreakThroughChoice
    ?? G.pendingExileChoice
    ?? G.pendingGarrisonChoice
    ?? G.pendingRegionChoice
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingDiscardChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingSolsticeOrderChoice
    ?? G.pendingCleanupMarketResourceChoice
    ?? G.pendingCleanupDiscardChoice
    ?? G.pendingReactiveExhaustChoice
  );
}

function pauseBotTurnIfInterrupted(G: GameState, remainingSlots: BotSlot[], effectsRemaining?: number): boolean {
  if (!G.solo || !hasPendingInterruption(G)) return false;
  G.solo.pausedBotTurn = {
    remainingSlotNumbers: remainingSlots.map((slot) => slot.slotNumber),
    ...(effectsRemaining === undefined ? {} : { effectsRemaining })
  };
  G.log.push({ round: G.round, playerId: G.solo.bot.botId, message: `BotTurnPaused(pending_choice/remaining=${remainingSlots.length})` });
  return true;
}

function resolveBotSlots(G: GameState, slots: BotSlot[], effectsRemaining?: number, randomNumber?: () => number): boolean {
  if (!G.solo) return false;
  const bot = G.solo.bot;
  let remaining = effectsRemaining;
  for (let index = 0; index < slots.length; index += 1) {
    if (remaining !== undefined && remaining <= 0) break;
    const slot = slots[index];
    const cardId = revealSlotCard(bot, slot.slotNumber);
    const table = G.solo.botStateTables[bot.botStateTableId];
    if (cardId) bot.revealedSlotCard = { slotNumber: slot.slotNumber, cardId };
    if (cardId && table) resolveBotCard({ G, bot, revealedCardId: cardId, source: "slot", table, randomNumber });
    if (G.gameover) return true;
    slot.cardId = undefined;
    if (cardId) remaining = remaining === undefined ? undefined : remaining - 1;
    const nextSlots = slots.slice(index + 1).filter((nextSlot) => nextSlot.cardId && !nextSlot.blockedByDie);
    if (pauseBotTurnIfInterrupted(G, nextSlots, remaining)) return true;
  }
  return false;
}

export function runBotTurn(args: { G: GameState; rollDie?: () => number; randomNumber?: () => number }): GameState {
  const { G } = args;
  if (!G.solo) return G;
  const bot = G.solo.bot;
  bot.revealedSlotCard = undefined;
  const roll = args.rollDie ? args.rollDie() : 1;
  rollAndBlockSlot(bot, roll);
  const effectLimit = bot.difficultyConfig.botEffectsPerTurn ?? Number.POSITIVE_INFINITY;
  const slots = getResolvableBotSlots(bot).slice(0, effectLimit);
  if (resolveBotSlots(G, slots, Number.isFinite(effectLimit) ? effectLimit : undefined, args.randomNumber)) return G;
  if (G.gameover) return G;
  finishBotTurn(G, args.randomNumber);
  return G;
}

export function continuePausedBotTurn(G: GameState, randomNumber?: () => number): void {
  const paused = G.solo?.pausedBotTurn;
  if (!G.solo || !paused || hasPendingInterruption(G)) return;
  const bot = G.solo.bot;
  const slots = paused.remainingSlotNumbers
    .map((slotNumber) => bot.slots[slotNumber])
    .filter((slot): slot is BotSlot => Boolean(slot?.cardId && !slot.blockedByDie));
  G.solo.pausedBotTurn = undefined;
  G.log.push({ round: G.round, playerId: bot.botId, message: "BotTurnResumed" });
  if (resolveBotSlots(G, slots, paused.effectsRemaining, randomNumber)) return;
  if (G.gameover) return;
  finishBotTurn(G, randomNumber);
}
