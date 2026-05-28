import type { BoardProps } from "boardgame.io/react";
import type { GameState } from "../../engine/src/game/state";
import { CardView } from "./components/CardView";
import { PlayerZone } from "./components/PlayerZone";
import { ResourcePanel } from "./components/ResourcePanel";
import { LogPanel } from "./components/LogPanel";

export default function Board({ G, ctx, moves, playerID }: BoardProps<GameState>) {
  const activePlayerId = ctx.currentPlayer ?? playerID ?? "0";
  const me = G.players[activePlayerId];
  return <div className="layout">
    <h1>Digital Prototype</h1><h2>Current Player: {ctx.currentPlayer}</h2><div className="panel">Options: mode={G.options?.mode ?? "multiplayer"}, expansions={(G.options?.enabledExpansions ?? []).join(",") || "none"}, variants={(G.options?.enabledVariants ?? []).join(",") || "none"}{G.options?.soloDifficulty ? `, soloDifficulty=${G.options.soloDifficulty}` : ""}</div>
    <ResourcePanel resources={me.resources} />
    <div className="zones"><PlayerZone label="Deck" count={me.deck.length} /><PlayerZone label="Discard" count={me.discard.length} /><PlayerZone label="History" count={me.history.length} /></div>
    <h3>Hand</h3><div className="row">{me.hand.map((id) => <CardView key={id} title={G.cardDb[id]?.displayName ?? id}><button onClick={() => moves.playCard(id)}>Play card</button></CardView>)}</div>
    <h3>Market</h3><div className="row">{G.market.map((id) => <CardView key={id} title={G.cardDb[id]?.displayName ?? id}><button onClick={() => moves.acquireCard(id)}>Acquire card</button></CardView>)}</div>
    <button className="end" onClick={() => moves.endTurn()}>End turn</button>
    <LogPanel log={G.log} />
  </div>;
}
