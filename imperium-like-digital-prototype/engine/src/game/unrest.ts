import type { GameState, ReturnUnrestSourceZone } from "./state";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { triggerCollapse } from "./scoring";
import { actualHistorySourceZoneIds } from "./history";
import { detachGarrisonedCard } from "./regions";
import { cardHasSuitIcon } from "./suitIcons";

function activeRecipients(G: GameState, playerIds: string[]): string[] {
  return playerIds.filter((playerId) => !!G.players[playerId]);
}

function hasPendingInterruption(G: GameState): boolean {
  return Boolean(
    G.pendingChoice
    ?? G.pendingDrawChoice
    ?? G.pendingFindChoice
    ?? G.pendingAcquireChoice
    ?? G.pendingMarketCardChoice
    ?? G.pendingBreakThroughChoice
    ?? G.pendingExileChoice
    ?? G.pendingGarrisonChoice
    ?? G.pendingRegionChoice
    ?? G.pendingRegionChoiceContinuation
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingDiscardChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingReturnFameChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingReturnExhaustTokenChoice
    ?? G.pendingFreePlayChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingSolsticeOrderChoice
    ?? G.pendingCleanupMarketResourceChoice
    ?? G.pendingCleanupDiscardChoice
    ?? G.pendingReactiveExhaustChoice
    ?? G.pendingPlayCardResolution
    ?? G.pendingAcquireCardResolution
    ?? G.pendingAcquireEffectResolution
    ?? G.pendingMarketMoveEffectResolution
    ?? G.pendingBreakThroughEffectResolution
    ?? G.pendingMarketUnrestHookContinuation
    ?? G.pendingNationHookContinuation
    ?? G.pendingPostDevelopmentResolution
    ?? G.pendingReshuffleResolution
    ?? G.pendingAfterReshuffleEffects
    ?? G.pendingReshuffleDraw
    ?? G.pendingTurnEndCleanup
    ?? G.pendingScoringFinalization
    ?? G.pendingScoringLifecycle
    ?? G.pendingCollapseLifecycle
    ?? G.pendingSolsticeContinuation
    ?? G.pendingSolsticeRoundEnd
    ?? G.pendingPracticeMarketExileBeforeCleanup
  );
}

function nextUnrestTakePosition(args: { recipientIndex: number; cardIndex: number; countPerPlayer: number }): { recipientIndex: number; cardIndex: number } {
  const cardIndex = args.cardIndex + 1;
  if (cardIndex < args.countPerPlayer) return { recipientIndex: args.recipientIndex, cardIndex };
  return { recipientIndex: args.recipientIndex + 1, cardIndex: 0 };
}

function takeUnrestFromPosition(
  G: GameState,
  args: { playerId: string; recipientPlayerIds: string[]; countPerPlayer: number; recipientIndex: number; cardIndex: number; taken: number; reactiveTargetPlayerIds?: string[]; randomNumber?: () => number }
): boolean {
  let taken = args.taken;
  const reactiveTargetPlayerIds = args.reactiveTargetPlayerIds ?? [];
  for (let recipientIndex = args.recipientIndex; recipientIndex < args.recipientPlayerIds.length; recipientIndex += 1) {
    const playerId = args.recipientPlayerIds[recipientIndex];
    const player = G.players[playerId];
    const startingCardIndex = recipientIndex === args.recipientIndex ? args.cardIndex : 0;
    for (let cardIndex = startingCardIndex; cardIndex < args.countPerPlayer; cardIndex += 1) {
      const unrestCardId = G.unrestPile?.shift();
      if (!unrestCardId) {
        G.log.push({ round: G.round, playerId: args.playerId, message: `UnrestTaken(players=${args.recipientPlayerIds.join(",")}/count=${args.countPerPlayer}/taken=${taken})` });
        triggerCollapse(G, "unrest_pile_empty", args.playerId);
        return false;
      }
      player.hand.push(unrestCardId);
      taken += 1;
      if (!reactiveTargetPlayerIds.includes(playerId)) reactiveTargetPlayerIds.push(playerId);
      if (!runNationHooks({ G, playerId, trigger: "after_gain_unrest", payload: { cardId: unrestCardId, triggeredBy: args.playerId }, randomNumber: args.randomNumber })) return false;
      if (G.gameover) return false;
      if (hasPendingInterruption(G)) {
        const nextPosition = nextUnrestTakePosition({ recipientIndex, cardIndex, countPerPlayer: args.countPerPlayer });
        G.pendingUnrestTakeContinuation = {
          playerId: args.playerId,
          recipientPlayerIds: args.recipientPlayerIds,
          countPerPlayer: args.countPerPlayer,
          recipientIndex: nextPosition.recipientIndex,
          cardIndex: nextPosition.cardIndex,
          taken,
          reactiveTargetPlayerIds
        };
        return true;
      }
    }
  }
  G.log.push({ round: G.round, playerId: args.playerId, message: `UnrestTaken(players=${args.recipientPlayerIds.join(",")}/count=${args.countPerPlayer}/taken=${taken})` });
  return true;
}

