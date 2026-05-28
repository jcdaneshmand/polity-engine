import type { CommonsSetupOptions } from "./commonsTypes";

export function validateCommonsSetupOptions(options: CommonsSetupOptions): string[] {
  const errors: string[] = [];
  if (options.playerCount === 1 && options.effectiveCommonsPlayerCount !== 2) {
    errors.push("Solo/practice commons setup requires effectiveCommonsPlayerCount=2.");
  }
  return errors;
}
