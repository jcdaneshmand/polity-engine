import type { GameState, ReturnFameSourceZone } from "./state";
import type { BotState } from "../solo/botTypes";
import { gainPlayerResource, takeResourceFromSupply } from "./resources";
import { createCardDrivenDevelopmentChoice } from "./zones";
import { triggerScoring } from "./scoring";
import { currentStateMatches } from "./stateMatching";
import { actualHistorySourceZoneIds } from "./history";
import { detachGarrisonedCard } from "./regions";
import { cardHasSuitIcon } from "./suitIcons";

function ensureFameDeck(G: GameState): NonNullable<GameState["fameDeck"]> {
  G.fameDeck ??= { available: [], resolvedSpecialByPlayer: {} };
  G.fameDeck.resolvedSpecialByPlayer ??= {};
  if (G.fameDeck.specialBottomCardId && !G.fameDeck.specialBottomSide) G.fameDeck.specialBottomSide = "A";
  return G.fameDeck;
}

function kingOfKingsRewardSuppressionState(G: GameState, playerId: string): string | undefined {
  const ruleset = G.activeNationRulesets?.[playerId];
  for (const override of ruleset?.stateOverrides ?? []) {
    if (override.op !== "suppress_king_of_kings_reward") continue;
    if (!override.state || currentStateMatches(G, playerId, override.state)) return override.state ?? "any";
  }
  return undefined;
}

interface FameCardResult {
  cardId?: string;
  deferredDevelopmentEffect?: { trigger: "on_play"; op: "develop"; free: true; sourceCardId: string };
}

function resolveSpecialBottomFameRewards(G: GameState, playerId: string, cardId: string, options: { deferDevelopmentChoice?: boolean } = {}): FameCardResult {
  const suppressedState = kingOfKingsRewardSuppressionState(G, playerId);
  if (suppressedState) {
    G.log.push({ round: G.round, playerId, message: `KingOfKingsRewardSuppressed(${cardId}/${suppressedState})` });
    return {};
  }
  if (currentStateMatches(G, playerId, "uncivilized")) {
    const gained = gainPlayerResource(G, playerId, "knowledge", 6);
    G.log.push({ round: G.round, playerId, message: `KingOfKingsReward(${cardId}/uncivilized/progress=${gained === 6 ? 6 : `${gained}/6`})` });
    return {};
  }
  if (currentStateMatches(G, playerId, "civilized")) {
    const gained = gainPlayerResource(G, playerId, "knowledge", 3);
    G.log.push({ round: G.round, playerId, message: `KingOfKingsReward(${cardId}/civilized/progress=${gained === 3 ? 3 : `${gained}/3`}/free_develop)` });
    if (options.deferDevelopmentChoice) return { deferredDevelopmentEffect: { trigger: "on_play", op: "develop", free: true, sourceCardId: cardId } };
    createCardDrivenDevelopmentChoice(G, playerId, cardId, { free: true });
  }
  return {};
}

function resolveSpecialBottomFameCardResult(G: GameState, playerId: string, options: { deferDevelopmentChoice?: boolean } = {}): FameCardResult {
  const fameDeck = ensureFameDeck(G);
  const specialBottomCardId = fameDeck.specialBottomCardId;
  if (!specialBottomCardId) return {};
  if (fameDeck.specialBottomSide === "face_down") return {};
  if (fameDeck.resolvedSpecialByPlayer[playerId]) {
    G.log.push({ round: G.round, playerId, message: `FameSpecialSkipped(already_resolved/${specialBottomCardId})` });
    return {};
  }

  fameDeck.resolvedSpecialByPlayer[playerId] = true;
  const reward = resolveSpecialBottomFameRewards(G, playerId, specialBottomCardId, options);
  if ((fameDeck.specialBottomSide ?? "A") === "A") {
    fameDeck.specialBottomSide = "B";
    G.log.push({ round: G.round, playerId, message: `FameSpecialResolved(${specialBottomCardId}/side=A->B)` });
    return { cardId: specialBottomCardId, deferredDevelopmentEffect: reward.deferredDevelopmentEffect };
  }

  delete fameDeck.specialBottomCardId;
  fameDeck.specialBottomSide = "face_down";
  G.log.push({ round: G.round, playerId, message: `FameSpecialResolved(${specialBottomCardId}/side=B->face_down)` });
  triggerScoring(G, "fame_deck_terminal_condition", playerId);
  return { cardId: specialBottomCardId, deferredDevelopmentEffect: reward.deferredDevelopmentEffect };
}

function resolveSpecialBottomFameCard(G: GameState, playerId: string): string | undefined {
  return resolveSpecialBottomFameCardResult(G, playerId).cardId;
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
  if (fameDeck.specialBottomSide === "face_down") return false;
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
  if (fameDeck.available.length > 0) return fameDeck.available.slice(0, count);
  if (fameDeck.specialBottomCardId && fameDeck.specialBottomSide !== "face_down" && count > 0) return [fameDeck.specialBottomCardId];
  return [];
}

export function takeFameCard(G: GameState, playerId: string): string | undefined {
  return takeFameCardResult(G, playerId).cardId;
}

