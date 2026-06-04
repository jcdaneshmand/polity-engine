import { actualHistorySourceZoneIds } from "../game/history";
import type { Card, GameState } from "../game/state";
import { currentStateMatches } from "../game/stateMatching";
import { cardHasSuitIconForPlayer } from "../game/suitIcons";
import type { EffectCondition, NationHookTrigger, NationRuleset } from "./nationRulesetTypes";

type NationHookEffectRunner = (ruleset: NationRuleset, hookIndex: number, effects: NationRuleset["hookRules"][number]["effects"]) => boolean;

function getPayloadCardId(payload: Record<string, unknown> | undefined, payloadKey: string): string | undefined {
  const value = payload?.[payloadKey];
  return typeof value === "string" ? value : undefined;
}

function getPayloadCard(G: GameState, payload: Record<string, unknown> | undefined, payloadKey: string): Card | undefined {
  const cardId = getPayloadCardId(payload, payloadKey);
  return cardId ? G.cardDb[cardId] : undefined;
}

function getZoneCards(G: GameState, playerId: string, p: GameState["players"][string], zoneId: string): string[] {
  if (zoneId === "history") {
    return actualHistorySourceZoneIds(G, playerId).flatMap((resolvedZoneId) => getZoneCards(G, playerId, p, resolvedZoneId));
  }
  if (zoneId === "nationDeck") {
    const cards = [...p.nationDeck];
    if (p.accessionCardId && !cards.includes(p.accessionCardId)) cards.push(p.accessionCardId);
    return cards;
  }
  const direct = (p as any)[zoneId];
  if (Array.isArray(direct)) return direct;
  if (p.sideAreas?.[zoneId]) return p.sideAreas[zoneId];
  if (G.specialZones?.[playerId]?.[zoneId]?.cardIds) return G.specialZones[playerId][zoneId].cardIds;
  if (G.globalSpecialZones?.[zoneId]?.cardIds) return G.globalSpecialZones[zoneId].cardIds;
  return [];
}

export function evaluateNationHookCondition(G: GameState, playerId: string, condition?: EffectCondition, payload?: Record<string, unknown>): boolean {
  if (!condition || condition.op === "always") return true;
  const p = G.players[playerId];
  if (!p) return false;
  if (condition.op === "state_is") return currentStateMatches(G, playerId, condition.state);
  if (condition.op === "zone_empty") return getZoneCards(G, playerId, p, condition.zoneId).length === 0;
  if (condition.op === "zone_has_at_least") return getZoneCards(G, playerId, p, condition.zoneId).length >= condition.count;
  if (condition.op === "card_in_zone") return getZoneCards(G, playerId, p, condition.zoneId).includes(condition.cardId);
  if (condition.op === "expansion_enabled") return Boolean(G.options?.enabledExpansions?.includes(condition.expansion));
  if (condition.op === "variant_enabled") return Boolean(G.options?.enabledVariants?.includes(condition.variant));
  if (condition.op === "mode_is") return G.options?.mode === condition.mode;
  if (condition.op === "payload_card_is") return getPayloadCardId(payload, condition.payloadKey) === condition.cardId;
  if (condition.op === "payload_card_suit_is") return cardHasSuitIconForPlayer(G, playerId, getPayloadCard(G, payload, condition.payloadKey), condition.suit);
  if (condition.op === "payload_card_type_is") {
    const card = getPayloadCard(G, payload, condition.payloadKey);
    return (card?.cardType ?? card?.type) === condition.cardType;
  }
  if (condition.op === "payload_card_has_tag") return Boolean((getPayloadCard(G, payload, condition.payloadKey)?.tags ?? []).includes(condition.tag));
  return false;
}

export function hasNationHookInterruption(G: GameState): boolean {
  return Boolean(
    G.pendingChoice
    ?? G.pendingDrawChoice
    ?? G.pendingFindChoice
    ?? G.pendingAcquireChoice
    ?? G.pendingMarketCardChoice
    ?? G.pendingExileChoice
    ?? G.pendingBreakThroughChoice
    ?? G.pendingGarrisonChoice
    ?? G.pendingRegionChoice
    ?? G.pendingRegionChoiceContinuation
    ?? G.pendingDevelopmentChoice
    ?? G.pendingShortGameDevelopmentExileChoice
    ?? G.pendingTradeChoice
    ?? G.pendingDiscardChoice
    ?? G.pendingUnrestAllocationChoice
    ?? G.pendingReturnUnrestChoice
    ?? G.pendingReturnFameChoice
    ?? G.pendingPlaceOnDeckChoice
    ?? G.pendingReturnExhaustTokenChoice
    ?? G.pendingGiveCardChoice
    ?? G.pendingSwapChoice
    ?? G.pendingLookOrderChoice
    ?? G.pendingReactiveExhaustChoice
  );
}

export function runNationHooksWithEffectRunner(args: {
  G: GameState;
  playerId: string;
  trigger: NationHookTrigger;
  payload?: Record<string, unknown>;
  startIndex?: number;
  runHookEffects: NationHookEffectRunner;
}): boolean {
  const ruleset = args.G.activeNationRulesets?.[args.playerId];
  if (!ruleset) return true;
  const hooks = [...(ruleset.hookRules ?? []).filter((h) => h.trigger === args.trigger)].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  for (let index = args.startIndex ?? 0; index < hooks.length; index += 1) {
    const hook = hooks[index];
    if (args.G.gameover || hasNationHookInterruption(args.G)) return true;
    if (!evaluateNationHookCondition(args.G, args.playerId, hook.condition, args.payload)) continue;
    try {
      const resolved = args.runHookEffects(ruleset, index, hook.effects);
      if (!resolved) {
        args.G.log.push({ round: args.G.round, playerId: args.playerId, message: `Nation hook ${args.trigger} #${index} failed.` });
        return false;
      }
      if (args.G.gameover) return true;
      if (hasNationHookInterruption(args.G)) {
        args.G.pendingNationHookContinuation = { playerId: args.playerId, trigger: args.trigger, payload: args.payload, nextIndex: index + 1, resolvedHookIndex: index };
        return true;
      }
      args.G.log.push({ round: args.G.round, playerId: args.playerId, message: `Nation hook ${args.trigger} #${index} resolved.` });
    } catch (err) {
      args.G.log.push({ round: args.G.round, playerId: args.playerId, message: `NationRulesetError(${ruleset.nationId}/${args.trigger}/${index}): ${(err as Error).message}` });
      return false;
    }
  }
  return true;
}
