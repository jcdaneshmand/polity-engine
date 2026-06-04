import type { GameState, ResourceName } from "../game/state";
import { applyBotEffectWithResolution } from "./botStateTableResolver";
import type { BotEffectOp } from "./botEffectOps";
import type { BotTradeRouteRow, BotTradeRoutesTable } from "./botTradeRoutesTypes";
import type { BotState } from "./botTypes";
import type { BotStateTable } from "./botStateTableTypes";
import { returnResourceToSupply, takeResourceFromSupply } from "../game/resources";
import { cardHasSuitIcon } from "../game/suitIcons";

function currentBotTable(G: GameState, bot: BotState): BotStateTable | undefined {
  return G.solo?.botStateTables[bot.botStateTableId];
}

function tradeRouteTables(G: GameState): BotTradeRoutesTable[] {
  return Object.values(G.solo?.botTradeRoutesTables ?? {});
}

function allTradeRouteRows(G: GameState): BotTradeRouteRow[] {
  return tradeRouteTables(G).flatMap((table) => table.rows);
}

function tradeRoutesEnabled(G: GameState): boolean {
  return Boolean(G.options?.enabledExpansions?.includes("trade_routes"));
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
    ?? G.pendingRegionChoiceContinuation
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingDiscardChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingReturnFameChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingReturnExhaustTokenChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingSolsticeOrderChoice
    ?? G.pendingCleanupMarketResourceChoice
    ?? G.pendingCleanupDiscardChoice
    ?? G.pendingReactiveExhaustChoice
    ?? G.pendingPlayCardResolution
    ?? G.pendingPlayedCardResolution
    ?? G.pendingAcquireCardResolution
    ?? G.pendingAcquireEffectResolution
    ?? G.pendingMarketMoveEffectResolution
    ?? G.pendingBreakThroughEffectResolution
    ?? G.pendingMarketUnrestHookContinuation
    ?? G.pendingNationHookContinuation
    ?? G.pendingUnrestTakeContinuation
    ?? G.pendingUnrestAllocationResolution
    ?? G.pendingPostDevelopmentResolution
    ?? G.pendingReshuffleResolution
    ?? G.pendingAfterReshuffleEffects
    ?? G.pendingReshuffleDraw
    ?? G.pendingTurnEndCleanup
    ?? G.pendingScoringFinalization
    ?? G.pendingScoringLifecycle
    ?? G.pendingCollapseLifecycle
    ?? G.pendingSolsticeContinuation
    ?? G.pendingSolsticeRoundEnd
    ?? G.pendingPracticeMarketExileBeforeCleanup
    ?? G.pausedSolstice
  );
}

function executeBotEffects(G: GameState, bot: BotState, sourceCardId: string, effects: BotEffectOp[], startIndex = 0, randomNumber?: () => number): { resolved: boolean; warnings: string[] } {
  const table = currentBotTable(G, bot);
  if (!table) return { resolved: false, warnings: ["missing bot state table"] };
  const warnings: string[] = [];
  let resolved = false;
  for (let index = startIndex; index < effects.length; index += 1) {
    const effect = effects[index];
    const result = applyBotEffectWithResolution(G, bot, table, sourceCardId, effect, { randomNumber });
    resolved ||= result.resolved;
    warnings.push(...result.warnings);
    if (G.gameover) break;
    if (hasPendingInterruption(G)) {
      const existingContinuation = G.solo!.pendingBotTradeRouteContinuation;
      if (existingContinuation && existingContinuation.sourceCardId === sourceCardId) {
        existingContinuation.effects = [...existingContinuation.effects, ...effects.slice(index + 1)];
      } else {
        G.solo!.pendingBotTradeRouteContinuation = {
          sourceCardId,
          effects,
          nextEffectIndex: index + 1
        };
      }
      break;
    }
  }
  return { resolved, warnings };
}

