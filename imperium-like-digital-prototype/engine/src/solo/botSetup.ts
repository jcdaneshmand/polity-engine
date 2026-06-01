import type { GameOptions } from "../options/gameOptions";
import type { NationDefinition } from "../nations/nationTypes";
import type { NationRuleset } from "../nations/nationRulesetTypes";
import type { Card, ResourceName } from "../game/state";
import { SOLO_DIFFICULTY_CONFIG } from "./botDifficulty";
import type { SoloDifficultyConfig } from "./botDifficulty";
import { initializeBotSlots } from "./botSlots";
import type { BotState } from "./botTypes";
import type { BotStateTable } from "./botStateTableTypes";

function capPositiveCardVp(value: number): number {
  return value > 0 ? Math.min(value, 10) : value;
}

function cardVpValue(card: Card | undefined): number {
  const vp = card?.vp as unknown;
  if (typeof vp === "number") return capPositiveCardVp(vp);
  if (vp && typeof vp === "object") {
    const { mode, value, trueValue, falseValue } = vp as { mode?: string; value?: unknown; trueValue?: unknown; falseValue?: unknown };
    const numericValue = typeof value === "number" ? value : 0;
    if (mode === "none") return 0;
    if (mode === "conditional" && (typeof trueValue === "number" || typeof falseValue === "number")) {
      return capPositiveCardVp(Math.max(
        typeof trueValue === "number" ? trueValue : numericValue,
        typeof falseValue === "number" ? falseValue : numericValue
      ));
    }
    if (mode === "conditional" || mode === "variable") return capPositiveCardVp(numericValue || 5);
    if (mode === "negative") return -Math.abs(numericValue);
    return capPositiveCardVp(numericValue);
  }
  return 0;
}

function sortDynastyCards(cardIds: string[], cardDb: Record<string, Card>): string[] {
  return [...cardIds].sort((a, b) => {
    const vpDiff = cardVpValue(cardDb[b]) - cardVpValue(cardDb[a]);
    return vpDiff;
  });
}

function defaultDynastyCards(args: { botNation: NationDefinition; cardDb: Record<string, Card>; shuffle: <T>(items: T[]) => T[] }): string[] {
  const development = sortDynastyCards(args.shuffle(args.botNation.developmentCardIds.filter((id) => args.cardDb[id])), args.cardDb);
  const accession = args.botNation.accessionCardId && args.cardDb[args.botNation.accessionCardId] ? [args.botNation.accessionCardId] : [];
  const nation = args.shuffle(args.botNation.nationDeckCardIds.filter((id) => args.cardDb[id]));
  if (development.length || accession.length || nation.length) return [...nation, ...accession, ...development];
  return sortDynastyCards(args.shuffle(Object.values(args.cardDb).map((c) => c.id).filter((id) => args.cardDb[id].tags.includes("bot_dynasty"))), args.cardDb);
}

function applyShortGameDynastySetup(dynasty: string[], cardDb: Record<string, Card>): { deck: string[]; discard: string[] } {
  const deck = [...dynasty];
  const discard: string[] = [];
  if (deck.length > 0) {
    let lowestIndex = 0;
    for (let index = 1; index < deck.length; index += 1) {
      if (cardVpValue(cardDb[deck[index]]) <= cardVpValue(cardDb[deck[lowestIndex]])) lowestIndex = index;
    }
    deck.splice(lowestIndex, 1);
  }
  const topCard = deck.shift();
  if (topCard) discard.push(topCard);
  return { deck, discard };
}

function botStartingResourcesForOptions(config: SoloDifficultyConfig, options: GameOptions): Partial<Record<ResourceName, number>> {
  const resources = { ...config.botStartingResources };
  if (options.enabledExpansions.includes("trade_routes") && resources.knowledge) {
    delete resources.knowledge;
    resources.goods = (resources.goods ?? 0) + 1;
  }
  return resources;
}

