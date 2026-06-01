import type { GameState, ResourceName } from "./state";

type ResourceBag = Partial<Record<string, number | undefined>>;

export function canonicalResourceName(resource: ResourceName | string): ResourceName {
  if (resource === "progress") return "knowledge";
  if (resource === "population") return "influence";
  return resource as ResourceName;
}

export function resourceAmount(resources: ResourceBag | undefined, resource: ResourceName | string): number {
  return resources?.[canonicalResourceName(resource)] ?? 0;
}

export function setResourceAmount(resources: ResourceBag, resource: ResourceName | string, amount: number): void {
  const canonical = canonicalResourceName(resource);
  resources[canonical] = amount;
  if (resource !== canonical) delete resources[resource];
}

export function addResourceAmount(resources: ResourceBag, resource: ResourceName | string, amount: number): void {
  setResourceAmount(resources, resource, resourceAmount(resources, resource) + amount);
}

export function normalizeResourceMap(value: ResourceBag | undefined): Partial<Record<ResourceName, number>> {
  const normalized: Partial<Record<ResourceName, number>> = {};
  for (const [rawResource, rawAmount] of Object.entries(value ?? {})) {
    const amount = rawAmount ?? 0;
    if (amount === 0) continue;
    const resource = canonicalResourceName(rawResource);
    normalized[resource] = (normalized[resource] ?? 0) + amount;
  }
  return normalized;
}

export function takeResourceFromSupply(G: GameState, resource: ResourceName, requested: number): number {
  const canonical = canonicalResourceName(resource);
  const amount = Math.max(0, Math.floor(requested));
  if (amount <= 0) return 0;
  if (!G.resourceSupply) return amount;
  const available = Math.max(0, G.resourceSupply[canonical] ?? 0);
  const taken = Math.min(amount, available);
  G.resourceSupply[canonical] = available - taken;
  return taken;
}

export function returnResourceToSupply(G: GameState, resource: ResourceName, amount: number): void {
  const canonical = canonicalResourceName(resource);
  const returned = Math.max(0, Math.floor(amount));
  if (returned <= 0 || !G.resourceSupply) return;
  G.resourceSupply[canonical] = (G.resourceSupply[canonical] ?? 0) + returned;
}

export function gainPlayerResource(G: GameState, playerId: string, resource: ResourceName, requested: number): number {
  const canonical = canonicalResourceName(resource);
  const gained = takeResourceFromSupply(G, canonical, requested);
  if (gained <= 0) return 0;
  const player = G.players[playerId];
  player.resources[canonical] = (player.resources[canonical] ?? 0) + gained;
  return gained;
}

export function gainCardResource(G: GameState, cardId: string, resource: ResourceName, requested: number): number {
  const canonical = canonicalResourceName(resource);
  const gained = takeResourceFromSupply(G, canonical, requested);
  if (gained <= 0) return 0;
  G.cardStates ??= {};
  G.cardStates[cardId] ??= {};
  G.cardStates[cardId].resources ??= {};
  G.cardStates[cardId].resources[canonical] = (G.cardStates[cardId].resources[canonical] ?? 0) + gained;
  return gained;
}

export function gainMarketResource(G: GameState, cardId: string, resource: ResourceName, requested: number): number {
  const canonical = canonicalResourceName(resource);
  const gained = takeResourceFromSupply(G, canonical, requested);
  if (gained <= 0) return 0;
  G.marketResources ??= {};
  G.marketResources[cardId] ??= {};
  G.marketResources[cardId][canonical] = (G.marketResources[cardId][canonical] ?? 0) + gained;
  return gained;
}
