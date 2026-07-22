import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../game/initialState";
import {
  endTurnMove,
  exhaustCard,
  innovateTurn,
  playCard,
  resolveAcquireChoice,
  resolveBreakThroughChoice,
  resolveChoice,
  resolveCleanupDiscard,
  resolveCleanupMarketResource,
  resolveDevelopmentChoice,
  resolveDiscardChoice,
  resolveDrawChoice,
  resolveExileChoice,
  resolveFindChoice,
  resolveFreePlayChoice,
  resolveGarrisonChoice,
  resolveGiveCardChoice,
  resolveLookOrderChoice,
  resolveLookTakeChoice,
  resolveMarketCardChoice,
  resolveMarketResourcePlacement,
  resolvePlaceOnDeckChoice,
  resolveReactiveExhaustChoice,
  resolveRegionChoice,
  resolveReturnExhaustTokenChoice,
  resolveReturnFameChoice,
  resolveReturnUnrestChoice,
  resolveShortGameDevelopmentExileChoice,
  resolveSolsticeOrderChoice,
  resolveSwapChoice,
  resolveTradeChoice,
  resolveUnrestAllocationChoice,
  skipDevelopmentChoice,
  skipExileChoice,
  skipReactiveExhaustChoice
} from "../game/moves";
import { onTurnEnd } from "../game/turn";
import { canPayResourceCosts, normalizeResourceCost } from "../game/payments";
import type { ExpansionId, GameOptions, SoloDifficulty, VariantId } from "../options/gameOptions";
import type { GameState, ResourceName } from "../game/state";

const RESOURCES = ["materials", "knowledge", "influence", "unrest", "goods"] satisfies ResourceName[];
const fixtureRoot = path.resolve(__dirname, "../../../data/fictional-regression");

function readFixtureJson<T>(fileName: string): T {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, fileName), "utf8")) as T;
}

function fictionalPrivateData() {
  return {
    cards: readFixtureJson<any[]>("cards.json"),
    nations: readFixtureJson<any[]>("nations.json"),
    nationRulesets: readFixtureJson<any[]>("rulesets.json")
  };
}

function playerCtx(G: GameState, playerId = "1") {
  return { currentPlayer: playerId, playOrder: G.playOrder ?? Object.keys(G.players) } as any;
}

function allPlayerCardIds(G: GameState, playerId: string): string[] {
  const player = G.players[playerId];
  return [
    ...player.deck,
    ...player.hand,
    ...player.discard,
    ...player.playArea,
    ...player.history,
    ...player.exile,
    ...player.powerArea,
    ...player.stateArea,
    ...player.developmentArea,
    ...player.nationDeck,
    ...Object.values(player.sideAreas ?? {}).flat()
  ];
}

function allKnownCardIds(G: GameState): string[] {
  return [
    ...Object.keys(G.cardDb),
    ...Object.keys(G.globalSpecialZones ?? {}),
    ...Object.values(G.globalSpecialZones ?? {}).flatMap((zone) => zone.cardIds)
  ];
}

function expectKnownCards(G: GameState, cardIds: string[], label: string) {
  const known = new Set(allKnownCardIds(G));
  expect(cardIds.filter(Boolean).every((cardId) => known.has(cardId)), `${label} contains unknown card: ${cardIds.join(",")}`).toBe(true);
}

function expectGameStateConsistent(G: GameState, trace: string[]) {
  for (const [playerId, player] of Object.entries(G.players)) {
    for (const resource of RESOURCES) {
      expect(player.resources[resource], `${playerId} has negative ${resource}; trace=${trace.join(" -> ")}`).toBeGreaterThanOrEqual(0);
    }
    expect(player.actionsRemaining, `${playerId} has negative actions; trace=${trace.join(" -> ")}`).toBeGreaterThanOrEqual(0);
    expect(player.actionTokensAvailable, `${playerId} has negative action tokens; trace=${trace.join(" -> ")}`).toBeGreaterThanOrEqual(0);
    expect(player.exhaustTokensAvailable, `${playerId} has negative exhaust tokens; trace=${trace.join(" -> ")}`).toBeGreaterThanOrEqual(0);
    expectKnownCards(G, allPlayerCardIds(G, playerId), `${playerId} zones`);
  }
  expectKnownCards(G, G.market, "market");
  expectKnownCards(G, G.marketRefillPool, "market refill pool");
  expectKnownCards(G, G.sharedDiscard, "shared discard");
  expectKnownCards(G, Object.values(G.marketDecks ?? {}).flat(), "market decks");
  expectKnownCards(G, Object.values(G.marketDeckBottomCards ?? {}).filter(Boolean) as string[], "market deck bottom cards");
  expect((G.fameDeck?.available ?? []).every((cardId) => cardId.length > 0), `fame deck contains blank id; trace=${trace.join(" -> ")}`).toBe(true);
  expectKnownCards(G, G.unrestPile ?? [], "unrest pile");
  expect(G.market.length, `market overfilled; trace=${trace.join(" -> ")}`).toBeLessThanOrEqual(6);
  expect(Object.values(G.marketResources ?? {}).flatMap((resources) => Object.values(resources)).every((amount) => amount === undefined || amount >= 0), `negative market resource; trace=${trace.join(" -> ")}`).toBe(true);
}

