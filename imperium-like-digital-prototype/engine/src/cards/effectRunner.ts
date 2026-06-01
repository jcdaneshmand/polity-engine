import type { DrawSourceZone, Effect, EffectTrigger, FindSourceZone, GameState, LookSourceZone, PlaceOnDeckSourceZone, PlayerExileSource, PlayerState, ReactiveExhaustCondition, ResourceName, ReturnUnrestSourceZone, Suit, SwapSourceZone, ZoneName } from "../game/state";
import { canUseDevelopmentArea, createCardDrivenDevelopmentChoice, drawCard, drawCardWithReshuffleLifecycle } from "../game/zones";
import { breakThrough, visibleTributaryBreakThroughCards } from "../game/breakThrough";
import { canPayResourceCosts, canPayResourceCost, payResourceCost, payResourceCosts } from "../game/payments";
import { acquireFromExile, availableExileCards, exileMarketCard, exilePlayerCard, playerCardOrGarrisonHasTokens, playerExileSourceCards } from "../game/exile";
import { acquireMarketCard, gainMarketCard, takeMarketCard } from "../game/marketAcquire";
import { drawFameCard, peekFameCards, takeFameCard } from "../game/fame";
import { isUnrestCard, returnUnrestCard, takeUnrest, zoneCardsForReturnUnrest } from "../game/unrest";
import { placeCardOnDeck } from "../game/deckPlacement";
import { giveCardToPlayer } from "../game/giveCard";
import { availableSwapChoices, swapCardWithMarket } from "../game/swap";
import { cardHasSuitIcon } from "../game/suitIcons";
import { abandonRegionToDiscard, collectAndClearCardStateToPlayer, collectCardResourcesToPlayer, detachGarrisonedCard, detachGarrisonedCards, garrisonCardOnRegion, garrisonedCardsInPlay, isRegionCard, recallRegionToHand } from "../game/regions";
import { addResourceAmount, canonicalResourceName, gainPlayerResource, resourceAmount, returnResourceToSupply, setResourceAmount, takeResourceFromSupply } from "../game/resources";
import { triggerScoring } from "../game/scoring";
import { currentStateMatches } from "../game/stateMatching";
import { isAccessionCard, lookableNationDeckCards } from "../game/nationDeck";
import { actualHistorySourceZoneIds, moveCardsToHistoryDestination } from "../game/history";
import { deckForSuit } from "../game/marketRefill";

interface Ctx {
  G: GameState;
  playerId: string;
  selfCardId?: string;
  randomNumber?: () => number;
  enabledExpansions?: string[];
}

type ResumablePendingChoice =
  | NonNullable<GameState["pendingChoice"]>
  | NonNullable<GameState["pendingDrawChoice"]>
  | NonNullable<GameState["pendingFindChoice"]>
  | NonNullable<GameState["pendingAcquireChoice"]>
  | NonNullable<GameState["pendingMarketCardChoice"]>
  | NonNullable<GameState["pendingBreakThroughChoice"]>
  | NonNullable<GameState["pendingExileChoice"]>
  | NonNullable<GameState["pendingGarrisonChoice"]>
  | NonNullable<GameState["pendingRegionChoice"]>
  | NonNullable<GameState["pendingDevelopmentChoice"]>
  | NonNullable<GameState["pendingShortGameDevelopmentExileChoice"]>
  | NonNullable<GameState["pendingTradeChoice"]>
  | NonNullable<GameState["pendingDiscardChoice"]>
  | NonNullable<GameState["pendingReturnUnrestChoice"]>
  | NonNullable<GameState["pendingPlaceOnDeckChoice"]>
  | NonNullable<GameState["pendingGiveCardChoice"]>
  | NonNullable<GameState["pendingSwapChoice"]>
  | NonNullable<GameState["pendingLookOrderChoice"]>
  | NonNullable<GameState["pendingUnrestAllocationChoice"]>
  | NonNullable<GameState["pendingReactiveExhaustChoice"]>;

function pendingEffectInterruption(G: GameState): ResumablePendingChoice | undefined {
  return G.pendingChoice
    ?? G.pendingDrawChoice
    ?? G.pendingFindChoice
    ?? G.pendingAcquireChoice
    ?? G.pendingMarketCardChoice
    ?? G.pendingBreakThroughChoice
    ?? G.pendingExileChoice
    ?? G.pendingGarrisonChoice
    ?? G.pendingRegionChoice
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingDiscardChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingReactiveExhaustChoice;
}

function isTradeExpansionDisabled(ctx: Ctx): boolean {
  return !(ctx.enabledExpansions ?? ctx.G.options?.enabledExpansions ?? []).includes("trade_routes");
}

function removeOneCard(cards: string[], target: string): void {
  const index = cards.indexOf(target);
  if (index >= 0) cards.splice(index, 1);
}

function cardResourceCount(G: GameState, cardId: string, resource: "goods"): number {
  return G.cardStates?.[cardId]?.resources?.[resource] ?? 0;
}

function canGainResourceFromSupply(G: GameState, resource: ResourceName, amount: number): boolean {
  const canonical = canonicalResourceName(resource);
  if (amount <= 0) return false;
  return !G.resourceSupply || (G.resourceSupply[canonical] ?? 0) > 0;
}

function isCardExhausted(G: GameState, cardId: string): boolean {
  const state = G.cardStates?.[cardId];
  return state?.exhausted === true || (state?.exhaustTokens ?? 0) > 0;
}

function reactiveCondition(effect: Effect): ReactiveExhaustCondition | undefined {
  return (effect as Effect & { reactive?: ReactiveExhaustCondition }).reactive;
}

type ReactiveExhaustEvent =
  | { trigger: "after_gain_resource"; resource?: ResourceName }
  | { trigger: "after_take_unrest"; targetPlayerId: string }
  | { trigger: "after_acquire_card"; targetPlayerId: string };

function conditionMatchesReactiveExhaust(condition: ReactiveExhaustCondition | undefined, event: ReactiveExhaustEvent, ownerPlayerId: string): boolean {
  if (!condition || condition.trigger !== event.trigger) return false;
  if (condition.trigger === "after_gain_resource" && event.trigger === "after_gain_resource") {
    return !condition.resource || condition.resource === event.resource;
  }
  if (condition.trigger === "after_take_unrest" && event.trigger === "after_take_unrest") {
    const target = condition.target ?? "any";
    if (target === "self") return event.targetPlayerId === ownerPlayerId;
    if (target === "opponent") return event.targetPlayerId !== ownerPlayerId;
    return true;
  }
  if (condition.trigger === "after_acquire_card" && event.trigger === "after_acquire_card") {
    const target = condition.target ?? "any";
    if (target === "self") return event.targetPlayerId === ownerPlayerId;
    if (target === "opponent") return event.targetPlayerId !== ownerPlayerId;
    return true;
  }
  return false;
}

function reactiveExhaustCardsForEvent(ctx: Ctx, event: ReactiveExhaustEvent): { playerId: string; cardIds: string[] } | undefined {
  if ((ctx.G.currentTurnType ?? "activate") !== "activate") return undefined;
  for (const [playerId, player] of Object.entries(ctx.G.players)) {
    if (player.exhaustTokensAvailable < 1) continue;
    const candidateCardIds = [...player.playArea, ...player.powerArea].filter((cardId) =>
      !isCardExhausted(ctx.G, cardId)
        && (ctx.G.cardDb[cardId]?.effects ?? []).some((effect) =>
          effect.trigger === "on_exhaust"
            && conditionMatchesReactiveExhaust(reactiveCondition(effect), event, playerId)
            && canResolveEffectText({ ...ctx, playerId }, effect)
        )
    );
    if (candidateCardIds.length > 0) return { playerId, cardIds: candidateCardIds };
  }
  return undefined;
}

export function createReactiveExhaustChoice(ctx: Ctx, event: ReactiveExhaustEvent): void {
  if (pendingEffectInterruption(ctx.G)) return;
  const candidates = reactiveExhaustCardsForEvent(ctx, event);
  if (!candidates) return;
  ctx.G.pendingReactiveExhaustChoice = {
    playerId: candidates.playerId,
    cardIds: candidates.cardIds,
    resolvingPlayerId: ctx.playerId,
    sourceCardId: ctx.selfCardId,
    trigger: event.trigger,
    ...(event.trigger === "after_gain_resource" ? { resource: event.resource } : {}),
    ...("targetPlayerId" in event ? { targetPlayerId: event.targetPlayerId } : {})
  };
  const detail = event.trigger === "after_gain_resource" ? event.resource ?? "any" : event.targetPlayerId;
  ctx.G.log.push({ round: ctx.G.round, playerId: candidates.playerId, message: `ReactiveExhaustPending(${event.trigger}/${detail}/options=${candidates.cardIds.length})` });
}

function addCardResource(G: GameState, cardId: string, resource: "goods", amount: number): void {
  if (amount <= 0) return;
  G.cardStates ??= {};
  G.cardStates[cardId] ??= {};
  G.cardStates[cardId].resources ??= {};
  G.cardStates[cardId].resources[resource] = (G.cardStates[cardId].resources[resource] ?? 0) + amount;
}