function initialBotStateTable(args: { botNationId: string; botRuleset?: NationRuleset; botStateTables: Record<string, BotStateTable> }): { tableId: string; side: string } {
  const override = args.botRuleset?.botOverrides.find((ov) => ov.op === "initial_bot_state_table");
  if (override?.tableId) {
    const key = override.side ? `${override.tableId}_${override.side}` : override.tableId;
    const table = args.botStateTables[key] ?? Object.entries(args.botStateTables).find(([, candidate]) => candidate.id === override.tableId && (!override.side || candidate.side === override.side))?.[1];
    const tableKey = args.botStateTables[key] ? key : Object.entries(args.botStateTables).find(([, candidate]) => candidate === table)?.[0];
    if (table && tableKey) return { tableId: tableKey, side: table.side };
  }
  const exactStart = args.botStateTables[`${args.botNationId}_S`];
  if (exactStart) return { tableId: `${args.botNationId}_S`, side: exactStart.side };
  const matchingStart = Object.entries(args.botStateTables).find(([, table]) => table.botNationId === args.botNationId && table.side === "S");
  if (matchingStart) return { tableId: matchingStart[0], side: matchingStart[1].side };
  const first = Object.entries(args.botStateTables)[0];
  return { tableId: first?.[0] ?? "placeholder", side: first?.[1].side ?? "S" };
}

export function setupSoloBot(args: { botNation: NationDefinition; botRuleset?: NationRuleset; cardDb: Record<string, Card>; botStateTables: Record<string, BotStateTable>; options: GameOptions; shuffle: <T>(items: T[]) => T[]; rollDie?: () => number; }): BotState {
  const difficulty = args.options.soloDifficulty ?? "chieftain";
  const config = SOLO_DIFFICULTY_CONFIG[difficulty];
  const all = Object.values(args.cardDb).map((c) => c.id);
  const botOverrides = args.botRuleset?.botOverrides ?? [];
  const skipDefaultDynastySetup = botOverrides.some((ov) => ov.op === "skip_default_dynasty_setup");
  const start = skipDefaultDynastySetup ? [] : all.filter((id) => args.cardDb[id].startingLocation === "bot_deck" || args.cardDb[id].tags.includes("bot_starting"));
  const customStateStack = botOverrides.find((ov) => ov.op === "custom_bot_state_stack");
  const customDynastySetup = botOverrides.find((ov) => ov.op === "custom_dynasty_setup");
  const customCleanupEffects = botOverrides.flatMap((ov) => ov.op === "bot_custom_cleanup" ? ov.effect : []);
  const skipAccessionStateFlip = botOverrides.some((ov) => ov.op === "skip_bot_accession_state_flip");
  const cleanupMarketResource = botOverrides.find((ov) => ov.op === "bot_cleanup_market_resource");
  const customStateCardIds = customStateStack?.cardIds?.filter((id) => args.cardDb[id]) ?? [];
  const customDynastyCardIds = customDynastySetup?.config?.cardIds?.filter((id) => args.cardDb[id]) ?? [];
  const dynasty = customDynastyCardIds.length > 0 ? customDynastyCardIds : skipDefaultDynastySetup ? [] : defaultDynastyCards(args);
  const shortGameDynastySetup = args.options.enabledVariants.includes("short_game")
    ? applyShortGameDynastySetup(dynasty, args.cardDb)
    : { deck: dynasty, discard: [] };
  const deck = args.shuffle(start);
  if (customStateCardIds.length > 0) deck.unshift(...customStateCardIds);
  const slots = initializeBotSlots(config.slotCount);
  for (const slot of Object.values(slots)) slot.cardId = deck.shift();
  const startTable = initialBotStateTable({ botNationId: args.botNation.id, botRuleset: args.botRuleset, botStateTables: args.botStateTables });
  return { botId: "bot_0", botNationId: args.botNation.id, botDeck: deck, botDiscard: shortGameDynastySetup.discard, botHistory: [], botPlayArea: [], botDynastyDeck: shortGameDynastySetup.deck, botStateTableId: startTable.tableId, botStateSide: startTable.side, slots, resources: botStartingResourcesForOptions(config, args.options), merchantState: args.options.enabledExpansions.includes("trade_routes") ? "merchants" : "none", difficulty, difficultyConfig: config, ...(skipAccessionStateFlip ? { skipAccessionStateFlip } : {}), ...(cleanupMarketResource ? { cleanupMarketResource: { resource: cleanupMarketResource.resource, count: cleanupMarketResource.count } } : {}), ...(customCleanupEffects.length ? { customCleanupEffects } : {}), botLog: [] };
}
