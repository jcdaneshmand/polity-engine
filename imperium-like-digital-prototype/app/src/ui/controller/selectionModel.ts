import { getCardById } from "../layout/uiSelectors";

export type SelectableKind = "market_slot"|"hand_card"|"play_area_card"|"development_card"|"pile"|"player_zone"|"action";
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
export function getAvailableActionsForSelection(s: Selection | null, G: any, ctx: any) {
  const actions: Array<{ label:string; action:string; enabled:boolean; reason?:string; cardId?:string }> = [];
  actions.push({ label:"View Details", action:"view", enabled: !!s });
  if (!s) return actions;
  if (s.kind === "hand_card") {
    const p = G.players?.[ctx.currentPlayer];
    const ok = (p?.hand ?? []).includes(s.id) && (p?.actionsRemaining ?? 0) > 0;
    actions.push({ label:"Play Card", action:"play", enabled: ok, reason: ok ? undefined : "Card is not in hand or no action tokens available", cardId: s.id });
  }
  if (s.kind === "market_slot") actions.push({ label:"Acquire Card", action:"acquire", enabled: true, cardId: s.id });
  actions.push({ label:"Innovate", action:"innovate", enabled:false, reason:"Not implemented yet" });
  actions.push({ label:"Revolt", action:"revolt", enabled:false, reason:"Not implemented yet" });
  actions.push({ label:"End Turn", action:"endTurn", enabled:true });
  actions.push({ label:"Cancel", action:"cancel", enabled:true });
  return actions;
}