function collectAndClearCardResources(G: GameState, playerId: string, cardId: string): void {
  collectCardResourcesToPlayer(G, playerId, cardId);
  if (G.cardStates?.[cardId]?.resources) G.cardStates[cardId].resources = {};
}

function isTradeRoute(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.suit === "trade_route" || card?.cardType === "trade_route" || card?.type === "trade_route";
}

function tradeRouteOwner(G: GameState, routeCardId: string): string | undefined {
  return Object.entries(G.players).find(([, player]) => player.playArea.includes(routeCardId))?.[0];
}

function availableTradeRoutes(G: GameState, playerId: string): string[] {
  const player = G.players[playerId];
  const ownRoutes = player.playArea.filter((cardId) => isTradeRoute(G, cardId) && cardResourceCount(G, cardId, "goods") < 3 && (player.resources.goods ?? 0) > 0);
  const opponentRoutes = Object.entries(G.players)
    .filter(([candidatePlayerId]) => candidatePlayerId !== playerId)
    .flatMap(([, opponent]) => opponent.playArea.filter((cardId) => isTradeRoute(G, cardId) && cardResourceCount(G, cardId, "goods") < 3));
  return [...ownRoutes, ...opponentRoutes];
}

function runCommerceEffects(ctx: Ctx, tradeRouteCardId: string, ownerPlayerId = ctx.playerId): boolean {
  const effects = (ctx.G.cardDb[tradeRouteCardId]?.effects ?? []).filter((candidate): candidate is Extract<Effect, { op: "commerce" }> => {
    return candidate.trigger === "on_play" && candidate.op === "commerce";
  });
  return runEffects({ ...ctx, playerId: ownerPlayerId, selfCardId: tradeRouteCardId }, effects);
}

export function resolvePendingTradeChoice(G: GameState, playerId: string, routeCardId?: string): boolean {
  const pending = G.pendingTradeChoice;
  if (!pending || pending.playerId !== playerId) return false;
  const p = G.players[playerId];
  if (!routeCardId) {
    if (!pending.allowGoodsForProgress || (p.resources.goods ?? 0) <= 0) return false;
    if (!canGainResourceFromSupply(G, "knowledge", 1)) return false;
    p.resources.goods -= 1;
    returnResourceToSupply(G, "goods", 1);
    gainPlayerResource(G, playerId, "knowledge", 1);
    G.pendingTradeChoice = undefined;
    G.log.push({ round: G.round, playerId, message: "TradeChoiceResolved(goods_to_progress)" });
    return true;
  }
  const ownerPlayerId = tradeRouteOwner(G, routeCardId);
  if (!pending.routeCardIds.includes(routeCardId) || !ownerPlayerId || !availableTradeRoutes(G, playerId).includes(routeCardId)) return false;
  if (ownerPlayerId === playerId) {
    if ((p.resources.goods ?? 0) <= 0) return false;
    p.resources.goods -= 1;
    addCardResource(G, routeCardId, "goods", 1);
  } else {
    gainPlayerResource(G, playerId, "knowledge", 1);
    addCardResource(G, routeCardId, "goods", takeResourceFromSupply(G, "goods", 1));
  }
  G.pendingTradeChoice = undefined;
  G.log.push({ round: G.round, playerId, message: `TradeChoiceResolved(${ownerPlayerId === playerId ? "own" : "opponent"}_route/${routeCardId})` });
  return runCommerceEffects({ G, playerId, selfCardId: pending.sourceCardId, enabledExpansions: G.options?.enabledExpansions }, routeCardId, playerId);
}

function shuffleWithRandom<T>(items: T[], randomNumber?: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const roll = randomNumber ? randomNumber() : 0;
    const j = Math.floor(roll * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type FindZone = FindSourceZone;

function resolvedFindZones(G: GameState, playerId: string, zone: FindZone): string[] {
  return zone === "history" ? actualHistorySourceZoneIds(G, playerId) : [zone];
}

function findZoneCards(G: GameState, playerId: string, zone: string): string[] {
  if (zone === "garrison") return garrisonedCardsInPlay(G, playerId);
  const player = G.players[playerId];
  const direct = (player as unknown as Record<string, unknown>)[zone];
  if (Array.isArray(direct)) return direct as string[];
  if (player.sideAreas?.[zone]) return player.sideAreas[zone];
  if (G.specialZones?.[playerId]?.[zone]?.cardIds) return G.specialZones[playerId][zone].cardIds;
  if (G.globalSpecialZones?.[zone]?.cardIds) return G.globalSpecialZones[zone].cardIds;
  return [];
}

function removeFromFindZone(G: GameState, playerId: string, zone: string, cardId: string): boolean {
  const cards = findZoneCards(G, playerId, zone);
  const index = cards.indexOf(cardId);
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

function moveFoundCard(G: GameState, playerId: string, fromZone: string, destination: ZoneName, cardId: string): string | undefined {
  if (fromZone === destination) return destination;
  if (fromZone === "garrison") {
    if (!detachGarrisonedCard(G, playerId, cardId)) return undefined;
    collectAndClearCardStateToPlayer(G, playerId, cardId);
  } else if (!removeFromFindZone(G, playerId, fromZone, cardId)) return undefined;
  if (destination === "history") return moveCardsToHistoryDestination(G, playerId, [cardId]);
  G.players[playerId][destination].push(cardId);
  return destination;
}

function cardMatchesFindCriteria(G: GameState, cardId: string, effect: Extract<Effect, { op: "find_card" }>): boolean {
  const card = G.cardDb[cardId];
  if (!card) return false;
  if (effect.cardId) return cardId === effect.cardId;
  if (effect.suit && !cardHasSuitIcon(card, effect.suit)) return false;
  if (effect.cardType && (card.cardType ?? card.type) !== effect.cardType) return false;
  return Boolean(effect.suit || effect.cardType);
}

function cardMatchesAcquireCriteria(G: GameState, cardId: string, effect: Extract<Effect, { op: "acquire_card" }>): boolean {
  const card = G.cardDb[cardId];
  if (!card) return false;
  if (effect.cardId && cardId !== effect.cardId) return false;
  if (effect.suit && !cardHasSuitIcon(card, effect.suit)) return false;
  if (effect.cardType && (card.cardType ?? card.type) !== effect.cardType) return false;
  return true;
}

function marketCardCanBeExiled(G: GameState, cardId: string): boolean {
  return Object.values(G.marketResources?.[cardId] ?? {}).every((amount) => (amount ?? 0) <= 0);
}

function cardMatchesExileCriteria(G: GameState, cardId: string, effect: Extract<Effect, { op: "exile_card" }>, source: Extract<Effect, { op: "exile_card" }>["source"]): boolean {
  const card = G.cardDb[cardId];
  if (!card) return false;
  if (source === "market" && !marketCardCanBeExiled(G, cardId)) return false;
  if (source !== "market" && playerCardOrGarrisonHasTokens(G, cardId)) return false;
  if (effect.cardId && cardId !== effect.cardId) return false;
  if (effect.suit && !cardHasSuitIcon(card, effect.suit)) return false;
  if (effect.cardType && (card.cardType ?? card.type) !== effect.cardType) return false;
  return true;
}

function remainingAcquireEffect(effect: Extract<Effect, { op: "acquire_card" }>, completedCount: number): Effect[] | undefined {
  const remainingCount = effect.count - completedCount;
  if (remainingCount <= 0) return undefined;
  return [{ ...effect, count: remainingCount }];
}

function cardMatchesMarketMoveCriteria(G: GameState, cardId: string, effect: Extract<Effect, { op: "gain_card" | "take_card" }>): boolean {
  const card = G.cardDb[cardId];
  if (!card || effect.source !== "market") return false;
  if (effect.cardId && cardId !== effect.cardId) return false;
  if (effect.suit && !cardHasSuitIcon(card, effect.suit)) return false;
  if (effect.cardType && (card.cardType ?? card.type) !== effect.cardType) return false;
  return true;
}

function matchingMarketMoveCards(G: GameState, effect: Extract<Effect, { op: "gain_card" | "take_card" }>): string[] {
  return G.market.filter((marketCardId) => cardMatchesMarketMoveCriteria(G, marketCardId, effect));
}

function remainingMarketMoveEffect(effect: Extract<Effect, { op: "gain_card" | "take_card" }>, completedCount: number): Effect[] | undefined {
  const remainingCount = effect.count - completedCount;
  if (remainingCount <= 0) return undefined;
  return [{ ...effect, cardId: undefined, count: remainingCount }];
}

function cardMatchesBreakThroughCriteria(G: GameState, cardId: string, effect: Extract<Effect, { op: "break_through" }>): boolean {
  return cardHasSuitIcon(G.cardDb[cardId], effect.suit);
}

function remainingBreakThroughEffect(effect: Extract<Effect, { op: "break_through" }>, completedCount: number): Effect[] | undefined {
  const remainingCount = effect.count - completedCount;
  if (remainingCount <= 0) return undefined;
  return [{ ...effect, count: remainingCount }];
}

function matchingMarketBreakThroughCards(G: GameState, effect: Extract<Effect, { op: "break_through" }>): string[] {
  return G.market.filter((marketCardId) => cardMatchesBreakThroughCriteria(G, marketCardId, effect));
}

function remainingExileEffect(effect: Extract<Effect, { op: "exile_card" }>, completedCount: number): Effect[] | undefined {
  const remainingCount = (effect.count ?? 1) - completedCount;
  if (remainingCount <= 0) return undefined;
  return [{ ...effect, count: remainingCount }];
}

function isPlayerExileSource(source: Extract<Effect, { op: "exile_card" }>["source"]): source is PlayerExileSource {
  return source !== "market";
}

function shuffleFindDeckIfNeeded(G: GameState, playerId: string, zone: "deck" | "nationDeck", randomNumber?: () => number): void {
  const player = G.players[playerId];
  if (zone === "deck") {
    player.deck = shuffleWithRandom(player.deck, randomNumber);
    G.log.push({ round: G.round, playerId, message: "FindShuffled(deck)" });
    return;
  }
  const accessionCards = player.nationDeck.filter((cardId) => isAccessionCard(G, player, cardId));
  const searchableCards = player.nationDeck.filter((cardId) => !isAccessionCard(G, player, cardId));
  player.nationDeck = [...shuffleWithRandom(searchableCards, randomNumber), ...accessionCards];
  G.log.push({ round: G.round, playerId, message: "FindShuffled(nationDeck)" });
}

function searchableFindCards(G: GameState, playerId: string, player: PlayerState, zone: string): string[] {
  if (zone !== "nationDeck") return [...findZoneCards(G, playerId, zone)];
  return player.nationDeck.filter((cardId) => !isAccessionCard(G, player, cardId));
}

function lookableCards(G: GameState, player: PlayerState, source: LookSourceZone): string[] {
  if (source === "deck") return [...player.deck];
  if (source === "nationDeck") return lookableNationDeckCards(G, player);
  return peekFameCards(G, Number.MAX_SAFE_INTEGER);
}

function drawSourceCards(G: GameState, playerId: string, player: PlayerState, source: Exclude<DrawSourceZone, "deck" | "fameDeck">): string[] {
  if (source === "exile") return availableExileCards(G, playerId);
  return player[source];
}

function startFaceUpDrawChoice(ctx: Ctx, source: Exclude<DrawSourceZone, "deck" | "fameDeck">, count: number): void {
  const cardIds = [...drawSourceCards(ctx.G, ctx.playerId, ctx.G.players[ctx.playerId], source)];
  if (cardIds.length === 0 || count <= 0) {
    ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `DrawSkipped(source=${source}/empty)` });
    return;
  }
  const remainingCount = Math.min(count, cardIds.length);
  ctx.G.pendingDrawChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, source, cardIds, remainingCount };
  ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `DrawChoicePending(${ctx.selfCardId ?? "unknown"}/source=${source}/options=${cardIds.length}/remaining=${remainingCount})` });
}