export function takeFameCardResult(G: GameState, playerId: string, options: { deferDevelopmentChoice?: boolean } = {}): FameCardResult {
  const fameDeck = ensureFameDeck(G);
  const cardId = fameDeck.available.shift();
  if (cardId) {
    G.players[playerId]?.discard.push(cardId);
    return { cardId };
  }

  return resolveSpecialBottomFameCardResult(G, playerId, options);
}

export function drawFameCard(G: GameState, playerId: string): string | undefined {
  return drawFameCardResult(G, playerId).cardId;
}

export function drawFameCardResult(G: GameState, playerId: string, options: { deferDevelopmentChoice?: boolean } = {}): FameCardResult {
  const fameDeck = ensureFameDeck(G);
  const cardId = fameDeck.available.shift();
  if (cardId) {
    G.players[playerId]?.hand.push(cardId);
    return { cardId };
  }

  return resolveSpecialBottomFameCardResult(G, playerId, options);
}

export function returnFameCardToTop(G: GameState, cardId: string): void {
  const fameDeck = ensureFameDeck(G);
  fameDeck.available.unshift(cardId);
}

export function isFameCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "fame" || card?.cardType === "fame" || card?.type === "fame" || cardHasSuitIcon(card, "fame");
}

function directZoneCardsForReturnFame(G: GameState, playerId: string, zoneId: string): string[] | undefined {
  if (zoneId === "history") {
    const zones = actualHistorySourceZoneIds(G, playerId);
    if (zones.length !== 1 || zones[0] !== "history") return zones.flatMap((zone) => zoneCardsForReturnFame(G, playerId, zone as ReturnFameSourceZone));
  }
  const player = G.players[playerId];
  if (!player) return undefined;
  const direct = (player as unknown as Record<string, unknown>)[zoneId];
  if (Array.isArray(direct)) return direct as string[];
  if (player.sideAreas?.[zoneId]) return player.sideAreas[zoneId];
  if (G.specialZones?.[playerId]?.[zoneId]?.cardIds) return G.specialZones[playerId][zoneId].cardIds;
  if (G.globalSpecialZones?.[zoneId]?.cardIds) return G.globalSpecialZones[zoneId].cardIds;
  return undefined;
}

export function zoneCardsForReturnFame(G: GameState, playerId: string, zoneId: ReturnFameSourceZone): string[] {
  if (zoneId === "exile") {
    const player = G.players[playerId];
    if (!player) return [];
    return [...player.exile, ...(G.globalSpecialZones?.exile?.cardIds ?? [])];
  }
  const cards = directZoneCardsForReturnFame(G, playerId, zoneId);
  if (!cards) return [];
  const garrisonedCardIds = cards.flatMap((hostCardId) => G.cardStates?.[hostCardId]?.garrisonedCardIds ?? []);
  return [...cards, ...garrisonedCardIds];
}

function removeFromReturnFameZone(G: GameState, playerId: string, zoneId: ReturnFameSourceZone, cardId: string): boolean {
  if (zoneId === "exile") {
    const playerExile = G.players[playerId]?.exile;
    const playerIndex = playerExile?.indexOf(cardId) ?? -1;
    if (playerIndex >= 0) {
      playerExile?.splice(playerIndex, 1);
      return true;
    }
    const publicExile = G.globalSpecialZones?.exile?.cardIds;
    const publicIndex = publicExile?.indexOf(cardId) ?? -1;
    if (publicIndex >= 0) {
      publicExile?.splice(publicIndex, 1);
      return true;
    }
    return false;
  }
  const cards = directZoneCardsForReturnFame(G, playerId, zoneId);
  if (!cards) return false;
  const index = cards.indexOf(cardId);
  if (index >= 0) {
    cards.splice(index, 1);
    return true;
  }
  for (const hostCardId of cards) {
    const garrisoned = G.cardStates?.[hostCardId]?.garrisonedCardIds;
    const garrisonedIndex = garrisoned?.indexOf(cardId) ?? -1;
    if (!garrisoned || garrisonedIndex < 0) continue;
    garrisoned.splice(garrisonedIndex, 1);
    return true;
  }
  return Boolean(zoneId === "playArea" && detachGarrisonedCard(G, playerId, cardId));
}

export function returnFameCard(G: GameState, playerId: string, cardId: string, sourceZones: ReturnFameSourceZone[]): ReturnFameSourceZone | undefined {
  if (!G.players[playerId] || !isFameCard(G, cardId)) return undefined;
  for (const zone of sourceZones) {
    const resolvedZones = zone === "history" ? actualHistorySourceZoneIds(G, playerId) : [zone];
    for (const resolvedZone of resolvedZones) {
      if (!removeFromReturnFameZone(G, playerId, resolvedZone as ReturnFameSourceZone, cardId)) continue;
      returnFameCardToTop(G, cardId);
      G.log.push({ round: G.round, playerId, message: `FameReturned(${cardId}/${resolvedZone})` });
      return resolvedZone as ReturnFameSourceZone;
    }
  }
  return undefined;
}
