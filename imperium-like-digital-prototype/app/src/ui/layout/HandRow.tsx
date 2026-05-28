import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";
export function HandRow({ hand, cardDb, selectedId, onSelect }: { hand: string[]; cardDb: Record<string, any>; selectedId?: string; onSelect: (id: string)=>void }) {
  return <section className="hand-row">{hand.map((id, idx)=> {
    const card = cardDb[id];
    return <CardTile key={`${id}-${idx}`} card={card} orientation={getCardOrientation({ card, zone: "hand" })} selected={selectedId===id} onSelect={()=>onSelect(id)} />;
  })}</section>;
}
