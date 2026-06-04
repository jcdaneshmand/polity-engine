import type { GameState, ResourceName } from "./state";
import { canonicalResourceName, normalizeResourceMap, resourceAmount, returnResourceToSupply } from "./resources";
import { currentStateMatches } from "./stateMatching";
import { takeUnrest } from "./unrest";

export type ResourceCost = Partial<Record<ResourceName, number>>;
const RESOURCE_NAMES: ResourceName[] = ["materials", "knowledge", "influence", "goods", "unrest"];

export function normalizeResourceCost(cost: number | ResourceCost | undefined): ResourceCost {
  if (typeof cost === "number") return { materials: cost };
  return normalizeResourceMap(cost as Partial<Record<string, number | undefined>>);
}

export function describeResourceCost(cost: ResourceCost): string {
  const normalized = normalizeResourceMap(cost as Partial<Record<string, number | undefined>>);
  return (["materials", "influence", "knowledge", "goods", "unrest"] as ResourceName[])
    .filter((resource) => (normalized[resource] ?? 0) > 0)
    .map((resource) => `${resource}=${normalized[resource]}`)
    .join(",");
}

function normalizePlayerResourcePool(G: GameState, playerId: string): Partial<Record<ResourceName, number>> {
  const resources = G.players[playerId].resources as Partial<Record<string, number | undefined>>;
  const normalized = normalizeResourceMap(resources);
  for (const resource of Object.keys(resources)) delete resources[resource];
  for (const resource of RESOURCE_NAMES) resources[resource] = normalized[resource] ?? 0;
  return G.players[playerId].resources;
}

export function availableForResourceCost(G: GameState, playerId: string, resource: ResourceName): number {
  const canonical = canonicalResourceName(resource);
  const resources = normalizePlayerResourcePool(G, playerId);
  const direct = resources[canonical] ?? 0;
  if (canonical === "materials") return direct + 2 * ((resources.knowledge ?? 0) + (resources.goods ?? 0));
  if (canonical === "influence") return direct + (resources.knowledge ?? 0) + (resources.goods ?? 0);
  return direct;
}

export function canPayResourceCost(G: GameState, playerId: string, resource: ResourceName, amount: number): boolean {
  return canPayResourceCosts(G, playerId, { [canonicalResourceName(resource)]: amount });
}

export function payResourceCost(G: GameState, playerId: string, resource: ResourceName, amount: number, randomNumber?: () => number): boolean {
  const canonical = canonicalResourceName(resource);
  if (!canPayResourceCost(G, playerId, canonical, amount)) {
    G.log.push({
      round: G.round,
      playerId,
      message: `CostUnpaid(${canonical}/required=${amount}/available=${availableForResourceCost(G, playerId, canonical)})`
    });
    return false;
  }

  if (!payResourceCosts(G, playerId, { [canonical]: amount }, undefined, randomNumber)) {
    return false;
  }

  G.log.push({ round: G.round, playerId, message: `Spent ${amount} ${canonical}.` });
  return true;
}

export function canPayResourceCosts(G: GameState, playerId: string, cost: ResourceCost, payment?: ResourceCost): boolean {
  const normalizedCost = normalizeResourceMap(cost as Partial<Record<string, number | undefined>>);
  const normalizedPayment = payment ? normalizeResourceMap(payment as Partial<Record<string, number | undefined>>) : undefined;
  normalizePlayerResourcePool(G, playerId);
  if (!resourcesCanPayCost(G.players[playerId].resources, normalizedCost)) return false;
  if (!normalizedPayment) return true;
  return paymentIsAvailable(G, playerId, normalizedPayment) && selectedPaymentMatchesCost(normalizedPayment, normalizedCost);
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

function applySpentResourceOverrides(G: GameState, playerId: string, spent: Partial<Record<ResourceName, number>>, randomNumber?: () => number): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset) return;
  for (const override of ruleset.stateOverrides ?? []) {
    if (override.op !== "take_unrest_when_spending_resource") continue;
    if (override.state && !currentStateMatches(G, playerId, override.state)) continue;
    const amount = resourceAmount(spent, override.resource);
    if (amount <= 0) continue;
    takeUnrest(G, { playerIds: [playerId], count: amount, triggeredBy: playerId, randomNumber });
    G.log.push({ round: G.round, playerId, message: `SpentResourcePenalty(${override.resource}/unrest=${amount})` });
    if (G.gameover) return;
  }
}

export function payResourceCosts(G: GameState, playerId: string, cost: ResourceCost, payment?: ResourceCost, randomNumber?: () => number): boolean {
  const normalizedCost = normalizeResourceMap(cost as Partial<Record<string, number | undefined>>);
  const normalizedPayment = payment ? normalizeResourceMap(payment as Partial<Record<string, number | undefined>>) : undefined;
  normalizePlayerResourcePool(G, playerId);
  if (!canPayResourceCosts(G, playerId, normalizedCost, normalizedPayment)) {
    const required = Object.entries(normalizedCost)
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
  if (normalizedPayment) {
    for (const resource of RESOURCE_NAMES) {
      const amount = normalizedPayment[resource] ?? 0;
      if (amount <= 0) continue;
      resources[resource] = (resources[resource] ?? 0) - amount;
      spent[resource] = amount;
      returnResourceToSupply(G, resource, amount);
    }
    applySpentResourceOverrides(G, playerId, spent, randomNumber);
    return true;
  }

  resources.knowledge = (resources.knowledge ?? 0) - (normalizedCost.knowledge ?? 0);
  if ((normalizedCost.knowledge ?? 0) > 0) spent.knowledge = (spent.knowledge ?? 0) + (normalizedCost.knowledge ?? 0);
  resources.goods = (resources.goods ?? 0) - (normalizedCost.goods ?? 0);
  if ((normalizedCost.goods ?? 0) > 0) spent.goods = (spent.goods ?? 0) + (normalizedCost.goods ?? 0);
  resources.unrest = (resources.unrest ?? 0) - (normalizedCost.unrest ?? 0);
  if ((normalizedCost.unrest ?? 0) > 0) spent.unrest = (spent.unrest ?? 0) + (normalizedCost.unrest ?? 0);

  const materialDirectPayment = Math.min(resources.materials ?? 0, normalizedCost.materials ?? 0);
  resources.materials = (resources.materials ?? 0) - materialDirectPayment;
  if (materialDirectPayment > 0) spent.materials = (spent.materials ?? 0) + materialDirectPayment;
  let materialShortfall = Math.max(0, (normalizedCost.materials ?? 0) - materialDirectPayment);

  const populationDirectPayment = Math.min(resources.influence ?? 0, normalizedCost.influence ?? 0);
  resources.influence = (resources.influence ?? 0) - populationDirectPayment;
  if (populationDirectPayment > 0) spent.influence = (spent.influence ?? 0) + populationDirectPayment;
  let populationShortfall = Math.max(0, (normalizedCost.influence ?? 0) - populationDirectPayment);

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
  applySpentResourceOverrides(G, playerId, spent, randomNumber);
  return true;
}
