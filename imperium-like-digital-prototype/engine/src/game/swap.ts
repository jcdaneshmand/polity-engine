import type { GameState, ResourceName, SwapSourceZone } from "./state";
import { returnMarketUnrest, tuckUnrestUnderMarketCard } from "./marketResources";
import { cardMarketSuitIconsForPlayer } from "./suitIcons";

export interface SwapChoice {
  cardId: string;
  marketCardId: string;
}

function sourceCards(G: GameState, playerId: string, sourceZone: SwapSourceZone): string[] | undefined {
  return G.players[playerId]?.[sourceZone];
}

export function cardCanSwapWithMarket(G: GameState, playerId: string, cardId: string, marketCardId: string): boolean {
  const cardIcons = cardMarketSuitIconsForPlayer(G, playerId, G.cardDb[cardId]);
  const marketIcons = cardMarketSuitIconsForPlayer(G, playerId, G.cardDb[marketCardId]);
  return [...marketIcons].some((suit) => cardIcons.has(suit));
}

export function availableSwapChoices(G: GameState, playerId: string, sourceZone: SwapSourceZone): SwapChoice[] {
  const cards = sourceCards(G, playerId, sourceZone);
  if (!cards) return [];
  const choices: SwapChoice[] = [];
  for (const cardId of cards) {
    for (const marketCardId of G.market) {
      if (cardCanSwapWithMarket(G, playerId, cardId, marketCardId)) choices.push({ cardId, marketCardId });
    }
  }
  return choices;
}

function updateMarketSlot(G: GameState, marketIndex: number, previousMarketCardId: string, incomingCardId: string): void {
  const slot = G.marketSlots?.find((candidate) => candidate.cardId === previousMarketCardId)
    ?? G.marketSlots?.find((candidate) => candidate.index === marketIndex);
  if (!slot) return;
  slot.cardId = incomingCardId;
  slot.resourceMarkers = { ...(G.marketResources?.[incomingCardId] ?? {}) } as Record<string, number>;
  slot.attachedUnrestCardIds = [...(G.marketUnrest?.[incomingCardId] ?? [])];
}

export function swapCardWithMarket(G: GameState, args: { playerId: string; sourceZone: SwapSourceZone; cardId: string; marketCardId: string }): boolean {
  const cards = sourceCards(G, args.playerId, args.sourceZone);
  if (!cards) return false;
  const sourceIndex = cards.indexOf(args.cardId);
  const marketIndex = G.market.indexOf(args.marketCardId);
  if (sourceIndex < 0 || marketIndex < 0) return false;
  if (!cardCanSwapWithMarket(G, args.playerId, args.cardId, args.marketCardId)) return false;

  const marketResources = { ...(G.marketResources?.[args.marketCardId] ?? {}) } as Partial<Record<ResourceName, number>>;
  if (G.marketResources) delete G.marketResources[args.marketCardId];
  returnMarketUnrest(G, args.playerId, args.marketCardId);

  cards.splice(sourceIndex, 1);
  if (args.sourceZone === "deck") cards.splice(sourceIndex, 0, args.marketCardId);
  else cards.push(args.marketCardId);
  G.market[marketIndex] = args.cardId;

  if (Object.keys(marketResources).length > 0) {
    G.marketResources ??= {};
    G.marketResources[args.cardId] = marketResources;
  }
  tuckUnrestUnderMarketCard(G, args.playerId, args.cardId);
  updateMarketSlot(G, marketIndex, args.marketCardId, args.cardId);
  if (!G.gameover) G.log.push({ round: G.round, playerId: args.playerId, message: `CardSwapped(${args.cardId}<->${args.marketCardId}/source=${args.sourceZone})` });
  return true;
}
