import { isPrivateCardDebugEnabled } from "../debug/privateCardDebug";

export function CardTile({ card, selected, disabled, compact, orientation = "portrait", affordability, actionHints = [], highlighted, onSelect }: { card: any; selected?: boolean; disabled?: boolean; compact?: boolean; orientation?: "portrait"|"landscape"; affordability?: string; actionHints?: string[]; highlighted?: boolean; onSelect?: () => void }) {
  if (!card) return <div className="card-tile empty">Empty</div>;
  const effects = (card.effects ?? []).map((e: any) => e.op ?? "effect").slice(0, compact ? 1 : 3).join(", ");
  return <button className={`card-tile card-tile--${orientation} ${selected ? "is-selected" : ""} ${highlighted ? "is-action-target" : ""} ${compact ? "compact" : ""}`} onClick={onSelect} disabled={disabled}>
    <div className="title">{card.displayName}</div>
    {affordability ? <div className="affordance">{affordability}</div> : null}
    {actionHints.length > 0 ? <div className="action-hints">{actionHints.slice(0, 3).map((hint) => <span key={hint}>{hint}</span>)}</div> : null}
    <div className="meta">{card.suit ?? card.type} - {card.cardType ?? card.type}</div>
    <div className="meta">Cost: {card.cost?.materials ?? card.cost ?? 0} - VP: {card.vp?.value ?? "-"}</div>
    <div className="meta">{(card.tags ?? []).slice(0, 3).join(", ")}</div>
    <div className="summary">{effects || "No effects"}</div>
    {isPrivateCardDebugEnabled ? <div>{card.privateName} {card.rawEffectTextPrivate}</div> : null}
  </button>;
}
