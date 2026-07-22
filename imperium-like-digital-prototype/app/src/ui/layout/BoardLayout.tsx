import { useEffect, useMemo, useState } from "react";
import type { CampaignProgress } from "../../../../engine/src/options/gameOptions";
import { SharedAreaRow } from "./SharedAreaRow";
import { MarketRow } from "./MarketRow";
import { PlayerArea } from "./PlayerArea";
import { CardDetailPanel, CardInspectionModal } from "./CardDetailPanel";
import { ActionMenu } from "./ActionMenu";
import { formatLogMessage, GameLogPanel, summarizeLastLogEntry } from "./GameLogPanel";
import { BotRow } from "./BotRow";
import { ZoneDetailPanel } from "./ZoneDetailPanel";
import { TurnStatusBar } from "./TurnStatusBar";
import { RuleAidPanel } from "./RuleAidPanel";
import EndGameSummary, { type AccountGameResultContext } from "./EndGameSummary";
import type { AccountGameResultInput } from "../../onlineSession";
import { getActionHintsByCardId, getAvailableActionsForSelection, getCurrentTaskUiState, getMarketCardClickAction, getPendingUiState, getPrimaryBlockedReason, getSelectedCard, ruleProvenanceLabels, type CurrentTaskUiState, type Selection } from "../controller/selectionModel";
import { CONTROLLER_HINTS } from "../controller/controllerHints";
import { handleBoardKeyDown } from "../controller/keyboardControls";
import { getBotPiles, getCurrentPlayer, getInspectableLookedCards, getInspectableSharedPile, getInspectableZone, getMarketCards, getOwnerVisibleZoneIds, getPlayerZoneCounts, getPlayerZoneLabels, getRecentLogEntries, getSharedPiles } from "./uiSelectors";
import { resourceLabelsForGame } from "./resourceDisplay";

function mapViewerPlayerId(G: any, candidate?: string | null): string | undefined {
  if (candidate == null) return undefined;
  const seatIndex = Array.isArray(G?.seatOrder) && G.seatOrder.includes(candidate) ? Number(candidate) : Number.NaN;
  const mappedPlayerId = Number.isInteger(seatIndex) && Array.isArray(G?.playOrder) ? G.playOrder[seatIndex] : undefined;
  if (mappedPlayerId && G?.players?.[mappedPlayerId]) return mappedPlayerId;
  if (G?.players?.[candidate]) return candidate;
  return candidate;
}

function viewerPlayerId(G: any, ctx: any, viewerPlayerID?: string | null, playerID?: string | null): string {
  return mapViewerPlayerId(G, viewerPlayerID)
    ?? mapViewerPlayerId(G, ctx?.currentPlayer)
    ?? mapViewerPlayerId(G, playerID)
    ?? mapViewerPlayerId(G, ctx?.playerID)
    ?? "1";
}

