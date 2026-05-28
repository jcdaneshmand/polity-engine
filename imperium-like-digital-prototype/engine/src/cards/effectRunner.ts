import type { Effect, GameState } from "../game/state";
import { drawCard } from "../game/zones";

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

export function runEffects(ctx: Ctx, effects: Effect[]): void {
  for (const effect of effects) runEffect(ctx, effect);
}

function runEffect(ctx: Ctx, effect: Effect): void {
  const p = ctx.G.players[ctx.playerId];

  const maybeOp = (effect as unknown as { op?: string }).op ?? "";
  if ((maybeOp === "trade" || maybeOp === "commerce" || maybeOp === "profit") && isTradeExpansionDisabled(ctx)) {
    ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Ignored ${maybeOp} because trade_routes is disabled.` });
    return;
  }

  switch (effect.op) {
    case "draw": {
      for (let i = 0; i < effect.count; i++) {
        const card = drawCard(p, ctx.randomNumber);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: card ? `Drew ${card}` : "Draw failed (no deck/discard cards)." });
      }
      break;
    }
    case "gain_resource": p.resources[effect.resource] = (p.resources[effect.resource] ?? 0) + effect.amount; ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Gained ${effect.amount} ${effect.resource}.` }); break;
    case "spend_resource": p.resources[effect.resource] = Math.max(0, (p.resources[effect.resource] ?? 0) - effect.amount); ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Spent ${effect.amount} ${effect.resource}.` }); break;
    case "discard_random": {
      for (let i = 0; i < effect.count; i++) {
        if (p.hand.length === 0) break;
        const roll = ctx.randomNumber ? ctx.randomNumber() : Math.random();
        const randomIndex = Math.floor(roll * p.hand.length);
        const [card] = p.hand.splice(randomIndex, 1);
        if (card) { p.discard.push(card); ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Discarded ${card} at random.` }); }
      }
      break;
    }
    case "move_self_to_history": {
      if (!ctx.selfCardId) break;
      p.playArea = p.playArea.filter((id) => id !== ctx.selfCardId);
      p.discard = p.discard.filter((id) => id !== ctx.selfCardId);
      p.history.push(ctx.selfCardId);
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `${ctx.selfCardId} moved to history.` });
      break;
    }
    case "acquire_card": {
      for (let i = 0; i < effect.count; i++) {
        const cardId = ctx.G.market[0];
        if (!cardId) break;
        ctx.G.market = ctx.G.market.slice(1);
        p.discard.push(cardId);
        ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Acquired ${cardId} from market.` });
      }
      break;
    }
    case "conditional_resource_at_least": runEffects(ctx, p.resources[effect.resource] >= effect.atLeast ? effect.then : effect.else ?? []); break;
    case "choose_one": {
      const firstChoice = effect.choices?.[0] ?? [];
      ctx.G.log.push({ round: ctx.G.round, playerId: ctx.playerId, message: `Resolved choose_one by selecting first option.` });
      runEffects(ctx, firstChoice);
      break;
    }
  }
}
