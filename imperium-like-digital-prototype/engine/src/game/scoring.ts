import type { GameState } from "./state";
import type { ZoneOverride } from "../nations/nationRulesetTypes";
import { runEffects } from "../cards/effectRunner";
import { runNationHooks } from "../nations/nationRulesetHooks";

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

function cardVp(G: GameState, cardId: string): number {
  const vp = G.cardDb[cardId]?.vp as unknown;
  if (typeof vp === "number") return vp;
  if (typeof vp === "object" && vp !== null && typeof (vp as { value?: unknown }).value === "number") return (vp as { value: number }).value;
  return 0;
}

function scoreCardIds(G: GameState, cardIds: string[]): number {
  return cardIds.reduce((sum, cardId) => sum + cardVp(G, cardId), 0);
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

function garrisonedCardsInScoringZones(G: GameState, playerId: string, scoringZoneIds: string[], excludedZones: Set<string>): string[] {
  const hostIds = scoringZoneIds
    .filter((zoneId) => !excludedZones.has(zoneId))
    .flatMap((zoneId) => getZoneCards(G, playerId, zoneId));
  return hostIds.flatMap((hostId) => G.cardStates?.[hostId]?.garrisonedCardIds ?? []);
}

function collapseUnrestCount(G: GameState, playerId: string): number {
  const p = G.players[playerId];
  const ownedZoneIds = ["hand", "playArea", "deck", "discard", "history", "powerArea"];
  const ownedCards = ownedZoneIds.flatMap((zoneId) => getZoneCards(G, playerId, zoneId));
  const garrisonedCards = ownedZoneIds
    .flatMap((zoneId) => getZoneCards(G, playerId, zoneId))
    .flatMap((hostId) => G.cardStates?.[hostId]?.garrisonedCardIds ?? []);
  return (p.resources.unrest ?? 0) + [...ownedCards, ...garrisonedCards].filter((cardId) => isUnrestCard(G, cardId)).length;
}

function applyAutoWinCollapseOverride(G: GameState, playerId: string, ruleset: NonNullable<GameState["activeNationRulesets"]>[string], zoneId: string): void {
  if (G.gameover || getZoneCards(G, playerId, zoneId).length > 0) return;
  logOverride(G, playerId, ruleset.nationId, "collapse", "auto_win_if_zone_empty");
  G.gameover = { winner: playerId, reason: `auto_win_if_zone_empty:${zoneId}` };
  G.log.push({ round: G.round, playerId, message: `CollapseAutoWin(${ruleset.nationId}/${zoneId})` });
}

export function applyCollapseWinChecks(G: GameState, playerId: string, randomNumber?: () => number): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset || G.gameover) return;

  for (const [index, ov] of (ruleset.collapseOverrides ?? []).entries()) {
    if (ov.op === "auto_win_if_zone_empty") {
      applyAutoWinCollapseOverride(G, playerId, ruleset, ov.zoneId);
      if (G.gameover) return;
      continue;
    }

    const key = `${playerId}:${ruleset.nationId}:collapse_lifecycle:${G.round}:${index}`;
    (G as any)._appliedCollapseLifecycleKeys ??= {};
    if ((G as any)._appliedCollapseLifecycleKeys[key]) continue;
    (G as any)._appliedCollapseLifecycleKeys[key] = true;

    logOverride(G, playerId, ruleset.nationId, "collapse", ov.op);
    if (ov.op === "custom_collapse_resolution") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions, randomNumber }, ov.effect as any);
  }
}

export function applyScoringLifecycleOnce(G: GameState, playerId: string): void {
  const ruleset = G.activeNationRulesets?.[playerId];
  if (!ruleset) return;
  const key = `${playerId}:${ruleset.nationId}:scoring_lifecycle:${G.round}`;
  (G as any)._appliedScoringLifecycleKeys ??= {};
  if ((G as any)._appliedScoringLifecycleKeys[key]) return;
  (G as any)._appliedScoringLifecycleKeys[key] = true;

  runNationHooks({ G, playerId, trigger: "before_scoring" });
  for (const ov of ruleset.scoringOverrides ?? []) {
    logOverride(G, playerId, ruleset.nationId, "scoring", ov.op);
    if (ov.op === "custom_scoring_effect") runEffects({ G, playerId, enabledExpansions: G.options?.enabledExpansions }, ov.effect as any);
  }
  applyCollapseWinChecks(G, playerId);
  runNationHooks({ G, playerId, trigger: "after_scoring" });
}