function firstAffordableHandCard(G: GameState, playerId: string): string | undefined {
  return G.players[playerId].hand.find((cardId) => {
    const card = G.cardDb[cardId];
    return card && canPayResourceCosts(G, playerId, normalizeResourceCost(card.cost));
  });
}

function firstExhaustableCard(G: GameState, playerId: string): string | undefined {
  const player = G.players[playerId];
  if (player.exhaustTokensAvailable < 1) return undefined;
  return [...player.playArea, ...player.powerArea].find((cardId) =>
    Boolean(G.cardDb[cardId]?.effects.some((effect) => effect.trigger === "on_exhaust"))
      && (G.cardStates?.[cardId]?.exhaustTokens ?? 0) < 1
  );
}

function runAutomatedEngineMove(G: GameState, playerId = "1"): string {
  const ctx = playerCtx(G, playerId);
  const endTurn = () => onTurnEnd(G, ctx);

  if (G.pendingChoice) { resolveChoice({ G, ctx }, 0); return "resolveChoice"; }
  if (G.pendingDrawChoice) { resolveDrawChoice({ G, ctx }, G.pendingDrawChoice.cardIds[0]); return "resolveDrawChoice"; }
  if (G.pendingFindChoice) { resolveFindChoice({ G, ctx }, G.pendingFindChoice.cardIds[0]); return "resolveFindChoice"; }
  if (G.pendingAcquireChoice) { resolveAcquireChoice({ G, ctx }, G.pendingAcquireChoice.cardIds[0]); return "resolveAcquireChoice"; }
  if (G.pendingMarketCardChoice) { resolveMarketCardChoice({ G, ctx }, G.pendingMarketCardChoice.cardIds[0]); return "resolveMarketCardChoice"; }
  if (G.pendingBreakThroughChoice) { resolveBreakThroughChoice({ G, ctx, events: { endTurn } }, G.pendingBreakThroughChoice.cardIds[0]); return "resolveBreakThroughChoice"; }
  if (G.pendingExileChoice?.optional) { skipExileChoice({ G, ctx, events: { endTurn } }); return "skipExileChoice"; }
  if (G.pendingExileChoice) { resolveExileChoice({ G, ctx, events: { endTurn } }, G.pendingExileChoice.cardIds[0]); return "resolveExileChoice"; }
  if (G.pendingGarrisonChoice) { resolveGarrisonChoice({ G, ctx }, G.pendingGarrisonChoice.hostCardIds[0], G.pendingGarrisonChoice.cardIds[0]); return "resolveGarrisonChoice"; }
  if (G.pendingRegionChoice) { resolveRegionChoice({ G, ctx }, G.pendingRegionChoice.cardIds[0]); return "resolveRegionChoice"; }
  if (G.pendingDevelopmentChoice?.allowSkip) { skipDevelopmentChoice({ G, ctx }); return "skipDevelopmentChoice"; }
  if (G.pendingDevelopmentChoice) { resolveDevelopmentChoice({ G, ctx }, G.pendingDevelopmentChoice.cardIds[0]); return "resolveDevelopmentChoice"; }
  if (G.pendingShortGameDevelopmentExileChoice) { resolveShortGameDevelopmentExileChoice({ G, ctx }, G.pendingShortGameDevelopmentExileChoice.cardIds[0]); return "resolveShortGameDevelopmentExileChoice"; }
  if (G.pendingTradeChoice) { resolveTradeChoice({ G, ctx }, G.pendingTradeChoice.routeCardIds[0]); return "resolveTradeChoice"; }
  if (G.pendingDiscardChoice) { resolveDiscardChoice({ G, ctx }, G.pendingDiscardChoice.cardIds.slice(0, G.pendingDiscardChoice.count)); return "resolveDiscardChoice"; }
  if (G.pendingReturnUnrestChoice) { resolveReturnUnrestChoice({ G, ctx }, G.pendingReturnUnrestChoice.cardIds[0]); return "resolveReturnUnrestChoice"; }
  if (G.pendingReturnFameChoice) { resolveReturnFameChoice({ G, ctx }, G.pendingReturnFameChoice.cardIds[0]); return "resolveReturnFameChoice"; }
  if (G.pendingPlaceOnDeckChoice) { resolvePlaceOnDeckChoice({ G, ctx }, G.pendingPlaceOnDeckChoice.cardIds[0]); return "resolvePlaceOnDeckChoice"; }
  if (G.pendingReturnExhaustTokenChoice) { resolveReturnExhaustTokenChoice({ G, ctx }, G.pendingReturnExhaustTokenChoice.cardIds[0]); return "resolveReturnExhaustTokenChoice"; }
  if (G.pendingFreePlayChoice) { resolveFreePlayChoice({ G, ctx }, G.pendingFreePlayChoice.cardIds[0]); return "resolveFreePlayChoice"; }
  if (G.pendingGiveCardChoice) { resolveGiveCardChoice({ G, ctx }, G.pendingGiveCardChoice.cardIds[0], G.pendingGiveCardChoice.recipientPlayerIds[0]); return "resolveGiveCardChoice"; }
  if (G.pendingSwapChoice) { resolveSwapChoice({ G, ctx }, G.pendingSwapChoice.choices[0].cardId, G.pendingSwapChoice.choices[0].marketCardId); return "resolveSwapChoice"; }
  if (G.pendingLookOrderChoice) { resolveLookOrderChoice({ G, ctx }, G.pendingLookOrderChoice.cardIds); return "resolveLookOrderChoice"; }
  if (G.pendingLookTakeChoice) { resolveLookTakeChoice({ G, ctx }, G.pendingLookTakeChoice.cardIds[0]); return "resolveLookTakeChoice"; }
  if (G.pendingUnrestAllocationChoice) { resolveUnrestAllocationChoice({ G, ctx }, G.pendingUnrestAllocationChoice.recipientPlayerIds.slice(0, G.pendingUnrestAllocationChoice.countPerPlayer)); return "resolveUnrestAllocationChoice"; }
  if (G.pendingReactiveExhaustChoice) { skipReactiveExhaustChoice({ G, ctx }); return "skipReactiveExhaustChoice"; }
  if (G.pendingMarketResourcePlacementChoice) { resolveMarketResourcePlacement({ G, ctx }, G.pendingMarketResourcePlacementChoice.cardIds.slice(0, G.pendingMarketResourcePlacementChoice.amount)); return "resolveMarketResourcePlacement"; }
  if (G.pendingSolsticeOrderChoice) { resolveSolsticeOrderChoice({ G, ctx }, G.pendingSolsticeOrderChoice.cardIds); return "resolveSolsticeOrderChoice"; }
  if (G.pendingCleanupMarketResourceChoice) { resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, G.pendingCleanupMarketResourceChoice.cardIds[0]); return "resolveCleanupMarketResource"; }
  if (G.pendingCleanupDiscardChoice) { resolveCleanupDiscard({ G, ctx, events: { endTurn } }, []); return "resolveCleanupDiscard"; }

  const player = G.players[playerId];
  const canTakeAction = player.actionsRemaining > 0 && player.actionTokensAvailable > 0;
  const playableCard = canTakeAction ? firstAffordableHandCard(G, playerId) : undefined;
  if (playableCard) { playCard({ G, ctx }, playableCard); return `playCard:${playableCard}`; }
  const exhaustableCard = firstExhaustableCard(G, playerId);
  if (exhaustableCard) { exhaustCard({ G, ctx }, exhaustableCard); return `exhaustCard:${exhaustableCard}`; }
  const marketCard = canTakeAction
    ? G.market.find((cardId) => ["region", "uncivilized", "civilized", "tributary"].includes(G.cardDb[cardId]?.suit ?? "none"))
    : undefined;
  if (marketCard) {
    innovateTurn({ G, ctx, events: { endTurn } }, { suit: G.cardDb[marketCard].suit ?? "none", source: "market", cardId: marketCard });
    return `innovateTurn:${marketCard}`;
  }
  endTurnMove({ G, ctx, events: { endTurn } });
  return "endTurn";
}

