import type { GameState } from "./state";
import type { ScoringOverride, ZoneOverride } from "../nations/nationRulesetTypes";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { currentStateMatches } from "./stateMatching";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

function getZoneCards(G: GameState, playerId: string, zoneId: string): string[] {
  const p = G.players[playerId];
  if (!p) return [];
  const direct = (p as any)[zoneId];
  if (Array.isArray(direct)) return direct;
  if (p.sideAreas?.[zoneId]) return p.sideAreas[zoneId];
  if (G.specialZones?.[playerId]?.[zoneId]?.cardIds) return G.specialZones[playerId][zoneId].cardIds;
  if (G.globalSpecialZones?.[zoneId]?.cardIds) return G.globalSpecialZones[zoneId].cardIds;
  return [];
}

function isDisableHistoryOverride(override: ZoneOverride): override is Extract<ZoneOverride, { op: "disable_history" }> {
  return override.op === "disable_history";
}

function isHistoryReplacementOverride(override: ZoneOverride): override is Extract<ZoneOverride, { op: "replace_history_with_zone" }> {
  return override.op === "replace_history_with_zone";
}

function cardVp(G: GameState, cardId: string): number {
  const vp = G.cardDb[cardId]?.vp as unknown;
  if (typeof vp === "number") return vp;
  if (typeof vp === "object" && vp !== null) {
    const { mode, value } = vp as { mode?: string; value?: unknown };
    const numericValue = typeof value === "number" ? value : 0;
    if (mode === "none") return 0;
    if (mode === "conditional") return 0;
    if (mode === "variable") return Math.min(numericValue, 10);
    if (mode === "negative") return -Math.abs(numericValue);
    return numericValue;
  }
  return 0;
}

function scoreCardIds(G: GameState, cardIds: string[]): number {
  return cardIds.reduce((sum, cardId) => sum + cardVp(G, cardId), 0);
}

function botCardVp(G: GameState, cardId: string): number {
  const vp = G.cardDb[cardId]?.vp as unknown;
  if (typeof vp === "number") return vp;
  if (typeof vp === "object" && vp !== null) {
    const { mode, value } = vp as { mode?: string; value?: unknown };
    const numericValue = typeof value === "number" ? value : 0;
    if (mode === "none") return 0;
    if (mode === "variable") return numericValue || 5;
    if (mode === "conditional") return numericValue;
    if (mode === "negative") return 0;
    return numericValue;
  }
  return 0;
}

function scoreBotCardIds(G: GameState, cardIds: string[]): number {
  return cardIds.reduce((sum, cardId) => sum + botCardVp(G, cardId), 0);
}

export function scoreBot(G: GameState): number {
  const bot = G.solo?.bot;
  if (!bot) return 0;
  const slotCardIds = Object.values(bot.slots).flatMap((slot) => slot.cardId ? [slot.cardId] : []);
  const cardScore = scoreBotCardIds(G, [
    ...slotCardIds,
    ...bot.botPlayArea,
    ...bot.botDeck,
    ...bot.botDiscard,
    ...bot.botHistory
  ]);
  const progressScore = bot.resources.knowledge ?? 0;
  const sovereignOrHigher = bot.difficulty === "sovereign" || bot.difficulty === "overlord" || bot.difficulty === "supreme_ruler";
  const goodsAsBasicResources = sovereignOrHigher ? 0 : (bot.resources.goods ?? 0) * 5;
  const basicResourceTotal = (bot.resources.materials ?? 0) + (bot.resources.influence ?? 0) + goodsAsBasicResources;
  const resourceDenominator = sovereignOrHigher ? 5 : 10;
  const basicResourceScore = Math.floor(basicResourceTotal / resourceDenominator);
  const sovereignGoodsScore = sovereignOrHigher ? (bot.resources.goods ?? 0) : 0;
  return cardScore + progressScore + basicResourceScore + sovereignGoodsScore;
}

function isUnrestCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "unrest" || card?.suit === "unrest" || card?.tags?.includes("unrest");
}

function scoreZone(G: GameState, playerId: string, zoneId: string, excludedZones: Set<string>): number {
  if (excludedZones.has(zoneId)) return 0;
  return scoreCardIds(G, getZoneCards(G, playerId, zoneId));
}

function isResourceRatioOverride(override: ScoringOverride): override is Extract<ScoringOverride, { op: "score_resource_ratio" }> {
  return override.op === "score_resource_ratio";
}

