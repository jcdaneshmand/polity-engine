import type { GameState, ResourceName } from "./state";

export function takeResourceFromSupply(G: GameState, resource: ResourceName, requested: number): number {
  const amount = Math.max(0, Math.floor(requested));
  if (amount <= 0) return 0;
  if (!G.resourceSupply) return amount;
  const available = Math.max(0, G.resourceSupply[resource] ?? 0);
  const taken = Math.min(amount, available);
  G.resourceSupply[resource] = available - taken;
  return taken;
}

export function returnResourceToSupply(G: GameState, resource: ResourceName, amount: number): void {
  const returned = Math.max(0, Math.floor(amount));
  if (returned <= 0 || !G.resourceSupply) return;
  G.resourceSupply[resource] = (G.resourceSupply[resource] ?? 0) + returned;
}

export function gainPlayerResource(G: GameState, playerId: string, resource: ResourceName, requested: number): number {
  const gained = takeResourceFromSupply(G, resource, requested);
  if (gained <= 0) return 0;
  const player = G.players[playerId];
  player.resources[resource] = (player.resources[resource] ?? 0) + gained;
  return gained;
}

export function gainCardResource(G: GameState, cardId: string, resource: ResourceName, requested: number): number {
  const gained = takeResourceFromSupply(G, resource, requested);
  if (gained <= 0) return 0;
  G.cardStates ??= {};
  G.cardStates[cardId] ??= {};
  G.cardStates[cardId].resources ??= {};
  G.cardStates[cardId].resources[resource] = (G.cardStates[cardId].resources[resource] ?? 0) + gained;
  return gained;
}

export function gainMarketResource(G: GameState, cardId: string, resource: ResourceName, requested: number): number {
  const gained = takeResourceFromSupply(G, resource, requested);
  if (gained <= 0) return 0;
  G.marketResources ??= {};
  G.marketResources[cardId] ??= {};
  G.marketResources[cardId][resource] = (G.marketResources[cardId][resource] ?? 0) + gained;
  return gained;
}
