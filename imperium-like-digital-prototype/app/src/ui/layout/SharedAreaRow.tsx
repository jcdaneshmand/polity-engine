import { PileTile } from "../components/PileTile";
export function SharedAreaRow({ piles, round }: { piles: { id: string; label: string; count: number }[]; round: number }) {
  return <section className="shared-row">{piles.map((p) => <PileTile key={p.id} label={p.label} count={p.count} disabled={p.count === 0} />)}<div className="round-box">Round {round}</div></section>;
}