export function takeUnrest(G: GameState, args: { playerIds: string[]; count: number; triggeredBy: string; randomNumber?: () => number }): boolean {
  const recipients = activeRecipients(G, args.playerIds);
  const totalNeeded = recipients.length * args.count;
  const available = G.unrestPile?.length ?? 0;

  if (recipients.length > 1 && available > 0 && available < totalNeeded) {
    const availableUnrestCardIds = G.unrestPile?.splice(0, available) ?? [];
    G.pendingUnrestAllocationChoice = {
      playerId: args.triggeredBy,
      recipientPlayerIds: recipients,
      countPerPlayer: args.count,
      availableUnrestCardIds
    };
    G.log.push({ round: G.round, playerId: args.triggeredBy, message: `UnrestAllocationChoicePending(players=${recipients.join(",")}/count=${args.count}/available=${availableUnrestCardIds.length})` });
    return true;
  }

  return takeUnrestFromPosition(G, {
    playerId: args.triggeredBy,
    recipientPlayerIds: recipients,
    countPerPlayer: args.count,
    recipientIndex: 0,
    cardIndex: 0,
    taken: 0,
    reactiveTargetPlayerIds: [],
    randomNumber: args.randomNumber
  });
}

export function continuePendingUnrestTake(G: GameState, playerId: string, randomNumber?: () => number): { resolved: boolean; completed: boolean; playerId: string; reactiveTargetPlayerIds: string[] } | undefined {
  const pending = G.pendingUnrestTakeContinuation;
  if (!pending || pending.playerId !== playerId || hasPendingInterruption(G) || G.gameover) return undefined;
  const reactiveTargetPlayerIds = [...(pending.reactiveTargetPlayerIds ?? [])];
  G.pendingUnrestTakeContinuation = undefined;
  const resolved = takeUnrestFromPosition(G, { ...pending, reactiveTargetPlayerIds, randomNumber });
  return {
    resolved,
    completed: !G.pendingUnrestTakeContinuation,
    playerId: pending.playerId,
    reactiveTargetPlayerIds
  };
}

export function isUnrestCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "unrest" || card?.cardType === "unrest" || card?.type === "unrest" || cardHasSuitIcon(card, "unrest");
}

