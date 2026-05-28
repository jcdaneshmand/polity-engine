import type { GameOptions } from "../options/gameOptions";
import type { NationDefinition } from "../nations/nationTypes";
import type { NationRuleset } from "../nations/nationRulesetTypes";
import type { Card } from "../game/state";
import { SOLO_DIFFICULTY_CONFIG } from "./botDifficulty";
import { initializeBotSlots } from "./botSlots";
import type { BotState } from "./botTypes";
import type { BotStateTable } from "./botStateTableTypes";

export function setupSoloBot(args: { botNation: NationDefinition; botRuleset?: NationRuleset; cardDb: Record<string, Card>; botStateTables: Record<string, BotStateTable>; options: GameOptions; shuffle: <T>(items: T[]) => T[]; rollDie?: () => number; }): BotState {
  const difficulty = args.options.soloDifficulty ?? "chieftain";
  const config = SOLO_DIFFICULTY_CONFIG[difficulty];
  const all = Object.values(args.cardDb).map((c) => c.id);
  const start = all.filter((id) => args.cardDb[id].startingLocation === "bot_deck" || args.cardDb[id].tags.includes("bot_starting"));
  const dynasty = all.filter((id) => args.cardDb[id].tags.includes("bot_dynasty"));
  const deck = args.shuffle(start);
  const slots = initializeBotSlots(config.slotCount);
  for (const slot of Object.values(slots)) slot.cardId = deck.shift();
  return { botId: "bot_0", botNationId: args.botNation.id, botDeck: deck, botDiscard: [], botHistory: [], botPlayArea: [], botDynastyDeck: dynasty, botStateTableId: Object.keys(args.botStateTables)[0] ?? "placeholder", botStateSide: "S", slots, resources: { ...config.botStartingResources }, merchantState: args.options.enabledExpansions.includes("trade_routes") ? "merchants" : "none", difficulty, difficultyConfig: config, botLog: [] };
}
