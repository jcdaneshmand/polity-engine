import { isPrivateCardDebugEnabled } from "../debug/privateCardDebug";

function tileCost(card: any): number | string {
  if (typeof card?.cost === "number") return card.cost;
  if (card?.cost && typeof card.cost === "object") return card.cost.materials ?? 0;
  return 0;
}

export function CardTile({ card, selected, disabled, compact, orientation = "portrait", affordability, actionHints = [], resourceTokens = [], highlighted, onSelect }: { card: any; selected?: boolean; disabled?: boolean; compact?: boolean; orientation?: "portrait"|"landscape"; affordability?: string; actionHints?: string[]; resourceTokens?: string[]; highlighted?: boolean; onSelect?: () => void }) {
  if (!card) return <div className="card-tile empty">Empty</div>;
  const effects = (card.effects ?? []).map((e: any) => e.op ?? "effect").slice(0, compact ? 1 : 3).join(", ");
  return <button className={`card-tile card-tile--${orientation} ${selected ? "is-selected" : ""} ${highlighted ? "is-valid-target" : ""} ${compact ? "compact" : ""}`} onClick={onSelect} disabled={disabled}>
    <div className="card-tile-strip">
      <span>{card.suit ?? card.type}</span>
      <span>{card.cardType ?? card.type}</span>
    </div>
    <div className="title">{card.displayName}</div>
    {affordability ? <div className="affordance">{affordability}</div> : null}
    {resourceTokens.length > 0 ? <div className="resource-tokens">{resourceTokens.map((token) => <span key={token}>{token}</span>)}</div> : null}
    {actionHints.length > 0 ? <div className="action-hints">{actionHints.slice(0, 3).map((hint) => <span key={hint}>{hint}</span>)}</div> : null}
    <div className="card-stat-row">
      <span>Cost {tileCost(card)}</span>
      <span>VP {card.vp?.value ?? "-"}</span>
    </div>
    <div className="meta">{(card.tags ?? []).slice(0, 3).join(", ")}</div>
    <div className="summary">{effects || "No effects"}</div>
    {isPrivateCardDebugEnabled ? <div>{card.privateName} {card.rawEffectTextPrivate}</div> : null}
  </button>;
}
