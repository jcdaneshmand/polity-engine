import type { GameOptions } from "../options/gameOptions";
import type { CommonsSetupResult } from "../setup/commonsTypes";
import type { SoloState } from "../solo/botTypes";
import type { NationRuleset, NationRulesetApplicationReport, SideAreaState, ZoneState } from "../nations/nationRulesetTypes";
import type { NationStrategyProfile } from "../nations/nationStrategyTypes";
export type CardType = "action" | "unit" | "technology" | "legacy" | "in_play" | "attack" | "power" | "state" | "development" | "accession" | "nation" | "region" | "unrest" | "fame" | "trade_route" | "bot_state" | "other";
export type Suit = "military" | "civic" | "economic" | "unrest" | "wild" | "region" | "uncivilized" | "civilized" | "tributary" | "fame" | "power" | "trade_route" | "none" | "multi";
export type ZoneName = "deck" | "hand" | "discard" | "playArea" | "history" | "exile";
export type ResourceName = "materials" | "knowledge" | "influence" | "unrest" | "goods";
export type EffectOp = Record<string, unknown>;

export type Effect =
  | { trigger: "on_play"; op: "draw"; count: number }
  | { trigger: "on_play"; op: "gain_resource"; resource: ResourceName; amount: number }
  | { trigger: "on_play"; op: "spend_resource"; resource: ResourceName; amount: number }
  | { trigger: "on_play"; op: "discard_random"; count: number }
  | { trigger: "on_play"; op: "move_self_to_history" }
  | { trigger: "on_play"; op: "acquire_card"; count: number }
  | { trigger: "on_play"; op: "conditional_resource_at_least"; resource: ResourceName; atLeast: number; then: Effect[]; else?: Effect[] }
  | { trigger: "on_play"; op: "choose_one"; choices: Effect[][] };

export interface Card { id: string; displayName: string; type: CardType; cardType?: CardType; suit?: Suit; vp?: number; cost: number; tags: string[]; effects: Effect[]; allowedModes?: ("multiplayer"|"solo"|"practice")[]; disallowedModes?: ("multiplayer"|"solo"|"practice")[]; playerCountRequirement?: string; startingLocation?: string; }
export interface GameLogEntry { round: number; playerId: string; message: string; }
export interface PlayerState {
  deck: string[]; hand: string[]; discard: string[]; playArea: string[]; history: string[]; exile: string[];
  powerArea: string[]; stateArea: string[]; developmentArea: string[]; nationDeck: string[]; accessionCardId?: string; sideAreas?: Record<string, string[]>;
  resources: Record<ResourceName, number>; actionsRemaining: number;
  actionTokensBase: number; exhaustTokensBase: number; actionTokensAvailable: number; exhaustTokensAvailable: number;
}
export interface GameState {
  players: Record<string, PlayerState>; cardDb: Record<string, Card>; market: string[]; sharedDiscard: string[]; log: GameLogEntry[]; round: number;
  activeNationRulesets?: Record<string, NationRuleset>;
  activeNationStrategyProfiles?: Record<string, NationStrategyProfile>;
  sideAreas?: Record<string, Record<string, SideAreaState>>;
  specialZones?: Record<string, Record<string, ZoneState>>;
  globalSpecialZones?: Record<string, ZoneState>;
  rulesetReports?: NationRulesetApplicationReport[];
  options?: GameOptions;
  practiceClock?: { turnsRemaining: number; progressTokens: number };
  solo?: SoloState;
  setupReport?: { delayedAggressiveCount: number; usedQuickSetup: boolean; shortGameExiled: number; shortGameNationAdvanced: number; commonsSetup?: CommonsSetupResult };
  gameover?: { winner: string; reason: string };
}