export function continuePendingBotTradeRouteContinuation(G: GameState, bot: BotState, randomNumber?: () => number): boolean {
  if (!G.solo || G.gameover || hasPendingInterruption(G)) return false;
  const pending = G.solo.pendingBotTradeRouteContinuation;
  if (!pending) return false;
  G.solo.pendingBotTradeRouteContinuation = undefined;
  const result = executeBotEffects(G, bot, pending.sourceCardId, pending.effects, pending.nextEffectIndex, randomNumber);
  for (const warning of result.warnings) bot.botLog.push({ round: G.round, playerId: bot.botId, message: warning });
  if (!G.gameover && !hasPendingInterruption(G) && !G.solo.pendingBotTradeRouteContinuation && pending.remainingProfitCardIds?.length) {
    resolveBotProfitRoutes(G, bot, pending.remainingProfitCardIds, randomNumber);
  }
  return result.resolved;
}

function cardTokenCount(G: GameState, cardId: string, resource: ResourceName): number {
  return G.cardStates?.[cardId]?.resources?.[resource] ?? 0;
}

function canTakeResourceFromSupply(G: GameState, resource: ResourceName, count: number): boolean {
  return count > 0 && (!G.resourceSupply || (G.resourceSupply[resource] ?? 0) >= count);
}

function addCardResource(G: GameState, cardId: string, resource: ResourceName, count: number): void {
  if (count <= 0) return;
  G.cardStates ??= {};
  G.cardStates[cardId] ??= {};
  G.cardStates[cardId].resources ??= {};
  G.cardStates[cardId].resources[resource] = (G.cardStates[cardId].resources[resource] ?? 0) + count;
}

function tradeRouteRowFor(G: GameState, cardId: string): BotTradeRouteRow | undefined {
  return allTradeRouteRows(G).find((row) => row.tradeRouteId === cardId);
}

function humanPlayerId(G: GameState, bot: BotState): string | undefined {
  return Object.keys(G.players).sort().find((playerId) => playerId !== bot.botId);
}

function isTradeRoute(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "trade_route" || card?.cardType === "trade_route" || card?.type === "trade_route" || cardHasSuitIcon(card, "trade_route");
}

