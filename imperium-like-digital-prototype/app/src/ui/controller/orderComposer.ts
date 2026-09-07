export type OrderChoiceKind = "solstice" | "look" | "look_take";

export interface OrderChoiceModel {
  key: string;
  kind: OrderChoiceKind;
  playerId: string;
  cardIds: string[];
  title: string;
  submitLabel: string;
  resolveAction: "resolveSolsticeOrderChoice" | "resolveLookOrderChoice" | "resolveLookTakeChoice";
}

export function getOrderChoiceModel(G: any): OrderChoiceModel | undefined {
  if (G?.pendingSolsticeOrderChoice) {
    const pending = G.pendingSolsticeOrderChoice;
    const cardIds = [...(pending.cardIds ?? [])];
    return {
      key: `solstice:${pending.playerId}:${pending.phase}:${cardIds.join("|")}`,
      kind: "solstice",
      playerId: String(pending.playerId),
      cardIds,
      title: "Set Solstice order",
      submitLabel: "Resolve in this order",
      resolveAction: "resolveSolsticeOrderChoice"
    };
  }
  if (G?.pendingLookOrderChoice) {
    const pending = G.pendingLookOrderChoice;
    const cardIds = [...(pending.cardIds ?? [])];
    return {
      key: `look:${pending.playerId}:${pending.source}:${cardIds.join("|")}`,
      kind: "look",
      playerId: String(pending.playerId),
      cardIds,
      title: "Set return order",
      submitLabel: "Return in this order",
      resolveAction: "resolveLookOrderChoice"
    };
  }
  if (G?.pendingLookTakeChoice) {
    const pending = G.pendingLookTakeChoice;
    const cardIds = [...(pending.cardIds ?? [])];
    return {
      key: `look-take:${pending.playerId}:${pending.source}:${pending.destination}:${cardIds.join("|")}`,
      kind: "look_take",
      playerId: String(pending.playerId),
      cardIds,
      title: "Take one and order the rest",
      submitLabel: "Take card and return the rest",
      resolveAction: "resolveLookTakeChoice"
    };
  }
  return undefined;
}

export function reconcileOrder(previous: string[], expected: string[]): string[] {
  const remaining = [...expected];
  const preserved = previous.filter((cardId) => {
    const index = remaining.indexOf(cardId);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
  return [...preserved, ...remaining];
}

export function moveOrderItem(order: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (index < 0 || index >= order.length || target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function isExactOrder(order: string[], expected: string[]): boolean {
  if (order.length !== expected.length) return false;
  const remaining = [...expected];
  return order.every((cardId) => {
    const index = remaining.indexOf(cardId);
    if (index < 0) return false;
    remaining.splice(index, 1);
    return true;
  });
}

export function orderComposerOperationCount(model: OrderChoiceModel): number {
  return model.cardIds.length * 2 + (model.kind === "look_take" ? model.cardIds.length : 0) + 2;
}
