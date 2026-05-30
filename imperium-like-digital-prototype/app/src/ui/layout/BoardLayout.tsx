import { useEffect, useMemo, useState } from "react";
import { SharedAreaRow } from "./SharedAreaRow";
import { MarketRow } from "./MarketRow";
import { PlayerArea } from "./PlayerArea";
import { CardDetailPanel } from "./CardDetailPanel";
import { ActionMenu } from "./ActionMenu";
import { GameLogPanel } from "./GameLogPanel";
import { BotRow } from "./BotRow";
import { ZoneDetailPanel } from "./ZoneDetailPanel";
import { TurnStatusBar } from "./TurnStatusBar";
import { getActionHintsByCardId, getAvailableActionsForSelection, getPendingUiState, getSelectedCard, type Selection } from "../controller/selectionModel";
import { CONTROLLER_HINTS } from "../controller/controllerHints";
import { handleBoardKeyDown } from "../controller/keyboardControls";
import { getBotPiles, getCurrentPlayer, getInspectableLookedCards, getInspectableZone, getMarketCards, getRecentLogEntries, getSharedPiles } from "./uiSelectors";
import { resourceLabelsForGame } from "./resourceDisplay";

export default function BoardLayout({ G, ctx, moves }: any) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [detailCardId, setDetailCardId] = useState<string | null>(null);
  const player = getCurrentPlayer(G, ctx);
  const marketIds = getMarketCards(G);
  const marketCards = marketIds.map((id) => G.cardDb?.[id]).filter(Boolean);
  const shared = getSharedPiles(G);
  const resourceLabels = resourceLabelsForGame(G, ctx.currentPlayer);
  const selectedCard = getSelectedCard(selection, G);
  const detailCard = selectedCard ?? G.cardDb?.[G.pendingChoice?.sourceCardId];
  const selectedZone = selection?.kind === "player_zone"
    ? getInspectableZone(player, selection.id, { ownerPlayerId: selection.playerId, viewerPlayerId: ctx.currentPlayer })
    : undefined;
  const selectedBotZone = selection?.kind === "bot_zone" ? getInspectableZone(G.solo?.bot, selection.id) : undefined;
  const lookedZone = getInspectableLookedCards(G, ctx.currentPlayer);
  const actions = useMemo(() => getAvailableActionsForSelection(selection, G, ctx), [selection, G, ctx]);
  const pending = getPendingUiState(G, ctx);
  const actionHintsByCardId = useMemo(() => getActionHintsByCardId(actions), [actions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleBoardKeyDown(e, { onEndTurn: () => moves.endTurn?.(), onClear: () => setSelection(null), onCyclePanel: () => {}, onShortcut: () => {} });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves]);

  const onAction = (a: any) => {
    if (!a.enabled) return;
    if (a.action === "view" && a.cardId) setDetailCardId(a.cardId);
    if (a.action === "play" && a.cardId) moves.playCard?.(a.cardId);
    if (a.action === "acquire" && a.cardId) moves.acquireCard?.(a.cardId);
    if (a.action === "profit" && a.cardId) moves.profitCard?.(a.cardId);
    if (a.action === "resolveChoice" && typeof a.choiceIndex === "number") moves.resolveChoice?.(a.choiceIndex);
    if (a.action === "resolveDrawChoice" && a.cardId) moves.resolveDrawChoice?.(a.cardId);
    if (a.action === "resolveFindChoice" && a.cardId) moves.resolveFindChoice?.(a.cardId);
    if (a.action === "resolveAcquireChoice" && a.cardId) moves.resolveAcquireChoice?.(a.cardId);
    if (a.action === "resolveExileChoice" && a.cardId) moves.resolveExileChoice?.(a.cardId);
    if (a.action === "skipExileChoice") moves.skipExileChoice?.();
    if (a.action === "resolveBreakThroughChoice" && a.cardId) moves.resolveBreakThroughChoice?.(a.cardId);
    if (a.action === "resolveGarrisonChoice" && a.hostCardId && a.cardId) moves.resolveGarrisonChoice?.(a.hostCardId, a.cardId);
    if (a.action === "resolveRegionChoice" && a.cardId) moves.resolveRegionChoice?.(a.cardId);
    if (a.action === "resolveDevelopmentChoice" && a.cardId) moves.resolveDevelopmentChoice?.(a.cardId);
    if (a.action === "skipDevelopmentChoice") moves.skipDevelopmentChoice?.();
    if (a.action === "resolveShortGameDevelopmentExileChoice" && a.cardId) moves.resolveShortGameDevelopmentExileChoice?.(a.cardId);
    if (a.action === "resolveTradeChoice") moves.resolveTradeChoice?.(a.cardId);
    if (a.action === "resolveReturnUnrestChoice" && a.cardId) moves.resolveReturnUnrestChoice?.(a.cardId);
    if (a.action === "resolvePlaceOnDeckChoice" && a.cardId) moves.resolvePlaceOnDeckChoice?.(a.cardId);
    if (a.action === "resolveGiveCardChoice" && a.cardId && a.recipientPlayerId) moves.resolveGiveCardChoice?.(a.cardId, a.recipientPlayerId);
    if (a.action === "resolveSwapChoice" && a.cardId && a.marketCardId) moves.resolveSwapChoice?.(a.cardId, a.marketCardId);
    if (a.action === "resolveUnrestAllocationChoice" && a.recipientPlayerIds) moves.resolveUnrestAllocationChoice?.(a.recipientPlayerIds);
    if (a.action === "resolveSolsticeOrderChoice" && a.cardIds) moves.resolveSolsticeOrderChoice?.(a.cardIds);
    if (a.action === "resolveLookOrderChoice" && a.cardIds) moves.resolveLookOrderChoice?.(a.cardIds);
    if (a.action === "resolveCleanupMarketResource" && a.cardId) moves.resolveCleanupMarketResource?.(a.cardId);
    if (a.action === "resolveCleanupDiscard") moves.resolveCleanupDiscard?.(a.cardId ? [a.cardId] : []);
    if (a.action === "exhaust" && a.cardId) moves.exhaustCard?.(a.cardId);
    if (a.action === "garrison" && a.hostCardId && a.cardId) moves.garrisonCard?.(a.hostCardId, a.cardId);
    if (a.action === "recallRegion" && a.cardId) moves.recallRegion?.(a.cardId);
    if (a.action === "abandonRegion" && a.cardId) moves.abandonRegion?.(a.cardId);
    if (a.action === "innovate" && a.suit && a.source) moves.innovateTurn?.({ suit: a.suit, source: a.source, cardId: a.cardId });
    if (a.action === "revolt" && a.cardIds) moves.revoltTurn?.(a.cardIds);
    if (a.action === "revolt" && a.cardId) moves.revoltTurn?.([a.cardId]);
    if (a.action === "endTurn") moves.endTurn?.();
    if (a.action === "cancel") { setSelection(null); setDetailCardId(null); }
  };

  return <div className="board-layout">
    <div className="left">
      <TurnStatusBar G={G} ctx={ctx} player={player} pending={pending} />
      <SharedAreaRow piles={shared} round={G.round ?? 1} />
      <MarketRow cards={marketCards} selectedId={selection?.id} resources={player?.resources} resourceLabels={resourceLabels} actionHintsByCardId={actionHintsByCardId} onSelect={(id)=>setSelection({kind:"market_slot",id})} />
      <BotRow bot={G.solo?.bot} cardDb={G.cardDb ?? {}} selectedId={selection?.kind === "bot_zone" ? selection.id : undefined} resourceLabels={resourceLabels} onSelectZone={(id)=>setSelection({kind:"bot_zone",id})} />
      <PlayerArea player={player} cardDb={G.cardDb ?? {}} resourceLabels={resourceLabels} selectedId={selection?.id} selectedZoneId={selection?.kind === "player_zone" ? selection.id : undefined} actionHintsByCardId={actionHintsByCardId} onSelectZone={(id:string)=>setSelection({kind:"player_zone",id,playerId:ctx.currentPlayer})} onSelect={(id:string)=>setSelection({kind:"hand_card",id,playerId:ctx.currentPlayer})} />
      <div className="panel hints">{CONTROLLER_HINTS.map((h)=> <div key={h}>{h}</div>)}</div>
    </div>
    <div className="right">
      {lookedZone ? <ZoneDetailPanel title={`Looked ${lookedZone.source}`} cardIds={lookedZone.cardIds} hidden={lookedZone.hidden} count={lookedZone.count} cardDb={G.cardDb ?? {}} /> : null}
      {pending ? <div className="panel choice-banner is-blocking">
        <div className="eyebrow">{pending.title}</div>
        <strong>{pending.detail}</strong>
      </div> : null}
      {selection?.kind === "player_zone"
        ? <ZoneDetailPanel title={selection.id} cardIds={selectedZone?.cardIds ?? []} hidden={selectedZone?.hidden} count={selectedZone?.count} cardDb={G.cardDb ?? {}} />
        : selection?.kind === "bot_zone"
          ? <ZoneDetailPanel title={(getBotPiles(G.solo?.bot).find((p)=>p.id===selection.id)?.label) ?? selection.id} cardIds={selectedBotZone?.cardIds ?? []} hidden={selectedBotZone?.hidden} count={selectedBotZone?.count} cardDb={G.cardDb ?? {}} />
          : <CardDetailPanel card={G.cardDb?.[detailCardId ?? ""] ?? detailCard} pinned={!!detailCardId} onUnpin={() => setDetailCardId(null)} />}
      <ActionMenu actions={actions} onAction={onAction} />
      <GameLogPanel entries={getRecentLogEntries(G, 20)} />
    </div>
  </div>;
}
