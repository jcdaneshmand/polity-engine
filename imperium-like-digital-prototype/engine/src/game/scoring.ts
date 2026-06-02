import type { GameState } from "./state";
import type { GameOptions } from "../options/gameOptions";
import type { ScoringOverride } from "../nations/nationRulesetTypes";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";
import { currentStateMatches } from "./stateMatching";
import { actualScoredHistoryZoneIds } from "./history";
import { cardHasSuitIcon } from "./suitIcons";

function logOverride(G: GameState, playerId: string, nationId: string, category: string, op: string): void {
  G.log.push({ round: G.round, playerId, message: `NationRulesetApplied(${nationId}/${category}/${op})` });
}

function cloneOptions(options: GameOptions | undefined): GameOptions | undefined {
  return options ? JSON.parse(JSON.stringify(options)) as GameOptions : undefined;
}

function activeScoringOptions(G: GameState): GameOptions | undefined {
  return G.scoringOptions ?? G.options;
}

function getZoneCards(G: GameState, playerId: string, zoneId: string): string[] {
  const p = G.players[playerId];
  if (!p) return [];
  if (zoneId === "history") {
    const resolvedZones = actualScoredHistoryZoneIds(G, playerId);
    if (resolvedZones.length !== 1 || resolvedZones[0] !== "history") {
      return resolvedZones.flatMap((resolvedZoneId) => getZoneCards(G, playerId, resolvedZoneId));
    }
  }
  if (zoneId === "nationDeck") {
    const cards = [...p.nationDeck];
    if (p.accessionCardId && !cards.includes(p.accessionCardId)) cards.push(p.accessionCardId);
    return cards;
  }
  const direct = (p as any)[zoneId];
  if (Array.isArray(direct)) return direct;
  if (p.sideAreas?.[zoneId]) return p.sideAreas[zoneId];
  if (G.specialZones?.[playerId]?.[zoneId]?.cardIds) return G.specialZones[playerId][zoneId].cardIds;
  if (G.globalSpecialZones?.[zoneId]?.cardIds) return G.globalSpecialZones[zoneId].cardIds;
  return [];
}

function isTradeRouteCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  return card?.type === "trade_route" || card?.cardType === "trade_route" || card?.suit === "trade_route";
}

function countVariableFormula(G: GameState, playerId: string, formula: { op?: string; tag?: unknown; suit?: unknown; zones?: unknown; amountEach?: unknown; cap?: unknown }): number | undefined {
  if (formula.op !== "count_cards" || typeof formula.amountEach !== "number") return undefined;
  const zoneIds = Array.isArray(formula.zones) ? formula.zones.filter((zone): zone is string => typeof zone === "string") : ["hand", "playArea", "deck", "discard", "powerArea", ...actualScoredHistoryZoneIds(G, playerId)];
  const count = zoneIds
    .flatMap((zoneId) => getZoneCards(G, playerId, zoneId).map((cardId) => ({ cardId, zoneId })))
    .filter(({ cardId: matchedCardId, zoneId }) => {
      if (zoneId === "playArea" && isTradeRouteCard(G, matchedCardId)) return false;
      const card = G.cardDb[matchedCardId];
      if (!card) return false;
      if (typeof formula.tag === "string" && !card.tags.includes(formula.tag)) return false;
      if (typeof formula.suit === "string" && !cardHasSuitIcon(card, formula.suit as any)) return false;
      return true;
    }).length;
  const score = count * formula.amountEach;
  return typeof formula.cap === "number" ? Math.min(score, formula.cap) : Math.min(score, 10);
}

function capPositiveCardVp(value: number): number {
  return value > 10 ? 10 : value;
}

