import type { GameState, ResourceName } from "./state";
import { canonicalResourceName, normalizeResourceMap, resourceAmount, returnResourceToSupply } from "./resources";
import { currentStateMatches } from "./stateMatching";
import { takeUnrest } from "./unrest";

export type ResourceCost = Partial<Record<ResourceName, number>>;
const RESOURCE_NAMES: ResourceName[] = ["materials", "knowledge", "influence", "goods", "unrest"];

export interface ResourcePaymentExplanation {
  payable: boolean;
  kind: "free" | "fixed" | "alternative" | "unavailable";
  cost: ResourceCost;
  available: ResourceCost;
  payment?: ResourceCost;
  summary: string;
  reason?: string;
}

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
  return resolveResourcePayment(G.players[playerId].resources, normalizedCost, normalizedPayment) !== undefined;
}

function paymentIsAvailable(resources: Partial<Record<ResourceName, number>>, payment: ResourceCost): boolean {
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

function automaticResourcePayment(resources: Partial<Record<ResourceName, number>>, cost: ResourceCost): ResourceCost | undefined {
  const available = normalizeResourceMap(resources as Partial<Record<string, number | undefined>>);
  const payment: ResourceCost = {};
  const spend = (resource: ResourceName, amount: number): boolean => {
    if (amount <= 0) return true;
    if ((available[resource] ?? 0) < amount) return false;
    available[resource] = (available[resource] ?? 0) - amount;
    payment[resource] = (payment[resource] ?? 0) + amount;
    return true;
  };
  if (!spend("knowledge", cost.knowledge ?? 0) || !spend("goods", cost.goods ?? 0) || !spend("unrest", cost.unrest ?? 0)) return undefined;

  const materialDirect = Math.min(available.materials ?? 0, cost.materials ?? 0);
  spend("materials", materialDirect);
  const influenceDirect = Math.min(available.influence ?? 0, cost.influence ?? 0);
  spend("influence", influenceDirect);
  let substitutesNeeded = Math.ceil(Math.max(0, (cost.materials ?? 0) - materialDirect) / 2)
    + Math.max(0, (cost.influence ?? 0) - influenceDirect);
  while (substitutesNeeded > 0) {
    if ((available.goods ?? 0) > 0) spend("goods", 1);
    else if ((available.knowledge ?? 0) > 0) spend("knowledge", 1);
    else return undefined;
    substitutesNeeded -= 1;
  }
  return normalizeResourceMap(payment as Partial<Record<string, number | undefined>>);
}

function resolveResourcePayment(resources: Partial<Record<ResourceName, number>>, cost: ResourceCost, payment?: ResourceCost): ResourceCost | undefined {
  if (payment) return paymentIsAvailable(resources, payment) && selectedPaymentMatchesCost(payment, cost) ? payment : undefined;
  return automaticResourcePayment(resources, cost);
}

function formattedResourceAmounts(resources: ResourceCost): string {
  return (["materials", "influence", "knowledge", "goods", "unrest"] as ResourceName[])
    .filter((resource) => (resources[resource] ?? 0) > 0)
    .map((resource) => `${resources[resource]} ${resource}`)
    .join(", ") || "nothing";
}

export function explainResourcePayment(G: GameState, playerId: string, rawCost: number | ResourceCost | undefined, selectedPayment?: ResourceCost): ResourcePaymentExplanation {
  const cost = normalizeResourceCost(rawCost);
  const available = normalizeResourceMap(G.players[playerId]?.resources as Partial<Record<string, number | undefined>>);
  const hasCost = RESOURCE_NAMES.some((resource) => (cost[resource] ?? 0) > 0);
  if (!hasCost) return { payable: true, kind: "free", cost, available, payment: {}, summary: "Free" };
  const payment = resolveResourcePayment(available, cost, selectedPayment ? normalizeResourceCost(selectedPayment) : undefined);
  if (!payment) {
    const reason = selectedPayment ? "The selected payment no longer matches the cost or available resources." : "Available resources cannot satisfy this cost.";
    return { payable: false, kind: "unavailable", cost, available, summary: `Cannot pay ${formattedResourceAmounts(cost)}`, reason };
  }
  const substitutionUsed = (payment.knowledge ?? 0) > (cost.knowledge ?? 0) || (payment.goods ?? 0) > (cost.goods ?? 0);
  const directAndSubstituteAvailable = ((available.materials ?? 0) >= (cost.materials ?? 0) || (available.influence ?? 0) >= (cost.influence ?? 0))
    && ((available.knowledge ?? 0) > (cost.knowledge ?? 0) || (available.goods ?? 0) > (cost.goods ?? 0))
    && ((cost.materials ?? 0) > 0 || (cost.influence ?? 0) > 0);
  const kind = substitutionUsed || directAndSubstituteAvailable ? "alternative" : "fixed";
  return {
    payable: true,
    kind,
    cost,
    available,
    payment,
    summary: `${kind === "alternative" ? "Payment" : "Cost"}: ${formattedResourceAmounts(payment)}${substitutionUsed ? " (includes substitution)" : ""}`
  };
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
  const resolvedPayment = resolveResourcePayment(G.players[playerId].resources, normalizedCost, normalizedPayment);
  if (!resolvedPayment) {
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
  const spent: Partial<Record<ResourceName, number>> = { ...resolvedPayment };
  for (const [resource, amount] of Object.entries(spent) as [ResourceName, number | undefined][]) {
    resources[resource] = (resources[resource] ?? 0) - (amount ?? 0);
    returnResourceToSupply(G, resource, amount ?? 0);
  }
  applySpentResourceOverrides(G, playerId, spent, randomNumber);
  const changes = (Object.entries(spent) as [ResourceName, number | undefined][])
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => ({ playerId, resource, amount: -(amount ?? 0) }));
  if (changes.length > 0) G.log.push({
    round: G.round,
    playerId,
    message: `ResourcesPaid(${describeResourceCost(spent)})`,
    event: { type: "resource_change", changes, reason: "payment" }
  });
  return true;
}
