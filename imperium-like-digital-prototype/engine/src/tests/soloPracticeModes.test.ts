import { describe, expect, it } from "vitest";
import { Client } from "boardgame.io/client";
import { PrototypeGame } from "../game/game";
import { createInitialGameState } from "../game/initialState";
import { canPayResourceCosts, normalizeResourceCost } from "../game/payments";
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
import type { GameState, ResourceName } from "../game/state";
import { onTurnEnd } from "../game/turn";
import { practiceMarketChurn } from "../solo/practiceMode";

function fullStateCards(G: GameState, playerId: string): string[] {
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

function expectFullStateConsistent(G: GameState) {
  for (const [playerId, player] of Object.entries(G.players)) {
    for (const resource of ["materials", "knowledge", "influence", "unrest", "goods"] satisfies ResourceName[]) {
      expect(player.resources[resource], `${playerId} has negative ${resource}`).toBeGreaterThanOrEqual(0);
    }
    expect(player.actionsRemaining, `${playerId} has negative actions`).toBeGreaterThanOrEqual(0);
    expect(player.actionTokensAvailable, `${playerId} has negative action tokens`).toBeGreaterThanOrEqual(0);
    expect(player.exhaustTokensAvailable, `${playerId} has negative exhaust tokens`).toBeGreaterThanOrEqual(0);
    const cards = fullStateCards(G, playerId);
    expect(cards.every((cardId) => Boolean(G.cardDb[cardId])), `${playerId} owns unknown card`).toBe(true);
  }
  expect(G.market.every((cardId) => Boolean(G.cardDb[cardId])), "market contains unknown card").toBe(true);
}

function playerCtx(G: GameState, playerId = "1") {
  return { currentPlayer: playerId, playOrder: G.playOrder ?? Object.keys(G.players) } as any;
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
  if (G.pendingGarrisonChoice) {
    resolveGarrisonChoice({ G, ctx }, G.pendingGarrisonChoice.hostCardIds[0], G.pendingGarrisonChoice.cardIds[0]);
    return "resolveGarrisonChoice";
  }
  if (G.pendingRegionChoice) { resolveRegionChoice({ G, ctx }, G.pendingRegionChoice.cardIds[0]); return "resolveRegionChoice"; }
  if (G.pendingDevelopmentChoice?.allowSkip) { skipDevelopmentChoice({ G, ctx }); return "skipDevelopmentChoice"; }
  if (G.pendingDevelopmentChoice) { resolveDevelopmentChoice({ G, ctx }, G.pendingDevelopmentChoice.cardIds[0]); return "resolveDevelopmentChoice"; }
  if (G.pendingShortGameDevelopmentExileChoice) {
    resolveShortGameDevelopmentExileChoice({ G, ctx }, G.pendingShortGameDevelopmentExileChoice.cardIds[0]);
    return "resolveShortGameDevelopmentExileChoice";
  }
  if (G.pendingTradeChoice) { resolveTradeChoice({ G, ctx }, G.pendingTradeChoice.routeCardIds[0]); return "resolveTradeChoice"; }
  if (G.pendingDiscardChoice) { resolveDiscardChoice({ G, ctx }, G.pendingDiscardChoice.cardIds.slice(0, G.pendingDiscardChoice.count)); return "resolveDiscardChoice"; }
  if (G.pendingReturnUnrestChoice) { resolveReturnUnrestChoice({ G, ctx }, G.pendingReturnUnrestChoice.cardIds[0]); return "resolveReturnUnrestChoice"; }
  if (G.pendingReturnFameChoice) { resolveReturnFameChoice({ G, ctx }, G.pendingReturnFameChoice.cardIds[0]); return "resolveReturnFameChoice"; }
  if (G.pendingPlaceOnDeckChoice) { resolvePlaceOnDeckChoice({ G, ctx }, G.pendingPlaceOnDeckChoice.cardIds[0]); return "resolvePlaceOnDeckChoice"; }
  if (G.pendingReturnExhaustTokenChoice) { resolveReturnExhaustTokenChoice({ G, ctx }, G.pendingReturnExhaustTokenChoice.cardIds[0]); return "resolveReturnExhaustTokenChoice"; }
  if (G.pendingFreePlayChoice) { resolveFreePlayChoice({ G, ctx }, G.pendingFreePlayChoice.cardIds[0]); return "resolveFreePlayChoice"; }
  if (G.pendingGiveCardChoice) {
    resolveGiveCardChoice({ G, ctx }, G.pendingGiveCardChoice.cardIds[0], G.pendingGiveCardChoice.recipientPlayerIds[0]);
    return "resolveGiveCardChoice";
  }
  if (G.pendingSwapChoice) {
    resolveSwapChoice({ G, ctx }, G.pendingSwapChoice.choices[0].cardId, G.pendingSwapChoice.choices[0].marketCardId);
    return "resolveSwapChoice";
  }
  if (G.pendingLookOrderChoice) { resolveLookOrderChoice({ G, ctx }, G.pendingLookOrderChoice.cardIds); return "resolveLookOrderChoice"; }
  if (G.pendingLookTakeChoice) { resolveLookTakeChoice({ G, ctx }, G.pendingLookTakeChoice.cardIds[0]); return "resolveLookTakeChoice"; }
  if (G.pendingUnrestAllocationChoice) {
    resolveUnrestAllocationChoice({ G, ctx }, G.pendingUnrestAllocationChoice.recipientPlayerIds.slice(0, G.pendingUnrestAllocationChoice.countPerPlayer));
    return "resolveUnrestAllocationChoice";
  }
  if (G.pendingReactiveExhaustChoice) { skipReactiveExhaustChoice({ G, ctx }); return "skipReactiveExhaustChoice"; }
  if (G.pendingMarketResourcePlacementChoice) {
    resolveMarketResourcePlacement({ G, ctx }, G.pendingMarketResourcePlacementChoice.cardIds.slice(0, G.pendingMarketResourcePlacementChoice.amount));
    return "resolveMarketResourcePlacement";
  }
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

function runAutomatedPlaythrough(G: GameState, steps: number): string[] {
  const trace: string[] = [];
  const initialLogLength = G.log.length;
  for (let i = 0; i < steps && !G.gameover; i += 1) {
    trace.push(runAutomatedEngineMove(G));
    expectFullStateConsistent(G);
    const invalidEntries = G.log.slice(initialLogLength).filter((entry) => entry.message.startsWith("InvalidMove("));
    expect(invalidEntries, `trace=${trace.join(" -> ")}`).toEqual([]);
  }
  return trace;
}

describe("solo/practice modes",()=>{
  it("practice creates a 12-turn market churn clock and finite Progress pool",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 12 });
  });
  it("practice is feature-flagged separately from full solo Bot setup",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 12 });
    expect(G.solo).toBeUndefined();
  });
  it("practice cleanup spends one churn Progress token onto the market and ticks the clock",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.market = ["test_action_foundry_shift"];
    G.players["1"].hand = [];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["1"] } as any);

    expect(G.practiceClock).toEqual({ turnsRemaining: 11, progressTokens: 11 });
    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBe(1);
    expect(G.log.some((entry) => entry.message === "PracticeMarketChurn(test_action_foundry_shift/knowledge/1)")).toBe(true);
  });
  it("practice market churn mirrors Progress tokens into structured Market slots",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.market = ["test_action_foundry_shift"];
    G.marketResources = {};
    G.marketSlots = [{
      index: 0,
      cardId: "test_action_foundry_shift",
      resourceMarkers: {},
      attachedUnrestCardIds: []
    }];

    practiceMarketChurn(G);

    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 11 });
    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBe(1);
    expect(G.marketSlots![0]?.resourceMarkers.knowledge).toBe(1);
  });
  it("practice cleanup uses the chosen cleanup market card as the single churn Progress placement",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "1", playOrder: ["1"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketResources = {};
    G.players["1"].hand = [];

    endTurnMove({ G, ctx, events: { endTurn } });
    expect(G.pendingCleanupMarketResourceChoice?.cardIds).toEqual(["test_action_foundry_shift", "test_action_archive_survey"]);

    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 11 });
    expect(G.marketResources?.test_action_archive_survey?.knowledge).toBe(1);
    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBeUndefined();
    expect(G.pendingExileChoice).toEqual({
      playerId: "1",
      sourceCardId: "practice_market_churn",
      source: "market",
      cardIds: ["test_action_foundry_shift"],
      optional: true
    });
  });
  it("practice lifecycle cleanup waits for the player-chosen Market card before placing churn Progress",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketResources = {};
    G.players["1"].hand = [];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["1"] } as any);

    expect(G.pendingCleanupMarketResourceChoice).toEqual({
      playerId: "1",
      resource: "knowledge",
      amount: 1,
      cardIds: ["test_action_foundry_shift", "test_action_archive_survey"]
    });
    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 12 });
    expect(G.marketResources).toEqual({});
  });
  it("practice offers the optional market Exile before voluntary cleanup discard",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "1", playOrder: ["1"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketResources = {};
    G.players["1"].hand = ["test_action_scholars_circle"];

    endTurnMove({ G, ctx, events: { endTurn } });
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(G.pendingExileChoice?.sourceCardId).toBe("practice_market_churn");
    expect(G.pendingCleanupDiscardChoice).toBeUndefined();

    skipExileChoice({ G, ctx, events: { endTurn } });

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.pendingCleanupDiscardChoice).toEqual({
      playerId: "1",
      cardIds: ["test_action_scholars_circle"]
    });
    expect(G.practiceClock).toEqual({ turnsRemaining: 12, progressTokens: 11 });
  });
  it("practice does not offer optional market Exile when automatic churn leaves no tokenless market cards",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.market = ["test_action_foundry_shift"];
    G.marketResources = {};
    G.players["1"].hand = ["test_action_scholars_circle"];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["1"] } as any);

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.pendingCleanupDiscardChoice).toBeUndefined();
    expect(G.practiceClock).toEqual({ turnsRemaining: 11, progressTokens: 11 });
  });
  it("practice cleanup skips the churn choice when no Progress tokens remain",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.practiceClock = { turnsRemaining: 1, progressTokens: 0 };
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketResources = {};
    G.players["1"].hand = [];

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["1"] } as any);

    expect(G.pendingCleanupMarketResourceChoice).toBeUndefined();
    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.marketResources).toEqual({});
    expect(G.practiceClock).toEqual({ turnsRemaining: 0, progressTokens: 0 });
    expect(G.gameover?.reason).toBe("normal_scoring:practice_turn_limit");
  });
  it("practice cleanup pauses for an optional market Exile choice after churn",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "1", playOrder: ["1"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey", "test_action_scholars_circle"];
    G.marketResources = { test_action_archive_survey: { knowledge: 1 } };
    G.players["1"].hand = [];

    onTurnEnd(G, ctx);
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");

    expect(G.pendingExileChoice).toEqual({
      playerId: "1",
      sourceCardId: "practice_market_churn",
      source: "market",
      cardIds: ["test_action_scholars_circle"],
      optional: true
    });
    expect(G.pausedSolstice).toBeUndefined();
    expect(G.pendingPracticeMarketExileBeforeCleanup).toEqual({ playerId: "1" });
  });
  it("practice optional market Exile excludes market cards with card-state tokens",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "1", playOrder: ["1"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey", "test_action_scholars_circle", "test_action_risk_audit"];
    G.marketResources = { test_action_archive_survey: { knowledge: 1 } };
    G.cardStates = { test_action_scholars_circle: { actionTokens: 1 } };
    G.players["1"].hand = [];

    onTurnEnd(G, ctx);
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");

    expect(G.pendingExileChoice).toEqual({
      playerId: "1",
      sourceCardId: "practice_market_churn",
      source: "market",
      cardIds: ["test_action_risk_audit"],
      optional: true
    });
    expect(G.pendingPracticeMarketExileBeforeCleanup).toEqual({ playerId: "1" });
  });
  it("practice market Exile choice resumes the cleanup handoff without ticking twice",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "1", playOrder: ["1"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.marketRefillPool = ["test_action_scholars_circle"];
    G.marketDecks = undefined;
    G.unrestPile = ["unrest_from_supply"];
    G.players["1"].hand = [];

    onTurnEnd(G, ctx);
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");
    resolveExileChoice({ G, ctx, events: { endTurn } }, "test_action_archive_survey");

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.practiceClock).toEqual({ turnsRemaining: 11, progressTokens: 11 });
    expect(G.players["1"].exile).toContain("test_action_archive_survey");
    expect(G.pausedSolstice).toBeUndefined();
  });
  it("practice market Exile choice can be skipped and still resumes cleanup",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    const ctx = { currentPlayer: "1", playOrder: ["1"] } as any;
    const endTurn = () => onTurnEnd(G, ctx);
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    G.players["1"].hand = [];

    onTurnEnd(G, ctx);
    resolveCleanupMarketResource({ G, ctx, events: { endTurn } }, "test_action_foundry_shift");
    skipExileChoice({ G, ctx, events: { endTurn } });

    expect(G.pendingExileChoice).toBeUndefined();
    expect(G.practiceClock).toEqual({ turnsRemaining: 11, progressTokens: 11 });
    expect(G.players["1"].exile).toEqual([]);
  });
  it("practice resolves the twelfth turn Solstice before final scoring",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.practiceClock = { turnsRemaining: 1, progressTokens: 1 };
    G.market = ["test_action_foundry_shift"];
    G.players["1"].playArea = ["practice_final_solstice"];
    G.players["1"].hand = [];
    G.players["1"].resources.knowledge = 0;
    G.cardDb.practice_final_solstice = {
      id: "practice_final_solstice",
      displayName: "Practice Final Solstice",
      type: "in_play",
      cardType: "in_play",
      suit: "none",
      cost: 0,
      tags: [],
      effects: [{ trigger: "on_solstice", op: "gain_resource", resource: "knowledge", amount: 1 } as any]
    };

    onTurnEnd(G, { currentPlayer: "1", playOrder: ["1"] } as any);

    expect(G.practiceClock).toEqual({ turnsRemaining: 0, progressTokens: 0 });
    expect(G.players["1"].resources.knowledge).toBe(1);
    expect(G.gameover?.reason).toBe("normal_scoring:practice_turn_limit");
    expect(G.gameover?.scores?.["1"]).toBeGreaterThanOrEqual(1);
    expect(G.scoring).toBeUndefined();
  });
  it("solo creates bot",()=>{ const G=createInitialGameState({ options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain"} }); expect(G.solo?.bot.botId).toBe("bot_0"); });
  it("exposes solo/practice local pending cleanup choices to seat 0 instead of spectator view",()=>{
    const game = {
      ...PrototypeGame,
      setup: (ctx: any) => PrototypeGame.setup!(ctx, {
        options: { playerCount: 1, mode: "practice", enabledExpansions: [], enabledVariants: [] },
        playerNationIds: { "1": "test_nation_sun_coast" }
      })
    };
    const spectatorClient = Client({ game, numPlayers: 1 });
    const playerClient = Client({ game, numPlayers: 1, playerID: "0" });

    spectatorClient.start();
    playerClient.start();
    spectatorClient.moves.endTurn();
    playerClient.moves.endTurn();

    expect(spectatorClient.getState()?.G.pendingCleanupMarketResourceChoice).toBeUndefined();
    const pending = playerClient.getState()?.G.pendingCleanupMarketResourceChoice;
    expect(pending?.playerId).toBe("1");
    expect(pending?.cardIds.length).toBeGreaterThan(0);

    playerClient.moves.resolveCleanupMarketResource(pending!.cardIds[0]);
    expect(playerClient.getState()?.G.marketResources?.[pending!.cardIds[0]]?.knowledge).toBe(1);

    spectatorClient.stop();
    playerClient.stop();
  });
  it("automates a practice playthrough through end-turn market resource placement",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"practice",enabledExpansions:[],enabledVariants:[]} });
    G.players["1"].hand = [];
    G.market = ["test_action_foundry_shift", "test_action_archive_survey"];
    endTurnMove({ G, ctx: playerCtx(G), events: { endTurn: () => onTurnEnd(G, playerCtx(G)) } });
    expect(G.pendingCleanupMarketResourceChoice?.cardIds).toEqual(["test_action_foundry_shift", "test_action_archive_survey"]);

    const firstMove = runAutomatedEngineMove(G);
    expect(firstMove).toBe("resolveCleanupMarketResource");
    expect(G.marketResources?.test_action_foundry_shift?.knowledge).toBe(1);
    expectFullStateConsistent(G);

    const trace = [firstMove, ...runAutomatedPlaythrough(G, 17)];
    expect(trace.length).toBeGreaterThanOrEqual(6);
  });
  it("automates a solo playthrough without invalid moves or broken state",()=>{
    const G=createInitialGameState({ options:{playerCount:1,mode:"solo",enabledExpansions:[],enabledVariants:[],soloDifficulty:"chieftain"} });

    const trace = runAutomatedPlaythrough(G, 24);

    expect(G.solo?.bot.botId).toBe("bot_0");
    expect(trace.length).toBeGreaterThanOrEqual(8);
  });
});