function directZoneCardsForReturnUnrest(G: GameState, playerId: string, zoneId: string): string[] | undefined {
  if (zoneId === "history") {
    const zones = actualHistorySourceZoneIds(G, playerId);
    if (zones.length !== 1 || zones[0] !== "history") {
      return zones.flatMap((zone) => zoneCardsForReturnUnrest(G, playerId, zone) ?? []);
    }
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

export function zoneCardsForReturnUnrest(G: GameState, playerId: string, zoneId: string): string[] | undefined {
  if (zoneId === "exile") {
    const player = G.players[playerId];
    if (!player) return undefined;
    return [...player.exile, ...(G.globalSpecialZones?.exile?.cardIds ?? [])];
  }
  const cards = directZoneCardsForReturnUnrest(G, playerId, zoneId);
  if (!cards) return undefined;
  const garrisonedCardIds = cards.flatMap((hostCardId) => G.cardStates?.[hostCardId]?.garrisonedCardIds ?? []);
  return [...cards, ...garrisonedCardIds];
}

function removeFromReturnUnrestZone(G: GameState, playerId: string, zoneId: string, cardId: string): boolean {
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
  const cards = directZoneCardsForReturnUnrest(G, playerId, zoneId);
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

export function returnUnrestCard(G: GameState, playerId: string, cardId: string, sourceZones: ReturnUnrestSourceZone[]): ReturnUnrestSourceZone | undefined {
  const player = G.players[playerId];
  if (!player || !isUnrestCard(G, cardId)) return undefined;
  for (const zone of sourceZones) {
    const resolvedZones = zone === "history" ? actualHistorySourceZoneIds(G, playerId) : [zone];
    for (const resolvedZone of resolvedZones) {
      if (!removeFromReturnUnrestZone(G, playerId, resolvedZone, cardId)) continue;
      G.unrestPile ??= [];
      G.unrestPile.push(cardId);
      G.log.push({ round: G.round, playerId, message: `UnrestReturned(${cardId}/${resolvedZone})` });
      return resolvedZone as ReturnUnrestSourceZone;
    }
  }
  return undefined;
}

export function resolvePendingUnrestAllocationChoice(G: GameState, playerId: string, recipientPlayerIds: string[], randomNumber?: () => number): boolean {
  const pending = G.pendingUnrestAllocationChoice;
  if (!pending || pending.playerId !== playerId) return false;
  if (recipientPlayerIds.length !== pending.availableUnrestCardIds.length) return false;

  const counts: Record<string, number> = {};
  for (const recipientPlayerId of recipientPlayerIds) {
    if (!pending.recipientPlayerIds.includes(recipientPlayerId) || !G.players[recipientPlayerId]) return false;
    counts[recipientPlayerId] = (counts[recipientPlayerId] ?? 0) + 1;
    if (counts[recipientPlayerId] > pending.countPerPlayer) return false;
  }

  G.pendingUnrestAllocationChoice = undefined;
  return resolveUnrestAllocationFromIndex(G, {
    playerId,
    recipientPlayerIds,
    availableUnrestCardIds: pending.availableUnrestCardIds,
    nextIndex: 0,
    randomNumber
  });
}

function resolveUnrestAllocationFromIndex(
  G: GameState,
  args: { playerId: string; recipientPlayerIds: string[]; availableUnrestCardIds: string[]; nextIndex: number; randomNumber?: () => number; rollbackSnapshot?: GameState }
): boolean {
  for (let index = args.nextIndex; index < args.availableUnrestCardIds.length; index += 1) {
    const recipientPlayerId = args.recipientPlayerIds[index];
    const unrestCardId = args.availableUnrestCardIds[index];
    G.players[recipientPlayerId].hand.push(unrestCardId);
    if (!runNationHooks({ G, playerId: recipientPlayerId, trigger: "after_gain_unrest", payload: { cardId: unrestCardId, triggeredBy: args.playerId }, randomNumber: args.randomNumber })) return false;
    if (G.gameover) return true;
    if (hasPendingInterruption(G)) {
      G.pendingUnrestAllocationResolution = { ...args, nextIndex: index + 1 };
      return true;
    }
  }
  G.log.push({ round: G.round, playerId: args.playerId, message: `UnrestAllocationResolved(players=${args.recipientPlayerIds.join(",")}/taken=${args.recipientPlayerIds.length})` });
  triggerCollapse(G, "unrest_pile_empty", args.playerId);
  return true;
}

export function continuePendingUnrestAllocationResolution(G: GameState, playerId: string, randomNumber?: () => number): boolean | undefined {
  const pending = G.pendingUnrestAllocationResolution;
  if (!pending || pending.playerId !== playerId || hasPendingInterruption(G) || G.gameover) return undefined;
  G.pendingUnrestAllocationResolution = undefined;
  return resolveUnrestAllocationFromIndex(G, { ...pending, randomNumber });
}
