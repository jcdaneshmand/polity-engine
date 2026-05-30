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

function cardCost(card: any): Record<string, number> {
  return typeof card?.cost === "number"
    ? { materials: card.cost }
    : {
      materials: Number(card?.cost?.materials ?? 0),
      influence: Number(card?.cost?.influence ?? 0),
      knowledge: Number(card?.cost?.knowledge ?? 0),
      goods: Number(card?.cost?.goods ?? 0),
      unrest: Number(card?.cost?.unrest ?? 0)
    };
}

function describeCost(cost: Record<string, number>): string {
  return ["materials", "influence", "knowledge", "goods", "unrest"]
    .filter((resource) => Number(cost[resource] ?? 0) > 0)
    .map((resource) => `${resource}=${cost[resource]}`)
    .join(", ");
}

function canPayResourceCost(resources: any, cost: Record<string, number>): boolean {
  const progressCost = Number(cost.knowledge ?? 0);
  const goodsCost = Number(cost.goods ?? 0);
  const unrestCost = Number(cost.unrest ?? 0);
  if (Number(resources.knowledge ?? 0) < progressCost) return false;
  if (Number(resources.goods ?? 0) < goodsCost) return false;
  if (Number(resources.unrest ?? 0) < unrestCost) return false;

  const remainingProgress = Number(resources.knowledge ?? 0) - progressCost;
  const remainingGoods = Number(resources.goods ?? 0) - goodsCost;
  const materialShortfall = Math.max(0, Number(cost.materials ?? 0) - Number(resources.materials ?? 0));
  const populationShortfall = Math.max(0, Number(cost.influence ?? 0) - Number(resources.influence ?? 0));
  const substituteTokensNeeded = Math.ceil(materialShortfall / 2) + populationShortfall;
  return remainingProgress + remainingGoods >= substituteTokensNeeded;
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

function isTradeRouteCard(G: any, cardId: string): boolean {
  const card = getCardById(G, cardId);
  return (card?.cardType ?? card?.type) === "trade_route" || card?.suit === "trade_route";
}

function hasProfitAbility(G: any, cardId: string): boolean {
  return (getCardById(G, cardId)?.effects ?? []).some((effect: any) => effect?.op === "profit");
}

function cardGoods(G: any, cardId: string): number {
  return Number(G.cardStates?.[cardId]?.resources?.goods ?? 0);
}

function hasExhaustAbility(G: any, cardId: string): boolean {
  return (getCardById(G, cardId)?.effects ?? []).some((effect: any) => effect?.trigger === "on_exhaust");
}

function isCardExhausted(G: any, cardId: string): boolean {
  const state = G.cardStates?.[cardId];
  return state?.exhausted === true || Number(state?.exhaustTokens ?? 0) > 0;
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

function canPayChoiceCost(G: any, ctx: any, choice: any[]): boolean {
  const resources = G.players?.[ctx.currentPlayer]?.resources ?? {};
  const cost = choice
    .filter((effect) => effect?.op === "spend_resource")
    .reduce((acc, effect) => {
      acc[effect.resource] = (acc[effect.resource] ?? 0) + Number(effect.amount ?? 0);
      return acc;
    }, {} as Record<string, number>);
  return canPayResourceCost(resources, cost);
}

function isInnovateSuit(suit: string | undefined): boolean {
  return ["region", "uncivilized", "civilized", "tributary"].includes(suit ?? "");
}

const innovateDeckSuits = [
  { suit: "region", label: "Region" },
  { suit: "uncivilized", label: "Uncivilized" },
  { suit: "civilized", label: "Civilized" },
  { suit: "tributary", label: "Tributary" }
];

function isUnrestCard(card: any): boolean {
  return card?.suit === "unrest" || card?.cardType === "unrest" || card?.type === "unrest" || card?.tags?.includes("unrest") || String(card?.id ?? "").includes("unrest");
}

function allocationOptions(recipients: string[], countPerPlayer: number, slots: number): string[][] {
  const results: string[][] = [];
  const walk = (chosen: string[], counts: Record<string, number>) => {
    if (chosen.length === slots) {
      results.push([...chosen]);
      return;
    }
    for (const recipient of recipients) {
      if ((counts[recipient] ?? 0) >= countPerPlayer) continue;
      counts[recipient] = (counts[recipient] ?? 0) + 1;
      chosen.push(recipient);
      walk(chosen, counts);
      chosen.pop();
      counts[recipient] -= 1;
    }
  };
  walk([], {});
  return results;
}

function orderedPermutations(cardIds: string[]): string[][] {
  if (cardIds.length <= 1) return [cardIds];
  if (cardIds.length > 2) return cardIds.map((cardId, index) => [cardId, ...cardIds.filter((_, candidateIndex) => candidateIndex !== index)]);
  return cardIds.flatMap((cardId, index) => {
    const remaining = cardIds.filter((_, candidateIndex) => candidateIndex !== index);
    return orderedPermutations(remaining).map((order) => [cardId, ...order]);
  });
}

export function getPendingUiState(G: any, ctx: any): { title: string; detail: string; playerId?: string } | undefined {
  const plural = (count: number, singular: string) => `${count} ${singular}${count === 1 ? "" : "s"}`;
  const pendingExileDetail = (pendingExileChoice: any) => {
    const optionCount = pendingExileChoice.cardIds?.length ?? 0;
    if (pendingExileChoice.sourceCardId === "practice_market_churn" && pendingExileChoice.source === "market") {
      return `Choose 1 market card to exile${pendingExileChoice.optional ? ", or skip" : ""}`;
    }
    return optionCount > 1 ? `Choose 1 card to exile from ${plural(optionCount, "option")}` : "Choose 1 card to exile";
  };
  const pending =
    G.pendingChoice ? { title: "Pending Choice", detail: plural(G.pendingChoice.choices?.length ?? 0, "option"), playerId: G.pendingChoice.playerId } :
    G.pendingDrawChoice ? { title: "Pending Draw", detail: plural(G.pendingDrawChoice.cardIds?.length ?? 0, "card"), playerId: G.pendingDrawChoice.playerId } :
    G.pendingFindChoice ? { title: "Pending Find", detail: plural(G.pendingFindChoice.cardIds?.length ?? 0, "card"), playerId: G.pendingFindChoice.playerId } :
    G.pendingAcquireChoice ? { title: "Pending Acquire", detail: `Choose ${plural(G.pendingAcquireChoice.cardIds?.length ?? 0, "card")}`, playerId: G.pendingAcquireChoice.playerId } :
    G.pendingMarketCardChoice ? { title: G.pendingMarketCardChoice.op === "take_card" ? "Pending Take Card" : "Pending Gain Card", detail: `Choose ${plural(G.pendingMarketCardChoice.cardIds?.length ?? 0, "market card")}`, playerId: G.pendingMarketCardChoice.playerId } :
    G.pendingBreakThroughChoice ? { title: "Pending Break Through", detail: `Choose ${plural(G.pendingBreakThroughChoice.cardIds?.length ?? 0, "card")}`, playerId: G.pendingBreakThroughChoice.playerId } :
    G.pendingExileChoice ? { title: "Pending Exile", detail: pendingExileDetail(G.pendingExileChoice), playerId: G.pendingExileChoice.playerId } :
    G.pendingGarrisonChoice ? { title: "Pending Garrison", detail: `${plural(G.pendingGarrisonChoice.cardIds?.length ?? 0, "card")} / ${plural(G.pendingGarrisonChoice.hostCardIds?.length ?? 0, "host")}`, playerId: G.pendingGarrisonChoice.playerId } :
    G.pendingRegionChoice ? { title: "Pending Region", detail: `Choose ${plural(G.pendingRegionChoice.cardIds?.length ?? 0, "region")}`, playerId: G.pendingRegionChoice.playerId } :
    G.pendingDevelopmentChoice ? { title: "Pending Development", detail: `Choose ${plural(G.pendingDevelopmentChoice.cardIds?.length ?? 0, "card")}`, playerId: G.pendingDevelopmentChoice.playerId } :
    G.pendingShortGameDevelopmentExileChoice ? { title: "Pending Development Removal", detail: `Choose ${plural(G.pendingShortGameDevelopmentExileChoice.cardIds?.length ?? 0, "card")}`, playerId: G.pendingShortGameDevelopmentExileChoice.playerId } :
    G.pendingTradeChoice ? { title: "Pending Trade", detail: plural((G.pendingTradeChoice.routeCardIds?.length ?? 0) + (G.pendingTradeChoice.allowGoodsForProgress ? 1 : 0), "option"), playerId: G.pendingTradeChoice.playerId } :
    G.pendingReturnUnrestChoice ? { title: "Pending Return Unrest", detail: `Choose ${plural(G.pendingReturnUnrestChoice.cardIds?.length ?? 0, "card")}`, playerId: G.pendingReturnUnrestChoice.playerId } :
    G.pendingPlaceOnDeckChoice ? { title: "Pending Deck Placement", detail: `Choose ${plural(G.pendingPlaceOnDeckChoice.cardIds?.length ?? 0, "card")}`, playerId: G.pendingPlaceOnDeckChoice.playerId } :
    G.pendingGiveCardChoice ? { title: "Pending Give Card", detail: `${plural(G.pendingGiveCardChoice.cardIds?.length ?? 0, "card")} / ${plural(G.pendingGiveCardChoice.recipientPlayerIds?.length ?? 0, "recipient")}`, playerId: G.pendingGiveCardChoice.playerId } :
    G.pendingSwapChoice ? { title: "Pending Swap", detail: plural(G.pendingSwapChoice.choices?.length ?? 0, "option"), playerId: G.pendingSwapChoice.playerId } :
    G.pendingUnrestAllocationChoice ? { title: "Pending Unrest Allocation", detail: plural(G.pendingUnrestAllocationChoice.availableUnrestCardIds?.length ?? 0, "Unrest"), playerId: G.pendingUnrestAllocationChoice.playerId } :
    G.pendingSolsticeOrderChoice ? { title: "Pending Solstice Order", detail: `Choose first of ${plural(G.pendingSolsticeOrderChoice.cardIds?.length ?? 0, "card")}`, playerId: G.pendingSolsticeOrderChoice.playerId } :
    G.pendingLookOrderChoice ? { title: "Pending Look Order", detail: `Choose first of ${plural(G.pendingLookOrderChoice.cardIds?.length ?? 0, "card")}`, playerId: G.pendingLookOrderChoice.playerId } :
    G.pendingCleanupMarketResourceChoice ? {
      title: "Pending Cleanup Resource",
      detail: `Choose a market card for ${plural(G.pendingCleanupMarketResourceChoice.amount ?? 1, "cleanup resource")}`,
      playerId: G.pendingCleanupMarketResourceChoice.playerId
    } :
    G.pendingCleanupDiscardChoice ? { title: "Pending Cleanup Discard", detail: plural(G.pendingCleanupDiscardChoice.cardIds?.length ?? 0, "card"), playerId: G.pendingCleanupDiscardChoice.playerId } :
    undefined;
  if (!pending) return undefined;
  return pending.playerId === ctx.currentPlayer ? pending : { ...pending, detail: `${pending.detail} - waiting for player ${pending.playerId}` };
}

function hintLabel(action: any): string {
  return String(action.label ?? "").replace(/^Choose \d+:\s*/, "").replace(/^Break Through\s+/, "Break Through");
}

type HintZone = "hand" | "market";

function actionHintZone(action: any, idField: "cardId" | "marketCardId"): HintZone | undefined {
  if (idField === "marketCardId") return "market";
  if (action.action === "play" || action.action === "garrison" || action.action === "revolt" || action.action === "resolveCleanupDiscard") return "hand";
  if (action.action === "acquire" || action.action === "resolveAcquireChoice" || action.action === "resolveMarketCardChoice" || action.action === "resolveBreakThroughChoice" || action.action === "resolveCleanupMarketResource") return "market";
  if (action.action === "innovate" && action.source === "market") return "market";
  return undefined;
}

export function getActionHintsByCardId(actions: any[], zone?: HintZone): Record<string, { labels: string[]; highlighted: boolean }> {
  const hints: Record<string, { labels: string[]; highlighted: boolean }> = {};
  const add = (cardId: string | undefined, label: string, highlighted: boolean, hintZone?: HintZone) => {
    if (!cardId) return;
    if (zone && hintZone && zone !== hintZone) return;
    hints[cardId] ??= { labels: [], highlighted: false };
    if (!hints[cardId].labels.includes(label)) hints[cardId].labels.push(label);
    hints[cardId].highlighted ||= highlighted;
  };
  actions.forEach((action) => {
    const highlighted = action.enabled && String(action.action).startsWith("resolve");
    if (action.cardId) add(action.cardId, hintLabel(action).split(" ")[0] || action.label, highlighted, actionHintZone(action, "cardId"));
    if (action.marketCardId) add(action.marketCardId, hintLabel(action).split(" ")[0] || action.label, highlighted, actionHintZone(action, "marketCardId"));
  });
  return hints;
}

export function getMarketCardClickAction(G: any, ctx: any, cardId: string): { action: "resolveCleanupMarketResource" | "resolveExileChoice" | "resolveMarketCardChoice"; cardId: string; enabled: true } | undefined {
  const pending = G.pendingCleanupMarketResourceChoice;
  if (pending?.playerId === ctx.currentPlayer) {
    const eligibleCardIds = pending.cardIds ?? G.market ?? [];
    if (eligibleCardIds.includes(cardId)) return { action: "resolveCleanupMarketResource", cardId, enabled: true };
  }

  const pendingMarketCardChoice = G.pendingMarketCardChoice;
  if (
    pendingMarketCardChoice?.playerId === ctx.currentPlayer
    && (pendingMarketCardChoice.cardIds ?? []).includes(cardId)
  ) {
    return { action: "resolveMarketCardChoice", cardId, enabled: true };
  }

  const pendingExile = G.pendingExileChoice;
  if (
    pendingExile?.playerId === ctx.currentPlayer
    && pendingExile.source === "market"
    && pendingExile.sourceCardId === "practice_market_churn"
    && (pendingExile.cardIds ?? []).includes(cardId)
  ) {
    return { action: "resolveExileChoice", cardId, enabled: true };
  }

  return undefined;
}

export function getAvailableActionsForSelection(s: Selection | null, G: any, ctx: any) {
  const actions: Array<{ label:string; action:string; enabled:boolean; reason?:string; group?: string; cardId?:string; hostCardId?: string; marketCardId?: string; choiceIndex?: number; suit?: string; source?: "market" | "deck" | "discard" | "exile"; recipientPlayerId?: string; recipientPlayerIds?: string[]; cardIds?: string[] }> = [];
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
      const canPay = canPayChoiceCost(G, ctx, choice);
      actions.push({
        label: `Choose ${index + 1}: ${choiceLabel(choice)}`,
        action: "resolveChoice",
        enabled: isCurrentPlayer && canPay,
        reason: isCurrentPlayer ? canPay ? undefined : "Cannot pay choice cost" : `Waiting for player ${pendingChoice.playerId}`,
        choiceIndex: index
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending choice first" });
    return actions;
  }
  const pendingDrawChoice = G.pendingDrawChoice;
  if (pendingDrawChoice) {
    const isCurrentPlayer = pendingDrawChoice.playerId === ctx.currentPlayer;
    (pendingDrawChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Draw ${card?.displayName ?? cardId}`,
        action: "resolveDrawChoice",
        enabled: isCurrentPlayer,
        cardId,
        source: pendingDrawChoice.source,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingDrawChoice.playerId}`
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Draw choice first" });
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
  const pendingAcquireChoice = G.pendingAcquireChoice;
  if (pendingAcquireChoice) {
    const isCurrentPlayer = pendingAcquireChoice.playerId === ctx.currentPlayer;
    (pendingAcquireChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Acquire ${card?.displayName ?? cardId}`,
        action: "resolveAcquireChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingAcquireChoice.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Acquire choice first" });
    return actions;
  }
  const pendingMarketCardChoice = G.pendingMarketCardChoice;
  if (pendingMarketCardChoice) {
    const isCurrentPlayer = pendingMarketCardChoice.playerId === ctx.currentPlayer;
    const verb = pendingMarketCardChoice.op === "take_card" ? "Take" : "Gain";
    (pendingMarketCardChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `${verb} ${card?.displayName ?? cardId}`,
        action: "resolveMarketCardChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingMarketCardChoice.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:`Resolve the pending ${verb} choice first` });
    return actions;
  }
  const pendingExileChoice = G.pendingExileChoice;
  if (pendingExileChoice) {
    const isCurrentPlayer = pendingExileChoice.playerId === ctx.currentPlayer;
    (pendingExileChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Exile ${card?.displayName ?? cardId}`,
        action: "resolveExileChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingExileChoice.playerId}`,
        cardId
      });
    });
    if (pendingExileChoice.optional) {
      actions.push({
        label: "Skip Exile",
        action: "skipExileChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingExileChoice.playerId}`
      });
    }
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Exile choice first" });
    return actions;
  }
  const pendingBreakThroughChoice = G.pendingBreakThroughChoice;
  if (pendingBreakThroughChoice) {
    const isCurrentPlayer = pendingBreakThroughChoice.playerId === ctx.currentPlayer;
    (pendingBreakThroughChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Break Through ${card?.displayName ?? cardId}`,
        action: "resolveBreakThroughChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingBreakThroughChoice.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Break Through choice first" });
    return actions;
  }
  const pendingGarrisonChoice = G.pendingGarrisonChoice;
  if (pendingGarrisonChoice) {
    const isCurrentPlayer = pendingGarrisonChoice.playerId === ctx.currentPlayer;
    (pendingGarrisonChoice.hostCardIds ?? []).forEach((hostCardId: string) => {
      const hostCard = getCardById(G, hostCardId);
      (pendingGarrisonChoice.cardIds ?? []).forEach((cardId: string) => {
        const card = getCardById(G, cardId);
        actions.push({
          label: `Garrison ${card?.displayName ?? cardId} on ${hostCard?.displayName ?? hostCardId}`,
          action: "resolveGarrisonChoice",
          enabled: isCurrentPlayer,
          reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingGarrisonChoice.playerId}`,
          cardId,
          hostCardId
        });
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Garrison choice first" });
    return actions;
  }
  const pendingRegionChoice = G.pendingRegionChoice;
  if (pendingRegionChoice) {
    const isCurrentPlayer = pendingRegionChoice.playerId === ctx.currentPlayer;
    (pendingRegionChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `${pendingRegionChoice.op === "recall_region" ? "Recall" : "Abandon"} ${card?.displayName ?? cardId}`,
        action: "resolveRegionChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingRegionChoice.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Region choice first" });
    return actions;
  }
  const pendingDevelopmentChoice = G.pendingDevelopmentChoice;
  if (pendingDevelopmentChoice) {
    const isCurrentPlayer = pendingDevelopmentChoice.playerId === ctx.currentPlayer;
    (pendingDevelopmentChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Develop ${card?.displayName ?? cardId}`,
        action: "resolveDevelopmentChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingDevelopmentChoice.playerId}`,
        cardId
      });
    });
    if (pendingDevelopmentChoice.allowSkip) {
      actions.push({
        label: "Skip Development",
        action: "skipDevelopmentChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingDevelopmentChoice.playerId}`
      });
    }
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Development choice first" });
    return actions;
  }
  const pendingShortGameDevelopmentExileChoice = G.pendingShortGameDevelopmentExileChoice;
  if (pendingShortGameDevelopmentExileChoice) {
    const isCurrentPlayer = pendingShortGameDevelopmentExileChoice.playerId === ctx.currentPlayer;
    (pendingShortGameDevelopmentExileChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Remove ${card?.displayName ?? cardId}`,
        action: "resolveShortGameDevelopmentExileChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingShortGameDevelopmentExileChoice.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Short Game Development removal first" });
    return actions;
  }
  const pendingTradeChoice = G.pendingTradeChoice;
  if (pendingTradeChoice) {
    const isCurrentPlayer = pendingTradeChoice.playerId === ctx.currentPlayer;
    (pendingTradeChoice.routeCardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Trade via ${card?.displayName ?? cardId}`,
        action: "resolveTradeChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingTradeChoice.playerId}`,
        cardId
      });
    });
    if (pendingTradeChoice.allowGoodsForProgress) {
      actions.push({
        label: "Trade Goods for Progress",
        action: "resolveTradeChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingTradeChoice.playerId}`
      });
    }
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Trade choice first" });
    return actions;
  }
  const pendingReturnUnrestChoice = G.pendingReturnUnrestChoice;
  if (pendingReturnUnrestChoice) {
    const isCurrentPlayer = pendingReturnUnrestChoice.playerId === ctx.currentPlayer;
    (pendingReturnUnrestChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Return ${card?.displayName ?? cardId}`,
        action: "resolveReturnUnrestChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingReturnUnrestChoice.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Return Unrest choice first" });
    return actions;
  }
  const pendingPlaceOnDeckChoice = G.pendingPlaceOnDeckChoice;
  if (pendingPlaceOnDeckChoice) {
    const isCurrentPlayer = pendingPlaceOnDeckChoice.playerId === ctx.currentPlayer;
    (pendingPlaceOnDeckChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Place ${card?.displayName ?? cardId} on deck`,
        action: "resolvePlaceOnDeckChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingPlaceOnDeckChoice.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Place On Deck choice first" });
    return actions;
  }
  const pendingGiveCardChoice = G.pendingGiveCardChoice;
  if (pendingGiveCardChoice) {
    const isCurrentPlayer = pendingGiveCardChoice.playerId === ctx.currentPlayer;
    (pendingGiveCardChoice.cardIds ?? []).forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      (pendingGiveCardChoice.recipientPlayerIds ?? []).forEach((recipientPlayerId: string) => {
        actions.push({
          label: `Give ${card?.displayName ?? cardId} to player ${recipientPlayerId}`,
          action: "resolveGiveCardChoice",
          enabled: isCurrentPlayer,
          reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingGiveCardChoice.playerId}`,
          cardId,
          recipientPlayerId
        });
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Give Card choice first" });
    return actions;
  }
  const pendingSwapChoice = G.pendingSwapChoice;
  if (pendingSwapChoice) {
    const isCurrentPlayer = pendingSwapChoice.playerId === ctx.currentPlayer;
    (pendingSwapChoice.choices ?? []).forEach((choice: { cardId: string; marketCardId: string }) => {
      const card = getCardById(G, choice.cardId);
      const marketCard = getCardById(G, choice.marketCardId);
      actions.push({
        label: `Swap ${card?.displayName ?? choice.cardId} with ${marketCard?.displayName ?? choice.marketCardId}`,
        action: "resolveSwapChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingSwapChoice.playerId}`,
        cardId: choice.cardId,
        marketCardId: choice.marketCardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Swap choice first" });
    return actions;
  }
  const pendingUnrestAllocationChoice = G.pendingUnrestAllocationChoice;
  if (pendingUnrestAllocationChoice) {
    const isCurrentPlayer = pendingUnrestAllocationChoice.playerId === ctx.currentPlayer;
    allocationOptions(
      pendingUnrestAllocationChoice.recipientPlayerIds ?? [],
      Number(pendingUnrestAllocationChoice.countPerPlayer ?? 0),
      pendingUnrestAllocationChoice.availableUnrestCardIds?.length ?? 0
    ).forEach((recipientPlayerIds) => {
      actions.push({
        label: `Give Unrest to ${recipientPlayerIds.join(", ")}`,
        action: "resolveUnrestAllocationChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingUnrestAllocationChoice.playerId}`,
        recipientPlayerIds
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Unrest allocation first" });
    return actions;
  }
  const pendingSolsticeOrderChoice = G.pendingSolsticeOrderChoice;
  if (pendingSolsticeOrderChoice) {
    const isCurrentPlayer = pendingSolsticeOrderChoice.playerId === ctx.currentPlayer;
    orderedPermutations(pendingSolsticeOrderChoice.cardIds ?? []).forEach((cardIds) => {
      const names = cardIds.map((cardId) => getCardById(G, cardId)?.displayName ?? cardId);
      actions.push({
        label: cardIds.length > 2 ? `Resolve ${names[0]} first` : `Resolve ${names.join(" then ")}`,
        action: "resolveSolsticeOrderChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingSolsticeOrderChoice.playerId}`,
        cardIds
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Solstice order first" });
    return actions;
  }
  const pendingLookOrderChoice = G.pendingLookOrderChoice;
  if (pendingLookOrderChoice) {
    const isCurrentPlayer = pendingLookOrderChoice.playerId === ctx.currentPlayer;
    orderedPermutations(pendingLookOrderChoice.cardIds ?? []).forEach((cardIds) => {
      const names = cardIds.map((cardId) => getCardById(G, cardId)?.displayName ?? cardId);
      actions.push({
        label: cardIds.length > 2 ? `Return ${names[0]} first` : `Return ${names.join(" then ")}`,
        action: "resolveLookOrderChoice",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingLookOrderChoice.playerId}`,
        cardIds
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve the pending Look order first" });
    return actions;
  }
  const pendingCleanupMarketResource = G.pendingCleanupMarketResourceChoice;
  if (pendingCleanupMarketResource) {
    const isCurrentPlayer = pendingCleanupMarketResource.playerId === ctx.currentPlayer;
    const cardIds = pendingCleanupMarketResource.cardIds ?? G.market ?? [];
    cardIds.forEach((cardId: string) => {
      const card = getCardById(G, cardId);
      actions.push({
        label: `Place cleanup resource on ${card?.displayName ?? cardId}`,
        action: "resolveCleanupMarketResource",
        enabled: isCurrentPlayer,
        reason: isCurrentPlayer ? undefined : `Waiting for player ${pendingCleanupMarketResource.playerId}`,
        cardId
      });
    });
    actions.push({ label:"End Turn", action:"endTurn", enabled:false, reason:"Resolve cleanup market resource first" });
    return actions;
  }
  const selectedCard = getSelectedCard(s, G);
  actions.push({
    label:"Pin Details",
    action:"view",
    enabled: !!selectedCard,
    reason: selectedCard ? undefined : "Select a card to pin details",
    cardId: selectedCard?.id
  });
  const canUseNormalActions = isActivateTurn(G);
  const addGlobalTurnActions = () => {
    const p = G.players?.[ctx.currentPlayer];
    innovateDeckSuits.forEach(({ suit, label }) => {
      actions.push({
        label: `${label} from Deck`,
        action: "innovate",
        enabled: canUseNormalActions,
        reason: canUseNormalActions ? undefined : "Innovate requires starting from an Activate turn",
        group: "Innovate",
        suit,
        source: "deck"
      });
    });
    const unrestCardIds = (p?.hand ?? []).filter((cardId: string) => isUnrestCard(getCardById(G, cardId)));
    const canRevolt = canUseNormalActions && unrestCardIds.length > 0;
    actions.push({
      label: unrestCardIds.length > 0 ? "Revolt Return All Unrest" : "Revolt",
      action: "revolt",
      enabled: canRevolt,
      reason: canRevolt ? undefined : !canUseNormalActions ? "Revolt requires starting from an Activate turn" : "No Unrest in hand",
      cardIds: unrestCardIds
    });
  };
  if (!s) {
    addGlobalTurnActions();
    actions.push({ label:"End Turn", action:"endTurn", enabled:true });
    return actions;
  }
  if (s.kind === "hand_card") {
    const p = G.players?.[ctx.currentPlayer];
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
  if (s.kind === "play_area_card" && isTradeRouteCard(G, s.id) && hasProfitAbility(G, s.id)) {
    const p = G.players?.[ctx.currentPlayer];
    const hasAction = (p?.actionsRemaining ?? 0) > 0;
    const complete = cardGoods(G, s.id) >= 3;
    const ok = canUseNormalActions && hasAction && complete;
    actions.push({
      label:"Profit",
      action:"profit",
      enabled: ok,
      reason: ok ? undefined : !canUseNormalActions ? "Profit requires an Activate turn" : !complete ? "Trade Route needs 3 Goods" : "No Action tokens available",
      cardId: s.id
    });
  }
  if (s.kind === "play_area_card" && hasExhaustAbility(G, s.id)) {
    const p = G.players?.[ctx.currentPlayer];
    const hasToken = (p?.exhaustTokensAvailable ?? 0) > 0;
    const exhausted = isCardExhausted(G, s.id);
    const ok = canUseNormalActions && hasToken && !exhausted;
    actions.push({
      label:"Exhaust Ability",
      action:"exhaust",
      enabled: ok,
      reason: ok ? undefined : !canUseNormalActions ? "Exhaust abilities require an Activate turn" : exhausted ? "Card already exhausted" : "No Exhaust tokens available",
      cardId: s.id
    });
  }
  if (s.kind === "market_slot") {
    const card = getCardById(G, s.id);
    const suit = card?.suit;
    if (isInnovateSuit(suit)) actions.push({ label:`Break Through ${card?.displayName ?? s.id}`, action:"innovate", enabled:canUseNormalActions, reason:canUseNormalActions ? undefined : "Innovate requires starting from an Activate turn", group:"Innovate", cardId: s.id, suit, source:"market" });
  }
  addGlobalTurnActions();
  actions.push({ label:"End Turn", action:"endTurn", enabled:true });
  actions.push({ label:"Cancel", action:"cancel", enabled:true });
  return actions;
}
