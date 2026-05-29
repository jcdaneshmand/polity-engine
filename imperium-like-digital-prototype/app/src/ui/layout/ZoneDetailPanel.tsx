import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";

export function ZoneDetailPanel({ title, cardIds, cardDb, hidden = false, count = cardIds.length }: { title: string; cardIds: string[]; cardDb: Record<string, any>; hidden?: boolean; count?: number }) {
  return <div className="panel detail zone-detail-panel">
    <div className="eyebrow">Zone</div>
    <h3>{title}</h3>
    <div className="zone-summary">{count} {count === 1 ? "card" : "cards"}{hidden ? " - hidden" : ""}</div>
    {hidden
      ? <div className="empty-zone">Card identities are hidden until revealed.</div>
      : cardIds.length === 0
      ? <div className="empty-zone">No cards here.</div>
      : <div className="zone-card-list">{cardIds.map((id, index) => {
        const card = cardDb[id] ?? { id, displayName: id, type: "unknown", tags: [], effects: [] };
        return <CardTile key={`${id}-${index}`} card={card} compact orientation={getCardOrientation({ card, zone: "detail_zoom" })} />;
      })}</div>}
  </div>;
}
