import type { GameState, PlayerState } from "./state";

const ALWAYS_HIDDEN_PLAYER_ZONES: Array<keyof PlayerState> = ["deck", "nationDeck"];
const OWNER_VISIBLE_PLAYER_ZONES: Array<keyof PlayerState> = ["hand", "history"];

const PENDING_KEYS: Array<keyof GameState> = [
  "pendingChoice",
  "pendingDrawChoice",
  "pendingFindChoice",
  "pendingAcquireChoice",
  "pendingMarketCardChoice",
  "pendingBreakThroughChoice",
  "pendingExileChoice",
  "pendingGarrisonChoice",
  "pendingRegionChoice",
  "pendingRegionChoiceContinuation",
  "pendingDevelopmentChoice",
  "pendingShortGameDevelopmentExileChoice",
  "pendingTradeChoice",
  "pendingDiscardChoice",
  "pendingReturnUnrestChoice",
  "pendingReturnFameChoice",
  "pendingPlaceOnDeckChoice",
  "pendingReturnExhaustTokenChoice",
  "pendingFreePlayChoice",
  "pendingGiveCardChoice",
  "pendingSwapChoice",
  "pendingLookOrderChoice",
  "pendingLookTakeChoice",
  "pendingUnrestAllocationChoice",
  "pendingReactiveExhaustChoice",
  "pendingMarketResourcePlacementChoice",
  "pendingPlayCardResolution",
  "pendingPlayedCardResolution",
  "pendingAcquireCardResolution",
  "pendingAcquireEffectResolution",
  "pendingMarketMoveEffectResolution",
  "pendingBreakThroughEffectResolution",
  "pendingMarketUnrestHookContinuation",
  "pendingNationHookContinuation",
  "pendingUnrestTakeContinuation",
  "pendingUnrestAllocationResolution",
  "pendingPostDevelopmentResolution",
  "pendingReshuffleResolution",
  "pendingAfterReshuffleEffects",
  "pendingReshuffleDraw",
  "pendingTurnEndCleanup",
  "pendingCollapseLifecycle",
  "pendingScoringLifecycle",
  "pendingScoringFinalization",
  "pendingSolsticeOrderChoice",
  "pendingSolsticeContinuation",
  "pendingSolsticeRoundEnd",
  "pendingCleanupMarketResourceChoice",
  "pendingCleanupDiscardChoice",
  "pendingPracticeMarketExileBeforeCleanup"
];

function cloneGameState(G: GameState): GameState {
  const seen = new WeakSet<object>();
  return JSON.parse(JSON.stringify(G, (key, value) => {
    if (key === "rollbackSnapshot") return undefined;
    if (value && typeof value === "object") {
      if (seen.has(value)) return undefined;
      seen.add(value);
    }
    return value;
  })) as GameState;
}

function setupPublicSideAreaIds(G: GameState, playerId: string): Set<string> {
  const publicAreaIds = new Set<string>();
  for (const override of G.activeNationRulesets?.[playerId]?.setupOverrides ?? []) {
    if (override.op === "create_side_area" && override.public === true) publicAreaIds.add(override.areaId);
  }
  return publicAreaIds;
}

function ownerVisibleSideAreaIds(G: GameState, playerId: string): Set<string> {
  const visibleAreaIds = new Set<string>();
  const ruleset = G.activeNationRulesets?.[playerId];
  for (const override of ruleset?.setupOverrides ?? []) {
    if (override.op === "create_side_area" && override.public !== true) visibleAreaIds.add(override.areaId);
  }
  for (const override of ruleset?.zoneOverrides ?? []) {
    if (override.op === "replace_history_with_zone") visibleAreaIds.add(override.zoneId);
    if (override.op === "create_zone" && override.visibility === "private") visibleAreaIds.add(override.zoneId);
  }
  return visibleAreaIds;
}

function redactPlayer(player: PlayerState, args: { G: GameState; ownerPlayerId: string; viewerPlayerId?: string | null }): void {
  for (const zone of ALWAYS_HIDDEN_PLAYER_ZONES) {
    const value = player[zone];
    if (Array.isArray(value)) (player[zone] as string[]) = [];
  }

  if (args.ownerPlayerId !== args.viewerPlayerId) {
    for (const zone of OWNER_VISIBLE_PLAYER_ZONES) {
      const value = player[zone];
      if (Array.isArray(value)) (player[zone] as string[]) = [];
    }
  }

  const publicAreaIds = setupPublicSideAreaIds(args.G, args.ownerPlayerId);
  const ownerVisibleAreaIds = ownerVisibleSideAreaIds(args.G, args.ownerPlayerId);
  for (const [areaId, cardIds] of Object.entries(player.sideAreas ?? {})) {
    if (!Array.isArray(cardIds)) continue;
    const ownerCanSee = args.ownerPlayerId === args.viewerPlayerId && ownerVisibleAreaIds.has(areaId);
    if (!publicAreaIds.has(areaId) && !ownerCanSee) player.sideAreas![areaId] = [];
  }
}

function redactGlobalSpecialZones(G: GameState): void {
  for (const zone of Object.values(G.globalSpecialZones ?? {})) {
    if (zone.visibility !== "public") zone.cardIds = [];
  }
}

function pendingBelongsToViewer(pending: unknown, viewerPlayerId?: string | null): boolean {
  if (!viewerPlayerId || !pending || typeof pending !== "object") return false;
  const candidate = pending as { playerId?: unknown; resolvingPlayerId?: unknown };
  return candidate.playerId === viewerPlayerId || candidate.resolvingPlayerId === viewerPlayerId;
}

function redactPendingState(G: GameState, viewerPlayerId?: string | null): void {
  for (const key of PENDING_KEYS) {
    const pending = G[key];
    if (!pending) continue;
    if (!pendingBelongsToViewer(pending, viewerPlayerId)) {
      delete G[key];
      continue;
    }
    if (typeof pending === "object") {
      delete (pending as { rollbackSnapshot?: unknown }).rollbackSnapshot;
    }
  }
}

function redactLookedCards(G: GameState, viewerPlayerId?: string | null): void {
  if (G.lookedCards && G.lookedCards.playerId !== viewerPlayerId) {
    G.lookedCards.cardIds = [];
  }
}

export function redactGameStateForPlayer(G: GameState, viewerPlayerId?: string | null): GameState {
  const view = cloneGameState(G);
  for (const [playerId, player] of Object.entries(view.players ?? {})) {
    redactPlayer(player, { G: view, ownerPlayerId: playerId, viewerPlayerId });
  }
  redactGlobalSpecialZones(view);
  redactLookedCards(view, viewerPlayerId);
  redactPendingState(view, viewerPlayerId);
  return view;
}
