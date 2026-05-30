import type { GameState, ReturnUnrestSourceZone } from "./state";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { triggerCollapse } from "./scoring";

function activeRecipients(G: GameState, playerIds: string[]): string[] {
  return playerIds.filter((playerId) => !!G.players[playerId]);
}

function hasPendingInterruption(G: GameState): boolean {
  return Boolean(
    G.pendingChoice
    ?? G.pendingDrawChoice
    ?? G.pendingFindChoice
    ?? G.pendingAcquireChoice
    ?? G.pendingBreakThroughChoice
    ?? G.pendingExileChoice
    ?? G.pendingGarrisonChoice
    ?? G.pendingRegionChoice
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingUnrestAllocationChoice
  );
}

function nextUnrestTakePosition(args: { recipientIndex: number; cardIndex: number; countPerPlayer: number }): { recipientIndex: number; cardIndex: number } {
  const cardIndex = args.cardIndex + 1;
  if (cardIndex < args.countPerPlayer) return { recipientIndex: args.recipientIndex, cardIndex };
  return { recipientIndex: args.recipientIndex + 1, cardIndex: 0 };
}

function takeUnrestFromPosition(
  G: GameState,
  args: { playerId: string; recipientPlayerIds: string[]; countPerPlayer: number; recipientIndex: number; cardIndex: number; taken: number }
): boolean {
  let taken = args.taken;
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
      player.discard.push(unrestCardId);
      taken += 1;
      runNationHooks({ G, playerId, trigger: "after_gain_unrest", payload: { cardId: unrestCardId, triggeredBy: args.playerId } });
      if (G.gameover) return false;
      if (hasPendingInterruption(G)) {
        const nextPosition = nextUnrestTakePosition({ recipientIndex, cardIndex, countPerPlayer: args.countPerPlayer });
        G.pendingUnrestTakeContinuation = {
          playerId: args.playerId,
          recipientPlayerIds: args.recipientPlayerIds,
          countPerPlayer: args.countPerPlayer,
          recipientIndex: nextPosition.recipientIndex,
          cardIndex: nextPosition.cardIndex,
          taken
        };
        return true;
      }
    }
  }
  G.log.push({ round: G.round, playerId: args.playerId, message: `UnrestTaken(players=${args.recipientPlayerIds.join(",")}/count=${args.countPerPlayer}/taken=${taken})` });
  return true;
}

export function takeUnrest(G: GameState, args: { playerIds: string[]; count: number; triggeredBy: string }): boolean {
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
    taken: 0
  });
}

export function continuePendingUnrestTake(G: GameState, playerId: string): boolean {
  const pending = G.pendingUnrestTakeContinuation;
  if (!pending || pending.playerId !== playerId || hasPendingInterruption(G) || G.gameover) return false;
  G.pendingUnrestTakeContinuation = undefined;
  return takeUnrestFromPosition(G, pending);
}

export function isUnrestCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "unrest" || card?.cardType === "unrest" || card?.type === "unrest";
}

export function returnUnrestCard(G: GameState, playerId: string, cardId: string, sourceZones: ReturnUnrestSourceZone[]): ReturnUnrestSourceZone | undefined {
  const player = G.players[playerId];
  if (!player || !isUnrestCard(G, cardId)) return undefined;
  for (const zone of sourceZones) {
    const index = player[zone].indexOf(cardId);
    if (index < 0) continue;
    player[zone].splice(index, 1);
    G.unrestPile ??= [];
    G.unrestPile.push(cardId);
    G.log.push({ round: G.round, playerId, message: `UnrestReturned(${cardId}/${zone})` });
    return zone;
  }
  return undefined;
}

export function resolvePendingUnrestAllocationChoice(G: GameState, playerId: string, recipientPlayerIds: string[]): boolean {
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
    nextIndex: 0
  });
}

function resolveUnrestAllocationFromIndex(
  G: GameState,
  args: { playerId: string; recipientPlayerIds: string[]; availableUnrestCardIds: string[]; nextIndex: number }
): boolean {
  for (let index = args.nextIndex; index < args.availableUnrestCardIds.length; index += 1) {
    const recipientPlayerId = args.recipientPlayerIds[index];
    const unrestCardId = args.availableUnrestCardIds[index];
    G.players[recipientPlayerId].discard.push(unrestCardId);
    runNationHooks({ G, playerId: recipientPlayerId, trigger: "after_gain_unrest", payload: { cardId: unrestCardId, triggeredBy: args.playerId } });
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

export function continuePendingUnrestAllocationResolution(G: GameState, playerId: string): boolean {
  const pending = G.pendingUnrestAllocationResolution;
  if (!pending || pending.playerId !== playerId || hasPendingInterruption(G) || G.gameover) return false;
  G.pendingUnrestAllocationResolution = undefined;
  return resolveUnrestAllocationFromIndex(G, pending);
}
