import { PileTile } from "../components/PileTile";
import { getPlayerZoneCounts } from "./uiSelectors";
const labels: Record<string, string> = {
  deck: "Deck",
  discard: "Discard",
  hand: "Hand",
  playArea: "Play",
  history: "History",
  developmentArea: "Development",
  nationDeck: "Nation Deck"
};

export function PlayerZonesPanel({ player, selectedId, zoneLabels = {}, onSelectZone }: { player: any; selectedId?: string; zoneLabels?: Record<string, string>; onSelectZone: (id: string) => void }) {
  const z = getPlayerZoneCounts(player);
  const entries = Object.entries(z).filter(([k]) => k !== "nationDeck");
  return <div className="panel zones" data-zone-kind="own-private" data-zone-role="player-zones" aria-label="Your player zones">
    <div className="zone-panel-label"><span className="zone-badge">Your zone</span></div>
    <div className="nation-zone-tile">
      <PileTile label="Nation Deck" count={Number(z.nationDeck)} selected={selectedId === "nationDeck"} zoneKind="own-private" zoneRole="nationDeck" onSelect={() => onSelectZone("nationDeck")} />
    </div>
    <div className="zone-grid">{entries.map(([k,v])=> <PileTile key={k} label={zoneLabels[k] ?? labels[k] ?? k} count={Number(v)} selected={selectedId === k} zoneKind="own-private" zoneRole={k} onSelect={() => onSelectZone(k)} />)}</div>
  </div>;
}
