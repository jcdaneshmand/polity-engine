import { PlayerStatusPanel } from "./PlayerStatusPanel";
import { PlayerZonesPanel } from "./PlayerZonesPanel";
import { HandRow } from "./HandRow";
export function PlayerArea(props: any) { return <section className="player-area"><PlayerStatusPanel player={props.player} cardDb={props.cardDb} /><PlayerZonesPanel player={props.player} /><HandRow hand={props.player?.hand ?? []} cardDb={props.cardDb} selectedId={props.selectedId} onSelect={props.onSelect} /></section>; }
