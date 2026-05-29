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

function isActivateTurn(G: any): boolean {
  return (G.currentTurnType ?? "activate") === "activate";
}

function normalizeStateToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().replace(/[_\s-]+/g, "");
  if (normalized === "empire") return "civilized";
  if (normalized === "barbarian") return "uncivilized";
  return normalized;
}

function cardMeetsStateRequirement(G: any, ctx: any, cardId: string): boolean {
  const requirement = normalizeStateToken(getCardById(G, cardId)?.stateRequirement);
  if (!requirement) return true;
  const stateCardId = G.players?.[ctx.currentPlayer]?.stateArea?.[0];
  const stateCard = stateCardId ? getCardById(G, stateCardId) : undefined;
  const stateTokens = [
    stateCardId,
    stateCard?.displayName,
    stateCard?.suit,
    ...(stateCard?.tags ?? [])
  ].map(normalizeStateToken).filter(Boolean);
  return stateTokens.includes(requirement);
}

function isFreePlayCard(G: any, cardId: string): boolean {
  const card = getCardById(G, cardId);
  return (card?.tags ?? []).some((tag: string) => tag.toLowerCase().replace(/[_\s-]+/g, "_") === "free_play");
}

function freePlayAlreadyUsed(G: any, ctx: any, cardId: string): boolean {
  return (G.freePlayedThisTurn?.[ctx.currentPlayer] ?? []).includes(cardId);
}

function isRegionCard(G: any, cardId: string): boolean {
  const card = getCardById(G, cardId);
  return (card?.cardType ?? card?.type) === "region" || card?.suit === "region";
}

function hasExhaustAbility(G: any, cardId: string): boolean {
  return (getCardById(G, cardId)?.effects ?? []).some((effect: any) => effect?.trigger === "on_exhaust");
}

function effectLabel(effect: any): string {
  switch (effect?.op) {
    case "gain_resource":
      return `Gain ${effect.amount ?? 0} ${effect.resource ?? "resource"}`;
    case "draw":
      return `Draw ${effect.count ?? 0} ${(effect.count ?? 0) === 1 ? "card" : "cards"}`;
    case "spend_resource":
      return `Spend ${effect.amount ?? 0} ${effect.resource ?? "resource"}`;
    case "remove_resource":
      return `Remove ${effect.amount ?? 0} ${effect.resource ?? "resource"}`;
    case "return_resource":
      return `Return ${effect.amount ?? 0} ${effect.resource ?? "resource"}`;
    case "steal_resource":
      return `Steal ${effect.amount ?? 0} ${effect.resource ?? "resource"}`;
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
  return choice.map(effectLabel).join("; ") || "Skip";
}

function isInnovateSuit(suit: string | undefined): boolean {
  return ["region", "uncivilized", "civilized", "tributary"].includes(suit ?? "");
}

function isUnrestCard(card: any): boolean {
  return card?.suit === "unrest" || card?.cardType === "unrest" || card?.type === "unrest" || card?.tags?.includes("unrest") || String(card?.id ?? "").includes("unrest");
}

export function getAvailableActionsForSelection(s: Selection | null, G: any, ctx: any) {
  const actions: Array<{ label:string; action:string; enabled:boolean; reason?:string; cardId?:string; hostCardId?: string; choiceIndex?: number; suit?: string; source?: "market" | "deck" }> = [];
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
  const pendingFindChoice = G.pendingFindChoice;
  if (pendingFindChoice) {
    const isCurrentPlayer = pendingFindChoice.playerId === ctx.currentPlayer;
    (pendingFindChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Find ${card?.displayName ?? cardId}`,
        action: "resolveFindChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingFindChoice.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Find choice first" });
    return actions;
  }
  actions.push({ label:"View Details", action:"view", enabled: !!s });
  if (!s) return actions;
  if (s.kind === "hand_card") {
    const p = G.players?.[ctx.currentPlayer];
    const canUseNormalActions = isActivateTurn(G);
    const meetsStateRequirement = cardMeetsStateRequirement(G, ctx, s.id);
    const freePlay = isFreePlayCard(G, s.id);
    const freePlayUsed = freePlayAlreadyUsed(G, ctx, s.id);
    const hasAction = (p?.actionsRemaining ?? 0) > 0;
    const ok = canUseNormalActions && meetsStateRequirement && !freePlayUsed && (p?.hand ?? []).includes(s.id) && (freePlay || hasAction);
    actions.push({
      label:"Play Card",
      action:"play",
      enabled: ok,
      reason: ok ? undefined : !canUseNormalActions ? "Normal actions require an Activate turn" : !meetsStateRequirement ? `Requires ${getCardById(G, s.id)?.stateRequirement} State` : freePlayUsed ? "Free play already used this turn" : "Card is not in hand or no action tokens available",
      cardId: s.id
    });
    if (isUnrestCard(getCardById(G, s.id))) actions.push({ label:"Revolt Return", action:"revolt", enabled:canUseNormalActions, reason:canUseNormalActions ? undefined : "Revolt requires starting from an Activate turn", cardId: s.id });
    const hostCardId = (p?.playArea ?? []).find((cardId: string) => isRegionCard(G, cardId));
    if (hostCardId) actions.push({ label:"Garrison", action:"garrison", enabled:true, cardId: s.id, hostCardId });
  }
  if (s.kind === "play_area_card" && isRegionCard(G, s.id)) {
    actions.push({ label:"Recall Region", action:"recallRegion", enabled:true, cardId: s.id });
    actions.push({ label:"Abandon Region", action:"abandonRegion", enabled:true, cardId: s.id });
  }
  if (s.kind === "play_area_card" && hasExhaustAbility(G, s.id)) {
    const p = G.players?.[ctx.currentPlayer];
    const canUseNormalActions = isActivateTurn(G);
    const hasToken = (p?.exhaustTokensAvailable ?? 0) > 0;
    const ok = canUseNormalActions && hasToken;
    actions.push({
      label:"Exhaust Ability",
      action:"exhaust",
      enabled: ok,
      reason: ok ? undefined : canUseNormalActions ? "No Exhaust tokens available" : "Exhaust abilities require an Activate turn",
      cardId: s.id
    });
  }
  if (s.kind === "market_slot") {
    const card = getCardById(G, s.id);
    const cost = cardCost(card);
    const available = currentMaterialsAvailableForAcquire(G, ctx);
    const canUseNormalActions = isActivateTurn(G);
    const ok = canUseNormalActions && available >= cost;
    actions.push({
      label:"Acquire Card",
      action:"acquire",
      enabled: ok,
      reason: ok ? undefined : canUseNormalActions ? `Need ${cost} materials; you can pay ${available}` : "Normal acquisition requires an Activate turn",
      cardId: s.id
    });
    const suit = card?.suit;
    if (isInnovateSuit(suit)) actions.push({ label:"Innovate Break Through", action:"innovate", enabled:canUseNormalActions, reason:canUseNormalActions ? undefined : "Innovate requires starting from an Activate turn", cardId: s.id, suit, source:"market" });
  }
  actions.push({ label:"Innovate", action:"innovate", enabled:false, reason:"Not implemented yet" });
  actions.push({ label:"Revolt", action:"revolt", enabled:false, reason:"Not implemented yet" });
  actions.push({ label:"End Turn", action:"endTurn", enabled:true });
  actions.push({ label:"Cancel", action:"cancel", enabled:true });
  return actions;
}
