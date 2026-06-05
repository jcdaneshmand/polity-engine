import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";
export function HandRow({ hand, cardDb, selectedId, cleanupSelectedSlots = [], actionHintsByCardId = {}, onSelect }: { hand: string[]; cardDb: Record<string, any>; selectedId?: string; cleanupSelectedSlots?: number[]; actionHintsByCardId?: Record<string, { labels: string[]; highlighted: boolean }>; onSelect: (id: string, index: number)=>void }) {
  return <section className="hand-row">{hand.map((id, idx)=> {
    const card = cardDb[id];
    const hints = actionHintsByCardId[id];
    return <CardTile key={`${id}-${idx}`} card={card} orientation={getCardOrientation({ card, zone: "hand" })} selected={selectedId===id} cleanupSelected={cleanupSelectedSlots.includes(idx)} actionHints={hints?.labels} highlighted={hints?.highlighted} onSelect={()=>onSelect(id, idx)} />;
  })}</section>;
}