export function dispatchBoardAction({ action: a, moves, setDetailCardId, setSelection }: { action: any; moves: any; setDetailCardId: (cardId: string | null) => void; setSelection: (selection: Selection | null) => void }) {
  if (!a.enabled) return;
  if (a.action === "view" && a.cardId) setDetailCardId(a.cardId);
  if (a.action === "play" && a.cardId) moves.playCard?.(a.cardId);
  if (a.action === "profit" && a.cardId) moves.profitCard?.(a.cardId);
  if (a.action === "resolveChoice" && typeof a.choiceIndex === "number") moves.resolveChoice?.(a.choiceIndex);
  if (a.action === "resolveDrawChoice" && a.cardId) moves.resolveDrawChoice?.(a.cardId);
  if (a.action === "resolveFindChoice" && a.cardId) moves.resolveFindChoice?.(a.cardId);
  if (a.action === "resolveAcquireChoice" && a.cardId) moves.resolveAcquireChoice?.(a.cardId);
  if (a.action === "resolveMarketCardChoice" && a.cardId) moves.resolveMarketCardChoice?.(a.cardId);
  if (a.action === "resolveExileChoice" && a.cardId) moves.resolveExileChoice?.(a.cardId);
  if (a.action === "skipExileChoice") moves.skipExileChoice?.();
  if (a.action === "resolveBreakThroughChoice" && a.cardId) moves.resolveBreakThroughChoice?.(a.cardId);
  if (a.action === "resolveGarrisonChoice" && a.hostCardId && a.cardId) moves.resolveGarrisonChoice?.(a.hostCardId, a.cardId);
  if (a.action === "resolveRegionChoice" && a.cardId) moves.resolveRegionChoice?.(a.cardId);
  if (a.action === "resolveDevelopmentChoice" && a.cardId) moves.resolveDevelopmentChoice?.(a.cardId);
  if (a.action === "skipDevelopmentChoice") moves.skipDevelopmentChoice?.();
  if (a.action === "resolveShortGameDevelopmentExileChoice" && a.cardId) moves.resolveShortGameDevelopmentExileChoice?.(a.cardId);
  if (a.action === "resolveTradeChoice") moves.resolveTradeChoice?.(a.cardId);
  if (a.action === "resolveDiscardChoice" && a.cardIds) moves.resolveDiscardChoice?.(a.cardIds);
  if (a.action === "resolveReturnUnrestChoice" && a.cardId) moves.resolveReturnUnrestChoice?.(a.cardId);
  if (a.action === "resolveReturnFameChoice" && a.cardId) moves.resolveReturnFameChoice?.(a.cardId);
  if (a.action === "resolvePlaceOnDeckChoice" && a.cardId) moves.resolvePlaceOnDeckChoice?.(a.cardId);
  if (a.action === "resolveReturnExhaustTokenChoice" && a.cardId) moves.resolveReturnExhaustTokenChoice?.(a.cardId);
  if (a.action === "resolveGiveCardChoice" && a.cardId && a.recipientPlayerId) moves.resolveGiveCardChoice?.(a.cardId, a.recipientPlayerId);
  if (a.action === "resolveSwapChoice" && a.cardId && a.marketCardId) moves.resolveSwapChoice?.(a.cardId, a.marketCardId);
  if (a.action === "resolveUnrestAllocationChoice" && a.recipientPlayerIds) moves.resolveUnrestAllocationChoice?.(a.recipientPlayerIds);
  if (a.action === "resolveSolsticeOrderChoice" && a.cardIds) moves.resolveSolsticeOrderChoice?.(a.cardIds);
  if (a.action === "resolveLookOrderChoice" && a.cardIds) moves.resolveLookOrderChoice?.(a.cardIds);
  if (a.action === "resolveLookTakeChoice" && a.cardId) moves.resolveLookTakeChoice?.(a.cardId, a.returnOrder);
  if (a.action === "resolveMarketResourcePlacement" && a.cardIds) moves.resolveMarketResourcePlacement?.(a.cardIds);
  if (a.action === "resolveCleanupMarketResource" && a.cardId) moves.resolveCleanupMarketResource?.(a.cardId);
  if (a.action === "resolveCleanupDiscard") moves.resolveCleanupDiscard?.(a.cardIds ?? (a.cardId ? [a.cardId] : []));
  if (a.action === "resolveReactiveExhaustChoice" && a.cardId) moves.resolveReactiveExhaustChoice?.(a.cardId);
  if (a.action === "skipReactiveExhaustChoice") moves.skipReactiveExhaustChoice?.();
  if (a.action === "exhaust" && a.cardId) moves.exhaustCard?.(a.cardId);
  if (a.action === "innovate" && a.suit && a.source) moves.innovateTurn?.({ suit: a.suit, source: a.source, cardId: a.cardId });
  if (a.action === "revolt" && a.cardIds) moves.revoltTurn?.(a.cardIds);
  if (a.action === "revolt" && a.cardId) moves.revoltTurn?.([a.cardId]);
  if (a.action === "endTurn") moves.endTurn?.();
  if (a.action === "cancel") { setSelection(null); setDetailCardId(null); }
}

export type LocalUndoAvailability =
  | { enabled: true; reason?: undefined }
  | { enabled: false; reason: string };

