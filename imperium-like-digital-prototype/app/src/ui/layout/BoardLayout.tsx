import { useEffect, useMemo, useState } from "react";
import type { CampaignProgress } from "../../../../engine/src/options/gameOptions";
import { SharedAreaRow } from "./SharedAreaRow";
import { MarketRow } from "./MarketRow";
import { PlayerArea } from "./PlayerArea";
import { CardDetailPanel, CardInspectionModal } from "./CardDetailPanel";
import { ActionMenu } from "./ActionMenu";
import { GameLogPanel } from "./GameLogPanel";
import { BotRow } from "./BotRow";
import { ZoneDetailPanel } from "./ZoneDetailPanel";
import { TurnStatusBar } from "./TurnStatusBar";
import EndGameSummary from "./EndGameSummary";
import { getActionHintsByCardId, getAvailableActionsForSelection, getMarketCardClickAction, getPendingUiState, getPrimaryBlockedReason, getSelectedCard, type Selection } from "../controller/selectionModel";
import { CONTROLLER_HINTS } from "../controller/controllerHints";
import { handleBoardKeyDown } from "../controller/keyboardControls";
import { getBotPiles, getCurrentPlayer, getInspectableLookedCards, getInspectableSharedPile, getInspectableZone, getMarketCards, getOwnerVisibleZoneIds, getPlayerZoneLabels, getRecentLogEntries, getSharedPiles } from "./uiSelectors";
import { resourceLabelsForGame } from "./resourceDisplay";

function viewerPlayerId(ctx: any, playerID?: string | null): string {
  return playerID ?? ctx?.playerID ?? ctx?.currentPlayer ?? "0";
}

export default function BoardLayout({ G, ctx, moves, playerID, onCampaignProgress }: any & { onCampaignProgress?: (progress: CampaignProgress) => void }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const [zoomCardId, setZoomCardId] = useState<string | null>(null);
  const [summaryDismissed, setSummaryDismissed] = useState(false);
  const [cleanupDiscardSlots, setCleanupDiscardSlots] = useState<number[]>([]);
  const viewerId = viewerPlayerId(ctx, playerID);
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
  const primaryBlockedReason = getPrimaryBlockedReason(actions);
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

  const onAction = (a: any) => {
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
      <TurnStatusBar G={G} ctx={ctx} player={player} pending={pending} />
      <SharedAreaRow piles={shared} round={G.round ?? 1} selectedId={selection?.kind === "pile" ? selection.id : undefined} onSelectPile={(id)=>setSelection({kind:"pile",id})} />
      <MarketRow cards={marketCards} selectedId={selection?.id} resources={player?.resources} resourceLabels={resourceLabels} actionHintsByCardId={marketActionHintsByCardId} marketResources={G.marketResources ?? {}} onSelect={onMarketCardClick} />
      <BotRow bot={G.solo?.bot} cardDb={G.cardDb ?? {}} selectedId={selection?.kind === "bot_zone" ? selection.id : undefined} resourceLabels={resourceLabels} onSelectZone={(id)=>setSelection({kind:"bot_zone",id})} />
      <PlayerArea player={player} cardDb={G.cardDb ?? {}} resourceLabels={resourceLabels} zoneLabels={playerZoneLabels} selectedId={selection?.id} selectedZoneId={selection?.kind === "player_zone" ? selection.id : undefined} cleanupSelectedSlots={cleanupDiscardSlots} actionHintsByCardId={handActionHintsByCardId} onSelectZone={(id:string)=>setSelection({kind:"player_zone",id,playerId:viewerId})} onSelect={onHandCardClick} />
      <div className="panel hints">{CONTROLLER_HINTS.map((h)=> <div key={h}>{h}</div>)}</div>
    </div>
    <div className="right">
      {lookedZone ? <ZoneDetailPanel title={`Looked ${lookedZone.source}`} cardIds={lookedZone.cardIds} hidden={lookedZone.hidden} count={lookedZone.count} cardDb={G.cardDb ?? {}} /> : null}
      {pending ? <div className="panel choice-banner is-secondary">
        <div className="eyebrow">{pending.title}</div>
        <strong>{pending.detail}</strong>
      </div> : null}
      {selection?.kind === "player_zone"
        ? <ZoneDetailPanel title={playerZoneLabels[selection.id] ?? selection.id} cardIds={selectedZone?.cardIds ?? []} hidden={selectedZone?.hidden} count={selectedZone?.count} cardDb={G.cardDb ?? {}} />
        : selection?.kind === "pile"
          ? <ZoneDetailPanel title={(shared.find((p)=>p.id===selection.id)?.label) ?? selection.id} cardIds={selectedSharedPile?.cardIds ?? []} hidden={selectedSharedPile?.hidden} count={selectedSharedPile?.count} cardDb={G.cardDb ?? {}} />
        : selection?.kind === "bot_zone"
          ? <ZoneDetailPanel title={(getBotPiles(G.solo?.bot).find((p)=>p.id===selection.id)?.label) ?? selection.id} cardIds={selectedBotZone?.cardIds ?? []} hidden={selectedBotZone?.hidden} count={selectedBotZone?.count} cardDb={G.cardDb ?? {}} />
          : <CardDetailPanel
            card={visibleDetailCard}
            pinned={!!detailCardId}
            blockedReason={selectedCard ? primaryBlockedReason : undefined}
            onUnpin={() => setDetailCardId(null)}
            onZoom={visibleDetailCard?.id ? () => setZoomCardId(visibleDetailCard.id) : undefined}
          />}
      <ActionMenu actions={actions} onAction={onAction} />
      <GameLogPanel entries={getRecentLogEntries(G, 20)} />
    </div>
    <CardInspectionModal card={zoomCard} onClose={() => setZoomCardId(null)} />
    {G.gameover && !summaryDismissed ? (
      <EndGameSummary G={G} ctx={ctx} onReviewBoard={() => setSummaryDismissed(true)} onCampaignProgress={onCampaignProgress} />
    ) : null}
  </div>;
}
