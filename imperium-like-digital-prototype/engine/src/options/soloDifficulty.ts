import type { SoloDifficulty } from "./gameOptions";
import type { ResourceName } from "../game/state";

export type SoloDifficultyConfig = { id: SoloDifficulty; displayName: string; botStartingResources: Partial<Record<ResourceName, number>>; botEffectsPerTurn: number; botVpModifier: number };
export const SOLO_DIFFICULTY_CONFIG: Record<SoloDifficulty, SoloDifficultyConfig> = {
  chieftain: { id: "chieftain", displayName: "Chieftain", botStartingResources: { goods: 0 }, botEffectsPerTurn: 1, botVpModifier: -2 },
  warlord: { id: "warlord", displayName: "Warlord", botStartingResources: { goods: 1 }, botEffectsPerTurn: 1, botVpModifier: -1 },
  imperator: { id: "imperator", displayName: "Imperator", botStartingResources: { goods: 1, influence: 1 }, botEffectsPerTurn: 2, botVpModifier: 0 },
  sovereign: { id: "sovereign", displayName: "Sovereign", botStartingResources: { goods: 2, influence: 1 }, botEffectsPerTurn: 2, botVpModifier: 1 },
  sovereign_plus: { id: "sovereign_plus", displayName: "Sovereign+", botStartingResources: { goods: 2, influence: 2 }, botEffectsPerTurn: 3, botVpModifier: 2 }
};