function hasUnresolvedHiddenInformation(G: any): boolean {
  return Boolean(
    G?.pendingDrawChoice
    ?? G?.pendingFindChoice
    ?? G?.pendingLookOrderChoice
    ?? G?.pendingLookTakeChoice
    ?? G?.lookedCards
    ?? G?.pendingReshuffleResolution
    ?? G?.pendingReshuffleDraw
    ?? G?.pendingAfterReshuffleEffects
  );
}

export function getLocalUndoAvailability({
  G,
  isMultiplayer,
  undoStack
}: {
  G: any;
  isMultiplayer?: boolean;
  undoStack?: unknown[];
}): LocalUndoAvailability {
  if (isMultiplayer) return { enabled: false, reason: "Online games cannot use local undo" };
  if (!Array.isArray(undoStack) || undoStack.length === 0) return { enabled: false, reason: "No move to undo" };
  if (hasUnresolvedHiddenInformation(G)) return { enabled: false, reason: "Resolve hidden information before undo" };
  return { enabled: true };
}

export type PlaytestDiagnostics = {
  schemaVersion: 1;
  generatedAtIso: string;
  appVersion: string;
  mode: "local" | "online";
  activePlayer: string;
  viewerPlayer: string;
  options: {
    mode?: string;
    playerCount?: number;
    commonsSetId?: string;
    enabledExpansions: string[];
    enabledVariants: string[];
  };
  pendingAction?: string;
  currentTask?: CurrentTaskUiState;
  lastOutcome?: string;
  ruleUiState: {
    enabledActions: string[];
    blockedActions: Array<{ label: string; reason: string; provenance?: string }>;
    selectedPublicCardId?: string;
  };
  zoneUiState: {
    zones: Array<{ role: string; kind: string; count: number; hidden: boolean; selected: boolean }>;
  };
  sharedPiles: Record<string, number>;
  players: Record<string, { zones: Record<string, number>; resources: Record<string, number> }>;
  recentPublicLog: Array<{ round?: number; playerId?: string; message: string }>;
};

function redactKnownCardIds(message: string, cardIds: string[]): string {
  return cardIds.reduce((current, cardId) => current.split(cardId).join("[card]"), message);
}

function buildZoneUiState(G: any, viewerId: string, selection?: Selection | null) {
  const player = G?.players?.[viewerId];
  const playerZones = player
    ? Object.entries(getPlayerZoneCounts(player)).map(([role, count]) => ({
      role,
      kind: "own-private",
      count: Number(count),
      hidden: false,
      selected: selection?.kind === "player_zone" && selection.id === role
    }))
    : [];
  return {
    zones: [
      ...getSharedPiles(G).map((pile) => ({
        role: pile.id,
        kind: "public-shared",
        count: pile.count,
        hidden: false,
        selected: selection?.kind === "pile" && selection.id === pile.id
      })),
      {
        role: "market",
        kind: "market-shared",
        count: Array.isArray(G?.market) ? G.market.length : 0,
        hidden: false,
        selected: selection?.kind === "market_slot"
      },
      ...playerZones,
      ...(G?.solo?.bot ? getBotPiles(G.solo.bot).map((pile) => ({
        role: `bot:${pile.id}`,
        kind: "opponent-hidden",
        count: pile.count,
        hidden: true,
        selected: selection?.kind === "bot_zone" && selection.id === pile.id
      })) : []),
      ...(G?.lookedCards ? [{
        role: `looked:${G.lookedCards.source ?? "cards"}`,
        kind: "own-private",
        count: Array.isArray(G.lookedCards.cardIds) ? G.lookedCards.cardIds.length : 0,
        hidden: false,
        selected: false
      }] : []),
      ...(G?.pendingCleanupMarketResourceChoice || G?.pendingChoice ? [{
        role: "pending-choice",
        kind: "pending-choice",
        count: 1,
        hidden: false,
        selected: true
      }] : [])
    ]
  };
}