export function triggerScoring(G: GameState, reason: string, triggeredBy?: string): void {
  if (G.scoring || G.gameover) return;
  G.scoring = { reason, triggeredBy, phase: "finish_current_round" };
  G.log.push({ round: G.round, playerId: triggeredBy ?? "scoring", message: `ScoringTriggered(${reason})` });
}

export function triggerCollapse(G: GameState, reason: string, triggeredBy?: string): void {
  if (G.gameover) return;
  const scores = Object.fromEntries(Object.keys(G.players).map((playerId) => [playerId, collapseUnrestCount(G, playerId)]));
  const sorted = Object.entries(scores).sort(([, a], [, b]) => a - b);
  const lowScore = sorted[0]?.[1] ?? 0;
  const winners = sorted.filter(([, score]) => score === lowScore).map(([playerId]) => playerId);
  G.scoring = undefined;
  G.gameover = {
    winner: winners.length === 1 ? winners[0] : winners.join(","),
    reason: `collapse:${reason}`,
    scores
  };
  G.log.push({ round: G.round, playerId: triggeredBy ?? "collapse", message: `CollapseTriggered(${reason})` });
  G.log.push({ round: G.round, playerId: "collapse", message: `CollapseFinalized(winner=${G.gameover.winner})` });
}

export function finalizeNormalScoring(G: GameState): void {
  if (G.gameover || !G.scoring) return;
  const scores = Object.fromEntries(Object.keys(G.players).map((playerId) => [playerId, scorePlayer(G, playerId)]));
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const highScore = sorted[0]?.[1] ?? 0;
  const winners = sorted.filter(([, score]) => score === highScore).map(([playerId]) => playerId);
  G.gameover = {
    winner: winners.length === 1 ? winners[0] : winners.join(","),
    reason: `normal_scoring:${G.scoring.reason}`,
    scores
  };
  G.log.push({ round: G.round, playerId: "scoring", message: `ScoringFinalized(winner=${G.gameover.winner})` });
}

export function advanceScoringAtRoundBoundary(G: GameState): void {
  if (!G.scoring || G.gameover) return;
  if (G.scoring.phase === "finish_current_round") {
    G.scoring = { ...G.scoring, phase: "final_round", finalRound: G.round };
    G.log.push({ round: G.round, playerId: "scoring", message: `FinalRoundStarted(round=${G.round})` });
    return;
  }
  if (G.scoring.phase === "final_round" && G.scoring.finalRound !== undefined && G.round > G.scoring.finalRound) {
    finalizeNormalScoring(G);
  }
}

export function scorePlayer(G: GameState, playerId: string): number {
  applyScoringLifecycleOnce(G, playerId);

  const p = G.players[playerId];
  const ruleset = G.activeNationRulesets?.[playerId];
  const excludedZones = new Set((ruleset?.scoringOverrides ?? []).filter((ov) => ov.op === "exclude_zone_from_scoring").map((ov) => ov.zoneId));
  const disableHistory = ruleset?.zoneOverrides?.find(isDisableHistoryOverride);
  const historyZoneId = disableHistory?.replacementBehavior === "alternate_zone" ? "alternate_history" : "history";
  const baseScoringZones = ["hand", "playArea", "deck", "discard", "powerArea"];
  const historyScore = disableHistory && disableHistory.replacementBehavior !== "alternate_zone"
    ? 0
    : scoreZone(G, playerId, historyZoneId, excludedZones);
  const cardScore = baseScoringZones.reduce((sum, zoneId) => sum + scoreZone(G, playerId, zoneId, excludedZones), historyScore);
  const garrisonScore = scoreCardIds(G, garrisonedCardsInScoringZones(G, playerId, [...baseScoringZones, historyZoneId], excludedZones));
  return cardScore + garrisonScore + p.resources.influence - p.resources.unrest;
}