function runLookCards(ctx: Ctx, effect: Extract<Effect, { op: "look_cards" }>): void {
  const cardIds = lookableCards(ctx.G, ctx.G.players[ctx.playerId], effect.source).slice(0, Math.max(0, effect.count));
  ctx.G.lookedCards = { playerId: ctx.playerId, source: effect.source, cardIds };
  if (cardIds.length > 1) {
    ctx.G.pendingLookOrderChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, source: effect.source, cardIds };
  }
  ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `LookResolved(${effect.source}/count=${cardIds.length})` });
}

function runFindCard(ctx: Ctx, effect: Extract<Effect, { op: "find_card" }>): void {
  const player = ctx.G.players[ctx.playerId];
  const zones: FindZone[] = effect.sourceZones?.length ? effect.sourceZones : ["hand", "discard", "deck", "nationDeck"];

  if (effect.cardId) {
    for (const zone of zones) {
      for (const resolvedZone of resolvedFindZones(ctx.G, ctx.playerId, zone)) {
        const found = searchableFindCards(ctx.G, ctx.playerId, player, resolvedZone).includes(effect.cardId);
        if (resolvedZone === "deck" || resolvedZone === "nationDeck") shuffleFindDeckIfNeeded(ctx.G, ctx.playerId, resolvedZone, ctx.randomNumber);
        if (!found) continue;
        const destination = moveFoundCard(ctx.G, ctx.playerId, resolvedZone, effect.destination, effect.cardId);
        if (!destination) continue;
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `FindResolved(${effect.cardId}/${resolvedZone}->${destination})` });
        return;
      }
    }
    ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `FindMissed(${effect.cardId})` });
    return;
  }

  const cardIds: string[] = [];
  for (const zone of zones) {
    for (const resolvedZone of resolvedFindZones(ctx.G, ctx.playerId, zone)) {
      for (const cardId of searchableFindCards(ctx.G, ctx.playerId, player, resolvedZone)) {
        if (cardMatchesFindCriteria(ctx.G, cardId, effect) && !cardIds.includes(cardId)) cardIds.push(cardId);
      }
      if (resolvedZone === "deck" || resolvedZone === "nationDeck") shuffleFindDeckIfNeeded(ctx.G, ctx.playerId, resolvedZone, ctx.randomNumber);
    }
  }
  if (cardIds.length > 0) {
    ctx.G.pendingFindChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, cardIds, destination: effect.destination };
    ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `FindChoicePending(${ctx.selfCardId ?? "unknown"}/options=${cardIds.length})` });
    return;
  }
  ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "FindMissed(criteria)" });
}

function drawFameCards(ctx: Ctx, count: number): void {
  const drawn: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const cardId = drawFameCard(ctx.G, ctx.playerId);
    if (!cardId) break;
    drawn.push(cardId);
    if (ctx.G.gameover || pendingEffectInterruption(ctx.G)) break;
  }
  ctx.G.log.push({
    round: ctx.G.round,
    playerId: ctx.playerId,
    message: `FameDrawn(${ctx.selfCardId ?? "unknown"}/count=${count}/drawn=${drawn.length > 0 ? drawn.join(",") : "none"})`
  });
}

function createPendingRegionChoice(ctx: Ctx, op: "recall_region" | "abandon_region"): void {
  const p = ctx.G.players[ctx.playerId];
  const cardIds = [
    ...p.playArea,
    ...garrisonedCardsInPlay(ctx.G, ctx.playerId)
  ].filter((cardId) => isRegionCard(ctx.G, cardId));
  if (cardIds.length === 0) {
    ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `RegionChoiceSkipped(${op}/no_eligible_regions)` });
    return;
  }
  ctx.G.pendingRegionChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, op, cardIds };
  ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `RegionChoicePending(${ctx.selfCardId ?? "unknown"}/${op}/options=${cardIds.length})` });
}

function defaultGarrisonHostCardIds(ctx: Ctx): string[] {
  if (ctx.selfCardId && ctx.G.players[ctx.playerId].playArea.includes(ctx.selfCardId) && isRegionCard(ctx.G, ctx.selfCardId)) {
    return [ctx.selfCardId];
  }
  return ctx.G.players[ctx.playerId].playArea.filter((cardId) => isRegionCard(ctx.G, cardId));
}

function explicitSpendCost(effects: Effect[]): Partial<Record<ResourceName, number>> {
  const cost: Partial<Record<ResourceName, number>> = {};
  for (const effect of effects) {
    if (effect.op !== "spend_resource") continue;
    cost[effect.resource] = (cost[effect.resource] ?? 0) + effect.amount;
  }
  return cost;
}

function removeExplicitSpendEffects(effects: Effect[]): Effect[] {
  return effects.filter((effect) => effect.op !== "spend_resource");
}

function positiveResourceCostEntries(cost: Partial<Record<ResourceName, number>>): Array<[ResourceName, number]> {
  return (Object.entries(cost) as Array<[ResourceName, number | undefined]>)
    .filter(([, amount]) => (amount ?? 0) > 0)
    .map(([resource, amount]) => [resource, amount ?? 0]);
}

function canCreatePlayerChoice(effect: Effect): boolean {
  return [
    "optional",
    "choose_one",
    "draw",
    "find_card",
    "acquire_card",
    "gain_card",
    "take_card",
    "break_through",
    "exile_card",
    "garrison_card",
    "recall_region",
    "abandon_region",
    "develop",
    "trade",
    "return_unrest",
    "place_card_on_deck",
    "give_card",
    "swap_card",
    "look_cards",
    "take_unrest"
  ].includes(effect.op);
}

function firstChoiceBoundary(effects: Effect[]): number {
  return effects.findIndex(canCreatePlayerChoice);
}

function costPaymentPrefix(effects: Effect[]): Effect[] {
  const boundary = firstChoiceBoundary(effects);
  return boundary < 0 ? effects : effects.slice(0, boundary);
}

function orderedEffectsAfterPrefixPayment(effects: Effect[], prefix: Effect[]): Effect[] {
  if (prefix.length === 0) return effects;
  return [...removeExplicitSpendEffects(prefix), ...effects.slice(prefix.length)];
}

function hasUnpaidExplicitCost(ctx: Ctx, effects: Effect[]): boolean {
  return !canPayResourceCosts(ctx.G, ctx.playerId, explicitSpendCost(effects));
}

