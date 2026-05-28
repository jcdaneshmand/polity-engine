import type { GameOptions } from "../options/gameOptions";
import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";

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
    return true;
  });
}