export function buildLastOutcomeSummary(G: any, currentTask?: CurrentTaskUiState): string | undefined {
  if (currentTask?.suppressNormalActions) return `Required: ${currentTask.detail}`;
  const lastLog = summarizeLastLogEntry(getRecentLogEntries(G, 20));
  if (!lastLog) return undefined;
  return lastLog;
}

export function buildBugReportSummary(diagnostics: PlaytestDiagnostics): string {
  const lines = [
    "Polity Engine bug report",
    `App version: ${diagnostics.appVersion}`,
    `Mode: ${diagnostics.options.mode ?? "unknown"} (${diagnostics.mode})`,
    `Players: ${diagnostics.options.playerCount ?? "unknown"}`,
    `Active player: ${diagnostics.activePlayer}`,
    `Viewer player: ${diagnostics.viewerPlayer}`,
    `Current task: ${diagnostics.currentTask ? `${diagnostics.currentTask.title} - ${diagnostics.currentTask.detail}` : "unknown"}`,
    `Pending action: ${diagnostics.pendingAction ?? "none"}`,
    `Last event: ${diagnostics.lastOutcome ?? "none"}`,
    "Recent public log:",
    ...diagnostics.recentPublicLog.slice(-5).map((entry) => `- ${entry.round === undefined ? "Round ?" : `Round ${entry.round}`} ${entry.playerId ?? "system"}: ${formatLogMessage(entry.message)}`),
    "",
    "Please attach the exported playtest diagnostics JSON and describe what you expected to happen."
  ];
  return lines.join("\n");
}

function CurrentTaskPanel({ task }: { task: CurrentTaskUiState }) {
  return (
    <section
      className={`panel current-task-panel${task.suppressNormalActions ? " current-task-panel--blocking" : ""}`}
      data-qa="current-task-panel"
      data-task-title={task.title}
      data-task-choice-type={task.choiceType ?? ""}
      data-task-blocking={task.suppressNormalActions ? "true" : "false"}
      aria-label="Current required action"
    >
      <div className="eyebrow">{task.suppressNormalActions ? "Required Now" : "Current Task"}</div>
      <strong>{task.title}</strong>
      <span>{task.detail}</span>
    </section>
  );
}

function LastEventPanel({ outcome }: { outcome?: string }) {
  if (!outcome) return null;
  return (
    <section className="panel last-event-panel" data-qa="last-event-panel" aria-label="Last event">
      <div className="eyebrow">Last Event</div>
      <span>{outcome}</span>
    </section>
  );
}

export function buildPlaytestDiagnostics({
  G,
  ctx,
  viewerId,
  mode,
  pendingAction,
  currentTask,
  actions = [],
  selectedCardId,
  selection,
  appVersion = "local-dev",
  now = new Date()
}: {
  G: any;
  ctx: any;
  viewerId: string;
  mode: "local" | "online";
  pendingAction?: string;
  currentTask?: CurrentTaskUiState;
  actions?: any[];
  selectedCardId?: string;
  selection?: Selection | null;
  appVersion?: string;
  now?: Date;
}): PlaytestDiagnostics {
  const knownCardIds = Object.keys(G?.cardDb ?? {});
  const resolvedCurrentTask = currentTask ?? getCurrentTaskUiState(G, { ...ctx, currentPlayer: viewerId });
  const recentPublicLog = getRecentLogEntries(G, 20).map((entry: any) => ({
    round: typeof entry?.round === "number" ? entry.round : undefined,
    playerId: entry?.playerId === undefined ? undefined : String(entry.playerId),
    message: redactKnownCardIds(String(entry?.message ?? ""), knownCardIds)
  }));
  return {
    schemaVersion: 1,
    generatedAtIso: now.toISOString(),
    appVersion,
    mode,
    activePlayer: String(ctx?.currentPlayer ?? ""),
    viewerPlayer: viewerId,
    options: {
      mode: G?.options?.mode,
      playerCount: G?.options?.playerCount,
      commonsSetId: G?.options?.commonsSetId,
      enabledExpansions: Array.isArray(G?.options?.enabledExpansions) ? G.options.enabledExpansions : [],
      enabledVariants: Array.isArray(G?.options?.enabledVariants) ? G.options.enabledVariants : []
    },
    pendingAction,
    currentTask: resolvedCurrentTask,
    lastOutcome: resolvedCurrentTask.suppressNormalActions
      ? `Required: ${resolvedCurrentTask.detail}`
      : (recentPublicLog.at(-1) ? formatLogMessage(recentPublicLog.at(-1)?.message ?? "") : undefined),
    ruleUiState: {
      enabledActions: actions.filter((action) => action.enabled).map((action) => String(action.label ?? action.action)),
      blockedActions: actions
        .filter((action) => !action.enabled)
        .map((action) => ({
          label: String(action.label ?? action.action),
          reason: String(action.reason ?? "Unavailable"),
          ...(action.provenance ? { provenance: ruleProvenanceLabels[action.provenance as keyof typeof ruleProvenanceLabels] ?? String(action.provenance) } : {})
        })),
      ...(selectedCardId && G?.cardDb?.[selectedCardId] ? { selectedPublicCardId: selectedCardId } : {})
    },
    zoneUiState: buildZoneUiState(G, viewerId, selection),
    sharedPiles: Object.fromEntries(getSharedPiles(G).map((pile) => [pile.id, pile.count])),
    players: Object.fromEntries(Object.entries(G?.players ?? {}).map(([playerId, player]) => [
      playerId,
      {
        zones: getPlayerZoneCounts(player),
        resources: { ...((player as any)?.resources ?? {}) }
      }
    ])),
    recentPublicLog
  };
}

