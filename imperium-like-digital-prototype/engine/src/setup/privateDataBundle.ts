import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition } from "../nations/nationSchema";
import type { NationRuleset } from "../nations/nationRulesetTypes";
import type { NationStrategyProfile } from "../nations/nationStrategyTypes";
import type { BotStateTable } from "../solo/botStateTableTypes";
import type { BotTradeRoutesTable } from "../solo/botTradeRoutesTypes";

export type PrivateDataBundle = {
  cards?: NormalizedCardRecord[];
  nations?: NationDefinition[];
  nationRulesets?: NationRuleset[];
  nationStrategy?: NationStrategyProfile[];
  botStateTables?: Record<string, BotStateTable>;
  botTradeRoutesTables?: Record<string, BotTradeRoutesTable>;
};

export function recordById<T>(items: T[] | undefined, getId: (item: T) => string): Record<string, T> | undefined {
  if (!items) return undefined;
  return Object.fromEntries(items.map((item) => [getId(item), item]));
}
