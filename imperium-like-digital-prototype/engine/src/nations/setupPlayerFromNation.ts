import type { NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition, SetupRule } from "./nationSchema";
import type { PlayerState, ResourceName } from "../game/state";
import { validateNationCardReferences } from "./nationValidation";

export function setupPlayerFromNation(args: { nation: NationDefinition; cardDb: Record<string, NormalizedCardRecord>; playerId: string; shuffle: <T>(items: T[]) => T[]; }): PlayerState {
  const missing = validateNationCardReferences(args.nation, args.cardDb as Record<string, unknown>);
  if (missing.length) throw new Error(`Nation ${args.nation.id} references missing cards: ${missing.join(",")}`);
  const p: PlayerState = {
    deck: args.shuffle([...args.nation.startingDeckCardIds]), hand: [], discard: [], playArea: [], history: [], exile: [],
    powerArea: [...args.nation.powerCardIds], stateArea: [...args.nation.stateCardIds], developmentArea: [...args.nation.developmentCardIds], nationDeck: [...args.nation.nationDeckCardIds], accessionCardId: args.nation.accessionCardId,
    sideAreas: {}, resources: { materials: 0, knowledge: 0, influence: 0, unrest: 0, goods: 0 }, actionsRemaining: args.nation.actionTokensBase,
    actionTokensBase: args.nation.actionTokensBase, exhaustTokensBase: args.nation.exhaustTokensBase, actionTokensAvailable: args.nation.actionTokensBase, exhaustTokensAvailable: args.nation.exhaustTokensBase
  };
  args.nation.setupRules.forEach((r) => applySetupRule(p, r));
  return p;
}

function applySetupRule(player: PlayerState, rule: SetupRule): void {
  if (rule.op === "gain_resource") player.resources[mapRes(rule.resource)] += rule.count;
  if (rule.op === "create_side_area") player.sideAreas ??= {}, player.sideAreas[rule.areaId] = [];
  if (rule.op === "place_card_in_area") {
    if (rule.area === "hand") player.hand.push(rule.cardId);
    if (rule.area === "discard") player.discard.push(rule.cardId);
  }
}

const mapRes = (r: string): ResourceName => (r === "population" ? "influence" : r === "progress" ? "knowledge" : (r === "goods" ? "goods" : (r as ResourceName)));
