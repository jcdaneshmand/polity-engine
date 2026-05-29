import { getCardById } from "../layout/uiSelectors";

export type SelectableKind = "market_slot"|"hand_card"|"play_area_card"|"development_card"|"pile"|"player_zone"|"bot_zone"|"action";
export type Selection = { kind: SelectableKind; id: string; playerId?: string; index?: number };

export function getSelectionLabel(s: Selection | null, G: any): string {
  if (!s) return "None";
  const c = getSelectedCard(s, G);
  return c?.displayName ?? `${s.kind}:${s.id}`;
}
export function getSelectedCard(s: Selection | null, G: any): any | undefined {
  if (!s) return undefined;
  if (["market_slot","hand_card","play_area_card","development_card"].includes(s.kind)) return getCardById(G, s.id);
  return undefined;
}

function cardCost(card: any): number {
  return typeof card?.cost === "number" ? card.cost : Number(card?.cost?.materials ?? 0);
}

function currentMaterialsAvailableForAcquire(G: any, ctx: any): number {
  const resources = G.players?.[ctx.currentPlayer]?.resources ?? {};
  return Number(resources.materials ?? 0) + Number(resources.goods ?? 0);
}

function isRegionCard(G: any, cardId: string): boolean {
  const card = getCardById(G, cardId);
  return (card?.cardType ?? card?.type) === "region" || card?.suit === "region";
}

function effectLabel(effect: any): string {
  switch (effect?.op) {
    case "gain_resource":
      return `Gain ${effect.amount ?? 0} ${effect.resource ?? "resource"}`;
    case "draw":
      return `Draw ${effect.count ?? 0} ${(effect.count ?? 0) === 1 ? "card" : "cards"}`;
    case "spend_resource":
      return `Spend ${effect.amount ?? 0} ${effect.resource ?? "resource"}`;
    case "discard_random":
      return `Discard ${effect.count ?? 0} random ${(effect.count ?? 0) === 1 ? "card" : "cards"}`;
    case "move_self_to_history":
      return "Move this card to history";
    case "acquire_card":
      return `Acquire ${effect.count ?? 0} ${(effect.count ?? 0) === 1 ? "card" : "cards"}`;
    default:
      return String(effect?.op ?? "effect").replaceAll("_", " ");
  }
}

function choiceLabel(choice: any[]): string {
  return choice.map(effectLabel).join("; ") || "Option";
}

export function getAvailableActionsForSelection(s: Selection | null, G: any, ctx: any) {
  const actions: Array<{ label:string; action:string; enabled:boolean; reason?:string; cardId?:string; hostCardId?: string; choiceIndex?: number }> = [];
  const pendingCleanupDiscard = G.pendingCleanupDiscardChoice;
  if (pendingCleanupDiscard) {
    const isCurrentPlayer = pendingCleanupDiscard.playerId === ctx.currentPlayer;
    const card = s?.kind === "hand_card" && pendingCleanupDiscard.cardIds?.includes(s.id) ? getCardById(G, s.id) : undefined;
    if (card) {
      actions.push({
        label: `Discard ${card.displayName ?? s?.id}`,
        action: "resolveCleanupDiscard",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingCleanupDiscard.playerId}`,
        cardId: s?.id
      });
    }
    actions.push({
      label: "Keep Hand",
      action: "resolveCleanupDiscard",
      enabled: isCurrentPlayer,
      reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingCleanupDiscard.playerId}`
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve cleanup discard first" });
    return actions;
  }
  const pendingChoice = G.pendingChoice;
  if (pendingChoice) {
    const isCurrentPlayer = pendingChoice.playerId === ctx.currentPlayer;
    (pendingChoice.choices ?? []).forEach((choice: any[], index: number) => {
      actions.push({
        label: `Choose ${index + 1}: ${choiceLabel(choice)}`,
        action: "resolveChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingChoice.playerId}`,
        choiceIndex: index
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending choice first" });
    return actions;
  }
  actions.push({ label:"View Details", action:"view", enabled: !!s });
  if (!s) return actions;
  if (s.kind === "hand_card") {
    const p = G.players?.[ctx.currentPlayer];
    const ok = (p?.hand ?? []).includes(s.id) && (p?.actionsRemaining ?? 0) > 0;
    actions.push({ label:"Play Card", action:"play", enabled: ok, reason: ok ? undefined : "Card is not in hand or no action tokens available", cardId: s.id });
    const hostCardId = (p?.playArea ?? []).find((cardId: string) => isRegionCard(G, cardId));
    if (hostCardId) actions.push({ label:"Garrison", action:"garrison", enabled:true, cardId: s.id, hostCardId });
  }
  if (s.kind === "play_area_card" && isRegionCard(G, s.id)) {
    actions.push({ label:"Recall Region", action:"recallRegion", enabled:true, cardId: s.id });
    actions.push({ label:"Abandon Region", action:"abandonRegion", enabled:true, cardId: s.id });
  }
  if (s.kind === "market_slot") {
    const card = getCardById(G, s.id);
    const cost = cardCost(card);
    const available = currentMaterialsAvailableForAcquire(G, ctx);
    const ok = available >= cost;
    actions.push({ label:"Acquire Card", action:"acquire", enabled: ok, reason: ok ? undefined : `Need ${cost} materials; you can pay ${available}`, cardId: s.id });
  }
  actions.push({ label:"Innovate", action:"innovate", enabled:false, reason:"Not implemented yet" });
  actions.push({ label:"Revolt", action:"revolt", enabled:false, reason:"Not implemented yet" });
  actions.push({ label:"End Turn", action:"endTurn", enabled:true });
  actions.push({ label:"Cancel", action:"cancel", enabled:true });
  return actions;
}
