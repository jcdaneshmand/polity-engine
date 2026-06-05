import { isPrivateCardDebugEnabled } from "../debug/privateCardDebug";
import { resourceLabel } from "./resourceDisplay";

const resourceOrder = ["materials", "influence", "knowledge", "goods", "unrest"];

function titleWords(value: string | undefined): string {
  return String(value ?? "-")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

export function formatCardDetailResourceCost(cost: any): string {
  if (typeof cost === "number") return cost > 0 ? `${cost} Materials` : "Free";
  const parts = resourceOrder
    .filter((resource) => Number(cost?.[resource] ?? cost?.[resource === "influence" ? "population" : resource === "knowledge" ? "progress" : resource] ?? 0) > 0)
    .map((resource) => {
      const value = Number(cost?.[resource] ?? cost?.[resource === "influence" ? "population" : resource === "knowledge" ? "progress" : resource] ?? 0);
      return `${value} ${resourceLabel(resource)}`;
    });
  return parts.join(", ") || "Free";
}

function formatDestination(destination: string | undefined): string {
  if (!destination) return "";
  return ` to ${titleWords(destination).toLowerCase()}`;
}

function formatSource(source: string | undefined): string {
  if (!source) return "";
  return ` from ${titleWords(source).toLowerCase()}`;
}

function formatTrigger(trigger: string | undefined): string {
  if (!trigger) return "";
  return `On ${titleWords(trigger.replace(/^on_/, "")).toLowerCase()}: `;
}

export function formatCardDetailEffect(effect: any): string {
  const prefix = formatTrigger(effect?.trigger);
  const amount = Number(effect?.amount ?? effect?.count ?? 0);
  const resource = resourceLabel(effect?.resource ?? "resource");
  switch (effect?.op) {
    case "gain_resource":
      return `${prefix}gain ${amount} ${resource}.`;
    case "spend_resource":
      return `${prefix}spend ${amount} ${resource}.`;
    case "remove_resource":
      return `${prefix}remove up to ${amount} ${resource}.`;
    case "return_resource":
      return `${prefix}return up to ${amount} ${resource}.`;
    case "steal_resource":
      return `${prefix}steal up to ${amount} ${resource}.`;
    case "draw":
      return `${prefix}draw ${plural(Number(effect?.count ?? 0), "card")}${formatSource(effect?.source)}.`;
    case "discard_random":
      return `${prefix}discard ${plural(Number(effect?.count ?? 0), "random card")}.`;
    case "acquire_card":
      return `${prefix}acquire ${plural(Number(effect?.count ?? 1), "card")}${formatSource(effect?.source)}${formatDestination(effect?.destination)}.`;
    case "exile_card":
      return `${prefix}exile ${effect?.cardId ? titleWords(effect.cardId) : "a card"}${formatSource(effect?.source)}.`;
    case "place_card_on_deck":
      return `${prefix}place ${effect?.cardId ? titleWords(effect.cardId) : "a card"} on top of the draw deck.`;
    case "return_unrest":
      return `${prefix}return Unrest.`;
    case "move_self_to_history":
      return `${prefix}move this card to history.`;
    case "look_cards":
      return `${prefix}look at ${plural(Number(effect?.count ?? 0), "card")}${formatSource(effect?.source)}.`;
    case "find_card":
      return `${prefix}find ${effect?.cardId ? titleWords(effect.cardId) : "a matching card"}${formatDestination(effect?.destination)}.`;
    case "profit":
      return `${prefix}profit from this card.`;
    case "garrison":
      return `${prefix}garrison a card.`;
    default:
      return `${prefix}${titleWords(effect?.op ?? "effect").toLowerCase()}.`;
  }
}

function formatVp(vp: any): string {
  if (!vp || vp.mode === "none" || vp.value == null) return "None";
  if (vp.mode === "fixed") return `${vp.value}`;
  return `${vp.value ?? ""} variable VP`.trim();
}

type CardDetailPanelProps = {
  card: any;
  pinned?: boolean;
  blockedReason?: string;
  onUnpin?: () => void;
  onZoom?: () => void;
  variant?: "panel" | "modal";
};

export function CardDetailPanel({ card, pinned = false, blockedReason, onUnpin, onZoom, variant = "panel" }: CardDetailPanelProps) {
  if (!card) return <div className="panel detail">Select a card.</div>;
  const effects = card.effects ?? [];
  const tags = card.tags ?? [];

  return <div className={`panel detail card-detail-panel card-detail-panel--${variant}`}>
    <div className="detail-heading">
      <div>
        <h3>{card.displayName}</h3>
        <div className="detail-subtitle">{titleWords(card.suit ?? card.type)} {titleWords(card.cardType ?? card.type)}</div>
      </div>
      <div className="detail-heading-actions">
        {onZoom ? <button className="zoom-button" type="button" onClick={onZoom}>Zoom</button> : null}
        {pinned ? <button className="unpin-button" type="button" onClick={onUnpin}>Unpin</button> : null}
      </div>
    </div>
    {pinned ? <div className="pinned-label">Pinned</div> : null}
    {blockedReason ? <div className="detail-blocked-reason">{blockedReason}</div> : null}
    <div className="detail-grid">
      <div><span>Cost</span><strong>{formatCardDetailResourceCost(card.cost ?? 0)}</strong></div>
      <div><span>Develop</span><strong>{formatCardDetailResourceCost(card.developmentCost ?? {})}</strong></div>
      <div><span>VP</span><strong>{formatVp(card.vp)}</strong></div>
      <div><span>Starts In</span><strong>{titleWords(card.startingLocation)}</strong></div>
    </div>
    {tags.length > 0 ? <div className="detail-tags">{tags.map((tag: string) => <span key={tag}>{titleWords(tag)}</span>)}</div> : null}
    <div className="detail-section-title">Effects</div>
    <ul className="detail-effects">
      {effects.length === 0 ? <li>No effects.</li> : effects.map((effect: any, index: number) => <li key={`${effect.op ?? "effect"}-${index}`}>{formatCardDetailEffect(effect)}</li>)}
    </ul>
    <div className="detail-implementation">Implemented: {card.implemented === undefined ? "Unknown" : card.implemented ? "Yes" : "No"} - Tested: {card.tested === undefined ? "Unknown" : card.tested ? "Yes" : "No"}</div>
    {isPrivateCardDebugEnabled ? <pre>{card.privateName} {card.rawEffectTextPrivate}</pre> : null}
  </div>;
}

export function CardInspectionModal({ card, onClose }: { card: any; onClose: () => void }) {
  if (!card) return null;

  return (
    <div className="card-inspection-backdrop">
      <div className="card-inspection-modal" role="dialog" aria-modal="true" aria-label={`${card.displayName} card inspection`}>
        <div className="card-inspection-toolbar">
          <strong>{card.displayName}</strong>
          <button type="button" onClick={onClose}>Close</button>
        </div>
        <CardDetailPanel card={card} variant="modal" />
      </div>
    </div>
  );
}
