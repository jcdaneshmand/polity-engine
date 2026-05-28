import { ResourceBadge } from "../components/ResourceBadge";
import { TokenBadge } from "../components/TokenBadge";
export function PlayerStatusPanel({ player }: { player: any }) { return <div className="panel status">{Object.entries(player?.resources ?? {}).map(([k,v]) => <ResourceBadge key={k} label={k} value={Number(v)} />)}<TokenBadge label="Action" value={`${player?.actionTokensAvailable ?? 0}/${player?.actionTokensBase ?? 0}`} /><TokenBadge label="Exhaust" value={`${player?.exhaustTokensAvailable ?? 0}/${player?.exhaustTokensBase ?? 0}`} /></div>; }
