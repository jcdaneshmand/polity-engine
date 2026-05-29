import type { Effect, GameState } from "../game/state";
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

function isDisableHistoryOverride(override: ZoneOverride): override is Extract<ZoneOverride, { op: "disable_history" }> {
  return override.op === "disable_history";
}

export function runEffects(ctx: Ctx, effects: Effect[]): boolean {
  for (const effect of effects) {
    if (!runEffect(ctx, effect)) return false;
  }
  return true;
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
      breakThrough(ctx.G, { playerId: ctx.playerId, suit: effect.suit, source: effect.source, count: effect.count });
      break;
    }
    case "conditional_resource_at_least": runEffects(ctx, p.resources[effect.resource] >= effect.atLeast ? effect.then : effect.else ?? []); break;
    case "choose_one": {
      ctx.G.pendingChoice = { playerId: ctx.playerId, sourceCardId: ctx.selfCardId, choices: effect.choices };
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `ChoicePending(${ctx.selfCardId ?? "unknown"}/options=${effect.choices.length})` });
      break;
    }
  }
  return true;
}
