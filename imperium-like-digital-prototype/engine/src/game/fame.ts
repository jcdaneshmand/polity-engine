import type { GameState } from "./state";
import type { BotState } from "../solo/botTypes";
import { gainPlayerResource, takeResourceFromSupply } from "./resources";
import { createCardDrivenDevelopmentChoice } from "./zones";
import { triggerScoring } from "./scoring";
import { currentStateMatches } from "./stateMatching";

function ensureFameDeck(G: GameState): NonNullable<GameState["fameDeck"]> {
  G.fameDeck ??= { available: [], resolvedSpecialByPlayer: {} };
  G.fameDeck.resolvedSpecialByPlayer ??= {};
  if (G.fameDeck.specialBottomCardId && !G.fameDeck.specialBottomSide) G.fameDeck.specialBottomSide = "A";
  return G.fameDeck;
}

function resolveSpecialBottomFameRewards(G: GameState, playerId: string, cardId: string): void {
  if (currentStateMatches(G, playerId, "uncivilized")) {
    const gained = gainPlayerResource(G, playerId, "knowledge", 6);
    G.log.push({ round: G.round, playerId, message: `KingOfKingsReward(${cardId}/uncivilized/progress=${gained === 6 ? 6 : `${gained}/6`})` });
    return;
  }
  if (currentStateMatches(G, playerId, "civilized")) {
    const gained = gainPlayerResource(G, playerId, "knowledge", 3);
    G.log.push({ round: G.round, playerId, message: `KingOfKingsReward(${cardId}/civilized/progress=${gained === 3 ? 3 : `${gained}/3`}/free_develop)` });
    createCardDrivenDevelopmentChoice(G, playerId, cardId, { free: true });
  }
}

function normalizedBotStateTokens(bot: BotState): string[] {
  const values = [bot.botStateSide, bot.botStateTableId, bot.merchantState].filter(Boolean);
  return values.flatMap((value) => {
    const normalized = String(value).toLowerCase().replace(/[_\s-]+/g, "");
    if (["s", "a", "barbarian", "uncivilized", "uncivilised"].includes(normalized)) return ["barbarian", "uncivilized"];
    if (["f", "b", "empire", "civilized", "civilised", "merchantempire"].includes(normalized)) return ["empire", "civilized"];
    return [normalized];
  });
}

export function resolveBotKingOfKings(G: GameState): boolean {
  const bot = G.solo?.bot;
  if (!bot) return false;
  const fameDeck = ensureFameDeck(G);
  const specialBottomCardId = fameDeck.specialBottomCardId;
  if (!specialBottomCardId) return false;
  if (fameDeck.resolvedSpecialByPlayer[bot.botId]) {
    G.log.push({ round: G.round, playerId: bot.botId, message: `FameSpecialSkipped(already_resolved/${specialBottomCardId})` });
    return false;
  }

  const stateTokens = normalizedBotStateTokens(bot);
  if (stateTokens.includes("uncivilized")) {
    const gained = takeResourceFromSupply(G, "knowledge", 6);
    bot.resources.knowledge = (bot.resources.knowledge ?? 0) + gained;
    G.log.push({ round: G.round, playerId: bot.botId, message: `BotKingOfKingsReward(${specialBottomCardId}/uncivilized/progress=${gained === 6 ? 6 : `${gained}/6`})` });
  } else if (stateTokens.includes("civilized")) {
    const gained = takeResourceFromSupply(G, "knowledge", 3);
    bot.resources.knowledge = (bot.resources.knowledge ?? 0) + gained;
    const dynastyCardId = bot.botDynastyDeck.shift();
    if (dynastyCardId) bot.botDeck.unshift(dynastyCardId);
    G.log.push({ round: G.round, playerId: bot.botId, message: `BotKingOfKingsReward(${specialBottomCardId}/civilized/progress=${gained === 3 ? 3 : `${gained}/3`}/dynasty=${dynastyCardId ?? "none"})` });
  }

  fameDeck.resolvedSpecialByPlayer[bot.botId] = true;
  delete fameDeck.specialBottomCardId;
  fameDeck.specialBottomSide = "face_down";
  G.log.push({ round: G.round, playerId: bot.botId, message: `FameSpecialResolved(${specialBottomCardId}/bot->face_down)` });
  triggerScoring(G, "bot_king_of_kings", bot.botId);
  return true;
}

export function gainFameCardsForBot(G: GameState, bot: BotState, count: number): string[] {
  const fameDeck = ensureFameDeck(G);
  const gained: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const cardId = fameDeck.available.shift();
    if (cardId) {
      gained.push(cardId);
      bot.botDeck.unshift(cardId);
      continue;
    }
    if (fameDeck.specialBottomCardId) resolveBotKingOfKings(G);
    break;
  }
  if (gained.length > 0) G.log.push({ round: G.round, playerId: bot.botId, message: `BotFameGained(count=${gained.length})` });
  return gained;
}

export function peekFameCards(G: GameState, count: number): string[] {
  const fameDeck = ensureFameDeck(G);
  const visible = fameDeck.available.slice(0, count);
  if (visible.length === 0 && count > 0 && fameDeck.specialBottomCardId) {
    return [fameDeck.specialBottomCardId];
  }
  return visible;
}

export function takeFameCard(G: GameState, playerId: string): string | undefined {
  const fameDeck = ensureFameDeck(G);
  const cardId = fameDeck.available.shift();
  if (cardId) {
    G.players[playerId]?.discard.push(cardId);
    return cardId;
  }

  const specialBottomCardId = fameDeck.specialBottomCardId;
  if (!specialBottomCardId) return undefined;
  if (fameDeck.resolvedSpecialByPlayer[playerId]) {
    G.log.push({ round: G.round, playerId, message: `FameSpecialSkipped(already_resolved/${specialBottomCardId})` });
    return undefined;
  }

  fameDeck.resolvedSpecialByPlayer[playerId] = true;
  resolveSpecialBottomFameRewards(G, playerId, specialBottomCardId);
  if ((fameDeck.specialBottomSide ?? "A") === "A") {
    fameDeck.specialBottomSide = "B";
    G.log.push({ round: G.round, playerId, message: `FameSpecialResolved(${specialBottomCardId}/side=A->B)` });
    return specialBottomCardId;
  }

  delete fameDeck.specialBottomCardId;
  fameDeck.specialBottomSide = "face_down";
  G.log.push({ round: G.round, playerId, message: `FameSpecialResolved(${specialBottomCardId}/side=B->face_down)` });
  triggerScoring(G, "fame_deck_terminal_condition", playerId);
  return specialBottomCardId;
}

export function returnFameCardToTop(G: GameState, cardId: string): void {
  const fameDeck = ensureFameDeck(G);
  fameDeck.available.unshift(cardId);
}