function cardVp(G: GameState, playerId: string, cardId: string, zoneId?: string): number {
  const vp = G.cardDb[cardId]?.vp as unknown;
  if (typeof vp === "number") return capPositiveCardVp(vp);
  if (typeof vp === "object" && vp !== null) {
    const { mode, value, condition, formula, trueValue, falseValue } = vp as {
      mode?: string;
      value?: unknown;
      condition?: { op?: string; zoneId?: unknown };
      formula?: { op?: string; tag?: unknown; suit?: unknown; zones?: unknown; amountEach?: unknown; cap?: unknown };
      trueValue?: unknown;
      falseValue?: unknown;
    };
    const numericValue = typeof value === "number" ? value : 0;
    if (mode === "none") return 0;
    if (mode === "conditional" && condition?.op === "self_in_zone") {
      const isHistoryAlias = condition.zoneId === "history"
        && typeof zoneId === "string"
        && actualScoredHistoryZoneIds(G, playerId).includes(zoneId);
      const matchedValue = zoneId === condition.zoneId || isHistoryAlias ? trueValue : falseValue;
      return capPositiveCardVp(typeof matchedValue === "number" ? matchedValue : numericValue);
    }
    if (mode === "conditional") return capPositiveCardVp(numericValue);
    if (mode === "variable" && formula) return countVariableFormula(G, playerId, formula) ?? Math.min(numericValue, 10);
    if (mode === "variable") return Math.min(numericValue, 10);
    if (mode === "negative") return -Math.abs(numericValue);
    return capPositiveCardVp(numericValue);
  }
  return 0;
}

function scoreCardIds(G: GameState, playerId: string, cardIds: string[], zoneId?: string): number {
  return cardIds.reduce((sum, cardId) => sum + cardVp(G, playerId, cardId, zoneId), 0);
}

function zoneIsExcluded(G: GameState, playerId: string, zoneId: string, excludedZones: Set<string>): boolean {
  if (excludedZones.has(zoneId)) return true;
  if (zoneId === "history") return false;
  return excludedZones.has("history") && actualScoredHistoryZoneIds(G, playerId).includes(zoneId);
}

function botCardVp(G: GameState, cardId: string): number {
  const vp = G.cardDb[cardId]?.vp as unknown;
  if (typeof vp === "number") return capPositiveCardVp(vp);
  if (typeof vp === "object" && vp !== null) {
    const { mode, value, trueValue, falseValue } = vp as { mode?: string; value?: unknown; trueValue?: unknown; falseValue?: unknown };
    const numericValue = typeof value === "number" ? value : 0;
    if (mode === "none") return 0;
    if (mode === "variable") return capPositiveCardVp(numericValue || 5);
    if (mode === "conditional" && (typeof trueValue === "number" || typeof falseValue === "number")) {
      return capPositiveCardVp(Math.max(
        typeof trueValue === "number" ? trueValue : numericValue,
        typeof falseValue === "number" ? falseValue : numericValue
      ));
    }
    if (mode === "conditional") return capPositiveCardVp(numericValue);
    if (mode === "negative") return -Math.abs(numericValue);
    return capPositiveCardVp(numericValue);
  }
  return 0;
}

function isBotCultistUnrestCard(G: GameState, cardId: string): boolean {
  const bot = G.solo?.bot;
  if (bot?.botNationId !== "cultists") return false;
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "unrest" || card?.suit === "unrest" || card?.tags?.includes("unrest");
}

function isBotPowerCard(G: GameState, cardId: string): boolean {
  const card = G.cardDb[cardId];
  const type = card?.cardType ?? card?.type;
  return type === "power" || card?.suit === "power" || card?.tags?.includes("power");
}

function botScoredCardVp(G: GameState, cardId: string): number {
  if (isBotPowerCard(G, cardId)) return 0;
  if (isBotCultistUnrestCard(G, cardId)) {
    const difficulty = G.solo?.bot.difficulty;
    if (difficulty === "chieftain") return 0;
    if (difficulty === "overlord" || difficulty === "supreme_ruler") return 2;
    return 1;
  }
  return botCardVp(G, cardId);
}

function scoreBotCardIds(G: GameState, cardIds: string[]): number {
  return cardIds.reduce((sum, cardId) => sum + botScoredCardVp(G, cardId), 0);
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
  if (zoneIsExcluded(G, playerId, zoneId, excludedZones)) return 0;
  return scoreCardIds(G, playerId, getZoneCards(G, playerId, zoneId), zoneId);
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
    ?? G.pendingReturnExhaustTokenChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingSolsticeOrderChoice
    ?? G.pendingReactiveExhaustChoice
  );
}

function garrisonedCardsInScoringZones(G: GameState, playerId: string, scoringZoneIds: string[], excludedZones: Set<string>): string[] {
  const hostIds = scoringZoneIds
    .filter((zoneId) => !zoneIsExcluded(G, playerId, zoneId, excludedZones))
    .flatMap((zoneId) => getZoneCards(G, playerId, zoneId));
  return hostIds.flatMap((hostId) => G.cardStates?.[hostId]?.garrisonedCardIds ?? []);
}

