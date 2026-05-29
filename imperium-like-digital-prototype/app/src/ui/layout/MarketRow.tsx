import { CardSlot } from "../components/CardSlot";
import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";

function cardCost(card: any): number {
  return typeof card?.cost === "number" ? card.cost : Number(card?.cost?.materials ?? 0);
}

function availableForAcquire(resources: any): number {
  return Number(resources?.materials ?? 0) + Number(resources?.goods ?? 0);
}

export function MarketRow({ cards, selectedId, resources, onSelect }: { cards: any[]; selectedId?: string; resources?: any; onSelect: (id: string) => void }) {
  const available = availableForAcquire(resources);
  const slots = Array.from({ length: 5 }, (_, i) => cards[i]);
  return <section className="market-row">{slots.map((c, i) => {
    const cost = cardCost(c);
    const canAcquire = !!c && available >= cost;
    return <CardSlot key={i} slot={i + 1} attached={c ? (canAcquire ? "Can acquire" : `Need ${cost} materials`) : "empty"}>
      <CardTile
        card={c}
        compact
        orientation={getCardOrientation({ card: c, zone: "market" })}
        selected={selectedId === c?.id}
        affordability={c ? (canAcquire ? "Can acquire" : `Need ${cost}`) : undefined}
        onSelect={() => c && onSelect(c.id)}
      />
    </CardSlot>;
  })}</section>;
}
