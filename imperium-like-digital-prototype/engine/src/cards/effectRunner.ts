import type { Effect, EffectTrigger, GameState, PlayerState, ZoneName } from "../game/state";
import { drawCard, drawCardWithReshuffleLifecycle } from "../game/zones";
import { collectMarketResources, collectMarketUnrest } from "../game/marketResources";
import { refillMarketSlot } from "../game/marketRefill";
import { breakThrough } from "../game/breakThrough";
import { payResourceCost } from "../game/payments";
import type { ZoneOverride } from "../nations/nationRulesetTypes";

interface Ctx {
  G: GameState;
  playerId: string;
  selfCardId?: string;
  randomNumber?: () => number;
  enabledExpansions?: string[];
}


function isTradeExpansionDisabled(ctx: Ctx): boolean {
  return !(ctx.enabledExpansions ?? []).includes("trade_routes");
}

function removeOneCard(cards: string[], target: string): void {
  const index = cards.indexOf(target);
  if (index >= 0) cards.splice(index, 1);
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

type FindZone = "hand" | "discard" | "deck" | "nationDeck";

function findZoneCards(player: PlayerState, zone: FindZone): string[] {
  return player[zone];
}

function removeFromFindZone(player: PlayerState, zone: FindZone, cardId: string): boolean {
  const cards = findZoneCards(player, zone);
  const index = cards.indexOf(cardId);
  if (index < 0) return false;
  cards.splice(index, 1);
  return true;
}

function destinationZone(player: PlayerState, destination: ZoneName): string[] {
  return player[destination];
}

function moveFoundCard(player: PlayerState, fromZone: FindZone, destination: ZoneName, cardId: string): boolean {
  if (fromZone === destination) return true;
  if (!removeFromFindZone(player, fromZone, cardId)) return false;
  destinationZone(player, destination).push(cardId);
  return true;
}

function cardMatchesFindCriteria(G: GameState, cardId: string, effect: Extract<Effect, { op: "find_card" }>): boolean {
  const card = G.cardDb[cardId];
  if (!card) return false;
  if (effect.cardId) return cardId === effect.cardId;
  if (effect.suit && card.suit !== effect.suit) return false;
  if (effect.cardType && (card.cardType ?? card.type) !== effect.cardType) return false;
  return Boolean(effect.suit || effect.cardType);
}

function shuffleFindDeckIfNeeded(G: GameState, playerId: string, zone: "deck" | "nationDeck", randomNumber?: () => number): void {
  const player = G.players[playerId];
  if (zone === "deck") {
    player.deck = shuffleWithRandom(player.deck, randomNumber);
    G.log.push({ round: G.round, playerId, message: "FindShuffled(deck)" });
    return;
  }
  const accessionCardId = player.accessionCardId;
  const accessionCards = accessionCardId ? player.nationDeck.filter((cardId) => cardId === accessionCardId) : [];
  const searchableCards = accessionCardId ? player.nationDeck.filter((cardId) => cardId !== accessionCardId) : [...player.nationDeck];
  player.nationDeck = [...shuffleWithRandom(searchableCards, randomNumber), ...accessionCards];
  G.log.push({ round: G.round, playerId, message: "FindShuffled(nationDeck)" });
}

function searchableFindCards(player: PlayerState, zone: FindZone): string[] {
  if (zone !== "nationDeck" || !player.accessionCardId) return [...findZoneCards(player, zone)];
  return player.nationDeck.filter((cardId) => cardId !== player.accessionCardId);
}

function runFindCard(ctx: Ctx, effect: Extract<Effect, { op: "find_card" }>): void {
  const player = ctx.G.players[ctx.playerId];
  const zones: FindZone[] = ["hand", "discard", "deck", "nationDeck"];

  if (effect.cardId) {
    for (const zone of zones) {
      const found = searchableFindCards(player, zone).includes(effect.cardId);
      if (zone === "deck" || zone === "nationDeck") shuffleFindDeckIfNeeded(ctx.G, ctx.playerId, zone, ctx.randomNumber);
      if (!found) continue;
      moveFoundCard(player, zone, effect.destination, effect.cardId);
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `FindResolved(${effect.cardId}/${zone}->${effect.destination})` });
      return;
    }
    ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `FindMissed(${effect.cardId})` });
    return;
  }

  const cardIds: string[] = [];
  for (const zone of zones) {
    for (const cardId of searchableFindCards(player, zone)) {
      if (cardMatchesFindCriteria(ctx.G, cardId, effect) && !cardIds.includes(cardId)) cardIds.push(cardId);
    }
    if (zone === "deck" || zone === "nationDeck") shuffleFindDeckIfNeeded(ctx.G, ctx.playerId, zone, ctx.randomNumber);
  }
  if (cardIds.length === 0) {
    ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: "FindMissed(criteria)" });
    return;
  }
  ctx.G.pendingFindChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, cardIds, destination: effect.destination };
  ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `FindChoicePending(${ctx.selfCardId ?? "unknown"}/options=${cardIds.length})` });
}

