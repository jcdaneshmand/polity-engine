import type { CommonsSetupOptions } from "./commonsTypes";

export function validateCommonsSetupOptions(options: CommonsSetupOptions): string[] {
  const errors: string[] = [];
  if (!(["classics", "legends", "horizons", "custom"] as string[]).includes(options.commonsSetId)) errors.push(`Unknown commonsSetId: ${String(options.commonsSetId)}.`);
  if (![1, 2, 3, 4].includes(options.playerCount)) errors.push(`Invalid playerCount: ${String(options.playerCount)}.`);
  if (![2, 3, 4].includes(options.effectiveCommonsPlayerCount)) errors.push(`Invalid effectiveCommonsPlayerCount: ${String(options.effectiveCommonsPlayerCount)}.`);
  if (options.effectiveCommonsPlayerCount < 2) errors.push("Commons setup requires an effective player count of at least 2.");
  if (!(["none", "use_replacements", "prefer_latest"] as string[]).includes(options.replacementPolicy)) errors.push(`Unknown replacementPolicy: ${String(options.replacementPolicy)}.`);
  return errors;
}
