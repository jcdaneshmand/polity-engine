export type CardType = "action" | "unit" | "technology" | "legacy";
export type ZoneName = "deck" | "hand" | "discard" | "playArea" | "history" | "exile";
export type ResourceName = "materials" | "knowledge" | "influence" | "unrest";

export type Effect =
  | { trigger: "on_play"; op: "draw"; count: number }
  | { trigger: "on_play"; op: "gain_resource"; resource: ResourceName; amount: number }
  | { trigger: "on_play"; op: "spend_resource"; resource: ResourceName; amount: number }
  | { trigger: "on_play"; op: "discard_random"; count: number }
  | { trigger: "on_play"; op: "move_self_to_history" }
  | { trigger: "on_play"; op: "acquire_card"; count: number }
  | { trigger: "on_play"; op: "conditional_resource_at_least"; resource: ResourceName; atLeast: number; then: Effect[]; else?: Effect[] }
  | { trigger: "on_play"; op: "choose_one"; choices: Effect[][] };

export interface Card { id: string; displayName: string; type: CardType; cost: number; tags: string[]; effects: Effect[]; }
export interface GameLogEntry { round: number; playerId: string; message: string; }
export interface PlayerState {
  deck: string[]; hand: string[]; discard: string[]; playArea: string[]; history: string[]; exile: string[];
  resources: Record<ResourceName, number>; actionsRemaining: number;
}
export interface GameState {
  players: Record<string, PlayerState>; cardDb: Record<string, Card>; market: string[]; sharedDiscard: string[]; log: GameLogEntry[]; round: number;
}
