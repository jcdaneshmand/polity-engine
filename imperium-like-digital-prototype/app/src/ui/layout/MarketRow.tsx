import { CardSlot } from "../components/CardSlot";
import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";
export function MarketRow({ cards, selectedId, onSelect }: { cards: any[]; selectedId?: string; onSelect: (id: string) => void }) {
  const slots = Array.from({ length: 5 }, (_, i) => cards[i]);
  return <section className="market-row">{slots.map((c, i) => <CardSlot key={i} slot={i+1} attached={c ? "Under-slot space" : "empty"}><CardTile card={c} compact orientation={getCardOrientation({ card: c, zone: "market" })} selected={selectedId===c?.id} onSelect={() => c && onSelect(c.id)} /></CardSlot>)}</section>;
}
