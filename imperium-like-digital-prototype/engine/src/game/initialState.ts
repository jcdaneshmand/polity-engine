import { loadCardDb } from "../cards/cardLoader";
import type { GameState, PlayerState, ResourceName } from "./state";

const baseResources: Record<ResourceName, number> = { materials: 0, knowledge: 0, influence: 0, unrest: 0 };

function makePlayer(startingDeck: string[]): PlayerState {
  return { deck: [...startingDeck], hand: [], discard: [], playArea: [], history: [], exile: [], resources: { ...baseResources }, actionsRemaining: 1 };
}

export function createInitialState(): GameState {
  const cardDb = loadCardDb();
  const starterDeck = ["test_action_foundry_shift", "test_action_archive_survey", "test_action_scholars_circle", "test_action_risk_audit", "test_action_foundry_shift"];
  return { players: { "0": makePlayer(starterDeck), "1": makePlayer(starterDeck) }, cardDb, market: Object.keys(cardDb).slice(0, 8), sharedDiscard: [], log: [], round: 1 };
}
