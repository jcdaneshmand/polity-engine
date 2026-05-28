import type { BotEffectOp } from "./botEffectOps";

export type BotTradeRoutesTable = {
  id: string;
  rows: BotTradeRouteRow[];
  endOfTurnRows: BotTradeRouteEndOfTurnRow[];
};
export type BotTradeRouteRow = {
  tradeRouteId: string;
  publicPlaceholderName: string;
  privateName?: string;
  commerceEffects: BotEffectOp[];
  profitEffects: BotEffectOp[];
};
export type BotTradeRouteEndOfTurnRow = {
  merchantState: "merchants" | "merchant_empire";
  priority: number;
  effects: BotEffectOp[];
};