function scoreResourcePool(G: GameState, playerId: string): number {
  const p = G.players[playerId];
  const ruleset = G.activeNationRulesets?.[playerId];
  const progressAmount = p.resources.knowledge ?? 0;
  const progressOverride = (ruleset?.scoringOverrides ?? [])
    .filter(isResourceRatioOverride)
    .find((ov) =>
      ov.resource === "knowledge"
      && (!ov.state || currentStateMatches(G, playerId, ov.state))
    );
  if (!progressOverride || progressOverride.denominator <= 0) return progressAmount;
  return Math.floor(progressAmount * (progressOverride.numerator ?? 1) / progressOverride.denominator);
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
    ?? G.pendingSolsticeOrderChoice
  );
}

function garrisonedCardsInScoringZones(G: GameState, playerId: string, scoringZoneIds: string[], excludedZones: Set<string>): string[] {
  const hostIds = scoringZoneIds
    .filter((zoneId) => !excludedZones.has(zoneId))
    .flatMap((zoneId) => getZoneCards(G, playerId, zoneId));
  return hostIds.flatMap((hostId) => G.cardStates?.[hostId]?.garrisonedCardIds ?? []);
}

function collapseUnrestCount(G: GameState, playerId: string): number {
  const p = G.players[playerId];
  const ownedZoneIds = ["hand", "playArea", "deck", "discard", "history"];
  const ownedCards = ownedZoneIds.flatMap((zoneId) => getZoneCards(G, playerId, zoneId));
  const garrisonedCards = ownedZoneIds
    .flatMap((zoneId) => getZoneCards(G, playerId, zoneId))
    .flatMap((hostId) => G.cardStates?.[hostId]?.garrisonedCardIds ?? []);
  return [...ownedCards, ...garrisonedCards].filter((cardId) => isUnrestCard(G, cardId)).length;
}

function applyAutoWinCollapseOverride(G: GameState, playerId: string, ruleset: NonNullable<GameState["activeNationRulesets"]>[string], zoneId: string): void {
  if (G.gameover || getZoneCards(G, playerId, zoneId).length > 0) return;
  logOverride(G, playerId, ruleset.nationId, "collapse", "auto_win_if_zone_empty");
  G.gameover = { winner: playerId, reason: `auto_win_if_zone_empty:${zoneId}` };
  G.log.push({ round: G.round, playerId, message: `CollapseAutoWin(${ruleset.nationId}/${zoneId})` });
}

export function applyCollapseWinChecks(G: GameState, playerId: string, randomNumber?: () => number): boolean {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset || G.gameover) return true;
  const pending = G.pendingCollapseLifecycle?.playerId === playerId ? G.pendingCollapseLifecycle : undefined;
  if (pending && hasPendingInterruption(G)) return false;
  if (pending) G.pendingCollapseLifecycle = undefined;

  const overrides = ruleset.collapseOverrides ?? [];
  for (let index = pending?.nextOverrideIndex ?? 0; index < overrides.length; index += 1) {
    const ov = overrides[index];
    if (ov.op === "auto_win_if_zone_empty") {
      applyAutoWinCollapseOverride(G, playerId, ruleset, ov.zoneId);
      if (G.gameover) return false;
      continue;
    }

    const key = `${playerId}:${ruleset.nationId}:collapse_lifecycle:${G.round}:${index}`;
    (G as any)._appliedCollapseLifecycleKeys ??= {};
    if ((G as any)._appliedCollapseLifecycleKeys[key]) continue;
    (G as any)._appliedCollapseLifecycleKeys[key] = true;

    logOverride(G, playerId, ruleset.nationId, "collapse", ov.op);
    if (ov.op === "custom_collapse_resolution") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
    if (G.gameover) return false;
    if (hasPendingInterruption(G)) {
      G.pendingCollapseLifecycle = { playerId, nextOverrideIndex: index + 1 };
      return false;
    }
  }
  return true;
}

