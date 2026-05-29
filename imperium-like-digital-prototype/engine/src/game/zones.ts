import type { PlayerState, ResourceName } from "./state";
import type { GameState } from "./state";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { canPayResourceCosts, payResourceCosts } from "./payments";
import { triggerScoring } from "./scoring";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

function shuffleWithRandom<T>(items: T[], randomNumber?: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const roll = randomNumber ? randomNumber() : 0;
    const j = Math.floor(roll * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function ensureProgressionTokens(player: PlayerState): { nationDeck: number; developmentArea: number } {
  player.progressionTokens ??= { nationDeck: 0, developmentArea: 0 };
  return player.progressionTokens;
}

function hasProgressionMarker(player: PlayerState): boolean {
  const tokens = ensureProgressionTokens(player);
  return tokens.nationDeck > 0 || tokens.developmentArea > 0;
}

function canSpendProgressionToken(player: PlayerState): boolean {
  return !hasProgressionMarker(player) && player.exhaustTokensAvailable > 0;
}

function spendProgressionToken(player: PlayerState, destination: "nationDeck" | "developmentArea"): void {
  const tokens = ensureProgressionTokens(player);
  player.exhaustTokensAvailable -= 1;
  tokens[destination] += 1;
}

function flipStateForAccession(G: GameState, playerId: string, accessionCardId: string): void {
  const p = G.players[playerId];
  if (p.stateArea.length >= 2) p.stateArea.reverse();
  G.log.push({ round: G.round, playerId, message: `StateFlippedOnAccession(${accessionCardId})` });
}

function payableDevelopmentCards(G: GameState, playerId: string): string[] {
  const p = G.players[playerId];
  return p.developmentArea.filter((cardId) => canPayDevelopmentCost(G, playerId, cardId));
}

function canPayDevelopmentCost(G: GameState, playerId: string, cardId: string): boolean {
  const cost = G.cardDb[cardId]?.developmentCost ?? {};
  return canPayResourceCosts(G, playerId, cost);
}

function payDevelopmentCost(G: GameState, playerId: string, cardId: string): boolean {
  const cost = G.cardDb[cardId]?.developmentCost ?? {};
  return payResourceCosts(G, playerId, cost);
}

function runAfterReshuffleEffects(G: GameState, playerId: string, randomNumber?: () => number): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (ruleset) {
    for (const ov of ruleset.reshuffleOverrides ?? []) {
      if (ov.op === "skip_default_nation_card_addition") continue;
      logOverride(G, playerId, ruleset.nationId, "reshuffle", ov.op);
      if (ov.op === "custom_reshuffle_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
    }
  }
  runNationHooks({ G, playerId, trigger: "after_reshuffle", randomNumber });
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

export function maybeReshuffleDeck(G: GameState, playerId: string, randomNumber?: () => number, resumeDrawCount = 1): { attempted: boolean; shuffled: boolean } {
  const p = G.players[playerId];
  if (p.deck.length > 0 || p.discard.length === 0) return { attempted: false, shuffled: false };
  if (G.pendingDevelopmentChoice) return { attempted: false, shuffled: false };
  const ruleset = G.activeNationRulesets?.[playerId];
  const skipDefaultNationCard = (ruleset?.reshuffleOverrides ?? []).some((ov) => ov.op === "skip_default_nation_card_addition");

  if (ruleset) {
    for (const ov of ruleset.reshuffleOverrides ?? []) {
      if (ov.op === "skip_default_nation_card_addition") logOverride(G, playerId, ruleset.nationId, "reshuffle", ov.op);
    }
  }
  if (!skipDefaultNationCard && canSpendProgressionToken(p)) {
    const nationCardId = p.nationDeck.shift();
    if (nationCardId) {
      p.discard.push(nationCardId);
      spendProgressionToken(p, p.nationDeck.length === 0 ? "developmentArea" : "nationDeck");
      G.log.push({ round: G.round, playerId, message: `NationCardAddedOnReshuffle(${nationCardId})` });
      if (nationCardId === p.accessionCardId) flipStateForAccession(G, playerId, nationCardId);
    } else if (p.developmentArea.length > 0) {
      const cardIds = payableDevelopmentCards(G, playerId);
      if (cardIds.length > 0) {
        G.pendingDevelopmentChoice = { playerId, cardIds, resumeDrawCount };
        G.log.push({ round: G.round, playerId, message: `DevelopmentChoicePending(options=${cardIds.length})` });
        return { attempted: true, shuffled: false };
      }
      G.log.push({ round: G.round, playerId, message: "DevelopmentSkipped(no_payable_cards)" });
    }
  }

  p.deck = shuffleWithRandom(p.discard, randomNumber);
  G.log.push({ round: G.round, playerId, message: `ReshuffleResolved(deck=${p.deck.length}, deterministic=${randomNumber ? "injected_rng" : "fallback_zero"})` });
  p.discard = [];
  return { attempted: true, shuffled: true };
}

export function resolvePendingDevelopmentChoice(G: GameState, playerId: string, cardId: string, randomNumber?: () => number): boolean {
  const pending = G.pendingDevelopmentChoice;
  if (!pending || pending.playerId !== playerId || !pending.cardIds.includes(cardId)) return false;
  if (!canSpendProgressionToken(G.players[playerId]) || !canPayDevelopmentCost(G, playerId, cardId)) return false;

  const p = G.players[playerId];
  const index = p.developmentArea.indexOf(cardId);
  if (index < 0) return false;

  if (!payDevelopmentCost(G, playerId, cardId)) return false;
  p.developmentArea.splice(index, 1);
  p.discard.push(cardId);
  spendProgressionToken(p, "developmentArea");
  G.log.push({ round: G.round, playerId, message: `DevelopmentResolved(${cardId})` });
  if (p.developmentArea.length === 0) triggerScoring(G, "development_area_empty", playerId);

  const resumeDrawCount = pending.resumeDrawCount;
  G.pendingDevelopmentChoice = undefined;
  p.deck = shuffleWithRandom(p.discard, randomNumber);
  p.discard = [];
  G.log.push({ round: G.round, playerId, message: `ReshuffleResolved(deck=${p.deck.length}, deterministic=${randomNumber ? "injected_rng" : "fallback_zero"})` });
  runAfterReshuffleEffects(G, playerId, randomNumber);

  for (let i = 0; i < resumeDrawCount; i++) {
    const drawn = drawCard(p, randomNumber, false);
    if (!drawn) break;
  }
  return true;
}

export function drawCardWithReshuffleLifecycle(G: GameState, playerId: string, randomNumber?: () => number, resumeDrawCount = 1): string | null {
  const p = G.players[playerId];
  const shouldReshuffle = p.deck.length === 0 && p.discard.length > 0;
  (G as any)._reshuffleInProgressByPlayer ??= {};
  if (shouldReshuffle && !(G as any)._reshuffleInProgressByPlayer[playerId]) {
    (G as any)._reshuffleInProgressByPlayer[playerId] = true;
    try {
      runNationHooks({ G, playerId, trigger: "before_reshuffle", randomNumber });
      const result = maybeReshuffleDeck(G, playerId, randomNumber, resumeDrawCount);
      if (result.shuffled) runAfterReshuffleEffects(G, playerId, randomNumber);
    } finally {
      (G as any)._reshuffleInProgressByPlayer[playerId] = false;
    }
  }
  return drawCard(p, randomNumber, !shouldReshuffle);
}


export function moveAllToDiscard(player: PlayerState): void {
  player.discard.push(...player.hand);
  player.hand = [];
}
