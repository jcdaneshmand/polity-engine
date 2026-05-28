import type { PlayerState } from "./state";
import type { GameState } from "./state";
import { runEffects } from "../cards/effectRunner";

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

export function drawCard(player: PlayerState, randomNumber?: () => number): string | null {
  if (player.deck.length === 0 && player.discard.length > 0) {
    player.deck = shuffleWithRandom(player.discard, randomNumber);
    player.discard = [];
  }
  const cardId = player.deck.shift();
  if (!cardId) return null;
  player.hand.push(cardId);
  return cardId;
}

export function maybeReshuffleDeck(G: GameState, playerId: string, randomNumber?: () => number): void {
  const p = G.players[playerId];
  if (p.deck.length > 0 || p.discard.length === 0) return;
  const ruleset = G.activeNationRulesets?.[playerId];
  const skipDefault = !!ruleset?.reshuffleOverrides.some((ov) => ov.op === "skip_default_nation_card_addition");
  if (!skipDefault) {
    p.deck = shuffleWithRandom(p.discard, randomNumber);
    p.discard = [];
  }
  for (const ov of ruleset?.reshuffleOverrides ?? []) {
    logOverride(G, playerId, ruleset.nationId, "reshuffle", ov.op);
    if (ov.op === "custom_reshuffle_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
}

export function moveAllToDiscard(player: PlayerState): void {
  player.discard.push(...player.hand, ...player.playArea);
  player.hand = [];
  player.playArea = [];
}
