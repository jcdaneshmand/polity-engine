import { CardSlot } from "../components/CardSlot";
import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";
import { resourceLabel, type ResourceLabels } from "./resourceDisplay";

function cardCost(card: any): Record<string, number> {
  return typeof card?.cost === "number"
    ? { materials: card.cost }
    : {
      materials: Number(card?.cost?.materials ?? 0),
      influence: Number(card?.cost?.influence ?? 0),
      knowledge: Number(card?.cost?.knowledge ?? 0),
      goods: Number(card?.cost?.goods ?? 0),
      unrest: Number(card?.cost?.unrest ?? 0)
    };
}

function canPayCost(resources: any, cost: Record<string, number>): boolean {
  const progressCost = Number(cost.knowledge ?? 0);
  const goodsCost = Number(cost.goods ?? 0);
  const unrestCost = Number(cost.unrest ?? 0);
  if (Number(resources?.knowledge ?? 0) < progressCost) return false;
  if (Number(resources?.goods ?? 0) < goodsCost) return false;
  if (Number(resources?.unrest ?? 0) < unrestCost) return false;
  const remainingProgress = Number(resources?.knowledge ?? 0) - progressCost;
  const remainingGoods = Number(resources?.goods ?? 0) - goodsCost;
  const materialShortfall = Math.max(0, Number(cost.materials ?? 0) - Number(resources?.materials ?? 0));
  const populationShortfall = Math.max(0, Number(cost.influence ?? 0) - Number(resources?.influence ?? 0));
  return remainingProgress + remainingGoods >= Math.ceil(materialShortfall / 2) + populationShortfall;
}

function costLabel(cost: Record<string, number>, resourceLabels: ResourceLabels): string {
  return ["materials", "influence", "knowledge", "goods", "unrest"]
    .filter((resource) => Number(cost[resource] ?? 0) > 0)
    .map((resource) => `${cost[resource]} ${resourceLabel(resource, resourceLabels)}`)
    .join(", ") || "0";
}

export function MarketRow({ cards, selectedId, resources, resourceLabels = {}, actionHintsByCardId = {}, onSelect }: { cards: any[]; selectedId?: string; resources?: any; resourceLabels?: ResourceLabels; actionHintsByCardId?: Record<string, { labels: string[]; highlighted: boolean }>; onSelect: (id: string) => void }) {
  const slots = Array.from({ length: 5 }, (_, i) => cards[i]);
  return <section className="market-row">{slots.map((c, i) => {
    const cost = cardCost(c);
    const label = costLabel(cost, resourceLabels);
    const payable = !!c && canPayCost(resources, cost);
    const hints = c ? actionHintsByCardId[c.id] : undefined;
    return <CardSlot key={i} slot={i + 1} attached={c ? `Cost ${label}` : "empty"}>
      <CardTile
        card={c}
        compact
        orientation={getCardOrientation({ card: c, zone: "market" })}
        selected={selectedId === c?.id}
        affordability={c ? (payable ? `Cost ${label}` : `Need ${label}`) : undefined}
        actionHints={hints?.labels}
        highlighted={hints?.highlighted}
        onSelect={() => c && onSelect(c.id)}
      />
    </CardSlot>;
  })}</section>;
}
