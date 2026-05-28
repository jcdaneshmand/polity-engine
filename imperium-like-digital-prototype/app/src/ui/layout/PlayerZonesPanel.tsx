import { PileTile } from "../components/PileTile";
import { getPlayerZoneCounts } from "./uiSelectors";
export function PlayerZonesPanel({ player }: { player: any }) { const z=getPlayerZoneCounts(player); return <div className="panel zones">{Object.entries(z).map(([k,v])=> <PileTile key={k} label={k} count={Number(v)} />)}{player?.accessionCardId ? <div className="accession">Accession: {player.accessionCardId}</div> : null}</div>; }
