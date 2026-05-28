import type { Ctx } from "boardgame.io";
import type { GameState } from "./state";
import { drawCard, maybeReshuffleDeck, moveAllToDiscard } from "./zones";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { applyScoringLifecycleOnce } from "./scoring";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

export function onTurnBegin(G: GameState, ctx: Ctx, randomNumber?: () => number): void {
  const p = G.players[ctx.currentPlayer];
  const ruleset = G.activeNationRulesets?.[ctx.currentPlayer];

  for (const ov of ruleset?.stateOverrides ?? []) {
    logOverride(G, ctx.currentPlayer, ruleset.nationId, "state", ov.op);
    if (ov.op === "start_as_state" && !p.stateArea.includes(ov.state)) p.stateArea.unshift(ov.state);
  }
  p.actionsRemaining = p.actionTokensBase;
  p.actionTokensAvailable = p.actionTokensBase;
  p.exhaustTokensAvailable = p.exhaustTokensBase;

  if (p.hand.length < 5) {
    while (p.hand.length < 5) {
      const shouldReshuffle = p.deck.length === 0 && p.discard.length > 0;
      let reshuffled = false;
      if (shouldReshuffle) {
        runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_reshuffle" });
        reshuffled = maybeReshuffleDeck(G, ctx.currentPlayer, randomNumber);
        runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_reshuffle" });
      }
      const drawn = drawCard(p, randomNumber, !shouldReshuffle || reshuffled);
      if (!drawn) break;
    }
  }
}

export function onTurnEnd(G: GameState, ctx: Ctx): void {
  const p = G.players[ctx.currentPlayer];
  const ruleset = G.activeNationRulesets?.[ctx.currentPlayer];
  const preventDiscard = !!ruleset?.cleanupOverrides.some((ov) => ov.op === "prevent_voluntary_discard");
  for (const ov of ruleset?.cleanupOverrides ?? []) {
    logOverride(G, ctx.currentPlayer, ruleset.nationId, "cleanup", ov.op);
    if (ov.op === "custom_cleanup_effect") runEffects({ G, playerId: ctx.currentPlayer, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  if (!preventDiscard) moveAllToDiscard(p);
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "before_solstice" });
  for (const ov of ruleset?.solsticeOverrides ?? []) {
    logOverride(G, ctx.currentPlayer, ruleset.nationId, "solstice", ov.op);
    if (ov.op === "flip_state") p.stateArea.reverse();
    if (ov.op === "custom_solstice_effect") runEffects({ G, playerId: ctx.currentPlayer, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  runNationHooks({ G, playerId: ctx.currentPlayer, trigger: "after_solstice" });
  applyScoringLifecycleOnce(G, ctx.currentPlayer);
  G.round += 1;
}
