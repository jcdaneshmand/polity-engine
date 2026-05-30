import type { PlayerState, ResourceName } from "./state";
import type { GameState } from "./state";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { canPayResourceCosts, payResourceCosts, type ResourceCost } from "./payments";
import { triggerScoring } from "./scoring";
import { activateState } from "./stateMatching";

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

function hasNationProgressionCards(player: PlayerState): boolean {
  return player.nationDeck.length > 0 || Boolean(player.accessionCardId);
}

function isAccessionCard(G: GameState, player: PlayerState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return cardId === player.accessionCardId
    || (card?.cardType ?? card?.type) === "accession"
    || (card?.tags ?? []).includes("accession");
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

function takeNextNationProgressionCard(G: GameState, player: PlayerState): { cardId: string; isAccession: boolean } | undefined {
  const cardId = player.nationDeck.shift();
  if (cardId) {
    const isAccession = isAccessionCard(G, player, cardId);
    if (isAccession) player.accessionCardId = undefined;
    return { cardId, isAccession };
  }
  if (!player.accessionCardId) return undefined;
  const accessionCardId = player.accessionCardId;
  player.accessionCardId = undefined;
  return { cardId: accessionCardId, isAccession: true };
}

function flipStateForAccession(G: GameState, playerId: string, accessionCardId: string): void {
  const p = G.players[playerId];
  const ruleset = G.activeNationRulesets?.[playerId];
  const neverFlip = (ruleset?.rulesetTags ?? []).includes("never_becomes_empire")
    || (ruleset?.stateOverrides ?? []).some((ov) => ov.op === "never_flip_to_empire");
  if (neverFlip) {
    G.log.push({ round: G.round, playerId, message: `StateFlipSkippedOnAccession(${accessionCardId}/never_empire)` });
    return;
  }
  if (p.stateArea.length >= 2) [p.stateArea[0], p.stateArea[1]] = [p.stateArea[1], p.stateArea[0]];
  else activateState(G, playerId, "empire");
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

function payDevelopmentCost(G: GameState, playerId: string, cardId: string, payment?: ResourceCost): boolean {
  const cost = G.cardDb[cardId]?.developmentCost ?? {};
  return payResourceCosts(G, playerId, cost, payment);
}

function runAfterReshuffleEffects(G: GameState, playerId: string, randomNumber: (() => number) | undefined, resumeDrawCount: number, startOverrideIndex = 0): boolean {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (ruleset) {
    const overrides = ruleset.reshuffleOverrides ?? [];
    for (let index = startOverrideIndex; index < overrides.length; index += 1) {
      const ov = overrides[index];
      if (G.gameover) return false;
      if (ov.op === "skip_default_nation_card_addition") continue;
      if (ov.op === "development_available_from_start") continue;
      if (ov.op === "trigger_game_end_when_card_added") continue;
      if (ov.op === "place_nation_card_in_play_when_added") continue;
      logOverride(G, playerId, ruleset.nationId, "reshuffle", ov.op);
      if (ov.op === "custom_reshuffle_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
      if (G.gameover) return false;
      if (hasPendingInterruption(G)) {
        G.pendingAfterReshuffleEffects = { playerId, resumeDrawCount, nextOverrideIndex: index + 1 };
        return false;
      }
    }
  }
  runNationHooks({ G, playerId, trigger: "after_reshuffle", randomNumber });
  if (G.gameover) return false;
  if (hasPendingInterruption(G)) {
    G.pendingReshuffleDraw = { playerId, resumeDrawCount };
    return false;
  }
  return true;
}

function drawReshuffleResumeCards(G: GameState, playerId: string, randomNumber: (() => number) | undefined, resumeDrawCount: number): void {
  const p = G.players[playerId];
  for (let i = 0; i < resumeDrawCount; i += 1) {
    const drawn = drawCard(p, randomNumber, false);
    if (!drawn) break;
  }
}

function finishReshuffleAfterDevelopmentDecision(G: GameState, playerId: string, randomNumber: (() => number) | undefined, resumeDrawCount: number): void {
  const p = G.players[playerId];
  p.deck = shuffleWithRandom(p.discard, randomNumber);
  p.discard = [];
  G.log.push({ round: G.round, playerId, message: `ReshuffleResolved(deck=${p.deck.length}, deterministic=${randomNumber ? "injected_rng" : "fallback_zero"})` });
  if (!runAfterReshuffleEffects(G, playerId, randomNumber, resumeDrawCount)) return;

  drawReshuffleResumeCards(G, playerId, randomNumber, resumeDrawCount);
}

function finishPostDevelopmentResolution(G: GameState, playerId: string, randomNumber: (() => number) | undefined, resumeDrawCount: number, resumeBehavior?: "reshuffle_draw" | "none"): void {
  if (G.players[playerId].developmentArea.length === 0) triggerScoring(G, "development_area_empty", playerId);
  if (resumeBehavior === "none") return;
  finishReshuffleAfterDevelopmentDecision(G, playerId, randomNumber, resumeDrawCount);
}

function shouldSkipDefaultNationProgression(G: GameState, playerId: string): boolean {
  const ruleset = G.activeNationRulesets?.[playerId];
  return (ruleset?.reshuffleOverrides ?? []).some((ov) => ov.op === "skip_default_nation_card_addition");
}

function canDevelopBeforeNationDeckEmpty(G: GameState, playerId: string): boolean {
  const ruleset = G.activeNationRulesets?.[playerId];
  return (ruleset?.reshuffleOverrides ?? []).some((ov) => ov.op === "development_available_from_start")
    || (ruleset?.rulesetTags ?? []).includes("development_area_available_from_start");
}

function triggerScoringForTerminalNationCard(G: GameState, playerId: string, cardId: string): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  const triggers = (ruleset?.reshuffleOverrides ?? []).filter((ov) => ov.op === "trigger_game_end_when_card_added");
  if (triggers.some((ov) => ov.cardId === cardId)) triggerScoring(G, `nation_card_added:${cardId}`, playerId);
}

function nationCardInPlayOverride(G: GameState, playerId: string, cardId: string): { suppressStateFlip?: boolean } | undefined {
  const ruleset = G.activeNationRulesets?.[playerId];
  return (ruleset?.reshuffleOverrides ?? []).find((ov) => ov.op === "place_nation_card_in_play_when_added" && ov.cardId === cardId) as { suppressStateFlip?: boolean } | undefined;
}

function startShortGameDevelopmentExileChoice(G: GameState, playerId: string, resumeDrawCount: number): boolean {
  if (!G.options?.enabledVariants?.includes("short_game")) return false;
  const ruleset = G.activeNationRulesets?.[playerId];
  if ((ruleset?.shortGameOverrides ?? []).some((ov) => ov.op === "skip_accession_development_exile")) {
    logOverride(G, playerId, ruleset?.nationId ?? "unknown", "short_game", "skip_accession_development_exile");
    return false;
  }
  const cardIds = [...G.players[playerId].developmentArea];
  if (cardIds.length === 0) return false;
  G.pendingShortGameDevelopmentExileChoice = { playerId, cardIds, resumeDrawCount };
  G.log.push({ round: G.round, playerId, message: `ShortGameDevelopmentExilePending(options=${cardIds.length})` });
  return true;
}

function canAttemptReshuffleLifecycle(G: GameState, playerId: string): boolean {
  const p = G.players[playerId];
  if (p.deck.length > 0) return false;
  if (p.discard.length > 0) return true;
  if (shouldSkipDefaultNationProgression(G, playerId)) {
    return canSpendProgressionToken(p) && canDevelopBeforeNationDeckEmpty(G, playerId) && p.developmentArea.length > 0;
  }
  return canSpendProgressionToken(p) && (hasNationProgressionCards(p) || p.developmentArea.length > 0);
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
  if (!canAttemptReshuffleLifecycle(G, playerId)) return { attempted: false, shuffled: false };
  if (G.pendingDevelopmentChoice) return { attempted: false, shuffled: false };
  const ruleset = G.activeNationRulesets?.[playerId];
  const skipDefaultNationCard = shouldSkipDefaultNationProgression(G, playerId);

  if (ruleset) {
    for (const ov of ruleset.reshuffleOverrides ?? []) {
      if (ov.op === "skip_default_nation_card_addition") logOverride(G, playerId, ruleset.nationId, "reshuffle", ov.op);
    }
  }
  if (canSpendProgressionToken(p)) {
    if ((skipDefaultNationCard || !hasNationProgressionCards(p)) && canDevelopBeforeNationDeckEmpty(G, playerId) && p.developmentArea.length > 0) {
      const cardIds = payableDevelopmentCards(G, playerId);
      if (cardIds.length > 0) {
        G.pendingDevelopmentChoice = { playerId, cardIds, resumeDrawCount, allowSkip: true };
        G.log.push({ round: G.round, playerId, message: `DevelopmentChoicePending(options=${cardIds.length}/available_from_start)` });
        return { attempted: true, shuffled: false };
      }
    }
    if (skipDefaultNationCard) {
      p.deck = shuffleWithRandom(p.discard, randomNumber);
      G.log.push({ round: G.round, playerId, message: `ReshuffleResolved(deck=${p.deck.length}, deterministic=${randomNumber ? "injected_rng" : "fallback_zero"})` });
      p.discard = [];
      return { attempted: true, shuffled: true };
    }
    const nationCard = takeNextNationProgressionCard(G, p);
    if (nationCard) {
      const inPlayOverride = nationCardInPlayOverride(G, playerId, nationCard.cardId);
      if (inPlayOverride) p.playArea.push(nationCard.cardId);
      else p.discard.push(nationCard.cardId);
      spendProgressionToken(p, hasNationProgressionCards(p) ? "nationDeck" : "developmentArea");
      G.log.push({ round: G.round, playerId, message: inPlayOverride ? `NationCardAddedToPlayOnReshuffle(${nationCard.cardId})` : `NationCardAddedOnReshuffle(${nationCard.cardId})` });
      if (nationCard.isAccession && !inPlayOverride?.suppressStateFlip) flipStateForAccession(G, playerId, nationCard.cardId);
      triggerScoringForTerminalNationCard(G, playerId, nationCard.cardId);
      if (nationCard.isAccession && startShortGameDevelopmentExileChoice(G, playerId, resumeDrawCount)) {
        return { attempted: true, shuffled: false };
      }
    } else if (p.developmentArea.length > 0) {
      const cardIds = payableDevelopmentCards(G, playerId);
      if (cardIds.length > 0) {
        G.pendingDevelopmentChoice = { playerId, cardIds, resumeDrawCount, allowSkip: true };
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

export function resolvePendingDevelopmentChoice(G: GameState, playerId: string, cardId: string, randomNumber?: () => number, payment?: ResourceCost): boolean {
  const pending = G.pendingDevelopmentChoice;
  if (!pending || pending.playerId !== playerId || !pending.cardIds.includes(cardId)) return false;
  const usesProgressionToken = pending.usesProgressionToken !== false;
  const paysDevelopmentCost = pending.free !== true;
  if ((usesProgressionToken && !canSpendProgressionToken(G.players[playerId])) || (paysDevelopmentCost && !canPayDevelopmentCost(G, playerId, cardId))) return false;

  const p = G.players[playerId];
  const index = p.developmentArea.indexOf(cardId);
  if (index < 0) return false;
  const resumeDrawCount = pending.resumeDrawCount;

  if (paysDevelopmentCost && !payDevelopmentCost(G, playerId, cardId, payment)) return false;
  G.pendingDevelopmentChoice = undefined;
  p.developmentArea.splice(index, 1);
  p.discard.push(cardId);
  if (usesProgressionToken) spendProgressionToken(p, "developmentArea");
  G.log.push({ round: G.round, playerId, message: `DevelopmentResolved(${cardId})` });
  runNationHooks({ G, playerId, trigger: "after_develop", payload: { cardId } });
  if (G.gameover) return true;
  if (hasPendingInterruption(G)) {
    G.pendingPostDevelopmentResolution = { playerId, resumeDrawCount, resumeBehavior: pending.resumeBehavior };
    return true;
  }

  finishPostDevelopmentResolution(G, playerId, randomNumber, resumeDrawCount, pending.resumeBehavior);
  return true;
}

export function skipPendingDevelopmentChoice(G: GameState, playerId: string, randomNumber?: () => number): boolean {
  const pending = G.pendingDevelopmentChoice;
  if (!pending || pending.playerId !== playerId || !pending.allowSkip) return false;
  const resumeDrawCount = pending.resumeDrawCount;
  G.pendingDevelopmentChoice = undefined;
  G.log.push({ round: G.round, playerId, message: "DevelopmentSkipped(player_declined)" });
  finishReshuffleAfterDevelopmentDecision(G, playerId, randomNumber, resumeDrawCount);
  return true;
}

export function resolvePendingShortGameDevelopmentExileChoice(G: GameState, playerId: string, cardId: string, randomNumber?: () => number): boolean {
  const pending = G.pendingShortGameDevelopmentExileChoice;
  if (!pending || pending.playerId !== playerId || !pending.cardIds.includes(cardId)) return false;
  const p = G.players[playerId];
  const index = p.developmentArea.indexOf(cardId);
  if (index < 0) return false;

  p.developmentArea.splice(index, 1);
  p.exile.push(cardId);
  G.pendingShortGameDevelopmentExileChoice = undefined;
  G.log.push({ round: G.round, playerId, message: `ShortGameDevelopmentExiled(${cardId})` });
  finishReshuffleAfterDevelopmentDecision(G, playerId, randomNumber, pending.resumeDrawCount);
  return true;
}

export function createCardDrivenDevelopmentChoice(G: GameState, playerId: string, sourceCardId?: string, options: { free?: boolean } = {}): boolean {
  const p = G.players[playerId];
  if (p.developmentArea.length === 0) {
    G.log.push({ round: G.round, playerId, message: "DevelopmentSkipped(no_development_area)" });
    return false;
  }
  const cardIds = options.free ? [...p.developmentArea] : payableDevelopmentCards(G, playerId);
  if (cardIds.length === 0) {
    G.log.push({ round: G.round, playerId, message: "DevelopmentSkipped(no_payable_cards)" });
    return false;
  }
  G.pendingDevelopmentChoice = {
    playerId,
    sourceCardId,
    cardIds,
    resumeDrawCount: 0,
    resumeBehavior: "none",
    usesProgressionToken: false,
    ...(options.free ? { free: true } : {})
  };
  G.log.push({ round: G.round, playerId, message: `DevelopmentChoicePending(${sourceCardId ?? "unknown"}/source=card_effect/options=${cardIds.length})` });
  return true;
}

export function drawCardWithReshuffleLifecycle(G: GameState, playerId: string, randomNumber?: () => number, resumeDrawCount = 1): string | null {
  const p = G.players[playerId];
  const shouldReshuffle = canAttemptReshuffleLifecycle(G, playerId);
  (G as any)._reshuffleInProgressByPlayer ??= {};
  if (shouldReshuffle && !(G as any)._reshuffleInProgressByPlayer[playerId]) {
    (G as any)._reshuffleInProgressByPlayer[playerId] = true;
    try {
      runNationHooks({ G, playerId, trigger: "before_reshuffle", randomNumber });
      if (G.gameover) return null;
      if (hasPendingInterruption(G)) {
        G.pendingReshuffleResolution = { playerId, resumeDrawCount };
        return null;
      }
      const result = maybeReshuffleDeck(G, playerId, randomNumber, resumeDrawCount);
      if (result.shuffled && !runAfterReshuffleEffects(G, playerId, randomNumber, resumeDrawCount)) return null;
    } finally {
      (G as any)._reshuffleInProgressByPlayer[playerId] = false;
    }
  }
  if (G.gameover) return null;
  return drawCard(p, randomNumber, !shouldReshuffle);
}

export function continuePendingReshuffleLifecycle(G: GameState, playerId: string, randomNumber?: () => number): boolean {
  const postDevelopment = G.pendingPostDevelopmentResolution;
  if (postDevelopment && postDevelopment.playerId === playerId && !G.gameover && !hasPendingInterruption(G)) {
    G.pendingPostDevelopmentResolution = undefined;
    finishPostDevelopmentResolution(G, playerId, randomNumber, postDevelopment.resumeDrawCount, postDevelopment.resumeBehavior);
    return true;
  }

  const pendingDraw = G.pendingReshuffleDraw;
  if (pendingDraw && pendingDraw.playerId === playerId && !G.gameover && !hasPendingInterruption(G)) {
    G.pendingReshuffleDraw = undefined;
    drawReshuffleResumeCards(G, playerId, randomNumber, pendingDraw.resumeDrawCount);
    return true;
  }

  const pendingAfterEffects = G.pendingAfterReshuffleEffects;
  if (pendingAfterEffects && pendingAfterEffects.playerId === playerId && !G.gameover && !hasPendingInterruption(G)) {
    G.pendingAfterReshuffleEffects = undefined;
    if (runAfterReshuffleEffects(G, playerId, randomNumber, pendingAfterEffects.resumeDrawCount, pendingAfterEffects.nextOverrideIndex)) {
      drawReshuffleResumeCards(G, playerId, randomNumber, pendingAfterEffects.resumeDrawCount);
    }
    return true;
  }

  const pending = G.pendingReshuffleResolution;
  if (!pending || pending.playerId !== playerId || G.gameover || hasPendingInterruption(G)) return false;
  G.pendingReshuffleResolution = undefined;
  (G as any)._reshuffleInProgressByPlayer ??= {};
  (G as any)._reshuffleInProgressByPlayer[playerId] = true;
  try {
    const result = maybeReshuffleDeck(G, playerId, randomNumber, pending.resumeDrawCount);
    if (result.shuffled && !runAfterReshuffleEffects(G, playerId, randomNumber, pending.resumeDrawCount)) return true;
    drawReshuffleResumeCards(G, playerId, randomNumber, pending.resumeDrawCount);
    return true;
  } finally {
    (G as any)._reshuffleInProgressByPlayer[playerId] = false;
  }
}


export function moveAllToDiscard(player: PlayerState): void {
  player.discard.push(...player.hand);
  player.hand = [];
}
