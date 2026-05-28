import { isPrivateCardDebugEnabled } from "../debug/privateCardDebug";

export function CardTile({ card, selected, disabled, compact, orientation = "portrait", onSelect }: { card: any; selected?: boolean; disabled?: boolean; compact?: boolean; orientation?: "portrait"|"landscape"; onSelect?: () => void }) {
  if (!card) return <div className="card-tile empty">Empty</div>;
  const effects = (card.effects ?? []).map((e: any) => e.op ?? "effect").slice(0, compact ? 1 : 3).join(", ");
  return <button className={`card-tile card-tile--${orientation} ${selected ? "is-selected" : ""} ${compact ? "compact" : ""}`} onClick={onSelect} disabled={disabled}>
    <div className="title">{card.displayName}</div>
    <div className="meta">{card.suit ?? card.type} • {card.cardType ?? card.type}</div>
    <div className="meta">Cost: {card.cost?.materials ?? card.cost ?? 0} • VP: {card.vp?.value ?? "-"}</div>
    <div className="meta">{(card.tags ?? []).slice(0, 3).join(", ")}</div>
    <div className="summary">{effects || "No effects"}</div>
    {isPrivateCardDebugEnabled ? <div>{card.privateName} {card.rawEffectTextPrivate}</div> : null}
  </button>;
}
