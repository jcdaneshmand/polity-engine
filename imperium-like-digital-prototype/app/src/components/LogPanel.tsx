import type { GameLogEntry } from "../../../engine/src/game/state";

export function LogPanel({ log }: { log: GameLogEntry[] }) {
  return <div className="log">{log.slice(-8).map((e, i) => <div key={i}>R{e.round} P{e.playerId}: {e.message}</div>)}</div>;
}
