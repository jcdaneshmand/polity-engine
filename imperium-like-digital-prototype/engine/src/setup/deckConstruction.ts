import type { GameOptions } from "../options/gameOptions";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";

function matchesPlayerCount(req: string | undefined, playerCount: number): boolean {
  if (!req || req.trim() === "") return true;
  const trimmed = req.trim();
  const plus = trimmed.match(/^(\d+)\+$/);
  if (plus) return playerCount >= Number(plus[1]);
  const exact = trimmed.match(/^(\d+)$/);
  if (exact) return playerCount === Number(exact[1]);
  return true;
}

export function filterCardsByOptions(cards: NormalizedCardRecord[], options: GameOptions): NormalizedCardRecord[] {
  return cards.filter((c) => {
    const req = c.requiredExpansions ?? [];
    const exc = c.excludedExpansions ?? [];
    const allowedModes = c.allowedModes ?? ["multiplayer", "solo", "practice"];
    const disallowedModes = c.disallowedModes ?? [];
    if (req.some((e) => !options.enabledExpansions.includes(e))) return false;
    if (exc.some((e) => options.enabledExpansions.includes(e))) return false;
    if (!allowedModes.includes(options.mode)) return false;
    if (disallowedModes.includes(options.mode)) return false;
    if (!matchesPlayerCount(c.playerCountRequirement, options.playerCount)) return false;
    return true;
  });
}
