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

export function PlayerZonesPanel({ player, selectedId, onSelectZone }: { player: any; selectedId?: string; onSelectZone: (id: string) => void }) {
  const z = getPlayerZoneCounts(player);
  const entries = Object.entries(z).filter(([k]) => k !== "nationDeck");
  return <div className="panel zones">
    <div className="nation-zone-tile">
      <PileTile label="Nation Deck" count={Number(z.nationDeck)} selected={selectedId === "nationDeck"} onSelect={() => onSelectZone("nationDeck")} />
    </div>
    <div className="zone-grid">{entries.map(([k,v])=> <PileTile key={k} label={labels[k] ?? k} count={Number(v)} selected={selectedId === k} onSelect={() => onSelectZone(k)} />)}</div>
    {player?.accessionCardId ? <div className="accession">Accession: {player.accessionCardId}</div> : null}
  </div>;
}