function canPayAnyDevelopmentCard(G: GameState, playerId: string): boolean {
  if (!canUseDevelopmentArea(G, playerId)) return false;
  const p = G.players[playerId];
  return p.developmentArea.some((cardId) => canPayResourceCosts(G, playerId, G.cardDb[cardId]?.developmentCost ?? {}));
}

function canSpendProgressionToken(player: PlayerState): boolean {
  const tokens = player.progressionTokens ?? { nationDeck: 0, developmentArea: 0 };
  return tokens.nationDeck <= 0 && tokens.developmentArea <= 0 && player.exhaustTokensAvailable > 0;
}

function canDevelopBeforeNationDeckEmpty(G: GameState, playerId: string): boolean {
  if (!canUseDevelopmentArea(G, playerId)) return false;
  const ruleset = G.activeNationRulesets?.[playerId];
  return (ruleset?.reshuffleOverrides ?? []).some((ov) => ov.op === "development_available_from_start")
    || (ruleset?.rulesetTags ?? []).includes("development_area_available_from_start");
}

function canDrawAtLeastOneCardOrReshuffle(G: GameState, playerId: string): boolean {
  const p = G.players[playerId];
  if (p.deck.length > 0 || p.discard.length > 0) return true;
  if (!canSpendProgressionToken(p)) return false;

  const ruleset = G.activeNationRulesets?.[playerId];
  const skipsDefaultNationProgression = (ruleset?.reshuffleOverrides ?? []).some((ov) => ov.op === "skip_default_nation_card_addition");
  if (canDevelopBeforeNationDeckEmpty(G, playerId) && canPayAnyDevelopmentCard(G, playerId)) return true;
  if (skipsDefaultNationProgression) return false;
  return p.nationDeck.length > 0 || Boolean(p.accessionCardId) || canPayAnyDevelopmentCard(G, playerId);
}

function canGainFameCard(G: GameState, playerId: string): boolean {
  const fameDeck = G.fameDeck;
  if (!fameDeck) return false;
  if (fameDeck.available.length > 0) return true;
  return Boolean(
    fameDeck.specialBottomCardId
    && fameDeck.specialBottomSide !== "face_down"
    && !fameDeck.resolvedSpecialByPlayer?.[playerId]
  );
}

function canResolveDrawEffect(ctx: Ctx, effect: Extract<Effect, { op: "draw" }>): boolean {
  if (effect.count <= 0) return true;
  const source = effect.source ?? "deck";
  if (source === "fameDeck") return canGainFameCard(ctx.G, ctx.playerId);
  if (source !== "deck") return drawSourceCards(ctx.G, ctx.playerId, ctx.G.players[ctx.playerId], source).length > 0;
  return canDrawAtLeastOneCardOrReshuffle(ctx.G, ctx.playerId);
}

function canResolveReturnUnrestEffect(ctx: Ctx, effect: Extract<Effect, { op: "return_unrest" }>): boolean {
  const sourceZones = effect.sourceZones?.length ? effect.sourceZones : ["hand"];
  return sourceZones.some((zone) => (zoneCardsForReturnUnrest(ctx.G, ctx.playerId, zone) ?? []).some((cardId) =>
    isUnrestCard(ctx.G, cardId) && (!effect.cardId || cardId === effect.cardId)
  ));
}

function canResolvePlaceOnDeckEffect(ctx: Ctx, effect: Extract<Effect, { op: "place_card_on_deck" }>): boolean {
  const p = ctx.G.players[ctx.playerId];
  const sourceZone = effect.sourceZone ?? "hand";
  return effect.cardId ? p[sourceZone].includes(effect.cardId) : p[sourceZone].length > 0;
}

function canResolveGiveCardEffect(ctx: Ctx, effect: Extract<Effect, { op: "give_card" }>): boolean {
  const p = ctx.G.players[ctx.playerId];
  const candidates = effect.targetPlayerId
    ? [effect.targetPlayerId]
    : effect.targetPlayerIds?.length
      ? effect.targetPlayerIds
      : Object.keys(ctx.G.players);
  const recipientPlayerIds = candidates
    .filter((playerId) => playerId !== ctx.playerId && Boolean(ctx.G.players[playerId]));
  return recipientPlayerIds.length > 0
    && (effect.cardId ? p.hand.includes(effect.cardId) : p.hand.length > 0);
}

function canResolveSwapEffect(ctx: Ctx, effect: Extract<Effect, { op: "swap_card" }>): boolean {
  const sourceZone = effect.sourceZone ?? "hand";
  return availableSwapChoices(ctx.G, ctx.playerId, sourceZone)
    .some((choice) => (!effect.cardId || choice.cardId === effect.cardId) && (!effect.marketCardId || choice.marketCardId === effect.marketCardId));
}

function canResolveTakeUnrestEffect(ctx: Ctx, effect: Extract<Effect, { op: "take_unrest" }>): boolean {
  if (effect.count <= 0) return false;
  const recipients = effect.targetPlayerIds ?? [ctx.playerId];
  return recipients.some((candidatePlayerId) => Boolean(ctx.G.players[candidatePlayerId]));
}

function canResolveTradeEffect(ctx: Ctx): boolean {
  if (isTradeExpansionDisabled(ctx)) return false;
  const p = ctx.G.players[ctx.playerId];
  const hasGoods = (p.resources.goods ?? 0) > 0;
  return availableTradeRoutes(ctx.G, ctx.playerId).length > 0 || (hasGoods && canGainResourceFromSupply(ctx.G, "knowledge", 1));
}

function canResolveProfitEffect(ctx: Ctx): boolean {
  return Boolean(
    ctx.selfCardId
    && !isTradeExpansionDisabled(ctx)
    && ctx.G.players[ctx.playerId].playArea.includes(ctx.selfCardId)
    && cardResourceCount(ctx.G, ctx.selfCardId, "goods") >= 3
  );
}

function canResolveGarrisonEffect(ctx: Ctx, effect: Extract<Effect, { op: "garrison_card" }>): boolean {
  const p = ctx.G.players[ctx.playerId];
  if (effect.hostCardId || effect.cardId) {
    if (!effect.hostCardId || !effect.cardId) return false;
    return p.playArea.includes(effect.hostCardId)
      && isRegionCard(ctx.G, effect.hostCardId)
      && p.hand.includes(effect.cardId);
  }
  const handCardIds = p.hand.filter((cardId) => cardId !== ctx.selfCardId);
  return defaultGarrisonHostCardIds(ctx).length > 0 && handCardIds.length > 0;
}

function canResolveRegionEffect(ctx: Ctx, effect: Extract<Effect, { op: "recall_region" | "abandon_region" }>): boolean {
  const p = ctx.G.players[ctx.playerId];
  return effect.cardId
    ? (p.playArea.includes(effect.cardId) || garrisonedCardsInPlay(ctx.G, ctx.playerId).includes(effect.cardId)) && isRegionCard(ctx.G, effect.cardId)
    : [...p.playArea, ...garrisonedCardsInPlay(ctx.G, ctx.playerId)].some((cardId) => isRegionCard(ctx.G, cardId));
}

function canResolveExileEffect(ctx: Ctx, effect: Extract<Effect, { op: "exile_card" }>): boolean {
  return isPlayerExileSource(effect.source)
    ? playerExileSourceCards(ctx.G, ctx.playerId, effect.source).some((cardId) => cardMatchesExileCriteria(ctx.G, cardId, effect, effect.source))
    : ctx.G.market.some((cardId) => cardMatchesExileCriteria(ctx.G, cardId, effect, "market"));
}

function canResolveAcquireEffect(ctx: Ctx, effect: Extract<Effect, { op: "acquire_card" }>): boolean {
  return effect.source === "exile"
    ? availableExileCards(ctx.G, ctx.playerId).some((cardId) => cardMatchesAcquireCriteria(ctx.G, cardId, effect))
    : ctx.G.market.some((cardId) => cardMatchesAcquireCriteria(ctx.G, cardId, effect));
}

function canResolveFindEffect(ctx: Ctx, effect: Extract<Effect, { op: "find_card" }>): boolean {
  const p = ctx.G.players[ctx.playerId];
  const zones: FindZone[] = effect.sourceZones?.length ? effect.sourceZones : ["hand", "discard", "deck", "nationDeck"];
  return zones.some((zone) => resolvedFindZones(ctx.G, ctx.playerId, zone).some((resolvedZone) =>
    searchableFindCards(ctx.G, ctx.playerId, p, resolvedZone).some((cardId) => cardMatchesFindCriteria(ctx.G, cardId, effect))
  ));
}

function marketDeckHasDrawableCard(G: GameState, deckName: NonNullable<ReturnType<typeof deckForSuit>>): boolean {
  const deck = G.marketDecks?.[deckName];
  if (!deck || deck.length === 0) return false;
  return !(deck.length === 1 && G.marketDeckBottomCards?.[deckName] === deck[0]);
}