function downloadPlaytestDiagnostics(diagnostics: PlaytestDiagnostics): void {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") return;
  const content = JSON.stringify(diagnostics, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: "application/json;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `polity-playtest-diagnostics-${diagnostics.generatedAtIso.replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function BoardLayout({
  G,
  ctx,
  moves,
  playerID,
  viewerPlayerID,
  undo,
  isMultiplayer,
  _undo,
  onCampaignProgress,
  accountResultContext,
  onAccountGameResult
}: any & {
  viewerPlayerID?: string | null;
  onCampaignProgress?: (progress: CampaignProgress) => void;
  accountResultContext?: AccountGameResultContext;
  onAccountGameResult?: (result: AccountGameResultInput) => void;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [zoomCardId, setZoomCardId] = useState<string | null>(null);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const [bugReportText, setBugReportText] = useState<string | null>(null);
  const [bugReportStatus, setBugReportStatus] = useState<string | null>(null);
  const [cleanupDiscardSlots, setCleanupDiscardSlots] = useState<number[]>([]);
  const viewerId = viewerPlayerId(G, ctx, viewerPlayerID, playerID);
  const activePlayerId = mapViewerPlayerId(G, ctx?.currentPlayer) ?? String(ctx?.currentPlayer ?? "");
  const uiCtx = useMemo(() => ({ ...ctx, currentPlayer: viewerId }), [ctx, viewerId]);
  const player = getCurrentPlayer(G, uiCtx);
  const marketIds = getMarketCards(G);
  const marketCards = marketIds.map((id) => G.cardDb?.[id]).filter(Boolean);
  const shared = getSharedPiles(G);
  const resourceLabels = resourceLabelsForGame(G, viewerId);
  const playerZoneLabels = getPlayerZoneLabels(G, viewerId);
  const selectedCard = getSelectedCard(selection, G);
  const selectedZoneOwnerId = selection?.kind === "player_zone" ? (selection.playerId ?? viewerId) : undefined;
  const ownerVisibleZoneIds = selectedZoneOwnerId ? getOwnerVisibleZoneIds(G, selectedZoneOwnerId) : undefined;
  const detailCard = selectedCard ?? G.cardDb?.[G.pendingChoice?.sourceCardId];
  const pinnedDetailCard = G.cardDb?.[detailCardId ?? ""];
  const visibleDetailCard = pinnedDetailCard ?? detailCard;
  const zoomCard = G.cardDb?.[zoomCardId ?? ""];
  const selectedZone = selection?.kind === "player_zone"
    ? getInspectableZone(player, selection.id, { ownerPlayerId: selectedZoneOwnerId, viewerPlayerId: viewerId, ownerVisibleZoneIds })
    : undefined;
  const selectedSharedPile = selection?.kind === "pile" ? getInspectableSharedPile(G, selection.id) : undefined;
  const selectedBotZone = selection?.kind === "bot_zone" ? getInspectableZone(G.solo?.bot, selection.id) : undefined;
  const lookedZone = getInspectableLookedCards(G, viewerId);
  const cleanupDiscardCardIds: string[] = G.pendingCleanupDiscardChoice?.cardIds ?? [];
  const cleanupDiscardKey = cleanupDiscardCardIds.join("|");
  const cleanupDiscardSelection = cleanupDiscardSlots
    .map((slot) => cleanupDiscardCardIds[slot])
    .filter((cardId): cardId is string => !!cardId);
  const actions = useMemo(() => getAvailableActionsForSelection(selection, G, uiCtx, { cleanupDiscardSelection }), [selection, G, uiCtx, cleanupDiscardSelection]);
  const pending = getPendingUiState(G, uiCtx);
  const currentTask = getCurrentTaskUiState(G, uiCtx);
  const primaryBlockedReason = getPrimaryBlockedReason(actions);
  const primaryBlockedAction = actions.find((action: any) => !action.enabled && action.reason);
  const localUndoAvailability = getLocalUndoAvailability({ G, isMultiplayer, undoStack: _undo });
  const diagnostics = useMemo(() => buildPlaytestDiagnostics({
    G,
    ctx: { ...ctx, currentPlayer: activePlayerId },
    viewerId,
    mode: isMultiplayer ? "online" : "local",
    pendingAction: pending?.detail,
    currentTask,
    actions,
    selectedCardId: selectedCard?.id,
    selection,
    appVersion: (import.meta as any).env?.VITE_GIT_COMMIT ?? "local-dev"
  }), [G, ctx, activePlayerId, viewerId, isMultiplayer, pending?.detail, currentTask, actions, selectedCard?.id, selection]);
  const lastOutcome = diagnostics.lastOutcome;
  const handActionHintsByCardId = useMemo(() => {
    const hints = getActionHintsByCardId(actions, "hand");
    if (!G.pendingCleanupDiscardChoice) return hints;
    const next = { ...hints };
    cleanupDiscardCardIds.forEach((cardId) => {
      next[cardId] = {
        labels: ["Select to discard"],
        highlighted: true
      };
    });
    return next;
  }, [G.pendingCleanupDiscardChoice, actions, cleanupDiscardCardIds]);
  const marketActionHintsByCardId = useMemo(() => getActionHintsByCardId(actions, "market"), [actions]);

  useEffect(() => {
    if (!G.pendingCleanupDiscardChoice) {
      setCleanupDiscardSlots([]);
      return;
    }
    setCleanupDiscardSlots((prev) => prev.filter((slot) => slot >= 0 && slot < cleanupDiscardCardIds.length));
  }, [G.pendingCleanupDiscardChoice, cleanupDiscardKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleBoardKeyDown(e, {
      onEndTurn: () => moves.endTurn?.(),
      onClear: () => {
        if (zoomCardId) {
          setZoomCardId(null);
          return;
        }
        setSelection(null);
      },
      onCyclePanel: () => {},
      onShortcut: () => {},
      onZoom: () => {
        const cardId = detailCardId ?? detailCard?.id;
        if (cardId) setZoomCardId(cardId);
      }
    });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailCard?.id, detailCardId, moves, zoomCardId]);

  const onAction = (action: any) => dispatchBoardAction({ action, moves, setDetailCardId, setSelection });

  const copyBugReportSummary = async () => {
    const summary = buildBugReportSummary(diagnostics);
    setBugReportText(summary);
    try {
      await navigator.clipboard.writeText(summary);
      setBugReportStatus("Bug report summary copied.");
    } catch {
      setBugReportStatus("Copy failed. Summary is shown below.");
    }
  };

  const onMarketCardClick = (id: string) => {
    const directAction = getMarketCardClickAction(G, uiCtx, id);
    if (directAction) {
      onAction(directAction);
      return;
    }
    setSelection({kind:"market_slot",id});
  };

  const toggleCleanupDiscardCard = (id: string, index: number) => {
    if (!G.pendingCleanupDiscardChoice?.cardIds?.includes(id)) return;
    if (G.pendingCleanupDiscardChoice.playerId !== viewerId) return;
    setSelection({kind:"hand_card",id,playerId:viewerId});
    setCleanupDiscardSlots((prev) => prev.includes(index) ? prev.filter((slot) => slot !== index) : [...prev, index]);
  };

  const onHandCardClick = (id: string, index: number) => {
    if (G.pendingCleanupDiscardChoice) {
      toggleCleanupDiscardCard(id, index);
      return;
    }
    setSelection({kind:"hand_card",id,playerId:viewerId});
  };

  return <div className="board-layout">
    <div className="left">
      <TurnStatusBar G={G} ctx={{ ...ctx, currentPlayer: activePlayerId }} player={player} currentTask={currentTask} />
      <SharedAreaRow piles={shared} round={G.round ?? 1} selectedId={selection?.kind === "pile" ? selection.id : undefined} onSelectPile={(id)=>setSelection({kind:"pile",id})} />
      <MarketRow cards={marketCards} selectedId={selection?.id} resources={player?.resources} resourceLabels={resourceLabels} actionHintsByCardId={marketActionHintsByCardId} marketResources={G.marketResources ?? {}} onSelect={onMarketCardClick} />
      <BotRow bot={G.solo?.bot} cardDb={G.cardDb ?? {}} selectedId={selection?.kind === "bot_zone" ? selection.id : undefined} resourceLabels={resourceLabels} onSelectZone={(id)=>setSelection({kind:"bot_zone",id})} />
      <PlayerArea player={player} cardDb={G.cardDb ?? {}} resourceLabels={resourceLabels} zoneLabels={playerZoneLabels} selectedId={selection?.id} selectedZoneId={selection?.kind === "player_zone" ? selection.id : undefined} cleanupSelectedSlots={cleanupDiscardSlots} actionHintsByCardId={handActionHintsByCardId} onSelectZone={(id:string)=>setSelection({kind:"player_zone",id,playerId:viewerId})} onSelect={onHandCardClick} />
      <div className="panel hints">{CONTROLLER_HINTS.map((h)=> <div key={h}>{h}</div>)}</div>
    </div>
    <div className="right">
      <CurrentTaskPanel task={currentTask} />
      <LastEventPanel outcome={lastOutcome} />
      {lookedZone ? <ZoneDetailPanel title={`Looked ${lookedZone.source}`} cardIds={lookedZone.cardIds} hidden={lookedZone.hidden} count={lookedZone.count} cardDb={G.cardDb ?? {}} zoneKind="own-private" zoneRole={`looked:${lookedZone.source}`} /> : null}
      {selection?.kind === "player_zone"
        ? <ZoneDetailPanel title={playerZoneLabels[selection.id] ?? selection.id} cardIds={selectedZone?.cardIds ?? []} hidden={selectedZone?.hidden} count={selectedZone?.count} cardDb={G.cardDb ?? {}} zoneKind={selectedZone?.hidden ? "opponent-hidden" : "own-private"} zoneRole={selection.id} />
        : selection?.kind === "pile"
          ? <ZoneDetailPanel title={(shared.find((p)=>p.id===selection.id)?.label) ?? selection.id} cardIds={selectedSharedPile?.cardIds ?? []} hidden={selectedSharedPile?.hidden} count={selectedSharedPile?.count} cardDb={G.cardDb ?? {}} zoneKind={selectedSharedPile?.hidden ? "hidden-shared" : "public-shared"} zoneRole={selection.id} />
        : selection?.kind === "bot_zone"
          ? <ZoneDetailPanel title={(getBotPiles(G.solo?.bot).find((p)=>p.id===selection.id)?.label) ?? selection.id} cardIds={selectedBotZone?.cardIds ?? []} hidden={selectedBotZone?.hidden} count={selectedBotZone?.count} cardDb={G.cardDb ?? {}} zoneKind="opponent-hidden" zoneRole={`bot:${selection.id}`} />
          : <CardDetailPanel
            card={visibleDetailCard}
            pinned={!!detailCardId}
            selected={!!selectedCard}
            blockedReason={selectedCard ? primaryBlockedReason : undefined}
            ruleProvenance={selectedCard && primaryBlockedAction?.provenance ? ruleProvenanceLabels[primaryBlockedAction.provenance as keyof typeof ruleProvenanceLabels] : undefined}
            onUnpin={() => setDetailCardId(null)}
            onZoom={visibleDetailCard?.id ? () => setZoomCardId(visibleDetailCard.id) : undefined}
          />}
      {!isMultiplayer ? <div className="panel">
        <button
          className="action-button"
          type="button"
          disabled={!localUndoAvailability.enabled}
          title={localUndoAvailability.reason ?? "Undo last local move"}
          onClick={() => {
            if (localUndoAvailability.enabled) undo?.();
          }}
        >
          <span className="action-button-main">
            <span className="action-symbol" aria-hidden="true">UNDO</span>
            <span>Undo Last Move</span>
          </span>
          {!localUndoAvailability.enabled ? <small>{localUndoAvailability.reason}</small> : null}
        </button>
      </div> : null}
      <section
        className="panel playtest-diagnostics"
        data-qa="playtest-diagnostics"
        data-current-task-title={diagnostics.currentTask?.title ?? ""}
        data-enabled-action-count={diagnostics.ruleUiState.enabledActions.length}
        data-blocked-action-count={diagnostics.ruleUiState.blockedActions.length}
        data-zone-kind-count={diagnostics.zoneUiState.zones.length}
        data-zone-kinds={Array.from(new Set(diagnostics.zoneUiState.zones.map((zone) => zone.kind))).join(" ")}
        aria-label="Playtest diagnostics"
      >
        <div className="diagnostic-grid">
          <div>
            <span className="eyebrow">Active Player</span>
            <strong>Player {diagnostics.activePlayer}</strong>
          </div>
          <div>
            <span className="eyebrow">Viewer Player</span>
            <strong>Player {diagnostics.viewerPlayer}</strong>
          </div>
        </div>
        <button className="action-button" type="button" onClick={() => downloadPlaytestDiagnostics(diagnostics)}>
          <span className="action-button-main">
            <span className="action-symbol" aria-hidden="true">JSON</span>
            <span>Export Playtest Diagnostics</span>
          </span>
        </button>
        <button className="action-button" type="button" onClick={() => void copyBugReportSummary()}>
          <span className="action-button-main">
            <span className="action-symbol" aria-hidden="true">BUG</span>
            <span>Copy Bug Report Summary</span>
          </span>
        </button>
        {bugReportStatus ? <div className="diagnostic-status">{bugReportStatus}</div> : null}
        {bugReportText && bugReportStatus?.startsWith("Copy failed") ? (
          <textarea className="bug-report-fallback" readOnly value={bugReportText} aria-label="Bug report summary" />
        ) : null}
      </section>
      <ActionMenu actions={actions} onAction={onAction} />
      <GameLogPanel entries={getRecentLogEntries(G, 20)} />
      <RuleAidPanel G={G} pending={pending} selectedCard={selectedCard} />
    </div>
    <CardInspectionModal card={zoomCard} onClose={() => setZoomCardId(null)} />
    {G.gameover && !summaryDismissed ? (
      <EndGameSummary
        G={G}
        ctx={ctx}
        onReviewBoard={() => setSummaryDismissed(true)}
        onCampaignProgress={onCampaignProgress}
        accountResultContext={accountResultContext}
        onAccountGameResult={onAccountGameResult}
      />
    ) : null}
  </div>;
}
