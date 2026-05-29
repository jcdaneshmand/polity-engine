import { useEffect, useMemo, useState } from "react";
import { SharedAreaRow } from "./SharedAreaRow";
import { MarketRow } from "./MarketRow";
import { PlayerArea } from "./PlayerArea";
import { CardDetailPanel } from "./CardDetailPanel";
import { ActionMenu } from "./ActionMenu";
import { GameLogPanel } from "./GameLogPanel";
import { BotRow } from "./BotRow";
import { ZoneDetailPanel } from "./ZoneDetailPanel";
import { getAvailableActionsForSelection, getSelectedCard, type Selection } from "../controller/selectionModel";
import { CONTROLLER_HINTS } from "../controller/controllerHints";
import { handleBoardKeyDown } from "../controller/keyboardControls";
import { getBotPiles, getCurrentPlayer, getInspectableZone, getMarketCards, getRecentLogEntries, getSharedPiles } from "./uiSelectors";

export default function BoardLayout({ G, ctx, moves }: any) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const player = getCurrentPlayer(G, ctx);
  const marketIds = getMarketCards(G);
  const marketCards = marketIds.map((id) => G.cardDb?.[id]).filter(Boolean);
  const shared = getSharedPiles(G);
  const selectedCard = getSelectedCard(selection, G);
  const detailCard = selectedCard ?? G.cardDb?.[G.pendingChoice?.sourceCardId];
  const selectedZone = selection?.kind === "player_zone" ? getInspectableZone(player, selection.id) : undefined;
  const selectedBotZone = selection?.kind === "bot_zone" ? getInspectableZone(G.solo?.bot, selection.id) : undefined;
  const actions = useMemo(() => getAvailableActionsForSelection(selection, G, ctx), [selection, G, ctx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleBoardKeyDown(e, { onEndTurn: () => moves.endTurn?.(), onClear: () => setSelection(null), onCyclePanel: () => {}, onShortcut: () => {} });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moves]);

  const onAction = (a: any) => {
    if (!a.enabled) return;
    if (a.action === "play" && a.cardId) moves.playCard?.(a.cardId);
    if (a.action === "acquire" && a.cardId) moves.acquireCard?.(a.cardId);
    if (a.action === "resolveChoice" && typeof a.choiceIndex === "number") moves.resolveChoice?.(a.choiceIndex);
    if (a.action === "resolveFindChoice" && a.cardId) moves.resolveFindChoice?.(a.cardId);
    if (a.action === "resolveCleanupDiscard") moves.resolveCleanupDiscard?.(a.cardId ? [a.cardId] : []);
    if (a.action === "exhaust" && a.cardId) moves.exhaustCard?.(a.cardId);
    if (a.action === "garrison" && a.hostCardId && a.cardId) moves.garrisonCard?.(a.hostCardId, a.cardId);
    if (a.action === "recallRegion" && a.cardId) moves.recallRegion?.(a.cardId);
    if (a.action === "abandonRegion" && a.cardId) moves.abandonRegion?.(a.cardId);
    if (a.action === "innovate" && a.suit && a.source) moves.innovateTurn?.({ suit: a.suit, source: a.source, cardId: a.cardId });
    if (a.action === "revolt" && a.cardId) moves.revoltTurn?.([a.cardId]);
    if (a.action === "endTurn") moves.endTurn?.();
    if (a.action === "cancel") setSelection(null);
  };

  return <div className="board-layout">
    <div className="left">
      <SharedAreaRow piles={shared} round={G.round ?? 1} />
      <MarketRow cards={marketCards} selectedId={selection?.id} resources={player?.resources} onSelect={(id)=>setSelection({kind:"market_slot",id})} />
      <BotRow bot={G.solo?.bot} cardDb={G.cardDb ?? {}} selectedId={selection?.kind === "bot_zone" ? selection.id : undefined} onSelectZone={(id)=>setSelection({kind:"bot_zone",id})} />
      <PlayerArea player={player} cardDb={G.cardDb ?? {}} selectedId={selection?.id} selectedZoneId={selection?.kind === "player_zone" ? selection.id : undefined} onSelectZone={(id:string)=>setSelection({kind:"player_zone",id,playerId:ctx.currentPlayer})} onSelect={(id:string)=>setSelection({kind:"hand_card",id,playerId:ctx.currentPlayer})} />
      <div className="panel hints">{CONTROLLER_HINTS.map((h)=> <div key={h}>{h}</div>)}</div>
    </div>
    <div className="right">
      {G.pendingChoice ? <div className="panel choice-banner">
        <div className="eyebrow">Pending Choice</div>
        <strong>{G.cardDb?.[G.pendingChoice.sourceCardId]?.displayName ?? "Choose an option"}</strong>
      </div> : null}
      {selection?.kind === "player_zone"
        ? <ZoneDetailPanel title={selection.id} cardIds={selectedZone?.cardIds ?? []} hidden={selectedZone?.hidden} count={selectedZone?.count} cardDb={G.cardDb ?? {}} />
        : selection?.kind === "bot_zone"
          ? <ZoneDetailPanel title={(getBotPiles(G.solo?.bot).find((p)=>p.id===selection.id)?.label) ?? selection.id} cardIds={selectedBotZone?.cardIds ?? []} hidden={selectedBotZone?.hidden} count={selectedBotZone?.count} cardDb={G.cardDb ?? {}} />
          : <CardDetailPanel card={detailCard} />}
      <ActionMenu actions={actions} onAction={onAction} />
      <GameLogPanel entries={getRecentLogEntries(G, 20)} />
    </div>
  </div>;
}
