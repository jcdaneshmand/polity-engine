import { CardTile } from "../components/CardTile";
export function HandRow({ hand, cardDb, selectedId, onSelect }: { hand: string[]; cardDb: Record<string, any>; selectedId?: string; onSelect: (id: string)=>void }) { return <section className="hand-row">{hand.map((id)=> <CardTile key={id+Math.random()} card={cardDb[id]} selected={selectedId===id} onSelect={()=>onSelect(id)} />)}</section>; }