function tradeRouteRank(G: GameState, cardId: string): number {
  const rows = allTradeRouteRows(G);
  const index = rows.findIndex((row) => row.tradeRouteId === cardId);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function availableTradeRoutes(G: GameState, bot: BotState): { cardId: string; owner: "bot" | "human" }[] {
  const humanId = humanPlayerId(G, bot);
  const humanRoutes = humanId
    ? G.players[humanId].playArea
      .filter((cardId) =>
        isTradeRoute(G, cardId)
        && canTakeResourceFromSupply(G, "goods", 1)
        && canTakeResourceFromSupply(G, "knowledge", 1)
      )
      .map((cardId) => ({ cardId, owner: "human" as const }))
    : [];
  const botRoutes = bot.botPlayArea
    .filter((cardId) => isTradeRoute(G, cardId) && canTakeResourceFromSupply(G, "goods", 1))
    .map((cardId) => ({ cardId, owner: "bot" as const }));
  return [...humanRoutes, ...botRoutes].filter(({ cardId }) => cardTokenCount(G, cardId, "goods") < 3);
}

function chooseTradeRoute(G: GameState, bot: BotState): { cardId: string; owner: "bot" | "human" } | undefined {
  return availableTradeRoutes(G, bot).sort((a, b) => {
    const tokenDiff = cardTokenCount(G, b.cardId, "goods") - cardTokenCount(G, a.cardId, "goods");
    if (tokenDiff !== 0) return tokenDiff;
    if (a.owner !== b.owner) return a.owner === "bot" ? -1 : 1;
    return tradeRouteRank(G, a.cardId) - tradeRouteRank(G, b.cardId);
  })[0];
}

export function resolveBotTradeRoutesEndOfTurn(G: GameState, bot: BotState, randomNumber?: () => number): void {
  if (!tradeRoutesEnabled(G)) return;
  const rows = tradeRouteTables(G)
    .flatMap((table) => table.endOfTurnRows)
    .filter((candidate) => candidate.merchantState === bot.merchantState)
    .sort((a, b) => a.priority - b.priority);
  for (const row of rows) {
    const result = executeBotEffects(G, bot, `trade_routes_eot:${row.merchantState}`, row.effects, 0, randomNumber);
    for (const warning of result.warnings) bot.botLog.push({ round: G.round, playerId: bot.botId, message: warning });
    if (result.resolved || G.gameover) return;
  }
}

export function resolveBotTrade(G: GameState, bot: BotState, randomNumber?: () => number): boolean {
  if (!tradeRoutesEnabled(G)) return false;
  const chosen = chooseTradeRoute(G, bot);
  if (!chosen) {
    if ((bot.resources.goods ?? 0) > 0) {
      if (G.resourceSupply && (G.resourceSupply.knowledge ?? 0) <= 0) return false;
      bot.resources.goods = (bot.resources.goods ?? 0) - 1;
      returnResourceToSupply(G, "goods", 1);
      const gained = takeResourceFromSupply(G, "knowledge", 1);
      bot.resources.knowledge = (bot.resources.knowledge ?? 0) + gained;
      return gained > 0;
    }
    return false;
  }

  if (chosen.owner === "bot") {
    const goods = takeResourceFromSupply(G, "goods", 1);
    if (goods <= 0) return false;
    addCardResource(G, chosen.cardId, "goods", goods);
  } else if (chosen.owner === "human") {
    const goods = takeResourceFromSupply(G, "goods", 1);
    const knowledge = takeResourceFromSupply(G, "knowledge", 1);
    if (goods <= 0 || knowledge <= 0) {
      returnResourceToSupply(G, "goods", goods);
      returnResourceToSupply(G, "knowledge", knowledge);
      return false;
    }
    addCardResource(G, chosen.cardId, "goods", goods);
    bot.resources.knowledge = (bot.resources.knowledge ?? 0) + knowledge;
  }
  resolveBotTriggerTradeRoute(G, bot, chosen.cardId, randomNumber);
  return true;
}

export function resolveBotTriggerTradeRoute(G: GameState, bot: BotState, tradeRouteCardId?: string, randomNumber?: () => number): boolean {
  if (!tradeRoutesEnabled(G)) return false;
  if (!tradeRouteCardId) return false;
  const row = tradeRouteRowFor(G, tradeRouteCardId);
  if (!row) return false;
  const warnings = executeBotEffects(G, bot, tradeRouteCardId, row.commerceEffects, 0, randomNumber);
  for (const warning of warnings.warnings) bot.botLog.push({ round: G.round, playerId: bot.botId, message: warning });
  return warnings.resolved;
}

export function resolveBotProfitsWhereAble(G: GameState, bot: BotState, randomNumber?: () => number): boolean {
  if (!tradeRoutesEnabled(G)) return false;
  const profitable = bot.botPlayArea
    .filter((cardId) => isTradeRoute(G, cardId) && cardTokenCount(G, cardId, "goods") >= 3)
    .reverse();

  return resolveBotProfitRoutes(G, bot, profitable, randomNumber);
}

function resolveBotProfitRoutes(G: GameState, bot: BotState, cardIds: string[], randomNumber?: () => number): boolean {
  let resolved = false;
  for (let index = 0; index < cardIds.length; index += 1) {
    const cardId = cardIds[index];
    const row = tradeRouteRowFor(G, cardId);
    if (!row) continue;
    resolved = true;
    const goods = cardTokenCount(G, cardId, "goods");
    bot.resources.goods = (bot.resources.goods ?? 0) + goods;
    delete G.cardStates?.[cardId]?.resources?.goods;
    const playAreaIndex = bot.botPlayArea.indexOf(cardId);
    if (playAreaIndex >= 0) bot.botPlayArea.splice(playAreaIndex, 1);
    bot.botHistory.push(cardId);
    const result = executeBotEffects(G, bot, cardId, row.profitEffects, 0, randomNumber);
    for (const warning of result.warnings) bot.botLog.push({ round: G.round, playerId: bot.botId, message: warning });
    if (G.gameover) return true;
    if (hasPendingInterruption(G)) {
      const remainingProfitCardIds = cardIds.slice(index + 1);
      if (remainingProfitCardIds.length && G.solo?.pendingBotTradeRouteContinuation) {
        G.solo.pendingBotTradeRouteContinuation.remainingProfitCardIds = remainingProfitCardIds;
      }
      return true;
    }
  }
  return resolved;
}
