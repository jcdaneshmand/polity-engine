import { PlayerStatusPanel } from "./PlayerStatusPanel";
import { PlayerZonesPanel } from "./PlayerZonesPanel";
import { HandRow } from "./HandRow";
export function PlayerArea(props: any) { return <section className="player-area"><PlayerStatusPanel player={props.player} cardDb={props.cardDb} resourceLabels={props.resourceLabels} /><PlayerZonesPanel player={props.player} selectedId={props.selectedZoneId} zoneLabels={props.zoneLabels} onSelectZone={props.onSelectZone} /><HandRow hand={props.player?.hand ?? []} cardDb={props.cardDb} selectedId={props.selectedId} cleanupSelectedSlots={props.cleanupSelectedSlots} actionHintsByCardId={props.actionHintsByCardId} onSelect={props.onSelect} /></section>; }
