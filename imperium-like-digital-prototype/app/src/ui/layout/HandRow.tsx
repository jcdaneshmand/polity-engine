import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";
export function HandRow({ hand, cardDb, selectedId, actionHintsByCardId = {}, onSelect }: { hand: string[]; cardDb: Record<string, any>; selectedId?: string; actionHintsByCardId?: Record<string, { labels: string[]; highlighted: boolean }>; onSelect: (id: string)=>void }) {
  return <section className="hand-row">{hand.map((id, idx)=> {
    const card = cardDb[id];
    const hints = actionHintsByCardId[id];
    return <CardTile key={`${id}-${idx}`} card={card} orientation={getCardOrientation({ card, zone: "hand" })} selected={selectedId===id} actionHints={hints?.labels} highlighted={hints?.highlighted} onSelect={()=>onSelect(id)} />;
  })}</section>;
}
