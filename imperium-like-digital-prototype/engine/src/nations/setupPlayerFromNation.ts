import type { ExpansionId, NormalizedCardRecord } from "../../../tools/card-import/cardCsvTypes";
import type { NationDefinition, SetupRule } from "./nationTypes";
import type { PlayerState, ResourceName } from "../game/state";
import { validateNationCardReferences } from "./nationValidation";

export function setupPlayerFromNation(args: {
  nation: NationDefinition;
  cardDb: Record<string, NormalizedCardRecord>;
  playerId: string;
  shuffle: <T>(items: T[]) => T[];
  enabledExpansions?: ExpansionId[];
  extraStartingDeckCardIds?: string[];
  removedStartingDeckCardIds?: string[];
}): PlayerState {
  const missing = validateNationCardReferences(args.nation, args.cardDb as Record<string, unknown>);
  const missingCampaignCards = (args.extraStartingDeckCardIds ?? []).filter((cardId) => !args.cardDb[cardId]);
  if (missing.length || missingCampaignCards.length) throw new Error(`Nation ${args.nation.id} references missing cards: ${[...missing, ...missingCampaignCards].join(",")}`);
  const enabled = args.enabledExpansions ?? [];
  if (args.nation.requiredExpansions.some((e) => !enabled.includes(e))) throw new Error(`Nation ${args.nation.id} requires disabled expansion.`);
  const tradeRoutesEnabled = enabled.includes("trade_routes");
  const embeddedAccessionCardId = args.nation.nationDeckCardIds.find((cardId) => isSetupAccessionCard(args.cardDb[cardId]));
  const accessionCardId = args.nation.accessionCardId ?? embeddedAccessionCardId;
  const regularNationDeckCardIds = args.nation.nationDeckCardIds.filter((cardId) => cardId !== accessionCardId);
  const removedStartingDeckCardIds = new Set(args.removedStartingDeckCardIds ?? []);
  const startingDeckCardIds = [
    ...args.nation.startingDeckCardIds,
    ...(args.extraStartingDeckCardIds ?? [])
  ].filter((cardId) => !removedStartingDeckCardIds.has(cardId));
  const p: PlayerState = {
    deck: args.shuffle(startingDeckCardIds), hand: [], discard: [], playArea: [], history: [], exile: [],
    powerArea: [...args.nation.powerCardIds], stateArea: [...args.nation.stateCardIds], developmentArea: [...args.nation.developmentCardIds], nationDeck: args.shuffle([...regularNationDeckCardIds]), accessionCardId,
    sideAreas: {}, resources: { materials: 3, knowledge: tradeRoutesEnabled ? 0 : 1, influence: 2, unrest: 0, goods: tradeRoutesEnabled ? 1 : 0 }, actionsRemaining: args.nation.actionTokensBase, handSize: 5,
    actionTokensBase: args.nation.actionTokensBase, exhaustTokensBase: args.nation.exhaustTokensBase, actionTokensAvailable: args.nation.actionTokensBase, exhaustTokensAvailable: args.nation.exhaustTokensBase,
    progressionTokens: { nationDeck: 0, developmentArea: 0 }
  };
  args.nation.setupRules.forEach((r) => applySetupRule(p, r));
  return p;
}

function isSetupAccessionCard(card: NormalizedCardRecord | undefined): boolean {
  return card?.cardType === "accession" || (card?.tags ?? []).includes("accession");
}

function applySetupRule(player: PlayerState, rule: SetupRule): void {
  if (rule.op === "gain_resource") player.resources[mapRes(rule.resource)] += rule.count;
  if (rule.op === "create_side_area") {
    player.sideAreas ??= {};
    player.sideAreas[rule.areaId] = [];
  }

  if (rule.op === "set_token_count") {
    if (typeof rule.actionTokens === "number") {
      player.actionTokensBase = rule.actionTokens;
      player.actionTokensAvailable = rule.actionTokens;
      player.actionsRemaining = rule.actionTokens;
    }
    if (typeof rule.exhaustTokens === "number") {
      player.exhaustTokensBase = rule.exhaustTokens;
      player.exhaustTokensAvailable = rule.exhaustTokens;
    }
  }
  if (rule.op === "place_card_in_area") {
    switch (rule.area) {
      case "hand": player.hand.push(rule.cardId); break;
      case "discard": player.discard.push(rule.cardId); break;
      case "draw_deck": player.deck.push(rule.cardId); break;
      case "play_area": player.playArea.push(rule.cardId); break;
      case "history": player.history.push(rule.cardId); break;
      case "development_area": player.developmentArea.push(rule.cardId); break;
      case "nation_deck": player.nationDeck.push(rule.cardId); break;
      case "power_area": player.powerArea.push(rule.cardId); break;
      case "state_area": player.stateArea.push(rule.cardId); break;
      case "accession": player.accessionCardId = rule.cardId; break;
      case "side_area":
        player.sideAreas ??= {};
        if (!player.sideAreas.default) player.sideAreas.default = [];
        player.sideAreas.default.push(rule.cardId);
        break;
      default:
        throw new Error(`Unsupported place_card_in_area target: ${String(rule.area)}`);
    }
  }
}

const mapRes = (r: string): ResourceName => (r === "population" ? "influence" : r === "progress" ? "knowledge" : (r === "goods" ? "goods" : (r as ResourceName)));
