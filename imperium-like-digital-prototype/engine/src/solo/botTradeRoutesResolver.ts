import type { GameState } from "../game/state";
import type { BotState } from "./botTypes";
export function resolveBotTradeRoutesEndOfTurn(_G: GameState, bot: BotState): void { bot.botLog.push({ round: _G.round, playerId: bot.botId, message: "bot_trade_routes_eot_checked" }); }
export function resolveBotTrade(bot: BotState): void { bot.botLog.push({ round: 0, playerId: bot.botId, message: "bot_trade" }); }
export function resolveBotTriggerTradeRoute(bot: BotState, tradeRouteCardId?: string): void { bot.botLog.push({ round: 0, playerId: bot.botId, message: `bot_trigger_trade_route:${tradeRouteCardId ?? "none"}` }); }
export function resolveBotProfitsWhereAble(bot: BotState): void { bot.botLog.push({ round: 0, playerId: bot.botId, message: "bot_profits" }); }
