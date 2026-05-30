import type { Card, Suit } from "./state";

export const MARKET_SUIT_ICONS: Suit[] = ["region", "uncivilized", "civilized", "tributary", "fame"];
const FILTER_SUIT_ICONS: Suit[] = ["military", "civic", "economic", "unrest", "wild", "region", "uncivilized", "civilized", "tributary", "fame", "power", "trade_route"];

function normalizeSuitTag(tag: string, allowedSuits: readonly Suit[]): Suit | undefined {
  const normalized = tag.toLowerCase().replace(/[\s-]+/g, "_");
  const taggedSuit = normalized.startsWith("suit:") ? normalized.slice("suit:".length) : normalized;
  return allowedSuits.includes(taggedSuit as Suit) ? taggedSuit as Suit : undefined;
}

function cardSuitIconSet(card: Card | undefined, allowedSuits: readonly Suit[]): Set<Suit> {
  const icons = new Set<Suit>();
  if (card?.suit && allowedSuits.includes(card.suit)) icons.add(card.suit);
  for (const suit of card?.suitIcons ?? []) {
    if (allowedSuits.includes(suit)) icons.add(suit);
  }
  for (const tag of card?.tags ?? []) {
    const suit = normalizeSuitTag(tag, allowedSuits);
    if (suit) icons.add(suit);
  }
  return icons;
}

export function cardSuitIcons(card?: Card): Set<Suit> {
  return cardSuitIconSet(card, FILTER_SUIT_ICONS);
}

export function cardMarketSuitIcons(card?: Card): Set<Suit> {
  return cardSuitIconSet(card, MARKET_SUIT_ICONS);
}

export function cardHasSuitIcon(card: Card | undefined, suit: Suit | undefined): boolean {
  if (!suit) return false;
  return cardSuitIcons(card).has(suit);
}

export function cardHasAnySuitIcon(card: Card | undefined, suits: readonly Suit[] | undefined): boolean {
  if (!suits?.length) return true;
  const icons = cardSuitIcons(card);
  return suits.some((suit) => icons.has(suit));
}
