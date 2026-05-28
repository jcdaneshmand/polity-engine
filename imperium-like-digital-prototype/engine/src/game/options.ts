export type ExpansionId = "trade_routes";
export interface GameOptions {
  enabledExpansions: ExpansionId[];
}

export function isExpansionEnabled(options: GameOptions, expansion: ExpansionId): boolean {
  return options.enabledExpansions.includes(expansion);
}