export function applyScoringLifecycleOnce(G: GameState, playerId: string): boolean {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset) return true;
  const key = `${playerId}:${ruleset.nationId}:scoring_lifecycle:${G.round}`;
  (G as any)._appliedScoringLifecycleKeys ??= {};
  if ((G as any)._appliedScoringLifecycleKeys[key]) return true;
  const pending = G.pendingScoringLifecycle?.playerId === playerId ? G.pendingScoringLifecycle : undefined;
  if (pending && hasPendingInterruption(G)) return false;

  let stage = pending?.stage ?? "overrides";
  const startOverrideIndex = pending?.overrideIndex ?? 0;

  if (!pending) {
    runNationHooks({ G, playerId, trigger: "before_scoring" });
    if (G.gameover) return false;
    if (hasPendingInterruption(G)) {
      G.pendingScoringLifecycle = { playerId, stage: "overrides", overrideIndex: 0, lifecycleKey: key };
      return false;
    }
  }

  if (stage === "overrides") {
    const overrides = ruleset.scoringOverrides ?? [];
    for (let index = startOverrideIndex; index < overrides.length; index += 1) {
      const ov = overrides[index];
      if (G.gameover) return false;
      logOverride(G, playerId, ruleset.nationId, "scoring", ov.op);
      if (ov.op === "custom_scoring_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
      if (hasPendingInterruption(G)) {
        G.pendingScoringLifecycle = { playerId, stage: "overrides", overrideIndex: index + 1, lifecycleKey: key };
        return false;
      }
    }
    stage = "collapse_checks";
  }

  if (stage === "collapse_checks") {
    const collapseComplete = applyCollapseWinChecks(G, playerId);
    if (G.gameover) return false;
    if (!collapseComplete || hasPendingInterruption(G)) {
      G.pendingScoringLifecycle = { playerId, stage: "collapse_checks", overrideIndex: 0, lifecycleKey: key };
      return false;
    }
    stage = "after_scoring";
  }

  if (stage === "after_scoring") {
    runNationHooks({ G, playerId, trigger: "after_scoring" });
    if (G.gameover) return false;
    if (hasPendingInterruption(G)) {
      G.pendingScoringLifecycle = { playerId, stage: "complete", overrideIndex: 0, lifecycleKey: key };
      return false;
    }
  }

  if (stage === "complete" && hasPendingInterruption(G)) return false;
  G.pendingScoringLifecycle = undefined;
  (G as any)._appliedScoringLifecycleKeys[key] = true;
  return true;
}

export function triggerScoring(G: GameState, reason: string, triggeredBy?: string): void {
  if (G.scoring || G.gameover) return;
  G.scoring = { reason, triggeredBy, phase: "finish_current_round" };
  G.log.push({ round: G.round, playerId: triggeredBy ?? "scoring", message: `ScoringTriggered(${reason})` });
}

export function triggerCollapse(G: GameState, reason: string, triggeredBy?: string): void {
  if (G.gameover) return;
  for (const playerId of Object.keys(G.players)) {
    const ruleset = G.activeNationRulesets?.[playerId];
    if (!ruleset) continue;
    for (const override of ruleset.collapseOverrides ?? []) {
      if (override.op !== "auto_win_if_zone_empty") continue;
      applyAutoWinCollapseOverride(G, playerId, ruleset, override.zoneId);
      if (G.gameover) return;
    }
  }
  if (G.options?.mode === "solo" && G.solo) {
    const humanPlayerId = Object.keys(G.players)[0] ?? "0";
    G.scoring = undefined;
    G.gameover = {
      winner: G.solo.bot.botId,
      reason: `collapse:${reason}`,
      scores: { [humanPlayerId]: collapseUnrestCount(G, humanPlayerId) }
    };
    G.log.push({ round: G.round, playerId: triggeredBy ?? "collapse", message: `CollapseTriggered(${reason})` });
    G.log.push({ round: G.round, playerId: "collapse", message: `CollapseFinalized(winner=${G.gameover.winner})` });
    return;
  }
  const scores = Object.fromEntries(Object.keys(G.players).map((playerId) => [playerId, collapseUnrestCount(G, playerId)]));
  const sorted = Object.entries(scores).sort(([, a], [, b]) => a - b);
  const lowScore = sorted[0]?.[1] ?? 0;
  const winners = sorted.filter(([, score]) => score === lowScore).map(([playerId]) => playerId);
  const tieBreakScores = winners.length > 1
    ? Object.fromEntries(winners.map((playerId) => [playerId, scorePlayer(G, playerId)]))
    : undefined;
  const tieBreakWinners = tieBreakScores
    ? Object.entries(tieBreakScores)
        .filter(([, score], _index, entries) => score === Math.max(...entries.map(([, entryScore]) => entryScore)))
        .map(([playerId]) => playerId)
    : winners;
  G.scoring = undefined;
  G.gameover = {
    winner: tieBreakWinners.length === 1 ? tieBreakWinners[0] : tieBreakWinners.join(","),
    reason: `collapse:${reason}`,
    scores,
    ...(tieBreakScores ? { tieBreakScores } : {})
  };
  G.log.push({ round: G.round, playerId: triggeredBy ?? "collapse", message: `CollapseTriggered(${reason})` });
  G.log.push({ round: G.round, playerId: "collapse", message: `CollapseFinalized(winner=${G.gameover.winner})` });
}

