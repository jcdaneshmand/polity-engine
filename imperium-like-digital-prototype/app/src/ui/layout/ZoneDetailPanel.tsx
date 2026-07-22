import { CardTile } from "../components/CardTile";
import { getCardOrientation } from "./cardOrientation";

function zoneBadgeLabel(zoneKind: string): string {
  if (zoneKind === "own-private") return "Your zone";
  if (zoneKind === "market-shared") return "Market";
  if (zoneKind === "public-shared") return "Public";
  if (zoneKind === "opponent-hidden") return "Hidden opponent";
  if (zoneKind === "hidden-shared") return "Hidden";
  if (zoneKind === "pending-choice") return "Pending";
  return zoneKind.replace(/-/g, " ");
}

export function ZoneDetailPanel({ title, cardIds, cardDb, hidden = false, count = cardIds.length, zoneKind = hidden ? "hidden" : "public-shared", zoneRole }: { title: string; cardIds: string[]; cardDb: Record<string, any>; hidden?: boolean; count?: number; zoneKind?: string; zoneRole?: string }) {
  return <div className="panel detail zone-detail-panel" data-zone-kind={zoneKind} data-zone-role={zoneRole} data-zone-state={hidden ? "hidden" : "revealed"}>
    <div className="detail-heading">
      <div>
        <div className="eyebrow">Zone {hidden ? "Hidden" : "Visible"}</div>
        <h3>{title}</h3>
      </div>
      <span className="zone-badge">{zoneBadgeLabel(zoneKind)}</span>
    </div>
    <div className="zone-summary">{count} {count === 1 ? "card" : "cards"}{hidden ? " - hidden" : ""}</div>
    {hidden
      ? <div className="empty-zone">Card identities are hidden until revealed.</div>
      : cardIds.length === 0
      ? <div className="empty-zone">No cards here.</div>
      : <div className="zone-card-list">{cardIds.map((id, index) => {
        const card = cardDb[id] ?? { id, displayName: id, type: "unknown", tags: [], effects: [] };
        return <CardTile key={`${id}-${index}`} card={card} compact zoneKind={zoneKind} zoneRole={zoneRole} orientation={getCardOrientation({ card, zone: "detail_zoom" })} />;
      })}</div>}
  </div>;
}