function canResolveDeckBreakThroughEffect(ctx: Ctx, suit: Suit): boolean {
  if (suit === "tributary" && visibleTributaryBreakThroughCards(ctx.G).length > 0) return true;
  const sourceDeck = suit === "tributary" ? undefined : deckForSuit(suit);
  if (sourceDeck && marketDeckHasDrawableCard(ctx.G, sourceDeck)) return true;
  const mainDeck = ctx.G.marketDecks?.mainDeck ?? [];
  if (mainDeck.some((cardId) => cardHasSuitIcon(ctx.G.cardDb[cardId], suit))) return true;
  return canGainResourceFromSupply(ctx.G, "materials", 1);
}

function discardCostCardIds(ctx: Ctx): string[] {
  return ctx.G.players[ctx.playerId].hand.filter((cardId) => cardId !== ctx.selfCardId);
}

function canResolveEffectText(ctx: Ctx, effect: Effect): boolean {
  const p = ctx.G.players[ctx.playerId];
  switch (effect.op) {
    case "draw":
      return canResolveDrawEffect(ctx, effect);
    case "draw_if_able":
      return effect.count <= 0 || p.deck.length > 0;
    case "trigger_scoring":
    case "move_self_to_history":
      return true;
    case "profit":
      return canResolveProfitEffect(ctx);
    case "commerce":
      return !isTradeExpansionDisabled(ctx);
    case "gain_resource":
      return effect.amount <= 0 || canGainResourceFromSupply(ctx.G, effect.resource, effect.amount);
    case "gain_action":
      return effect.amount > 0;
    case "spend_action":
      return effect.amount <= 0 || (p.actionsRemaining >= effect.amount && p.actionTokensAvailable >= effect.amount);
    case "remove_resource":
    case "return_resource":
      return effect.amount <= 0 || resourceAmount(p.resources, effect.resource) > 0;
    case "steal_resource":
      return effect.amount <= 0 || resourceAmount(ctx.G.players[effect.fromPlayerId]?.resources, effect.resource) > 0;
    case "spend_resource":
      return canPayResourceCost(ctx.G, ctx.playerId, effect.resource, effect.amount);
    case "discard_random":
      return p.hand.length > (effect.trigger === "on_play" ? 1 : 0);
    case "discard_cards":
      return effect.count > 0 && discardCostCardIds(ctx).length >= effect.count;
    case "return_unrest":
      return canResolveReturnUnrestEffect(ctx, effect);
    case "place_card_on_deck":
      return canResolvePlaceOnDeckEffect(ctx, effect);
    case "give_card":
      return canResolveGiveCardEffect(ctx, effect);
    case "swap_card":
      return canResolveSwapEffect(ctx, effect);
    case "take_unrest":
      return canResolveTakeUnrestEffect(ctx, effect);
    case "gain_fame":
      return effect.count <= 0 || canGainFameCard(ctx.G, ctx.playerId);
    case "trade":
      return canResolveTradeEffect(ctx);
    case "garrison_card":
      return canResolveGarrisonEffect(ctx, effect);
    case "recall_region":
    case "abandon_region":
      return canResolveRegionEffect(ctx, effect);
    case "develop":
      return canPayAnyDevelopmentCard(ctx.G, ctx.playerId);
    case "exile_card":
      return canResolveExileEffect(ctx, effect);
    case "acquire_card":
      return canResolveAcquireEffect(ctx, effect);
    case "gain_card":
    case "take_card":
      return matchingMarketMoveCards(ctx.G, effect).length > 0;
    case "break_through":
      return effect.source === "market"
        ? matchingMarketBreakThroughCards(ctx.G, effect).length > 0
        : effect.source === "exile"
          ? availableExileCards(ctx.G, ctx.playerId).some((cardId) => cardMatchesBreakThroughCriteria(ctx.G, cardId, effect))
          : canResolveDeckBreakThroughEffect(ctx, effect.suit);
    case "find_card":
      return canResolveFindEffect(ctx, effect);
    case "look_cards":
      return effect.count <= 0 || lookableCards(ctx.G, p, effect.source).length > 0;
    case "optional":
      return choiceOptionCanResolve(ctx, effect.effects);
    case "choose_one":
      return effect.choices.some((choice) => choiceOptionCanResolve(ctx, choice));
    case "conditional_resource_at_least":
      return resourceAmount(p.resources, effect.resource) >= effect.atLeast
        ? effect.then.some((candidate) => canResolveEffectText(ctx, candidate))
        : (effect.else ?? []).some((candidate) => canResolveEffectText(ctx, candidate));
    case "conditional_state_is":
      return currentStateMatches(ctx.G, ctx.playerId, effect.state)
        ? effect.then.some((candidate) => canResolveEffectText(ctx, candidate))
        : (effect.else ?? []).some((candidate) => canResolveEffectText(ctx, candidate));
    default:
      return false;
  }
}

function canResolveChoiceEffectText(ctx: Ctx, effect: Effect): boolean {
  const p = ctx.G.players[ctx.playerId];
  switch (effect.op) {
    case "draw":
      return effect.count > 0 && canResolveDrawEffect(ctx, effect);
    case "draw_if_able":
      return effect.count > 0 && p.deck.length > 0;
    case "gain_resource":
      return effect.amount > 0 && canGainResourceFromSupply(ctx.G, effect.resource, effect.amount);
    case "spend_action":
      return effect.amount > 0 && p.actionsRemaining >= effect.amount && p.actionTokensAvailable >= effect.amount;
    case "remove_resource":
    case "return_resource":
      return effect.amount > 0 && resourceAmount(p.resources, effect.resource) > 0;
    case "steal_resource":
      return effect.amount > 0 && resourceAmount(ctx.G.players[effect.fromPlayerId]?.resources, effect.resource) > 0;
    case "spend_resource":
      return effect.amount > 0 && canPayResourceCost(ctx.G, ctx.playerId, effect.resource, effect.amount);
    case "discard_cards":
      return effect.count > 0 && discardCostCardIds(ctx).length >= effect.count;
    case "gain_fame":
      return effect.count > 0 && canGainFameCard(ctx.G, ctx.playerId);
    case "look_cards":
      return effect.count > 0 && lookableCards(ctx.G, p, effect.source).length > 0;
    case "optional":
      return choiceOptionCanResolve(ctx, effect.effects);
    case "choose_one":
      return effect.choices.some((choice) => choiceOptionCanResolve(ctx, choice));
    case "conditional_resource_at_least":
      return resourceAmount(p.resources, effect.resource) >= effect.atLeast
        ? effect.then.some((candidate) => canResolveChoiceEffectText(ctx, candidate))
        : (effect.else ?? []).some((candidate) => canResolveChoiceEffectText(ctx, candidate));
    case "conditional_state_is":
      return currentStateMatches(ctx.G, ctx.playerId, effect.state)
        ? effect.then.some((candidate) => canResolveChoiceEffectText(ctx, candidate))
        : (effect.else ?? []).some((candidate) => canResolveChoiceEffectText(ctx, candidate));
    default:
      return canResolveEffectText(ctx, effect);
  }
}

function choiceOptionCanResolve(ctx: Ctx, effects: Effect[]): boolean {
  return effects.length > 0
    && !hasUnpaidExplicitCost(ctx, effects)
    && effects.some((effect) => canResolveChoiceEffectText(ctx, effect));
}

export function runEffects(ctx: Ctx, effects: Effect[]): boolean {
  const prefix = costPaymentPrefix(effects);
  const cost = explicitSpendCost(prefix);
  const costEntries = positiveResourceCostEntries(cost);
  if (costEntries.length === 1) {
    const [resource, amount] = costEntries[0];
    if (!payResourceCost(ctx.G, ctx.playerId, resource, amount)) return false;
  } else if (costEntries.length > 1) {
    if (!payResourceCosts(ctx.G, ctx.playerId, cost)) return false;
  }
  if (ctx.G.gameover || pendingEffectInterruption(ctx.G)) return true;

  const payableEffects = costEntries.length > 0 ? orderedEffectsAfterPrefixPayment(effects, prefix) : effects;
  for (let index = 0; index < payableEffects.length; index += 1) {
    const effect = payableEffects[index];
    if (!runEffect(ctx, effect)) return false;
    if (ctx.G.gameover) return true;
    const pending = pendingEffectInterruption(ctx.G);
    if (pending) {
      const remaining = payableEffects.slice(index + 1);
      if (remaining.length > 0) pending.resumeEffects = [...(pending.resumeEffects ?? []), ...remaining];
      return true;
    }
  }
  return true;
}

export function runTriggeredEffects(ctx: Ctx, effects: Effect[], trigger: EffectTrigger): boolean {
  return runEffects(ctx, effects.filter((effect) => effect.trigger === trigger));
}

export function runAcquireTriggers(ctx: Ctx, cardId: string): boolean {
  return runTriggeredEffects(
    { ...ctx, selfCardId: cardId },
    ctx.G.cardDb[cardId]?.effects ?? [],
    "on_acquire"
  );
}

function appendResumeEffectsToPending(G: GameState, effects: Effect[] | undefined): void {
  if (!effects || effects.length === 0) return;
  const pending = pendingEffectInterruption(G);
  if (!pending) return;
  pending.resumeEffects = [...(pending.resumeEffects ?? []), ...effects];
}

