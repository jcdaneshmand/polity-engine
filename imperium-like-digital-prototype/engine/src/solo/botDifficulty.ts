import type { ResourceName } from "../game/state";
import type { SoloDifficulty } from "../options/gameOptions";

export type SoloDifficultyConfig = {
  id: SoloDifficulty;
  displayName: string;
  botStartingResources: Partial<Record<ResourceName, number>>;
  slotCount: 4 | 5 | 6;
  botEffectsPerTurn?: number;
  botVpModifier: number;
  returnsUnrestGainBonus?: boolean;
};

export const SOLO_DIFFICULTY_CONFIG: Record<SoloDifficulty, SoloDifficultyConfig> = {
  chieftain: { id: "chieftain", displayName: "Chieftain", botStartingResources: {}, slotCount: 4, botVpModifier: -2, botEffectsPerTurn: 4 },
  warlord: { id: "warlord", displayName: "Warlord", botStartingResources: {}, slotCount: 4, botVpModifier: -1, botEffectsPerTurn: 4 },
  imperator: { id: "imperator", displayName: "Imperator", botStartingResources: {}, slotCount: 5, botVpModifier: 0, botEffectsPerTurn: 5 },
  sovereign: { id: "sovereign", displayName: "Sovereign", botStartingResources: { materials: 3, influence: 2, knowledge: 1 }, slotCount: 5, botVpModifier: 1, botEffectsPerTurn: 5 },
  overlord: { id: "overlord", displayName: "Overlord", botStartingResources: { materials: 3, influence: 2, knowledge: 1 }, slotCount: 6, botVpModifier: 2, botEffectsPerTurn: 5 },
  supreme_ruler: { id: "supreme_ruler", displayName: "Supreme Ruler", botStartingResources: { materials: 3, influence: 2, knowledge: 1 }, slotCount: 6, botVpModifier: 3, botEffectsPerTurn: 5, returnsUnrestGainBonus: true }
};
