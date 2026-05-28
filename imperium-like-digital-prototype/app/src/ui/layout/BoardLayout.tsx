import { useEffect, useMemo, useState } from "react";
import { SharedAreaRow } from "./SharedAreaRow";
import { MarketRow } from "./MarketRow";
import { PlayerArea } from "./PlayerArea";
import { CardDetailPanel } from "./CardDetailPanel";
import { ActionMenu } from "./ActionMenu";
import { GameLogPanel } from "./GameLogPanel";
import { getAvailableActionsForSelection, getSelectedCard, type Selection } from "../controller/selectionModel";
import { CONTROLLER_HINTS } from "../controller/controllerHints";
import { handleBoardKeyDown } from "../controller/keyboardControls";
import { getCurrentPlayer, getMarketCards, getRecentLogEntries, getSharedPiles } from "./uiSelectors";

export default function BoardLayout({ G, ctx, moves }: any) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const player = getCurrentPlayer(G, ctx);
  const marketIds = getMarketCards(G);
  const marketCards = marketIds.map((id) => G.cardDb?.[id]).filter(Boolean);
  const shared = getSharedPiles(G);
  const selectedCard = getSelectedCard(selection, G);
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
    if (a.action === "endTurn") moves.endTurn?.();
    if (a.action === "cancel") setSelection(null);
  };

  return <div className="board-layout">
    <div className="left">
      <SharedAreaRow piles={shared} round={G.round ?? 1} />
      <MarketRow cards={marketCards} selectedId={selection?.id} onSelect={(id)=>setSelection({kind:"market_slot",id})} />
      <PlayerArea player={player} cardDb={G.cardDb ?? {}} selectedId={selection?.id} onSelect={(id:string)=>setSelection({kind:"hand_card",id,playerId:ctx.currentPlayer})} />
      <div className="panel hints">{CONTROLLER_HINTS.map((h)=> <div key={h}>{h}</div>)}</div>
    </div>
    <div className="right">
      <CardDetailPanel card={selectedCard} />
      <ActionMenu actions={actions} onAction={onAction} />
      <GameLogPanel entries={getRecentLogEntries(G, 20)} />
    </div>
  </div>;
}
