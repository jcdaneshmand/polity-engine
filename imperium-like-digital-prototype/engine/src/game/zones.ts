import type { PlayerState } from "./state";
import type { GameState } from "./state";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

function shuffleWithRandom<T>(items: T[], randomNumber?: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const roll = randomNumber ? randomNumber() : Math.random();
    const j = Math.floor(roll * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function drawCard(player: PlayerState, randomNumber?: () => number, allowAutoReshuffle = true): string | null {
  if (allowAutoReshuffle && player.deck.length === 0 && player.discard.length > 0) {
    player.deck = shuffleWithRandom(player.discard, randomNumber);
    player.discard = [];
  }
  const cardId = player.deck.shift();
  if (!cardId) return null;
  player.hand.push(cardId);
  return cardId;
}

export function maybeReshuffleDeck(G: GameState, playerId: string, randomNumber?: () => number): { attempted: boolean; shuffled: boolean } {
  const p = G.players[playerId];
  if (p.deck.length > 0 || p.discard.length === 0) return { attempted: false, shuffled: false };
  const ruleset = G.activeNationRulesets?.[playerId];
  p.deck = shuffleWithRandom(p.discard, randomNumber);
  p.discard = [];
  const shuffled = true;
  for (const ov of ruleset?.reshuffleOverrides ?? []) {
    logOverride(G, playerId, ruleset.nationId, "reshuffle", ov.op);
    if (ov.op === "custom_reshuffle_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  return { attempted: true, shuffled };
}

export function drawCardWithReshuffleLifecycle(G: GameState, playerId: string, randomNumber?: () => number): string | null {
  const p = G.players[playerId];
  const shouldReshuffle = p.deck.length === 0 && p.discard.length > 0;
  (G as any)._reshuffleInProgressByPlayer ??= {};
  if (shouldReshuffle && !(G as any)._reshuffleInProgressByPlayer[playerId]) {
    (G as any)._reshuffleInProgressByPlayer[playerId] = true;
    runNationHooks({ G, playerId, trigger: "before_reshuffle", randomNumber });
    maybeReshuffleDeck(G, playerId, randomNumber);
    runNationHooks({ G, playerId, trigger: "after_reshuffle", randomNumber });
    (G as any)._reshuffleInProgressByPlayer[playerId] = false;
  }
  return drawCard(p, randomNumber, !shouldReshuffle);
}


export function moveAllToDiscard(player: PlayerState): void {
  player.discard.push(...player.hand, ...player.playArea);
  player.hand = [];
  player.playArea = [];
}