function isDisableHistoryOverride(override: ZoneOverride): override is Extract<ZoneOverride, { op: "disable_history" }> {
  return override.op === "disable_history";
}

export function runEffects(ctx: Ctx, effects: Effect[]): boolean {
  for (const effect of effects) {
    if (!runEffect(ctx, effect)) return false;
  }
  return true;
}

export function runTriggeredEffects(ctx: Ctx, effects: Effect[], trigger: EffectTrigger): boolean {
  return runEffects(ctx, effects.filter((effect) => effect.trigger === trigger));
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
      for (let i = 0; i < effect.count; i++) {
        const card = drawCardWithReshuffleLifecycle(ctx.G, ctx.playerId, ctx.randomNumber);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: card ? `Drew ${card}` : "Draw failed (no deck/discard cards)." });
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
    case "gain_resource": p.resources[effect.resource] = (p.resources[effect.resource] ?? 0) + effect.amount; ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Gained ${effect.amount} ${effect.resource}.` }); break;
    case "spend_resource": return payResourceCost(ctx.G, ctx.playerId, effect.resource, effect.amount);
    case "remove_resource": {
      const available = p.resources[effect.resource] ?? 0;
      const removed = Math.min(available, effect.amount);
      p.resources[effect.resource] = available - removed;
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Removed ${removed}/${effect.amount} ${effect.resource}.` });
      break;
    }
    case "return_resource": {
      const available = p.resources[effect.resource] ?? 0;
      const returned = Math.min(available, effect.amount);
      p.resources[effect.resource] = available - returned;
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Returned ${returned}/${effect.amount} ${effect.resource}.` });
      break;
    }
    case "steal_resource": {
      const target = ctx.G.players[effect.fromPlayerId];
      if (!target) {
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `StealSkipped(player_not_found/${effect.fromPlayerId}).` });
        break;
      }
      const available = target.resources[effect.resource] ?? 0;
      const stolen = Math.min(available, effect.amount);
      target.resources[effect.resource] = available - stolen;
      p.resources[effect.resource] = (p.resources[effect.resource] ?? 0) + stolen;
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
    case "move_self_to_history": {
      if (!ctx.selfCardId) break;
      removeOneCard(p.playArea, ctx.selfCardId);
      removeOneCard(p.discard, ctx.selfCardId);
      const disableHistory = ctx.G.activeNationRulesets?.[ctx.playerId]?.zoneOverrides?.find(isDisableHistoryOverride);
      if (disableHistory?.replacementBehavior === "discard") {
        p.discard.push(ctx.selfCardId);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to discard (history disabled).` });
      } else if (disableHistory?.replacementBehavior === "exile") {
        p.exile.push(ctx.selfCardId);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to exile (history disabled).` });
      } else if (disableHistory?.replacementBehavior === "alternate_zone") {
        p.sideAreas ??= {};
        p.sideAreas.alternate_history ??= [];
        p.sideAreas.alternate_history.push(ctx.selfCardId);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to alternate_history (history disabled).` });
      } else {
        p.history.push(ctx.selfCardId);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to history.` });
      }
      break;
    }
    case "acquire_card": {
      for (let i = 0; i < effect.count; i++) {
        const cardId = ctx.G.market[0];
        if (!cardId) break;
        ctx.G.market = ctx.G.market.slice(1);
        collectMarketResources(ctx.G, ctx.playerId, cardId);
        p.hand.push(cardId);
        collectMarketUnrest(ctx.G, ctx.playerId, cardId);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Acquired ${cardId} from market.` });
        refillMarketSlot(ctx.G, { playerId: ctx.playerId, slotIndex: 0, acquiredCardId: cardId });
      }
      break;
    }
    case "break_through": {
      breakThrough(ctx.G, { playerId: ctx.playerId, suit: effect.suit, source: effect.source, count: effect.count, cardId: effect.cardId, randomNumber: ctx.randomNumber });
      break;
    }
    case "find_card": {
      runFindCard(ctx, effect);
      break;
    }
    case "conditional_resource_at_least": runEffects(ctx, p.resources[effect.resource] >= effect.atLeast ? effect.then : effect.else ?? []); break;
    case "conditional_state_is": runEffects(ctx, p.stateArea[0] === effect.state ? effect.then : effect.else ?? []); break;
    case "optional": {
      ctx.G.pendingChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, choices: [effect.effects, []] };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `OptionalPending(${ctx.selfCardId ?? "unknown"})` });
      break;
    }
    case "choose_one": {
      ctx.G.pendingChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, choices: effect.choices };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ChoicePending(${ctx.selfCardId ?? "unknown"}/options=${effect.choices.length})` });
      break;
    }
  }
  return true;
}
