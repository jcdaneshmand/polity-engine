import type { ResourceName } from "../game/state";
import type { SoloDifficulty } from "../options/gameOptions";

export type SoloDifficultyConfig = {
  id: SoloDifficulty;
  displayName: string;
  botStartingResources: Partial<Record<ResourceName, number>>;
  slotCount: 5 | 6;
  botEffectsPerTurn?: number;
  botVpModifier: number;
  addMarketTokenOnRollSix: boolean;
  returnsUnrestGainBonus?: boolean;
};

export const SOLO_DIFFICULTY_CONFIG: Record<SoloDifficulty, SoloDifficultyConfig> = {
  chieftain: { id: "chieftain", displayName: "Chieftain", botStartingResources: {}, slotCount: 5, botVpModifier: -2, addMarketTokenOnRollSix: false, botEffectsPerTurn: 3 },
  warlord: { id: "warlord", displayName: "Warlord", botStartingResources: { goods: 1 }, slotCount: 5, botVpModifier: -1, addMarketTokenOnRollSix: false, botEffectsPerTurn: 3 },
  imperator: { id: "imperator", displayName: "Imperator", botStartingResources: { goods: 1, influence: 1 }, slotCount: 5, botVpModifier: 0, addMarketTokenOnRollSix: true, botEffectsPerTurn: 4 },
  sovereign: { id: "sovereign", displayName: "Sovereign", botStartingResources: { goods: 2 }, slotCount: 5, botVpModifier: 1, addMarketTokenOnRollSix: true, botEffectsPerTurn: 4 },
  overlord: { id: "overlord", displayName: "Overlord", botStartingResources: { goods: 2, materials: 1 }, slotCount: 6, botVpModifier: 2, addMarketTokenOnRollSix: true, botEffectsPerTurn: 5 },
  supreme_ruler: { id: "supreme_ruler", displayName: "Supreme Ruler", botStartingResources: { goods: 3, materials: 1 }, slotCount: 6, botVpModifier: 3, addMarketTokenOnRollSix: true, botEffectsPerTurn: 5, returnsUnrestGainBonus: true }
};