function runEffect(ctx: Ctx, effect: Effect): boolean {
  const p = ctx.G.players[ctx.playerId];

  const maybeOp = (effect as unknown as { op?: string }).op ?? "";
  if ((maybeOp === "trade" || maybeOp === "commerce" || maybeOp === "profit") && isTradeExpansionDisabled(ctx)) {
    ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Ignored ${maybeOp} because trade_routes is disabled.` });
    return true;
  }

  switch (effect.op) {
    case "draw": {
      const source = effect.source ?? "deck";
      if (source === "fameDeck") {
        drawFameCards(ctx, effect.count);
        break;
      }
      if (source !== "deck") {
        startFaceUpDrawChoice(ctx, source, effect.count);
        break;
      }
      for (let i = 0; i < effect.count; i++) {
        const card = drawCardWithReshuffleLifecycle(ctx.G, ctx.playerId, ctx.randomNumber, effect.count - i);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: card ? `Drew ${card}` : "Draw failed (no deck/discard cards)." });
        if (ctx.G.gameover || pendingEffectInterruption(ctx.G)) break;
      }
      break;
    }
    case "draw_if_able": {
      for (let i = 0; i < effect.count; i++) {
        const card = drawCard(p, ctx.randomNumber, false);
        if (!card) {
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "Draw-if-able stopped (deck empty)." });
          break;
        }
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Drew ${card} if able.` });
      }
      break;
    }
    case "gain_resource": {
      const gained = gainPlayerResource(ctx.G, ctx.playerId, effect.resource, effect.amount);
      const prefix = gained === effect.amount ? `${effect.amount}` : `${gained}/${effect.amount}`;
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Gained ${prefix} ${effect.resource}.` });
      if (gained > 0) createReactiveExhaustChoice(ctx, { trigger: "after_gain_resource", resource: effect.resource });
      break;
    }
    case "spend_resource": return payResourceCost(ctx.G, ctx.playerId, effect.resource, effect.amount);
    case "gain_action": {
      p.actionsRemaining += effect.amount;
      p.actionTokensAvailable += effect.amount;
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Gained ${effect.amount} Action.` });
      break;
    }
    case "spend_action": {
      const available = Math.min(p.actionsRemaining, p.actionTokensAvailable);
      if (effect.amount > available) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `SpendActionFailed(required=${effect.amount}, available=${available})` });
        return false;
      }
      p.actionsRemaining -= effect.amount;
      p.actionTokensAvailable -= effect.amount;
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Spent ${effect.amount} Action.` });
      break;
    }
    case "remove_resource": {
      const available = resourceAmount(p.resources, effect.resource);
      const removed = Math.min(available, effect.amount);
      setResourceAmount(p.resources, effect.resource, available - removed);
      returnResourceToSupply(ctx.G, effect.resource, removed);
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Removed ${removed}/${effect.amount} ${effect.resource}.` });
      break;
    }
    case "return_resource": {
      const available = resourceAmount(p.resources, effect.resource);
      const returned = Math.min(available, effect.amount);
      setResourceAmount(p.resources, effect.resource, available - returned);
      returnResourceToSupply(ctx.G, effect.resource, returned);
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Returned ${returned}/${effect.amount} ${effect.resource}.` });
      break;
    }
    case "steal_resource": {
      const target = ctx.G.players[effect.fromPlayerId];
      if (!target) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `StealSkipped(player_not_found/${effect.fromPlayerId}).` });
        break;
      }
      const available = resourceAmount(target.resources, effect.resource);
      const stolen = Math.min(available, effect.amount);
      setResourceAmount(target.resources, effect.resource, available - stolen);
      addResourceAmount(p.resources, effect.resource, stolen);
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Stole ${stolen}/${effect.amount} ${effect.resource} from player ${effect.fromPlayerId}.` });
      break;
    }
    case "discard_random": {
      for (let i = 0; i < effect.count; i++) {
        if (p.hand.length === 0) break;
        const roll = ctx.randomNumber ? ctx.randomNumber() : 0;
        const randomIndex = Math.floor(roll * p.hand.length);
        const [card] = p.hand.splice(randomIndex, 1);
        if (card) { p.discard.push(card); ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Discarded ${card} at random.` }); }
      }
      break;
    }
    case "discard_cards": {
      const cardIds = discardCostCardIds(ctx);
      if (effect.count <= 0 || cardIds.length < effect.count) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `DiscardCardsFailed(required=${effect.count}/available=${cardIds.length})` });
        return false;
      }
      if (cardIds.length === effect.count) {
        for (const cardId of cardIds) {
          removeOneCard(p.hand, cardId);
          p.discard.push(cardId);
        }
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `DiscardedCards(count=${effect.count})` });
        break;
      }
      ctx.G.pendingDiscardChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, cardIds, count: effect.count };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `DiscardChoicePending(${ctx.selfCardId ?? "unknown"}/options=${cardIds.length}/count=${effect.count})` });
      break;
    }
    case "return_unrest": {
      const sourceZones: ReturnUnrestSourceZone[] = effect.sourceZones?.length ? effect.sourceZones : ["hand"];
      if (effect.cardId) {
        if (!returnUnrestCard(ctx.G, ctx.playerId, effect.cardId, sourceZones)) {
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ReturnUnrestFailed(${effect.cardId})` });
          return false;
        }
        break;
      }
      const cardIds = sourceZones.flatMap((zone) => zoneCardsForReturnUnrest(ctx.G, ctx.playerId, zone) ?? []).filter((cardId, index, all) => isUnrestCard(ctx.G, cardId) && all.indexOf(cardId) === index);
      if (cardIds.length === 0) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "ReturnUnrestSkipped(no_eligible_unrest)" });
        break;
      }
      ctx.G.pendingReturnUnrestChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, cardIds, sourceZones };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ReturnUnrestChoicePending(${ctx.selfCardId ?? "unknown"}/options=${cardIds.length})` });
      break;
    }
    case "place_card_on_deck": {
      const sourceZone: PlaceOnDeckSourceZone = effect.sourceZone ?? "hand";
      if (effect.cardId) {
        if (!placeCardOnDeck(ctx.G, ctx.playerId, effect.cardId, sourceZone)) {
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `PlaceOnDeckFailed(${effect.cardId}/${sourceZone})` });
          return false;
        }
        break;
      }
      const cardIds = [...p[sourceZone]];
      if (cardIds.length === 0) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `PlaceOnDeckSkipped(no_cards/${sourceZone})` });
        break;
      }
      ctx.G.pendingPlaceOnDeckChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, sourceZone, cardIds };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `PlaceOnDeckChoicePending(${ctx.selfCardId ?? "unknown"}/source=${sourceZone}/options=${cardIds.length})` });
      break;
    }
    case "give_card": {
      const recipientCandidates = effect.targetPlayerId
        ? [effect.targetPlayerId]
        : effect.targetPlayerIds?.length
          ? effect.targetPlayerIds
          : Object.keys(ctx.G.players);
      const recipientPlayerIds = recipientCandidates
        .filter((playerId) => playerId !== ctx.playerId && Boolean(ctx.G.players[playerId]));
      const targetPlayerId = effect.targetPlayerId && recipientPlayerIds.includes(effect.targetPlayerId)
        ? effect.targetPlayerId
        : recipientPlayerIds.length === 1
          ? recipientPlayerIds[0]
          : undefined;
      if (effect.cardId && targetPlayerId) {
        if (!giveCardToPlayer(ctx.G, ctx.playerId, effect.cardId, targetPlayerId)) {
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `GiveCardFailed(${effect.cardId}->${targetPlayerId})` });
          return false;
        }
        break;
      }
      const cardIds = effect.cardId ? p.hand.filter((cardId) => cardId === effect.cardId) : [...p.hand];
      if (cardIds.length === 0 || recipientPlayerIds.length === 0) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "GiveCardSkipped(no_eligible_card_or_recipient)" });
        break;
      }
      ctx.G.pendingGiveCardChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, cardIds, recipientPlayerIds };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `GiveCardChoicePending(${ctx.selfCardId ?? "unknown"}/cards=${cardIds.length}/recipients=${recipientPlayerIds.length})` });
      break;
    }
    case "swap_card": {
      const sourceZone: SwapSourceZone = effect.sourceZone ?? "hand";
      if (effect.cardId && effect.marketCardId) {
        if (!swapCardWithMarket(ctx.G, { playerId: ctx.playerId, sourceZone, cardId: effect.cardId, marketCardId: effect.marketCardId })) {
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `SwapFailed(${effect.cardId}<->${effect.marketCardId}/source=${sourceZone})` });
          return false;
        }
        break;
      }
      const choices = availableSwapChoices(ctx.G, ctx.playerId, sourceZone)
        .filter((choice) => (!effect.cardId || choice.cardId === effect.cardId) && (!effect.marketCardId || choice.marketCardId === effect.marketCardId));
      if (choices.length === 0) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `SwapSkipped(no_eligible_swap/source=${sourceZone})` });
        break;
      }
      ctx.G.pendingSwapChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, sourceZone, choices };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `SwapChoicePending(${ctx.selfCardId ?? "unknown"}/source=${sourceZone}/options=${choices.length})` });
      break;
    }
    case "take_unrest": {
      const targetPlayerIds = effect.targetPlayerIds ?? [ctx.playerId];
      const handCountsBefore = new Map(targetPlayerIds.map((playerId) => [playerId, ctx.G.players[playerId]?.hand.length ?? 0]));
      const resolved = takeUnrest(ctx.G, { playerIds: targetPlayerIds, count: effect.count, triggeredBy: ctx.playerId });
      if (!resolved || ctx.G.gameover || pendingEffectInterruption(ctx.G)) return resolved;
      for (const targetPlayerId of targetPlayerIds) {
        const player = ctx.G.players[targetPlayerId];
        if (!player || player.hand.length <= (handCountsBefore.get(targetPlayerId) ?? 0)) continue;
        createReactiveExhaustChoice(ctx, { trigger: "after_take_unrest", targetPlayerId });
        if (pendingEffectInterruption(ctx.G)) break;
      }
      return true;
    }
    case "gain_fame": {
      const gained: string[] = [];
      for (let i = 0; i < effect.count; i += 1) {
        const cardId = takeFameCard(ctx.G, ctx.playerId);
        if (!cardId) break;
        gained.push(cardId);
        if (ctx.G.gameover || pendingEffectInterruption(ctx.G)) break;
      }
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `FameGained(${ctx.selfCardId ?? "unknown"}/count=${effect.count}/gained=${gained.join(",") || "none"})` });
      break;
    }
    case "trigger_scoring": {
      triggerScoring(ctx.G, effect.reason, ctx.playerId);
      break;
    }
    case "trade": {
      const routes = availableTradeRoutes(ctx.G, ctx.playerId);
      if (routes.length > 0) {
        const allowGoodsForProgress = (p.resources.goods ?? 0) > 0 && canGainResourceFromSupply(ctx.G, "knowledge", 1);
        ctx.G.pendingTradeChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, routeCardIds: routes, allowGoodsForProgress };
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `TradeChoicePending(options=${routes.length + (allowGoodsForProgress ? 1 : 0)})` });
        break;
      }
      if ((p.resources.goods ?? 0) <= 0) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "TradeSkipped(no_goods)" });
        break;
      }
      if (!canGainResourceFromSupply(ctx.G, "knowledge", 1)) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "TradeSkipped(no_progress_supply)" });
        return false;
      }
      p.resources.goods -= 1;
      returnResourceToSupply(ctx.G, "goods", 1);
      gainPlayerResource(ctx.G, ctx.playerId, "knowledge", 1);
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "TradeResolved(goods_to_progress)" });
      break;
    }
    case "commerce": {
      return runEffects(ctx, effect.effects);
    }
    case "profit": {
      if (!ctx.selfCardId || !p.playArea.includes(ctx.selfCardId) || cardResourceCount(ctx.G, ctx.selfCardId, "goods") < 3) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ProfitSkipped(${ctx.selfCardId ?? "unknown"})` });
        break;
      }
      removeOneCard(p.playArea, ctx.selfCardId);
      collectCardResourcesToPlayer(ctx.G, ctx.playerId, ctx.selfCardId);
      const garrisonedCardIds = detachGarrisonedCards(ctx.G, ctx.selfCardId);
      garrisonedCardIds.forEach((cardId) => collectAndClearCardStateToPlayer(ctx.G, ctx.playerId, cardId));
      const destination = effect.destination ?? "discard";
      const resolvedDestination = destination === "history"
        ? moveCardsToHistoryDestination(ctx.G, ctx.playerId, [ctx.selfCardId, ...garrisonedCardIds])
        : (p[destination].push(ctx.selfCardId, ...garrisonedCardIds), destination);
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ProfitResolved(${ctx.selfCardId}->${resolvedDestination})` });
      return runEffects(ctx, effect.effects);
    }
    case "garrison_card": {
      if (!effect.hostCardId || !effect.cardId) {
        const hostCardIds = defaultGarrisonHostCardIds(ctx);
        const cardIds = [...p.hand];
        if (hostCardIds.length === 0 || cardIds.length === 0) {
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "GarrisonSkipped(no_eligible_host_or_card)" });
          break;
        }
        ctx.G.pendingGarrisonChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, hostCardIds, cardIds };
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `GarrisonChoicePending(${ctx.selfCardId ?? "unknown"}/hosts=${hostCardIds.length}/cards=${cardIds.length})` });
        break;
      }
      if (!garrisonCardOnRegion(ctx.G, ctx.playerId, effect.hostCardId, effect.cardId)) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `GarrisonFailed(${effect.cardId}/host=${effect.hostCardId})` });
        return false;
      }
      break;
    }
    case "recall_region": {
      if (!effect.cardId) {
        createPendingRegionChoice(ctx, effect.op);
        break;
      }
      if (!recallRegionToHand(ctx.G, ctx.playerId, effect.cardId)) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `RecallFailed(${effect.cardId})` });
        return false;
      }
      break;
    }
    case "abandon_region": {
      if (!effect.cardId) {
        createPendingRegionChoice(ctx, effect.op);
        break;
      }
      if (!abandonRegionToDiscard(ctx.G, ctx.playerId, effect.cardId)) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `AbandonFailed(${effect.cardId})` });
        return false;
      }
      break;
    }
    case "develop": {
      return createCardDrivenDevelopmentChoice(ctx.G, ctx.playerId, ctx.selfCardId);
    }
    case "move_self_to_history": {
      if (!ctx.selfCardId) break;
      const garrisonHostCardId = detachGarrisonedCard(ctx.G, ctx.playerId, ctx.selfCardId);
      let movedCardIds: string[];
      if (garrisonHostCardId) {
        collectAndClearCardStateToPlayer(ctx.G, ctx.playerId, ctx.selfCardId);
        movedCardIds = [ctx.selfCardId];
      } else {
        removeOneCard(p.playArea, ctx.selfCardId);
        removeOneCard(p.discard, ctx.selfCardId);
        collectCardResourcesToPlayer(ctx.G, ctx.playerId, ctx.selfCardId);
        const garrisonedCardIds = detachGarrisonedCards(ctx.G, ctx.selfCardId);
        garrisonedCardIds.forEach((cardId) => collectAndClearCardStateToPlayer(ctx.G, ctx.playerId, cardId));
        movedCardIds = [ctx.selfCardId, ...garrisonedCardIds];
      }
      const destination = moveCardsToHistoryDestination(ctx.G, ctx.playerId, movedCardIds);
      if (destination === "discard") {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to discard (history disabled).` });
      } else if (destination === "exile") {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to exile (history disabled).` });
      } else if (destination === "alternate_history") {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to alternate_history (history disabled).` });
      } else if (destination === "history") {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to history.` });
      } else {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to ${destination} (history replaced).` });
      }
      break;
    }
    case "exile_card": {
      if (isPlayerExileSource(effect.source)) {
        if (effect.cardId) {
          if (!exilePlayerCard(ctx.G, { playerId: ctx.playerId, source: effect.source, cardId: effect.cardId })) {
            ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ExileFailed(${effect.cardId})` });
            return false;
          }
          break;
        }
        const cardIds = playerExileSourceCards(ctx.G, ctx.playerId, effect.source).filter((sourceCardId) => cardMatchesExileCriteria(ctx.G, sourceCardId, effect, effect.source));
        if (cardIds.length === 0) break;
        const resumeEffects = remainingExileEffect(effect, 1);
        ctx.G.pendingExileChoice = {
          playerId: ctx.playerId,
          sourceCardId: ctx.selfCardId,
          source: effect.source,
          cardIds,
          ...(resumeEffects ? { resumeEffects } : {})
        };
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ExileChoicePending(${ctx.selfCardId ?? "unknown"}/source=${effect.source}/options=${cardIds.length})` });
        break;
      }
      if (effect.cardId) {
        if (!exileMarketCard(ctx.G, { playerId: ctx.playerId, cardId: effect.cardId })) {
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ExileFailed(${effect.cardId})` });
          return false;
        }
        break;
      }
      const cardIds = ctx.G.market.filter((marketCardId) => cardMatchesExileCriteria(ctx.G, marketCardId, effect, "market"));
      if (cardIds.length === 0) break;
      const resumeEffects = remainingExileEffect(effect, 1);
      ctx.G.pendingExileChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, source: "market", cardIds, ...(resumeEffects ? { resumeEffects } : {}) };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ExileChoicePending(${ctx.selfCardId ?? "unknown"}/source=market/options=${cardIds.length})` });
      break;
    }
    case "acquire_card": {
      for (let i = 0; i < effect.count; i++) {
        if (effect.source === "exile") {
          const cardId = effect.cardId;
            if (!cardId) {
              const cardIds = availableExileCards(ctx.G, ctx.playerId).filter((exiledCardId) => cardMatchesAcquireCriteria(ctx.G, exiledCardId, effect));
              if (cardIds.length === 0) break;
              const resumeEffects = remainingAcquireEffect(effect, i + 1);
              ctx.G.pendingAcquireChoice = {
                playerId: ctx.playerId,
                sourceCardId: ctx.selfCardId,
                source: "exile",
                cardIds,
                destination: effect.destination ?? "hand",
                ...(resumeEffects ? { resumeEffects } : {})
              };
            ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `AcquireChoicePending(${ctx.selfCardId ?? "unknown"}/source=exile/options=${cardIds.length})` });
            break;
          }
          if (!acquireFromExile(ctx.G, { playerId: ctx.playerId, cardId, destination: effect.destination })) break;
          if (!runAcquireTriggers(ctx, cardId)) return false;
          if (!pendingEffectInterruption(ctx.G)) createReactiveExhaustChoice(ctx, { trigger: "after_acquire_card", targetPlayerId: ctx.playerId });
          if (pendingEffectInterruption(ctx.G)) {
            appendResumeEffectsToPending(ctx.G, remainingAcquireEffect(effect, i + 1));
            break;
          }
          continue;
        }
        if (effect.cardId) {
          if (!acquireMarketCard(ctx.G, { playerId: ctx.playerId, cardId: effect.cardId, destination: effect.destination ?? "hand" })) break;
          if (!runAcquireTriggers(ctx, effect.cardId)) return false;
          if (!pendingEffectInterruption(ctx.G)) createReactiveExhaustChoice(ctx, { trigger: "after_acquire_card", targetPlayerId: ctx.playerId });
          if (pendingEffectInterruption(ctx.G)) {
            appendResumeEffectsToPending(ctx.G, remainingAcquireEffect(effect, i + 1));
            break;
          }
          continue;
        }
        if (!effect.suit && !effect.cardType) {
          const cardIds = [...ctx.G.market];
          if (cardIds.length === 0) break;
          if (cardIds.length > 1) {
            const resumeEffects = remainingAcquireEffect(effect, i + 1);
            ctx.G.pendingAcquireChoice = {
              playerId: ctx.playerId,
              sourceCardId: ctx.selfCardId,
              source: "market",
              cardIds,
              destination: effect.destination ?? "hand",
              ...(resumeEffects ? { resumeEffects } : {})
            };
            ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `AcquireChoicePending(${ctx.selfCardId ?? "unknown"}/source=market/options=${cardIds.length})` });
            break;
          }
          if (!acquireMarketCard(ctx.G, { playerId: ctx.playerId, cardId: cardIds[0], destination: effect.destination ?? "hand" })) break;
          if (!runAcquireTriggers(ctx, cardIds[0])) return false;
          if (!pendingEffectInterruption(ctx.G)) createReactiveExhaustChoice(ctx, { trigger: "after_acquire_card", targetPlayerId: ctx.playerId });
          if (pendingEffectInterruption(ctx.G)) {
            appendResumeEffectsToPending(ctx.G, remainingAcquireEffect(effect, i + 1));
            break;
          }
          continue;
        }
        const cardIds = ctx.G.market.filter((marketCardId) => cardMatchesAcquireCriteria(ctx.G, marketCardId, effect));
        if (cardIds.length === 0) break;
        const resumeEffects = remainingAcquireEffect(effect, i + 1);
        ctx.G.pendingAcquireChoice = {
          playerId: ctx.playerId,
          sourceCardId: ctx.selfCardId,
          source: "market",
          cardIds,
          destination: effect.destination ?? "hand",
          ...(resumeEffects ? { resumeEffects } : {})
        };
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `AcquireChoicePending(${ctx.selfCardId ?? "unknown"}/source=market/options=${cardIds.length})` });
        break;
      }
      break;
    }
    case "gain_card":
    case "take_card": {
      const rawSource = (effect as Effect & { source?: string }).source;
      if (rawSource !== "market") {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `MarketMoveFailed(invalid_source/${effect.op}/${rawSource ?? "unknown"})` });
        return false;
      }
      for (let i = 0; i < effect.count; i += 1) {
        const cardIds = effect.cardId && i === 0
          ? matchingMarketMoveCards(ctx.G, effect).filter((cardId) => cardId === effect.cardId)
          : matchingMarketMoveCards(ctx.G, { ...effect, cardId: undefined });
        if (cardIds.length === 0) break;
        if (cardIds.length > 1) {
          const resumeEffects = remainingMarketMoveEffect(effect, i + 1);
          ctx.G.pendingMarketCardChoice = {
            playerId: ctx.playerId,
            sourceCardId: ctx.selfCardId,
            op: effect.op,
            cardIds,
            destination: effect.destination ?? "hand",
            ...(resumeEffects ? { resumeEffects } : {})
          };
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `MarketCardChoicePending(${ctx.selfCardId ?? "unknown"}/${effect.op}/options=${cardIds.length})` });
          break;
        }
        const moved = effect.op === "gain_card"
          ? gainMarketCard(ctx.G, { playerId: ctx.playerId, cardId: cardIds[0], destination: effect.destination ?? "hand" })
          : takeMarketCard(ctx.G, { playerId: ctx.playerId, cardId: cardIds[0], destination: effect.destination ?? "hand" });
        if (!moved || ctx.G.gameover) break;
      }
      break;
    }
    case "break_through": {
      if (effect.source === "market") {
        for (let completedCount = 0; completedCount < effect.count; completedCount += 1) {
          const cardIds = effect.cardId && completedCount === 0
            ? matchingMarketBreakThroughCards(ctx.G, effect).filter((cardId) => cardId === effect.cardId)
            : matchingMarketBreakThroughCards(ctx.G, { ...effect, cardId: undefined });
          if (cardIds.length === 0) break;
          if (cardIds.length > 1) {
            const resumeEffects = remainingBreakThroughEffect({ ...effect, cardId: undefined }, completedCount + 1);
            ctx.G.pendingBreakThroughChoice = {
              playerId: ctx.playerId,
              sourceCardId: ctx.selfCardId,
              source: "market",
              suit: effect.suit,
              cardIds,
              ...(resumeEffects ? { resumeEffects } : {})
            };
            ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `BreakThroughChoicePending(${ctx.selfCardId ?? "unknown"}/source=market/options=${cardIds.length})` });
            break;
          }
          breakThrough(ctx.G, { playerId: ctx.playerId, suit: effect.suit, source: "market", count: 1, cardId: cardIds[0], randomNumber: ctx.randomNumber });
          if (ctx.G.gameover || pendingEffectInterruption(ctx.G)) break;
        }
        break;
      }
      if (effect.source === "exile" && !effect.cardId) {
        const cardIds = availableExileCards(ctx.G, ctx.playerId).filter((exiledCardId) => cardMatchesBreakThroughCriteria(ctx.G, exiledCardId, effect));
        if (cardIds.length === 0) break;
        const resumeEffects = remainingBreakThroughEffect(effect, 1);
        ctx.G.pendingBreakThroughChoice = {
          playerId: ctx.playerId,
          sourceCardId: ctx.selfCardId,
          source: "exile",
          suit: effect.suit,
          cardIds,
          ...(resumeEffects ? { resumeEffects } : {})
        };
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `BreakThroughChoicePending(${ctx.selfCardId ?? "unknown"}/source=exile/options=${cardIds.length})` });
        break;
      }
      if (effect.source === "deck" && effect.suit === "tributary" && !effect.cardId) {
        const cardIds = visibleTributaryBreakThroughCards(ctx.G);
        if (cardIds.length > 1) {
          const resumeEffects = remainingBreakThroughEffect(effect, 1);
          ctx.G.pendingBreakThroughChoice = {
            playerId: ctx.playerId,
            sourceCardId: ctx.selfCardId,
            source: "deck",
            suit: effect.suit,
            cardIds,
            ...(resumeEffects ? { resumeEffects } : {})
          };
          ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `BreakThroughChoicePending(${ctx.selfCardId ?? "unknown"}/source=deck/options=${cardIds.length})` });
          break;
        }
      }
      breakThrough(ctx.G, { playerId: ctx.playerId, suit: effect.suit, source: effect.source, count: effect.count, cardId: effect.cardId, randomNumber: ctx.randomNumber });
      break;
    }
    case "find_card": {
      runFindCard(ctx, effect);
      break;
    }
    case "look_cards": {
      runLookCards(ctx, effect);
      break;
    }
    case "conditional_resource_at_least": {
      return runEffects(ctx, resourceAmount(p.resources, effect.resource) >= effect.atLeast ? effect.then : effect.else ?? []);
    }
    case "conditional_state_is": {
      return runEffects(ctx, currentStateMatches(ctx.G, ctx.playerId, effect.state) ? effect.then : effect.else ?? []);
    }
    case "optional": {
      const choices = choiceOptionCanResolve(ctx, effect.effects) ? [effect.effects, []] : [[]];
      ctx.G.pendingChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, choices };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `OptionalPending(${ctx.selfCardId ?? "unknown"}/options=${choices.length})` });
      break;
    }
    case "choose_one": {
      const choices = effect.choices.filter((choice) => choiceOptionCanResolve(ctx, choice));
      if (choices.length === 0) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ChoiceSkipped(${ctx.selfCardId ?? "unknown"}/no_legal_options)` });
        break;
      }
      ctx.G.pendingChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, choices };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ChoicePending(${ctx.selfCardId ?? "unknown"}/options=${choices.length})` });
      break;
    }
    default: {
      const unsupportedOp = (effect as unknown as { op?: string }).op ?? "unknown";
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `UnsupportedEffectOp(${unsupportedOp})` });
      return false;
    }
  }
  return true;
}