function runStressCase(options: GameOptions, args: { seed: string; steps: number; playerNationIds?: Record<string, string>; soloBotNationId?: string; privateData?: any; prepare?: (G: GameState) => void; minTraceLength?: number }) {
  const G = createInitialGameState({
    options,
    randomSeed: args.seed,
    playerNationIds: args.playerNationIds,
    soloBotNationId: args.soloBotNationId,
    privateData: args.privateData
  });
  const trace: string[] = [];
  const initialLogLength = G.log.length;

  args.prepare?.(G);
  expectGameStateConsistent(G, trace);
  for (let step = 0; step < args.steps && !G.gameover; step += 1) {
    trace.push(runAutomatedEngineMove(G));
    expectGameStateConsistent(G, trace);
    const invalidEntries = G.log.slice(initialLogLength).filter((entry) => entry.message.startsWith("InvalidMove("));
    expect(invalidEntries, `seed=${args.seed}; trace=${trace.join(" -> ")}`).toEqual([]);
  }

  expect(trace.length, `seed=${args.seed}; game ended too early`).toBeGreaterThan(args.minTraceLength ?? 8);
  return { G, trace };
}

describe("automated gameplay stress", () => {
  it.each([
    { name: "practice/core/classics", mode: "practice" as const, enabledExpansions: [], enabledVariants: [], commonsSetId: "classics" as const, seed: "stress-practice-core", steps: 96 },
    { name: "practice/trade-routes/quick", mode: "practice" as const, enabledExpansions: ["trade_routes"] satisfies ExpansionId[], enabledVariants: ["quick_setup"] satisfies VariantId[], commonsSetId: "classics" as const, seed: "stress-practice-trade-quick", steps: 96 },
    { name: "solo/core/chieftain", mode: "solo" as const, enabledExpansions: [], enabledVariants: [], soloDifficulty: "chieftain" as SoloDifficulty, commonsSetId: "classics" as const, seed: "stress-solo-core", steps: 96 },
    { name: "solo/trade-routes/short-game", mode: "solo" as const, enabledExpansions: ["trade_routes"] satisfies ExpansionId[], enabledVariants: ["short_game"] satisfies VariantId[], soloDifficulty: "warlord" as SoloDifficulty, commonsSetId: "classics" as const, seed: "stress-solo-trade-short", steps: 96 },
    { name: "solo/precious-lowered", mode: "solo" as const, enabledExpansions: [], enabledVariants: ["precious_cards", "lowered_aggression"] satisfies VariantId[], soloDifficulty: "chieftain" as SoloDifficulty, commonsSetId: "classics" as const, seed: "stress-solo-precious-lowered", steps: 96 }
  ])("plays $name without invalid moves or invariant failures", (testCase) => {
    const { G, trace } = runStressCase({
      playerCount: 1,
      mode: testCase.mode,
      enabledExpansions: testCase.enabledExpansions,
      enabledVariants: testCase.enabledVariants,
      soloDifficulty: testCase.soloDifficulty,
      commonsSetId: testCase.commonsSetId
    }, {
      seed: testCase.seed,
      steps: testCase.steps
    });

    expect(trace.some((move) => move === "endTurn" || move === "resolveCleanupDiscard"), `trace=${trace.join(" -> ")}`).toBe(true);
    if (G.options?.mode === "practice") expect(trace).toContain("resolveCleanupMarketResource");
    if (G.options?.mode === "solo") expect(G.solo?.bot.botId).toBe("bot_0");
  });

  it("plays a complete fake-card practice game through final scoring", () => {
    const { G, trace } = runStressCase({
      playerCount: 1,
      mode: "practice",
      enabledExpansions: [],
      enabledVariants: [],
      commonsSetId: "custom"
    }, {
      seed: "stress-fictional-complete-practice",
      steps: 80,
      privateData: fictionalPrivateData(),
      playerNationIds: { "1": "fixture_nation_surveyors" },
      minTraceLength: 4,
      prepare: (G) => {
        G.practiceClock = { turnsRemaining: 1, progressTokens: 1 };
        G.market = ["fixture_market_materials", "fixture_market_knowledge", "fixture_market_unrest"];
        G.marketSlots = G.market.map((cardId, index) => ({
          index,
          cardId,
          resourceMarkers: {},
          attachedUnrestCardIds: []
        }));
        G.marketResources = {};
        G.players["1"].hand = G.players["1"].hand.filter((cardId) => cardId !== "fixture_action_draw_one");
      }
    });

    expect(G.gameover?.reason).toBe("normal_scoring:practice_turn_limit");
    expect(G.gameover?.scores?.["1"]).toBeDefined();
    expect(trace, `trace=${trace.join(" -> ")}`).toContain("resolveCleanupMarketResource");
    expect(trace.some((move) => move.startsWith("playCard:fixture_")), `trace=${trace.join(" -> ")}`).toBe(true);
  });
});
