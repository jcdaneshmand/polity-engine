import type { GameState, ResourceName } from "./state";
import { returnResourceToSupply } from "./resources";
import { currentStateMatches } from "./stateMatching";
import { takeUnrest } from "./unrest";

export type ResourceCost = Partial<Record<ResourceName, number>>;
const RESOURCE_NAMES: ResourceName[] = ["materials", "knowledge", "influence", "goods", "unrest"];

export function normalizeResourceCost(cost: number | ResourceCost | undefined): ResourceCost {
  if (typeof cost === "number") return { materials: cost };
  return cost ?? {};
}

export function describeResourceCost(cost: ResourceCost): string {
  return (["materials", "influence", "knowledge", "goods", "unrest"] as ResourceName[])
    .filter((resource) => (cost[resource] ?? 0) > 0)
    .map((resource) => `${resource}=${cost[resource]}`)
    .join(",");
}

export function availableForResourceCost(G: GameState, playerId: string, resource: ResourceName): number {
  const resources = G.players[playerId].resources;
  const direct = resources[resource] ?? 0;
  if (resource === "materials") return direct + 2 * ((resources.knowledge ?? 0) + (resources.goods ?? 0));
  if (resource === "influence") return direct + (resources.knowledge ?? 0) + (resources.goods ?? 0);
  return direct;
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
  return resourcesCanPayCost(G.players[playerId].resources, cost);
}

function resourcesCanPayCost(resources: Partial<Record<ResourceName, number>>, cost: ResourceCost): boolean {
  const materialCost = cost.materials ?? 0;
  const populationCost = cost.influence ?? 0;
  const progressCost = cost.knowledge ?? 0;
  const goodsCost = cost.goods ?? 0;
  const unrestCost = cost.unrest ?? 0;

  if ((resources.knowledge ?? 0) < progressCost) return false;
  if ((resources.goods ?? 0) < goodsCost) return false;
  if ((resources.unrest ?? 0) < unrestCost) return false;

  const remainingProgress = (resources.knowledge ?? 0) - progressCost;
  const remainingGoods = (resources.goods ?? 0) - goodsCost;
  const materialShortfall = Math.max(0, materialCost - (resources.materials ?? 0));
  const populationShortfall = Math.max(0, populationCost - (resources.influence ?? 0));
  const substituteTokensNeeded = Math.ceil(materialShortfall / 2) + populationShortfall;

  return remainingProgress + remainingGoods >= substituteTokensNeeded;
}

function paymentIsAvailable(G: GameState, playerId: string, payment: ResourceCost): boolean {
  const resources = G.players[playerId].resources;
  return RESOURCE_NAMES.every((resource) => (payment[resource] ?? 0) >= 0 && (payment[resource] ?? 0) <= (resources[resource] ?? 0));
}

function selectedPaymentMatchesCost(payment: ResourceCost, cost: ResourceCost): boolean {
  const selected = Object.fromEntries(RESOURCE_NAMES.map((resource) => [resource, payment[resource] ?? 0])) as Record<ResourceName, number>;
  if (selected.unrest !== (cost.unrest ?? 0)) return false;
  if (selected.knowledge < (cost.knowledge ?? 0)) return false;
  if (selected.goods < (cost.goods ?? 0)) return false;

  const extraProgress = selected.knowledge - (cost.knowledge ?? 0);
  const extraGoods = selected.goods - (cost.goods ?? 0);
  const materialShortfall = Math.max(0, (cost.materials ?? 0) - selected.materials);
  const influenceShortfall = Math.max(0, (cost.influence ?? 0) - selected.influence);

  return selected.materials <= (cost.materials ?? 0)
    && selected.influence <= (cost.influence ?? 0)
    && extraProgress + extraGoods === Math.ceil(materialShortfall / 2) + influenceShortfall;
}

function applySpentResourceOverrides(G: GameState, playerId: string, spent: Partial<Record<ResourceName, number>>): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset) return;
  for (const override of ruleset.stateOverrides ?? []) {
    if (override.op !== "take_unrest_when_spending_resource") continue;
    if (override.state && !currentStateMatches(G, playerId, override.state)) continue;
    const amount = spent[override.resource] ?? 0;
    if (amount <= 0) continue;
    takeUnrest(G, { playerIds: [playerId], count: amount, triggeredBy: playerId });
    G.log.push({ round: G.round, playerId, message: `SpentResourcePenalty(${override.resource}/unrest=${amount})` });
    if (G.gameover) return;
  }
}

export function payResourceCosts(G: GameState, playerId: string, cost: ResourceCost, payment?: ResourceCost): boolean {
  if (!canPayResourceCosts(G, playerId, cost) || (payment && (!paymentIsAvailable(G, playerId, payment) || !selectedPaymentMatchesCost(payment, cost)))) {
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
  const spent: Partial<Record<ResourceName, number>> = {};
  if (payment) {
    for (const resource of RESOURCE_NAMES) {
      const amount = payment[resource] ?? 0;
      if (amount <= 0) continue;
      resources[resource] = (resources[resource] ?? 0) - amount;
      spent[resource] = amount;
      returnResourceToSupply(G, resource, amount);
    }
    applySpentResourceOverrides(G, playerId, spent);
    return true;
  }

  resources.knowledge = (resources.knowledge ?? 0) - (cost.knowledge ?? 0);
  if ((cost.knowledge ?? 0) > 0) spent.knowledge = (spent.knowledge ?? 0) + (cost.knowledge ?? 0);
  resources.goods = (resources.goods ?? 0) - (cost.goods ?? 0);
  if ((cost.goods ?? 0) > 0) spent.goods = (spent.goods ?? 0) + (cost.goods ?? 0);
  resources.unrest = (resources.unrest ?? 0) - (cost.unrest ?? 0);
  if ((cost.unrest ?? 0) > 0) spent.unrest = (spent.unrest ?? 0) + (cost.unrest ?? 0);

  const materialDirectPayment = Math.min(resources.materials ?? 0, cost.materials ?? 0);
  resources.materials = (resources.materials ?? 0) - materialDirectPayment;
  if (materialDirectPayment > 0) spent.materials = (spent.materials ?? 0) + materialDirectPayment;
  let materialShortfall = Math.max(0, (cost.materials ?? 0) - materialDirectPayment);

  const populationDirectPayment = Math.min(resources.influence ?? 0, cost.influence ?? 0);
  resources.influence = (resources.influence ?? 0) - populationDirectPayment;
  if (populationDirectPayment > 0) spent.influence = (spent.influence ?? 0) + populationDirectPayment;
  let populationShortfall = Math.max(0, (cost.influence ?? 0) - populationDirectPayment);

  const spendSubstituteToken = (): void => {
    if ((resources.goods ?? 0) > 0) {
      resources.goods -= 1;
      spent.goods = (spent.goods ?? 0) + 1;
      return;
    }
    resources.knowledge = (resources.knowledge ?? 0) - 1;
    spent.knowledge = (spent.knowledge ?? 0) + 1;
  };

  while (materialShortfall > 0) {
    spendSubstituteToken();
    materialShortfall = Math.max(0, materialShortfall - 2);
  }
  while (populationShortfall > 0) {
    spendSubstituteToken();
    populationShortfall -= 1;
  }
  for (const [resource, amount] of Object.entries(spent) as [ResourceName, number | undefined][]) {
    returnResourceToSupply(G, resource, amount ?? 0);
  }
  applySpentResourceOverrides(G, playerId, spent);
  return true;
}
