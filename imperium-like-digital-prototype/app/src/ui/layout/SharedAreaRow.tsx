import { PileTile } from "../components/PileTile";
export function SharedAreaRow({ piles, round, selectedId, onSelectPile }: { piles: { id: string; label: string; count: number }[]; round: number; selectedId?: string; onSelectPile?: (id: string) => void }) {
  return <section className="shared-row" data-zone-kind="public-shared" aria-label="Shared public zones">
    <div className="pile-grid">{piles.map((p) => <PileTile key={p.id} label={p.label} count={p.count} disabled={p.count === 0} selected={selectedId === p.id} zoneKind="public-shared" zoneRole={p.id} onSelect={() => onSelectPile?.(p.id)} />)}</div>
    <div className="round-box" data-zone-kind="turn-public" data-zone-role="round">Round {round}</div>
  </section>;
}