export function finalizeNormalScoring(G: GameState): void {
  if (G.gameover || !G.scoring) return;
  const pending = G.pendingScoringFinalization;
  const playerIds = pending?.playerIds ?? Object.keys(G.players);
  const scores: Record<string, number> = { ...(pending?.scores ?? {}) };
  G.pendingScoringFinalization = undefined;
  for (let index = pending?.nextPlayerIndex ?? 0; index < playerIds.length; index += 1) {
    const playerId = playerIds[index];
    const score = scorePlayer(G, playerId);
    if (G.gameover) return;
    if (hasPendingInterruption(G) || G.pendingScoringLifecycle) {
      G.pendingScoringFinalization = { playerIds, scores, nextPlayerIndex: index };
      return;
    }
    scores[playerId] = score;
  }
  if (G.options?.mode === "solo" && G.solo) {
    const humanPlayerId = playerIds[0] ?? "0";
    const botId = G.solo.bot.botId;
    scores[botId] = scoreBot(G);
    const reason = G.scoring.reason;
    const humanScore = scores[humanPlayerId] ?? 0;
    const botScore = scores[botId] ?? 0;
    G.scoring = undefined;
    G.gameover = {
      winner: humanScore > botScore ? humanPlayerId : botId,
      reason: `normal_scoring:${reason}`,
      scores
    };
    G.log.push({ round: G.round, playerId: "scoring", message: `ScoringFinalized(winner=${G.gameover.winner})` });
    return;
  }
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const highScore = sorted[0]?.[1] ?? 0;
  const winners = sorted.filter(([, score]) => score === highScore).map(([playerId]) => playerId);
  const reason = G.scoring.reason;
  G.scoring = undefined;
  G.gameover = {
    winner: winners.length === 1 ? winners[0] : winners.join(","),
    reason: `normal_scoring:${reason}`,
    scores
  };
  G.log.push({ round: G.round, playerId: "scoring", message: `ScoringFinalized(winner=${G.gameover.winner})` });
}

export function continuePendingScoringFinalization(G: GameState): void {
  if (!G.pendingScoringFinalization || hasPendingInterruption(G) || G.gameover) return;
  finalizeNormalScoring(G);
}

export function advanceScoringAtRoundBoundary(G: GameState): void {
  if (!G.scoring || G.gameover) return;
  if (G.scoring.phase === "finish_current_round") {
    if (G.options?.enabledVariants?.includes("short_game") || G.options?.mode === "practice") {
      finalizeNormalScoring(G);
      return;
    }
    G.scoring = { ...G.scoring, phase: "final_round", finalRound: G.round };
    G.log.push({ round: G.round, playerId: "scoring", message: `FinalRoundStarted(round=${G.round})` });
    return;
  }
  if (G.scoring.phase === "final_round" && G.scoring.finalRound !== undefined && G.round > G.scoring.finalRound) {
    finalizeNormalScoring(G);
  }
}

export function scorePlayer(G: GameState, playerId: string): number {
  if (!applyScoringLifecycleOnce(G, playerId)) return 0;

  const p = G.players[playerId];
  const ruleset = G.activeNationRulesets?.[playerId];
  const excludedZones = new Set((ruleset?.scoringOverrides ?? []).filter((ov) => ov.op === "exclude_zone_from_scoring").map((ov) => ov.zoneId));
  const disableHistory = ruleset?.zoneOverrides?.find(isDisableHistoryOverride);
  const replacementHistory = ruleset?.zoneOverrides?.find(isHistoryReplacementOverride);
  const historyZoneId = replacementHistory?.zoneId ?? (disableHistory?.replacementBehavior === "alternate_zone" ? "alternate_history" : "history");
  const baseScoringZones = ["hand", "playArea", "deck", "discard", "powerArea"];
  const historyScore = replacementHistory?.cardsScore === false
    ? 0
    : disableHistory && disableHistory.replacementBehavior !== "alternate_zone"
    ? 0
    : scoreZone(G, playerId, historyZoneId, excludedZones);
  const cardScore = baseScoringZones.reduce((sum, zoneId) => sum + scoreZone(G, playerId, zoneId, excludedZones), historyScore);
  const garrisonScore = scoreCardIds(G, garrisonedCardsInScoringZones(G, playerId, [...baseScoringZones, historyZoneId], excludedZones));
  return cardScore + garrisonScore + scoreResourcePool(G, playerId);
}
