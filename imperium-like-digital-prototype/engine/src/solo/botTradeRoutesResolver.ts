import type { GameState, ResourceName } from "../game/state";
import { applyBotEffectWithResolution } from "./botStateTableResolver";
import type { BotEffectOp } from "./botEffectOps";
import type { BotTradeRouteRow, BotTradeRoutesTable } from "./botTradeRoutesTypes";
import type { BotState } from "./botTypes";
import type { BotStateTable } from "./botStateTableTypes";
import { returnResourceToSupply, takeResourceFromSupply } from "../game/resources";

function currentBotTable(G: GameState, bot: BotState): BotStateTable | undefined {
  return G.solo?.botStateTables[bot.botStateTableId];
}

function tradeRouteTables(G: GameState): BotTradeRoutesTable[] {
  return Object.values(G.solo?.botTradeRoutesTables ?? {});
}

function allTradeRouteRows(G: GameState): BotTradeRouteRow[] {
  return tradeRouteTables(G).flatMap((table) => table.rows);
}

function executeBotEffects(G: GameState, bot: BotState, sourceCardId: string, effects: BotEffectOp[]): { resolved: boolean; warnings: string[] } {
  const table = currentBotTable(G, bot);
  if (!table) return { resolved: false, warnings: ["missing bot state table"] };
  const warnings: string[] = [];
  let resolved = false;
  for (const effect of effects) {
    const result = applyBotEffectWithResolution(G, bot, table, sourceCardId, effect);
    resolved ||= result.resolved;
    warnings.push(...result.warnings);
    if (G.gameover) break;
  }
  return { resolved, warnings };
}

function cardTokenCount(G: GameState, cardId: string, resource: ResourceName): number {
  return G.cardStates?.[cardId]?.resources?.[resource] ?? 0;
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
  return card?.suit === "trade_route" || card?.cardType === "trade_route" || card?.type === "trade_route";
}

function tradeRouteRank(G: GameState, cardId: string): number {
  const rows = allTradeRouteRows(G);
  const index = rows.findIndex((row) => row.tradeRouteId === cardId);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function availableTradeRoutes(G: GameState, bot: BotState): { cardId: string; owner: "bot" | "human" }[] {
  const humanId = humanPlayerId(G, bot);
  const humanRoutes = humanId
    ? G.players[humanId].playArea.filter((cardId) => isTradeRoute(G, cardId)).map((cardId) => ({ cardId, owner: "human" as const }))
    : [];
  const botRoutes = bot.botPlayArea.filter((cardId) => isTradeRoute(G, cardId)).map((cardId) => ({ cardId, owner: "bot" as const }));
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

export function resolveBotTradeRoutesEndOfTurn(G: GameState, bot: BotState): void {
  const rows = tradeRouteTables(G)
    .flatMap((table) => table.endOfTurnRows)
    .filter((candidate) => candidate.merchantState === bot.merchantState)
    .sort((a, b) => a.priority - b.priority);
  for (const row of rows) {
    const result = executeBotEffects(G, bot, `trade_routes_eot:${row.merchantState}`, row.effects);
    for (const warning of result.warnings) bot.botLog.push({ round: G.round, playerId: bot.botId, message: warning });
    if (result.resolved || G.gameover) return;
  }
}

export function resolveBotTrade(G: GameState, bot: BotState): boolean {
  const chosen = chooseTradeRoute(G, bot);
  if (!chosen) {
    if ((bot.resources.goods ?? 0) > 0) {
      bot.resources.goods = (bot.resources.goods ?? 0) - 1;
      returnResourceToSupply(G, "goods", 1);
      const gained = takeResourceFromSupply(G, "knowledge", 1);
      bot.resources.knowledge = (bot.resources.knowledge ?? 0) + gained;
      return gained > 0;
    }
    return false;
  }

  if (chosen.owner === "bot" && (bot.resources.goods ?? 0) > 0) {
    bot.resources.goods = (bot.resources.goods ?? 0) - 1;
    addCardResource(G, chosen.cardId, "goods", 1);
  } else if (chosen.owner === "human") {
    addCardResource(G, chosen.cardId, "goods", takeResourceFromSupply(G, "goods", 1));
    bot.resources.knowledge = (bot.resources.knowledge ?? 0) + takeResourceFromSupply(G, "knowledge", 1);
  }
  resolveBotTriggerTradeRoute(G, bot, chosen.cardId);
  return true;
}

export function resolveBotTriggerTradeRoute(G: GameState, bot: BotState, tradeRouteCardId?: string): void {
  if (!tradeRouteCardId) return;
  const row = tradeRouteRowFor(G, tradeRouteCardId);
  if (!row) return;
  const warnings = executeBotEffects(G, bot, tradeRouteCardId, row.commerceEffects);
  for (const warning of warnings.warnings) bot.botLog.push({ round: G.round, playerId: bot.botId, message: warning });
}

export function resolveBotProfitsWhereAble(G: GameState, bot: BotState): boolean {
  const profitable = bot.botPlayArea
    .filter((cardId) => isTradeRoute(G, cardId) && cardTokenCount(G, cardId, "goods") >= 3)
    .reverse();

  let resolved = false;
  for (const cardId of profitable) {
    const row = tradeRouteRowFor(G, cardId);
    if (!row) continue;
    resolved = true;
    const goods = cardTokenCount(G, cardId, "goods");
    bot.resources.goods = (bot.resources.goods ?? 0) + goods;
    delete G.cardStates?.[cardId]?.resources?.goods;
    const index = bot.botPlayArea.indexOf(cardId);
    if (index >= 0) bot.botPlayArea.splice(index, 1);
    bot.botHistory.push(cardId);
    const result = executeBotEffects(G, bot, cardId, row.profitEffects);
    for (const warning of result.warnings) bot.botLog.push({ round: G.round, playerId: bot.botId, message: warning });
  }
  return resolved;
}
