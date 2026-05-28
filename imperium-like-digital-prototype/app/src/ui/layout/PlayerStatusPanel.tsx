import { ResourceBadge } from "../components/ResourceBadge";
import { TokenBadge } from "../components/TokenBadge";
import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";

export function PlayerStatusPanel({ player, cardDb }: { player: any; cardDb: Record<string, any> }) {
  return <div className="panel status">
    <div>{Object.entries(player?.resources ?? {}).map(([k,v]) => <ResourceBadge key={k} label={k} value={Number(v)} />)}</div>
    <TokenBadge label="Action" value={`${player?.actionTokensAvailable ?? 0}/${player?.actionTokensBase ?? 0}`} />
    <TokenBadge label="Exhaust" value={`${player?.exhaustTokensAvailable ?? 0}/${player?.exhaustTokensBase ?? 0}`} />
    <div className="status-cards">{(player?.powerArea ?? []).slice(0,2).map((id:string)=><CardTile key={id} card={cardDb[id]} compact orientation={getCardOrientation({ card: cardDb[id], zone: "power_area" })} />)}</div>
    <div className="status-cards">{(player?.stateArea ?? []).slice(0,2).map((id:string)=><CardTile key={id} card={cardDb[id]} compact orientation={getCardOrientation({ card: cardDb[id], zone: "state_area" })} />)}</div>
  </div>;
}
