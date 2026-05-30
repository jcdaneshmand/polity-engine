import type { BotTradeRoutesTable } from "./botTradeRoutesTypes";
import { getNodeFs, resolveFromCwd } from "../local/nodeBuiltins";

export function loadBotTradeRoutesTables(opts: { usePrivate?: boolean; privatePath?: string } = {}): Record<string, BotTradeRoutesTable> {
  const privatePath = opts.privatePath ?? resolveFromCwd("generated-private/bot-trade-routes-tables.normalized.json");
  const fs = getNodeFs();
  if ((opts.usePrivate || opts.privatePath) && fs?.existsSync(privatePath)) {
    return JSON.parse(fs.readFileSync(privatePath, "utf8")) as Record<string, BotTradeRoutesTable>;
  }
  if (opts.usePrivate || opts.privatePath) {
    throw new Error(`Private bot Trade Routes tables requested but not found: ${privatePath}`);
  }
  return {};
}