function collapseUnrestCount(G: GameState, playerId: string): number {
  const ownedZoneIds = ["hand", "playArea", "deck", "discard", ...actualScoredHistoryZoneIds(G, playerId)];
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

function isDirectReturnUnrestEffect(effect: unknown): boolean {
  const op = (effect as { op?: unknown }).op;
  const cardId = (effect as { cardId?: unknown }).cardId;
  return op === "return_unrest" && typeof cardId === "string";
}

function isCollapseTieBreakReturnUnrestHook(hook: { trigger?: string; effects?: unknown[] }): boolean {
  if (hook.trigger !== "before_scoring" || !hook.effects?.length) return false;
  return hook.effects.every(isDirectReturnUnrestEffect);
}

function scoringReturnUnrestSourceZones(G: GameState, playerId: string): string[] {
  return ["hand", "playArea", "discard", "deck", ...actualScoredHistoryZoneIds(G, playerId)];
}

function expandScoringReturnUnrestSources(G: GameState, hook: NonNullable<GameState["activeNationRulesets"]>[string]["hookRules"][number], playerId: string): typeof hook {
  if (hook.trigger !== "before_scoring") return hook;
  return {
    ...hook,
    effects: hook.effects.map((effect) => {
      if ((effect as { op?: unknown }).op !== "return_unrest" || (effect as { sourceZones?: unknown }).sourceZones) return effect;
      return {
        ...effect,
        sourceZones: scoringReturnUnrestSourceZones(G, playerId) as any
      };
    })
  };
}

function applyCollapseTieBreakReturnUnrestHooks(G: GameState, playerIds: string[]): void {
  for (const playerId of playerIds) {
    const ruleset = G.activeNationRulesets?.[playerId];
    if (!ruleset) continue;
    const eligibleHooks = ruleset.hookRules
      .filter(isCollapseTieBreakReturnUnrestHook)
      .map((hook) => expandScoringReturnUnrestSources(G, hook, playerId));
    if (eligibleHooks.length === 0) continue;
    const originalHooks = ruleset.hookRules;
    ruleset.hookRules = eligibleHooks;
    try {
      runNationHooks({ G, playerId, trigger: "before_scoring" });
    } finally {
      ruleset.hookRules = originalHooks;
    }
  }
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
    ruleset.hookRules = ruleset.hookRules.map((hook) => expandScoringReturnUnrestSources(G, hook, playerId));
    if (!runNationHooks({ G, playerId, trigger: "before_scoring" })) return false;
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
    if (!runNationHooks({ G, playerId, trigger: "after_scoring" })) return false;
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
  G.scoringOptions = cloneOptions(G.options);
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
  if (activeScoringOptions(G)?.mode === "solo" && G.solo) {
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
  if (winners.length > 1) applyCollapseTieBreakReturnUnrestHooks(G, winners);
  const tieBreakScores = winners.length > 1
    ? Object.fromEntries(winners.map((playerId) => [playerId, calculatePlayerScore(G, playerId)]))
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
  if (activeScoringOptions(G)?.mode === "solo" && G.solo) {
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
  const options = activeScoringOptions(G);
  if (G.scoring.phase === "finish_current_round") {
    if (options?.enabledVariants?.includes("short_game") || options?.mode === "practice") {
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
  return calculatePlayerScore(G, playerId);
}

function calculatePlayerScore(G: GameState, playerId: string): number {
  const p = G.players[playerId];
  const ruleset = G.activeNationRulesets?.[playerId];
  const excludedZones = new Set((ruleset?.scoringOverrides ?? []).filter((ov) => ov.op === "exclude_zone_from_scoring").map((ov) => ov.zoneId));
  const baseScoringZones = ["hand", "playArea", "deck", "discard", "powerArea"];
  const historyZoneIds = actualScoredHistoryZoneIds(G, playerId);
  const scoredZoneIds = [...baseScoringZones, ...historyZoneIds];
  const cardScore = scoredZoneIds.reduce((sum, zoneId) => sum + scoreZone(G, playerId, zoneId, excludedZones), 0);
  const garrisonScore = scoreCardIds(G, playerId, garrisonedCardsInScoringZones(G, playerId, scoredZoneIds, excludedZones));
  return cardScore + garrisonScore + scoreResourcePool(G, playerId);
}
