import type { GameState, ResourceName } from "./state";

const goodsSubstitutableResources = new Set<ResourceName>(["materials", "knowledge", "influence"]);
type ResourceCost = Partial<Record<ResourceName, number>>;

export function availableForResourceCost(G: GameState, playerId: string, resource: ResourceName): number {
  const resources = G.players[playerId].resources;
  const direct = resources[resource] ?? 0;
  if (!goodsSubstitutableResources.has(resource)) return direct;
  return direct + (resources.goods ?? 0);
}

export function canPayResourceCost(G: GameState, playerId: string, resource: ResourceName, amount: number): boolean {
  return canPayResourceCosts(G, playerId, { [resource]: amount });
}

export function payResourceCost(G: GameState, playerId: string, resource: ResourceName, amount: number): boolean {
  if (!canPayResourceCost(G, playerId, resource, amount)) {
    G.log.push({
      round: G.round,
      playerId,
      message: `CostUnpaid(${resource}/required=${amount}/available=${availableForResourceCost(G, playerId, resource)})`
    });
    return false;
  }

  if (!payResourceCosts(G, playerId, { [resource]: amount })) {
    return false;
  }

  G.log.push({ round: G.round, playerId, message: `Spent ${amount} ${resource}.` });
  return true;
}

export function canPayResourceCosts(G: GameState, playerId: string, cost: ResourceCost): boolean {
  const resources = G.players[playerId].resources;
  let goodsShortfall = 0;

  for (const [resource, maybeAmount] of Object.entries(cost) as [ResourceName, number | undefined][]) {
    const amount = maybeAmount ?? 0;
    if (amount <= 0) continue;

    if (resource === "goods") {
      goodsShortfall += amount;
      continue;
    }

    const direct = resources[resource] ?? 0;
    if (!goodsSubstitutableResources.has(resource)) {
      if (direct < amount) return false;
      continue;
    }

    goodsShortfall += Math.max(0, amount - direct);
  }

  return (resources.goods ?? 0) >= goodsShortfall;
}

export function payResourceCosts(G: GameState, playerId: string, cost: ResourceCost): boolean {
  if (!canPayResourceCosts(G, playerId, cost)) {
    const required = Object.entries(cost)
      .filter(([, amount]) => (amount ?? 0) > 0)
      .map(([resource, amount]) => `${resource}=${amount}`)
      .join(",");
    G.log.push({
      round: G.round,
      playerId,
      message: `CostUnpaid(${required || "none"})`
    });
    return false;
  }

  const resources = G.players[playerId].resources;
  let goodsPayment = 0;

  for (const [resource, maybeAmount] of Object.entries(cost) as [ResourceName, number | undefined][]) {
    const amount = maybeAmount ?? 0;
    if (amount <= 0) continue;

    if (resource === "goods") {
      goodsPayment += amount;
      continue;
    }

    const directPayment = Math.min(resources[resource] ?? 0, amount);
    resources[resource] = (resources[resource] ?? 0) - directPayment;
    const remainder = amount - directPayment;
    if (remainder > 0) goodsPayment += remainder;
  }

  if (goodsPayment > 0) resources.goods = (resources.goods ?? 0) - goodsPayment;
  return true;
}
